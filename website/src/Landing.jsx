import { useEffect, useRef, useState } from "react";
import {
  MousePointer2,
  GraduationCap,
  Eye,
  Zap,
  Volume2,
  VolumeX,
  Play,
  ArrowRight,
  Apple,
  MonitorSmartphone,
  Command,
  Video,
} from "lucide-react";

const BRAND = "#B6FF3E";
const FLASH_PINK = "#FF2E9A";
const FLASH_BLUE = "#3B82F6";

const MODE_COLORS = {
  teach: { accent: "#3B82F6", text: "#ffffff" }, // blue — Notion
  show: { accent: "#B6FF3E", text: "#0A0A0A" }, // green — Excel
  do: { accent: "#A78BFA", text: "#0A0A0A" }, // violet — video editor
};

function IntroAnimation() {
  const [visible, setVisible] = useState(true);
  const duration = 2600;

  useEffect(() => {
    const t = setTimeout(() => setVisible(false), duration);
    return () => clearTimeout(t);
  }, []);

  if (!visible) return null;

  return (
    <div
      className="fixed inset-0 z-[100] pointer-events-none flex items-center justify-center"
      style={{ animation: `intro-bg-fade ${duration}ms ease forwards` }}
    >
      <div className="absolute inset-0 bg-white" />

      {/* the mark: empty green square -> flips black once "clicked" */}
      <div
        className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-20 h-20 rounded-[22px] shadow-[0_20px_50px_-15px_rgba(0,0,0,0.25)]"
        style={{ animation: `intro-mark-color ${duration}ms steps(1) forwards` }}
      />

      {/* cursor: arcs around the mark, lands centered, crossfades outline -> solid brand */}
      <div
        className="absolute top-1/2 left-1/2 w-11 h-11 flex items-center justify-center"
        style={{ animation: `intro-arc ${duration}ms cubic-bezier(0.4,0,0.2,1) forwards` }}
      >
        <div
          className="absolute drop-shadow-[0_10px_16px_rgba(0,0,0,0.35)]"
          style={{ animation: `intro-cursor-outline ${duration}ms steps(1) forwards` }}
        >
          <MousePointer2 size={34} color="#0A0A0A" fill="white" strokeWidth={2} />
        </div>
        <div
          className="absolute"
          style={{ animation: `intro-cursor-solid ${duration}ms steps(1) forwards` }}
        >
          <MousePointer2 size={20} color={BRAND} strokeWidth={2.5} />
        </div>
      </div>
    </div>
  );
}

function Logo() {
  return (
    <div className="flex items-center gap-2.5">
      <img
        src="/assets/guido-icon.png"
        alt="Guido"
        className="w-11 h-11 rounded-xl"
        style={{
          border: "1.5px solid rgba(0,0,0,0.1)",
          boxShadow: "0 0 0 4px rgba(196,181,253,0.15), 0 4px 10px -2px rgba(0,0,0,0.15)",
        }}
      />
      <span className="font-semibold text-[17px] tracking-tight" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
        Guido
      </span>
    </div>
  );
}

function DownloadButton({ className = "" }) {
  const [clicked, setClicked] = useState(false);
  const [pressed, setPressed] = useState(false);
  return (
    <button
      type="button"
      onClick={() => {
        setClicked(true);
        setTimeout(() => setClicked(false), 1600);
      }}
      onPointerDown={() => setPressed(true)}
      onPointerUp={() => setPressed(false)}
      onPointerLeave={() => setPressed(false)}
      className={`relative inline-flex items-center gap-2 rounded-full font-semibold text-white overflow-hidden transition-transform duration-100 ${className}`}
      style={{
        background: "linear-gradient(180deg, #2a2a2a 0%, #0A0A0A 60%, #000000 100%)",
        boxShadow: pressed
          ? "0 1px 0 0 #000, 0 2px 6px -2px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.15)"
          : "0 5px 0 0 #000, 0 14px 26px -10px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.2)",
        transform: pressed ? "translateY(4px)" : "translateY(0)",
      }}
    >
      <span
        className="absolute inset-x-1 top-1 h-1/3 rounded-full pointer-events-none"
        style={{ background: "linear-gradient(180deg, rgba(255,255,255,0.25), rgba(255,255,255,0))" }}
      />
      <span className="relative flex items-center gap-2">
        {clicked ? (
          "Coming soon"
        ) : (
          <>
            <Apple size={15} />
            Download free
          </>
        )}
      </span>
    </button>
  );
}

function WindowChrome({ title, onDotClick, cream }) {
  const dots = [
    { key: "red", bg: "#FF5F57" },
    { key: "yellow", bg: "#FEBC2E" },
    { key: "green", bg: "#28C840" },
  ];
  return (
    <div
      className="flex items-center gap-2 px-3.5 py-2.5 border-b border-black/[0.06]"
      style={cream ? { background: "#FBF3E7" } : undefined}
    >
      {dots.map((dot) =>
        onDotClick ? (
          <button
            key={dot.key}
            type="button"
            onClick={() => onDotClick(dot.key)}
            className="w-3 h-3 rounded-full p-0 border-0 cursor-pointer"
            style={{ background: dot.bg }}
          />
        ) : (
          <div key={dot.key} className="w-3 h-3 rounded-full" style={{ background: dot.bg }} />
        )
      )}
      <div className="ml-2 text-[10px] text-neutral-400 font-medium truncate">{title}</div>
    </div>
  );
}

const PLATFORMS = [
  { id: "mac", label: "macOS", icon: Apple },
  { id: "windows", label: "Windows", icon: MonitorSmartphone },
  { id: "linux", label: "Linux", icon: Command },
];

function DesktopDownloadWindow({ onClose }) {
  const [platform, setPlatform] = useState("mac");
  const [clicked, setClicked] = useState(false);
  const current = PLATFORMS.find((p) => p.id === platform);
  const Icon = current.icon;

  return (
    <div className="max-w-3xl w-full mx-auto rounded-3xl border border-black/10 bg-white shadow-[0_30px_80px_-30px_rgba(0,0,0,0.25)] overflow-hidden">
      <WindowChrome
        title="Guido — in one click"
        cream
        onDotClick={(dot) => {
          if (dot === "red") onClose?.();
        }}
      />
      <div
        className="flex flex-col items-center gap-8 px-10 py-16"
        style={{
          backgroundImage: "radial-gradient(rgba(0,0,0,0.08) 1px, transparent 1px)",
          backgroundSize: "22px 22px",
        }}
      >
        <div className="inline-flex items-center gap-1 rounded-full p-1.5" style={{ background: "#EFEFEF" }}>
          {PLATFORMS.map((p) => {
            const PIcon = p.icon;
            const active = p.id === platform;
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => {
                  setPlatform(p.id);
                  setClicked(false);
                }}
                className="flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-semibold transition-colors duration-200"
                style={{ background: active ? "#0A0A0A" : "transparent", color: active ? "#ffffff" : "#6b6b6b" }}
              >
                <PIcon size={14} />
                {p.label}
              </button>
            );
          })}
        </div>

        <button
          type="button"
          onClick={() => {
            setClicked(true);
            setTimeout(() => setClicked(false), 1600);
          }}
          className="relative inline-flex items-center gap-2 rounded-full font-semibold text-white overflow-hidden transition-transform duration-100 px-7 py-3.5 text-[15px]"
          style={{
            background: "linear-gradient(180deg, #2a2a2a 0%, #0A0A0A 60%, #000000 100%)",
            boxShadow: "0 5px 0 0 #000, 0 14px 26px -10px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.2)",
          }}
        >
          <span
            className="absolute inset-x-1 top-1 h-1/3 rounded-full pointer-events-none"
            style={{ background: "linear-gradient(180deg, rgba(255,255,255,0.25), rgba(255,255,255,0))" }}
          />
          <span className="relative flex items-center gap-2">
            <Icon size={15} />
            {clicked ? "Coming soon" : `Download for ${current.label}`}
          </span>
        </button>
      </div>
    </div>
  );
}

const MODES = [
  {
    id: "teach",
    label: "Teach",
    tag: "Default",
    icon: GraduationCap,
    app: "NOTION",
    description: "Learn by doing. Guido guides you step by step, highlights the right controls, and checks your progress before moving forward.",
  },
  {
    id: "show",
    label: "Show",
    icon: Eye,
    app: "EXCEL",
    description: "Understand what you are looking at. Guido highlights any element on your screen and explains what it is, what it does, and when to use it.",
  },
  {
    id: "do",
    label: "Do",
    icon: Zap,
    app: "VIDEO EDITOR",
    description: "Let Guido handle it for you. It performs the action directly on your screen, then clearly explains what it did so you stay in control.",
  },
];

function EqBars({ active, color }) {
  const heights = [40, 70, 100, 55, 85, 45, 65];
  return (
    <div className="flex items-end gap-[3px] h-6">
      {heights.map((h, i) => (
        <span
          key={i}
          className="w-[3px] rounded-full"
          style={{
            height: `${h}%`,
            background: active ? color : "#3a3a3a",
            transformOrigin: "bottom",
            animation: active ? `eq-bar ${0.6 + (i % 3) * 0.15}s ease-in-out infinite` : "none",
            animationDelay: `${i * 0.07}s`,
            transform: active ? undefined : "scaleY(0.25)",
            transition: "transform 0.3s ease, background 0.3s ease",
          }}
        />
      ))}
    </div>
  );
}

// Real logos where we have them (public/assets); generic placeholders for the rest.
const WORKS_WITH = [
  { name: "Notion", img: "/assets/notion.png" },
  { name: "Excel", img: "/assets/excel.png" },
  { name: "Figma", img: "/assets/figma.png" },
  { name: "GitHub", img: "/assets/github.svg" },
  { name: "Video editor", img: "/assets/video-editor.png" },
  { name: "VS Code", img: "/assets/vscode.png" },
  { name: "Blender", img: "/assets/blender.png" },
  { name: "DaVinci Resolve", icon: Video, bg: "#1B1B3A", fg: "#ffffff" },
];

function WorksWithMarquee() {
  const items = [...WORKS_WITH, ...WORKS_WITH];
  return (
    <div
      className="relative overflow-hidden py-2"
      style={{ maskImage: "linear-gradient(to right, transparent, black 8%, black 92%, transparent)" }}
    >
      <div className="flex gap-6 w-max px-2" style={{ animation: "marquee-x 22s linear infinite" }}>
        {items.map((app, i) => {
          const Icon = app.icon;
          const tilt = i % 2 === 0 ? -4 : 4;
          return (
            <div key={i} className="flex flex-col items-center gap-2 shrink-0 w-32">
              <div
                className="w-28 h-28 rounded-2xl flex items-center justify-center transition-transform duration-200 hover:-translate-y-1"
                style={{
                  background: app.img ? "#ffffff" : `linear-gradient(160deg, ${app.bg}, ${app.bg}dd)`,
                  boxShadow: app.img
                    ? "0 5px 0 0 rgba(0,0,0,0.1), inset 0 1px 0 rgba(255,255,255,0.9), 0 16px 26px -12px rgba(0,0,0,0.25)"
                    : "0 5px 0 0 rgba(0,0,0,0.25), inset 0 1px 0 rgba(255,255,255,0.35), 0 16px 26px -12px rgba(0,0,0,0.4)",
                  border: app.img ? "1px solid rgba(0,0,0,0.06)" : "none",
                  transform: `rotate(${tilt}deg)`,
                }}
              >
                {app.img ? (
                  <img src={app.img} alt={app.name} className="w-24 h-24 object-contain" />
                ) : (
                  <Icon size={48} color={app.fg} strokeWidth={1.6} />
                )}
              </div>
              <span className="text-xs font-semibold text-neutral-500 text-center">{app.name}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function Landing() {
  const [activeMode, setActiveMode] = useState("teach");
  const [audioOn, setAudioOn] = useState(false);
  const [demoInView, setDemoInView] = useState(false);
  const [shaking, setShaking] = useState(false);
  const [demoExpanded, setDemoExpanded] = useState(false);
  const [downloadOpen, setDownloadOpen] = useState(false);
  const demoPanelRef = useRef(null);
  const mode = MODES.find((m) => m.id === activeMode);
  const color = MODE_COLORS[activeMode];

  function selectMode(id) {
    setActiveMode(id);
    setAudioOn(false);
  }

  function handleDotClick(dot) {
    if (demoExpanded) {
      if (dot === "red") setDemoExpanded(false);
      return;
    }
    if (dot === "green") {
      setDemoExpanded(true);
    } else {
      setShaking(true);
      setTimeout(() => setShaking(false), 500);
    }
  }

  useEffect(() => {
    const el = demoPanelRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setDemoInView(true);
          observer.unobserve(entry.target);
        }
      },
      { threshold: 0.25 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div className="min-h-screen text-[#0A0A0A]" style={{ background: "#ffffff", fontFamily: "'Inter', sans-serif" }}>
      {/* <IntroAnimation /> temporarily disabled for testing */}

      {/* Nav */}
      <header className="sticky top-0 z-30 backdrop-blur-md bg-white/85 border-b border-black/[0.06]">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <Logo />
          <nav className="hidden md:flex items-center gap-8 text-sm font-medium text-neutral-600">
            <a href="#demo" className="hover:text-black transition-colors">How it works</a>
            <a href="#works-with" className="hover:text-black transition-colors">Works with</a>
          </nav>
          <button
            type="button"
            onClick={() => setDownloadOpen(true)}
            className="inline-flex items-center gap-2 rounded-full font-semibold px-5 py-2 text-sm bg-white border border-black/15 text-[#0A0A0A] transition-all duration-200 hover:scale-105 hover:border-black/30"
            style={{ boxShadow: "0 0 0 rgba(196,181,253,0)" }}
            onMouseEnter={(e) => (e.currentTarget.style.boxShadow = "0 0 24px 6px rgba(196,181,253,0.35)")}
            onMouseLeave={(e) => (e.currentTarget.style.boxShadow = "0 0 0 rgba(196,181,253,0)")}
          >
            Download for free
          </button>
        </div>
      </header>

      {/* Hero — clean, editor-vibe */}
      <section>
        <div
          className="pt-20 pb-10"
          style={{
            backgroundImage:
              "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='40' height='40'%3E%3Cpath d='M20 15v10M15 20h10' stroke='%23000000' stroke-opacity='0.09' stroke-width='1.2'/%3E%3C/svg%3E\")",
            backgroundRepeat: "repeat",
          }}
        >
          <div className="max-w-3xl mx-auto px-6 text-center">
            <div
              className="w-full max-w-3xl mx-auto overflow-hidden mb-8"
              style={{
                background: "#fcfcfc",
                maskImage: "radial-gradient(ellipse 65% 70% at center, black 55%, transparent 100%)",
                WebkitMaskImage: "radial-gradient(ellipse 65% 70% at center, black 55%, transparent 100%)",
              }}
            >
              <video
                src="/assets/hero-demo.mp4"
                className="w-full h-auto block"
                autoPlay
                muted
                playsInline
              />
            </div>

            <h2
              className="uppercase font-extrabold tracking-wide text-2xl sm:text-3xl mb-6 leading-tight"
              style={{ fontFamily: "'Space Grotesk', sans-serif", color: FLASH_PINK }}
            >
              Your step-by-step guide for learning any software
            </h2>

            <p className="text-neutral-600 text-[17px] leading-relaxed max-w-lg mx-auto">
              Guido watches your screen and shows you exactly where to click.{" "}
              <span className="font-bold text-neutral-800">
                Learn any app by{" "}
                <span className="relative whitespace-nowrap">
                  <span className="relative z-10">doing it, live.</span>
                  <span className="absolute inset-x-0 bottom-0.5 h-2.5 -z-0" style={{ background: `${FLASH_BLUE}55` }} />
                </span>
              </span>
            </p>
          </div>
        </div>

        <div className="max-w-3xl mx-auto px-6 pt-10 pb-16 text-center">
          <div className="flex items-center justify-center gap-3 sm:gap-6 flex-wrap">
            {["Follow", "Learn", "Master"].map((word, i) => {
              const weight = i === 0 ? 400 : i === 1 ? 600 : 800;
              const col = i === 0 ? "#a0a0a0" : i === 1 ? `${FLASH_PINK}99` : FLASH_PINK;
              return (
                <div key={word} className="flex items-center gap-3 sm:gap-6">
                  <span
                    className="text-base sm:text-lg tracking-tight"
                    style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: weight, color: col }}
                  >
                    {word}
                  </span>
                  {i < 2 && <ArrowRight size={16} className="text-neutral-300" />}
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Interactive demo */}
      <section id="demo" className="max-w-5xl mx-auto px-6 pb-24 scroll-mt-16">
        <div className="flex justify-center mb-8">
          <div className="inline-flex items-center gap-1 bg-white border border-black/10 rounded-full p-1">
            {MODES.map((m) => {
              const Icon = m.icon;
              const isActive = m.id === activeMode;
              const c = MODE_COLORS[m.id];
              return (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => selectMode(m.id)}
                  className="relative flex items-center gap-2 rounded-full px-5 py-2.5 text-sm font-semibold transition-colors duration-300"
                  style={{
                    background: isActive ? c.accent : "transparent",
                    color: isActive ? c.text : "#6b6b6b",
                  }}
                >
                  <Icon size={15} />
                  {m.label}
                  {m.tag && !isActive && (
                    <span className="text-[9px] font-bold uppercase text-neutral-400 hidden sm:inline">
                      {m.tag}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        <div className="max-w-xl mx-auto mt-10 mb-12">
          <div className="relative">
            <div
              className="rounded-3xl px-7 py-6 text-base font-bold leading-relaxed border transition-colors duration-300"
              style={{ background: `${color.accent}12`, borderColor: `${color.accent}40`, color: "#2a2a2a" }}
            >
              {mode.description}
            </div>
            <div
              className="absolute left-10 -bottom-2 w-0 h-0 transition-colors duration-300"
              style={{
                borderLeft: "8px solid transparent",
                borderRight: "8px solid transparent",
                borderTop: `8px solid ${color.accent}12`,
              }}
            />
          </div>
        </div>

        {/* Big video panel */}
        {demoExpanded && (
          <div
            className="fixed inset-0 z-40"
            style={{ background: "rgba(10,10,10,0.55)", backdropFilter: "blur(10px)" }}
            onClick={() => setDemoExpanded(false)}
          />
        )}
        <div
          ref={demoPanelRef}
          className={`rounded-3xl border bg-white overflow-hidden transition-all duration-500 ease-out ${
            demoExpanded ? "fixed left-1/2 top-1/2 z-50 w-[92vw] max-w-6xl" : ""
          }`}
          style={{
            borderColor: `${color.accent}55`,
            boxShadow: `0 40px 90px -20px rgba(0,0,0,0.35), 0 0 70px -10px ${color.accent}66`,
            transform: demoExpanded ? "translate(-50%, -50%)" : demoInView ? "scale(1)" : "scale(0.92)",
            opacity: demoInView ? 1 : 0,
            animation: shaking ? "shake-no 0.5s ease-in-out" : "none",
          }}
        >
          <WindowChrome title={mode.app} onDotClick={handleDotClick} />
          <div className="relative bg-neutral-950 aspect-video flex items-center justify-center">
            <div className="absolute inset-0 opacity-50" style={{ background: "radial-gradient(circle at 25% 20%, #1c1c1c, #000)" }} />

            {activeMode === "teach" && (
              <div className="relative grid grid-cols-6 gap-2 w-2/3">
                {Array.from({ length: 12 }).map((_, i) => (
                  <div key={i} className="h-8 rounded bg-white/5 border border-white/10" />
                ))}
              </div>
            )}
            {activeMode === "show" && (
              <div className="relative grid grid-cols-5 gap-2 w-2/3">
                {Array.from({ length: 15 }).map((_, i) => (
                  <div key={i} className="h-6 rounded-sm bg-white/5 border border-white/10" />
                ))}
              </div>
            )}
            {activeMode === "do" && (
              <div className="relative w-2/3 h-24 rounded-lg bg-white/5 border border-white/10 flex items-end gap-1 p-3">
                {[30, 60, 40, 80, 50, 65, 35, 90, 45].map((h, i) => (
                  <div key={i} className="flex-1 rounded-sm" style={{ height: `${h}%`, background: "rgba(255,255,255,0.08)" }} />
                ))}
              </div>
            )}

            <button
              type="button"
              onClick={() => setAudioOn((v) => !v)}
              className="absolute w-16 h-16 rounded-full flex items-center justify-center border-2 transition-all duration-300 hover:scale-105"
              style={{ borderColor: color.accent, background: "rgba(10,10,10,0.7)" }}
            >
              <Play size={22} color={color.accent} fill={audioOn ? color.accent : "none"} />
            </button>

            <span className="absolute top-4 right-4 text-[10px] font-bold uppercase tracking-wide text-neutral-500 bg-white/5 border border-white/10 rounded-full px-2.5 py-1">
              Demo coming soon
            </span>
          </div>

          {/* Audio bar visualizer */}
          <div className="flex items-center justify-between gap-4 px-5 py-4 bg-black border-t border-white/10">
            <button
              type="button"
              onClick={() => setAudioOn((v) => !v)}
              className="flex items-center gap-2 text-xs font-semibold transition-colors"
              style={{ color: audioOn ? color.accent : "#a0a0a0" }}
            >
              {audioOn ? <Volume2 size={15} color={color.accent} /> : <VolumeX size={15} />}
              {audioOn ? "Audio on" : "Tap to hear it"}
            </button>
            <EqBars active={audioOn} color={color.accent} />
          </div>
        </div>
      </section>

      {/* Works with — horizontal icon marquee */}
      <section id="works-with" className="border-y border-black/[0.06] bg-white scroll-mt-16 py-20">
        <h2
          className="text-4xl sm:text-5xl font-semibold tracking-tight leading-[1.05] text-center max-w-2xl mx-auto px-6 mb-14"
          style={{ fontFamily: "'Space Grotesk', sans-serif" }}
        >
          Use it on everything you already have open.
        </h2>
        <WorksWithMarquee />
      </section>

      {/* Download */}
      <section id="download" className="max-w-6xl mx-auto px-6 py-16 text-center scroll-mt-16">
        <img
          src="/assets/get-guido.png"
          alt="Get Guido"
          className="w-full max-w-2xl mx-auto mb-10"
        />

        <button
          type="button"
          onClick={() => setDownloadOpen(true)}
          className="inline-flex items-center gap-2 rounded-full font-semibold px-7 py-3.5 text-[15px] bg-white border border-black/15 text-[#0A0A0A] transition-all duration-200 hover:scale-105 hover:border-black/30"
          style={{ boxShadow: "0 0 0 rgba(196,181,253,0)" }}
          onMouseEnter={(e) => (e.currentTarget.style.boxShadow = "0 0 36px 8px rgba(196,181,253,0.35)")}
          onMouseLeave={(e) => (e.currentTarget.style.boxShadow = "0 0 0 rgba(196,181,253,0)")}
        >
          Download for free
        </button>
      </section>

      {downloadOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-6"
          style={{ background: "rgba(10,10,10,0.55)", backdropFilter: "blur(10px)" }}
          onClick={() => setDownloadOpen(false)}
        >
          <div onClick={(e) => e.stopPropagation()}>
            <DesktopDownloadWindow onClose={() => setDownloadOpen(false)} />
          </div>
        </div>
      )}

      {/* Footer */}
      <footer className="border-t border-black/[0.06]">
        <div className="max-w-6xl mx-auto px-6 py-10 flex flex-col sm:flex-row items-center justify-between gap-4">
          <Logo />
          <p className="text-xs text-neutral-400">© Guido team</p>
        </div>
      </footer>
    </div>
  );
}
