"""Linux screen capture via the XDG desktop portal (ScreenCast).

Why this exists: the wlr-screencopy tools (grim) only work on wlroots
compositors — on GNOME/Mutter and KDE they fail outright ("compositor
doesn't support the screen capture protocol"), and mss is X11-only, so on
a Wayland-native GNOME session there is no capture path at all. The XDG
ScreenCast portal is the one sanctioned, compositor-agnostic route, and it
is also how a *window* gets picked on Wayland: enumerating other apps'
windows is deliberately impossible there (see ADR 0005), so the
compositor's own picker replaces our click-to-pick gesture.

Two entry points:

    python portal_capture.py pick [any|window|monitor]
        Runs the compositor's picker once (the only step that prompts) and
        stores a restore token. Prints one line of JSON describing the
        chosen source.

    python portal_capture.py capture <out.png> [any|window|monitor]
        Grabs one frame using the stored token — no prompt, no UI.

Both print JSON to stdout and nothing else; errors go to stderr with a
non-zero exit code. Called from src-tauri/src/capture.rs.
"""

import json
import os
import subprocess
import sys
import tempfile
from pathlib import Path

# PyGObject is a distro package (python-gobject), not something that
# pip-installs cleanly into a venv — it needs gobject-introspection headers
# and a meson build. The project venv therefore doesn't have it, but the
# system interpreter does, and this script needs *only* gi plus the stdlib
# (no anthropic, no venv deps). So rather than making every caller pick the
# right interpreter, re-exec under one that can actually import gi.
def _reexec_with_system_python() -> None:
    import shutil

    # Set before exec so the replacement process can't bounce again if it
    # also lacks gi — one hop, then a real error message.
    if os.environ.get("TUTORIA_PORTAL_REEXEC"):
        return
    env_marker = dict(os.environ, TUTORIA_PORTAL_REEXEC="1")

    # Compared as written, not resolved: a venv's bin/python3 is usually a
    # symlink to the very same system binary, so realpath() would call them
    # identical — yet launching via the venv path is exactly what puts the
    # venv's (gi-less) site-packages in scope. The env marker above is what
    # actually prevents a loop.
    candidates = ["/usr/bin/python3", shutil.which("python3")]
    for candidate in candidates:
        if not candidate or os.path.abspath(candidate) == os.path.abspath(sys.executable):
            continue
        probe = subprocess.run([candidate, "-c", "import gi"], capture_output=True)
        if probe.returncode != 0:
            continue
        os.execve(candidate, [candidate, os.path.abspath(__file__), *sys.argv[1:]], env_marker)


try:
    import gi
except ModuleNotFoundError:
    _reexec_with_system_python()
    print(
        "portal_capture failed: PyGObject (python-gobject) isn't available to "
        f"{sys.executable}, and no system python3 with it was found. Install your "
        "distro's python-gobject package.",
        file=sys.stderr,
    )
    sys.exit(1)

gi.require_version("Gio", "2.0")
from gi.repository import Gio, GLib  # noqa: E402

# ScreenCast source types (portal spec): 1 = MONITOR, 2 = WINDOW, 4 = VIRTUAL.
# "any" offers both, which is what the compositor's own dialog already
# presents as Screen/Window tabs — letting it decide beats us forcing a
# choice before the user has seen the picker.
MONITOR, WINDOW = 1, 2
SOURCE_TYPES = {"monitor": MONITOR, "window": WINDOW, "any": MONITOR | WINDOW}
SOURCE_TYPE_NAMES = {MONITOR: "screen", WINDOW: "window"}

# persist_mode 2 = "permissions persist until explicitly revoked" — the
# thing that lets `capture` reuse a pick without re-prompting.
PERSIST_PERMANENT = 2

PORTAL_BUS = "org.freedesktop.portal.Desktop"
PORTAL_PATH = "/org/freedesktop/portal/desktop"
SCREENCAST_IFACE = "org.freedesktop.portal.ScreenCast"

# A pick has to outlive the process that made it (each capture spins up a
# fresh portal session and restores from this token), so it goes on disk.
def state_path(scope: str) -> Path:
    base = os.environ.get("XDG_STATE_HOME") or os.path.expanduser("~/.local/state")
    return Path(base) / "tutoria" / f"portal-{scope}.json"


def load_token(scope: str) -> str | None:
    try:
        return json.loads(state_path(scope).read_text()).get("restore_token")
    except (OSError, ValueError):
        return None


def save_token(scope: str, token: str | None) -> None:
    if not token:
        return
    path = state_path(scope)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps({"restore_token": token}))


class PortalSession:
    """One ScreenCast session: CreateSession -> SelectSources -> Start.

    Every portal call is asynchronous — it returns a Request object path
    and the real answer arrives later as a Response signal on that path —
    so each step here subscribes before calling and then runs a main loop
    until the response lands.
    """

    def __init__(self) -> None:
        self.bus = Gio.bus_get_sync(Gio.BusType.SESSION, None)
        self.unique = self.bus.get_unique_name()[1:].replace(".", "_")
        self.counter = 0
        self.session_handle: str | None = None

    def _call(self, method: str, args_after_token: dict, signature: str, *leading):
        """Invoke a portal method and block until its Response arrives.

        Returns (response_code, results_dict); code 0 = success, 1 =
        cancelled by the user, 2 = ended some other way.
        """
        self.counter += 1
        token = f"tutoria{self.counter}"
        request_path = f"/org/freedesktop/portal/desktop/request/{self.unique}/{token}"

        loop = GLib.MainLoop()
        out: dict = {}

        def on_response(_conn, _sender, _path, _iface, _sig, params):
            out["code"], out["results"] = params[0], dict(params[1])
            loop.quit()

        sub = self.bus.signal_subscribe(
            PORTAL_BUS, "org.freedesktop.portal.Request", "Response",
            request_path, None, Gio.DBusSignalFlags.NONE, on_response,
        )

        options = {"handle_token": GLib.Variant("s", token), **args_after_token}
        self.bus.call_sync(
            PORTAL_BUS, PORTAL_PATH, SCREENCAST_IFACE, method,
            GLib.Variant(signature, (*leading, options)),
            GLib.VariantType("(o)"), Gio.DBusCallFlags.NONE, -1, None,
        )

        # Generous: the interactive pick waits on a human, and the
        # non-interactive restore path still round-trips the compositor.
        GLib.timeout_add_seconds(300, lambda: (loop.quit(), False)[1])
        loop.run()
        self.bus.signal_unsubscribe(sub)

        if "code" not in out:
            raise RuntimeError(f"portal {method} timed out with no response")
        return out["code"], out["results"]

    def create(self) -> None:
        self.counter += 1
        session_token = f"tutoriasession{self.counter}"
        code, results = self._call(
            "CreateSession",
            {"session_handle_token": GLib.Variant("s", session_token)},
            "(a{sv})",
        )
        if code != 0:
            raise RuntimeError(f"portal CreateSession failed (code {code})")
        self.session_handle = results["session_handle"]

    def select_sources(self, scope: str, restore_token: str | None) -> None:
        options = {
            "types": GLib.Variant("u", SOURCE_TYPES[scope]),
            "multiple": GLib.Variant("b", False),
            # 1 = embed the cursor in the frames. The vision model does
            # better with the pointer visible (it's a strong hint about
            # what the user is looking at) than with it stripped out.
            "cursor_mode": GLib.Variant("u", 1),
            "persist_mode": GLib.Variant("u", PERSIST_PERMANENT),
        }
        if restore_token:
            options["restore_token"] = GLib.Variant("s", restore_token)
        code, _ = self._call("SelectSources", options, "(oa{sv})", self.session_handle)
        if code != 0:
            raise RuntimeError(f"portal SelectSources failed (code {code})")

    def start(self) -> dict:
        code, results = self._call("Start", {}, "(osa{sv})", self.session_handle, "")
        if code == 1:
            raise RuntimeError("the capture picker was cancelled")
        if code != 0:
            raise RuntimeError(f"portal Start failed (code {code})")

        streams = results.get("streams")
        if not streams:
            raise RuntimeError("portal returned no streams")
        node_id, props = streams[0]
        width, height = props.get("size", (0, 0))
        return {
            "node_id": node_id,
            "width": width,
            "height": height,
            # Which tab of the picker the user actually landed on — the
            # only thing the portal tells us about the chosen source. There
            # is deliberately no window title or app id here (that is the
            # whole point of the portal boundary), so anything the UI shows
            # has to be built from this plus the frame size.
            "source_type": props.get("source_type"),
            # Sent for monitor sources only (the spec makes it optional and
            # GNOME omits it for windows — confirmed by probing this
            # session). With it, a screen-scoped frame can be mapped back
            # onto absolute screen coordinates, which is what lets the
            # on-screen overlay draw at all on Wayland.
            "position": props.get("position"),
            # Only handed back when the compositor honoured persist_mode.
            "restore_token": results.get("restore_token"),
        }

    def open_pipewire_fd(self) -> int:
        """The sanctioned way to read the stream: a PipeWire fd scoped to
        this session, rather than connecting to the user's whole PipeWire
        socket and guessing at node ids."""
        reply, fds = self.bus.call_with_unix_fd_list_sync(
            PORTAL_BUS, PORTAL_PATH, SCREENCAST_IFACE, "OpenPipeWireRemote",
            GLib.Variant("(oa{sv})", (self.session_handle, {})),
            GLib.VariantType("(h)"), Gio.DBusCallFlags.NONE, -1, None, None,
        )
        return fds.get(reply.unpack()[0])

    def close(self) -> None:
        if not self.session_handle:
            return
        try:
            self.bus.call_sync(
                PORTAL_BUS, self.session_handle, "org.freedesktop.portal.Session",
                "Close", None, None, Gio.DBusCallFlags.NONE, 5000, None,
            )
        except GLib.Error:
            pass
        self.session_handle = None


def num_buffers_for(source_type: int | None, position: object) -> int:
    """How many PipeWire buffers to pull before keeping the last one.

    A monitor source streams continuously, so the first buffers after it
    starts can still be blank while the compositor gets going — worth
    taking a few and keeping the last. A window source is damage-driven
    (framerate=0/1): it emits a frame right after Start and then nothing
    more until the window actually redraws, so asking for a second buffer
    risks blocking for however long the window happens to sit idle (up to
    this call's 60s timeout). One buffer is what actually completes.

    `source_type` is optional per the portal spec — some implementations
    omit it (this file already documents GNOME omitting the *other*
    optional field, `position`, for windows). When it's missing, `position`
    is a decent proxy, since it's only ever sent for monitor sources. If
    both are missing, prefer the window assumption: a single buffer risks
    one blank frame (the vision call fails cleanly and can be retried),
    whereas guessing 5 on an actual window risks the 60s hang this
    function exists to prevent.
    """
    if source_type == WINDOW:
        return 1
    if source_type == MONITOR:
        return 5
    return 5 if position is not None else 1


def grab_frame(fd: int, node_id: int, out_path: str, source_type: int | None, position: object = None) -> None:
    """Pull a single frame off the PipeWire node into a PNG.

    GStreamer rather than a hand-rolled PipeWire client: pipewiresrc
    already handles the format negotiation and the fd hand-off, and it is
    a dependency the desktop already ships. See num_buffers_for() for how
    many buffers this asks for and why.
    """
    num_buffers = num_buffers_for(source_type, position)
    with tempfile.TemporaryDirectory() as tmpdir:
        pattern = os.path.join(tmpdir, "frame%05d.png")
        cmd = [
            "gst-launch-1.0", "-q",
            "pipewiresrc", f"fd={fd}", f"path={node_id}", f"num-buffers={num_buffers}", "!",
            "videoconvert", "!", "pngenc", "!",
            "multifilesink", f"location={pattern}",
        ]
        result = subprocess.run(cmd, capture_output=True, text=True, pass_fds=(fd,), timeout=60)
        frames = sorted(Path(tmpdir).glob("frame*.png"))
        if not frames:
            raise RuntimeError(
                f"pipewiresrc produced no frames (exit {result.returncode}): {result.stderr.strip()}"
            )
        os.replace(frames[-1], out_path)


def describe(stream: dict) -> str:
    kind = SOURCE_TYPE_NAMES.get(stream.get("source_type"), "source")
    return f"{kind} ({stream['width']}x{stream['height']})"


def do_pick(scope: str) -> dict:
    session = PortalSession()
    try:
        session.create()
        session.select_sources(scope, None)
        stream = session.start()
        save_token(scope, stream["restore_token"])
        return {
            "scope": scope,
            "width": stream["width"],
            "height": stream["height"],
            "source_type": SOURCE_TYPE_NAMES.get(stream.get("source_type")),
            "position": list(stream["position"]) if stream.get("position") else None,
            "label": describe(stream),
            # False means the compositor refused to persist the grant, so
            # every later capture will prompt again — worth surfacing
            # rather than discovering mid-demo.
            "persisted": bool(stream["restore_token"]),
        }
    finally:
        session.close()


def do_capture(out_path: str, scope: str) -> dict:
    token = load_token(scope)
    if not token:
        raise RuntimeError(
            f"no {scope} capture source has been picked yet — run `pick {scope}` first"
        )

    session = PortalSession()
    try:
        session.create()
        session.select_sources(scope, token)
        stream = session.start()
        # The compositor rotates the token on each use; keep the newest or
        # the next capture starts prompting again.
        save_token(scope, stream["restore_token"])
        fd = session.open_pipewire_fd()
        try:
            grab_frame(fd, stream["node_id"], out_path, stream.get("source_type"), stream.get("position"))
        finally:
            os.close(fd)
        return {
            "path": out_path,
            "width": stream["width"],
            "height": stream["height"],
            "label": describe(stream),
        }
    finally:
        session.close()


def main() -> None:
    args = sys.argv[1:]
    if not args or args[0] not in ("pick", "capture"):
        print(f"Usage: {sys.argv[0]} pick [any|window|monitor] | "
              f"capture <out.png> [any|window|monitor]",
              file=sys.stderr)
        sys.exit(1)

    try:
        if args[0] == "pick":
            scope = args[1] if len(args) > 1 else "any"
            print(json.dumps(do_pick(scope)))
        else:
            if len(args) < 2:
                print("capture needs an output path", file=sys.stderr)
                sys.exit(1)
            scope = args[2] if len(args) > 2 else "any"
            print(json.dumps(do_capture(args[1], scope)))
    except Exception as exc:  # noqa: BLE001 — CLI boundary, report and exit non-zero
        print(f"portal_capture failed: {exc}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
