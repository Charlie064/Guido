import { useEffect, useState } from "react";
import { Apple, Command, MonitorSmartphone } from "lucide-react";

export const RELEASES_BASE = "https://github.com/Charlie064/Guido/releases/latest/download";

const PLATFORMS = [
  { id: "mac", label: "macOS", icon: Apple, file: "Guido_mac.dmg" },
  { id: "windows", label: "Windows", icon: MonitorSmartphone, file: "Guido_windows.exe" },
  { id: "linux", label: "Linux", icon: Command, file: "Guido_linux.AppImage" },
];

function detectPlatform() {
  if (typeof navigator === "undefined") return "mac";
  const ua = navigator.userAgent;
  if (/Win/i.test(ua)) return "windows";
  if (/Linux/i.test(ua) && !/Android/i.test(ua)) return "linux";
  return "mac";
}

function WindowChrome({ title, onClose }) {
  return (
    <div className="flex items-center gap-2 px-3.5 py-2.5 border-b border-black/[0.06]" style={{ background: "#FBF3E7" }}>
      <button type="button" onClick={onClose} className="w-3 h-3 rounded-full p-0 border-0 cursor-pointer" style={{ background: "#FF5F57" }} aria-label="Close" />
      <span className="w-3 h-3 rounded-full" style={{ background: "#FEBC2E" }} />
      <span className="w-3 h-3 rounded-full" style={{ background: "#28C840" }} />
      <div className="ml-2 text-[10px] text-neutral-400 font-medium truncate">{title}</div>
    </div>
  );
}

function DesktopDownloadWindow({ onClose }) {
  const [platform, setPlatform] = useState(detectPlatform);
  const current = PLATFORMS.find((p) => p.id === platform);
  const Icon = current.icon;

  return (
    <div className="download-card">
      <WindowChrome title="Guido — in one click" onClose={onClose} />
      <div className="download-card-body">
        <div className="download-platforms">
          {PLATFORMS.map((p) => {
            const PIcon = p.icon;
            const active = p.id === platform;
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => setPlatform(p.id)}
                className={`download-platform${active ? " is-on" : ""}`}
              >
                <PIcon size={14} />
                {p.label}
              </button>
            );
          })}
        </div>
        <a href={`${RELEASES_BASE}/${current.file}`} className="download-cta download-cta-lg">
          <Icon size={15} />
          {`Download for ${current.label}`}
        </a>
      </div>
    </div>
  );
}

export function DownloadOverlay({ open, onClose }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="download-overlay" onClick={onClose} role="presentation">
      <div className="download-shell" onClick={(e) => e.stopPropagation()}>
        <DesktopDownloadWindow onClose={onClose} />
      </div>
    </div>
  );
}
