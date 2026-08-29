#!/usr/bin/env bash
# Register the Guido icon for the dev build on Linux desktops.
#
# On Wayland, GNOME ignores the icon a window sets on itself and instead looks
# up a .desktop file whose basename matches the surface app_id (here the binary
# name, "tauri-overlay"). Without one, the app shows the generic cog. Packaged
# .deb/.AppImage builds ship this file; running from `cargo tauri dev` does not.
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
app_id="tauri-overlay"
icons="$root/../../assets/mascot"
icon_dir="$HOME/.local/share/icons/hicolor"
apps_dir="$HOME/.local/share/applications"

for size in 16 32 64 128 256 512; do
  install -Dm644 "$icons/app-icon-$size.png" "$icon_dir/${size}x${size}/apps/$app_id.png"
done

mkdir -p "$apps_dir"
cat > "$apps_dir/$app_id.desktop" <<EOF
[Desktop Entry]
Type=Application
Name=Guido
Comment=AI software tutor (dev build)
Exec=$root/src-tauri/target/debug/$app_id
Icon=$app_id
StartupWMClass=$app_id
Terminal=false
Categories=Utility;
EOF

gtk-update-icon-cache -f -t "$icon_dir" 2>/dev/null || true
update-desktop-database "$apps_dir" 2>/dev/null || true
echo "installed $app_id.desktop + hicolor icons; restart the app to pick it up"
