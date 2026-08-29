import { useEffect, useRef, useState } from "react";
import { ArrowRight, MousePointer2, Video } from "lucide-react";
import GlassMascotCursor from "@mascot/GlassMascotCursor.jsx";
import WaitlistOverlay from "./Waitlist.jsx";
import { FLASH_BLUE, FLASH_PINK, Logo } from "./brand.jsx";

const INTRO_MS = 4200;

function IntroAnimation({ onDone }) {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const t = setTimeout(() => {
      setVisible(false);
      onDone(true);
    }, reduceMotion ? 1400 : INTRO_MS);
    return () => clearTimeout(t);
  }, [onDone]);

  if (!visible) return null;

  return (
    <div className="intro-overlay" aria-hidden="true">
      <div className="intro-mascot">
        <img src="/assets/mascot/mascot-happy.svg" alt="" width="118" height="136" draggable="false" />
      </div>
      <div className="intro-orbit">
        <div className="intro-radius">
          <div className="intro-pointer">
            <div className="intro-pointer-press">
              <MousePointer2 size={26} color="#111111" fill="#f6f6f6" strokeWidth={2.2} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

const HOW_STEPS = [
  {
    n: "1",
    title: "It reads your screen",
    body: "Guido looks at what's actually open — the app, the panel, the buttons in front of you. Not a generic recording made for someone else's setup.",
    tile: "linear-gradient(160deg, #c5e6fb 0%, #d9cef2 55%, #f3d4e6 100%)",
    num: "linear-gradient(180deg, #6eaee4 0%, #b592d8 52%, #e58ab4 100%)",
  },
  {
    n: "2",
    title: "It builds a real plan",
    body: "Ask for something and it researches first. Then it writes a short plan for your version of the software — not a script from someone else's screen.",
    tile: "linear-gradient(160deg, #d3d4f8 0%, #e4c8ee 50%, #f6c7dd 100%)",
    num: "linear-gradient(180deg, #8b9ae8 0%, #c89ad4 50%, #ee8eb8 100%)",
  },
  {
    n: "3",
    title: "It checks as you go",
    body: "After every step, Guido looks again. If you clicked the wrong thing or the screen changed, it adjusts instead of pushing you forward.",
    tile: "linear-gradient(160deg, #e0c8f4 0%, #f0c4e2 52%, #ffd2e4 100%)",
    num: "linear-gradient(180deg, #a88ad8 0%, #d89ac8 48%, #f48ab0 100%)",
  },
];

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

export default function Landing({ startWaitlist = false }) {
  const referredBy = new URLSearchParams(window.location.search).get("ref") || "";
  const [waitlistOpen, setWaitlistOpen] = useState(startWaitlist);
  const [introDone, setIntroDone] = useState(false);
  const [touchPointer] = useState(() =>
    typeof window !== "undefined" && window.matchMedia("(pointer: coarse)").matches
  );
  const heroGuidoRef = useRef(null);

  return (
    <div className="min-h-screen text-[#0A0A0A]" style={{ background: "#ffffff", fontFamily: "'Inter', sans-serif" }}>
      <IntroAnimation onDone={setIntroDone} />
      {introDone ? (
        <GlassMascotCursor
          disabled={touchPointer}
          size={72}
          restRef={heroGuidoRef}
          style={{ zIndex: 20 }}
        />
      ) : null}

      {/* Nav */}
      <header className="sticky top-0 z-30 backdrop-blur-md bg-white/85 border-b border-black/[0.06]">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-3">
          <Logo />
          <nav className="hidden md:flex items-center gap-8 text-sm font-medium text-neutral-600">
            <a href="#how-it-works" className="hover:text-black transition-colors">How it works</a>
            <a href="#works-with" className="hover:text-black transition-colors">Works with</a>
          </nav>
          <button
            type="button"
            onClick={() => setWaitlistOpen(true)}
            className="shrink-0 inline-flex items-center gap-2 rounded-full font-semibold px-3.5 py-1.5 text-[13px] sm:px-5 sm:py-2 sm:text-sm bg-white border border-black/15 text-[#0A0A0A] transition-all duration-200 hover:scale-105 hover:border-black/30"
            style={{ boxShadow: "0 0 0 rgba(196,181,253,0)" }}
            onMouseEnter={(e) => (e.currentTarget.style.boxShadow = "0 0 24px 6px rgba(196,181,253,0.35)")}
            onMouseLeave={(e) => (e.currentTarget.style.boxShadow = "0 0 0 rgba(196,181,253,0)")}
          >
            Join the waitlist
          </button>
        </div>
      </header>

      {/* Hero — clean, editor-vibe */}
      <section>
        <div
          className="pt-12 pb-12 sm:pt-20 sm:pb-20"
          style={{
            backgroundImage:
              "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='40' height='40'%3E%3Cpath d='M20 15v10M15 20h10' stroke='%23000000' stroke-opacity='0.09' stroke-width='1.2'/%3E%3C/svg%3E\")",
            backgroundRepeat: "repeat",
          }}
        >
          <div className="max-w-3xl mx-auto px-6 text-center">
            <div
              className="relative w-full max-w-3xl mx-auto overflow-hidden mb-8"
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
              <span ref={heroGuidoRef} className="hero-guido-rest" aria-hidden="true" />
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

        <div className="max-w-3xl mx-auto px-6 pt-6 pb-10 sm:pt-10 sm:pb-16 text-center">
          <div className="flex items-center justify-center gap-3 sm:gap-6 flex-wrap">
            {["Ask", "Learn", "Master"].map((word, i) => {
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

      {/* How it works, in more detail */}
      <section id="how-it-works" className="max-w-5xl mx-auto px-5 sm:px-6 py-14 sm:py-20 scroll-mt-16">
        <h2 className="how-section-title text-[1.7rem] sm:text-4xl text-center mb-10 sm:mb-14">
          A closer look at how it works
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {HOW_STEPS.map((step) => (
            <article key={step.n} className="how-step" style={{ background: step.tile }}>
              <span className="how-step-num mb-5" style={{ backgroundImage: step.num }}>
                {step.n}
              </span>
              <h3 className="how-step-title mb-3">{step.title}</h3>
              <p className="relative text-[15px] leading-relaxed text-[#2a2233]/70">
                {step.body}
              </p>
            </article>
          ))}
        </div>
      </section>

      {/* Works with — horizontal icon marquee */}
      <section id="works-with" className="border-y border-black/[0.06] bg-white scroll-mt-16 py-14 sm:py-20">
        <h2
          className="text-3xl sm:text-5xl font-semibold tracking-tight leading-[1.05] text-center max-w-2xl mx-auto px-6 mb-10 sm:mb-14"
          style={{ fontFamily: "'Space Grotesk', sans-serif" }}
        >
          Use it on everything you already have open.
        </h2>
        <WorksWithMarquee />
      </section>

      {/* Waitlist */}
      <section id="waitlist" className="max-w-6xl mx-auto px-5 sm:px-6 py-12 sm:py-16 text-center scroll-mt-16">
        <img
          src="/assets/get-guido.png"
          alt="Get Guido"
          className="w-full max-w-sm sm:max-w-2xl mx-auto mb-8 sm:mb-10"
        />

        <button
          type="button"
          onClick={() => setWaitlistOpen(true)}
          className="inline-flex items-center gap-2 rounded-full font-semibold px-7 py-3.5 text-[15px] bg-white border border-black/15 text-[#0A0A0A] transition-all duration-200 hover:scale-105 hover:border-black/30"
          style={{ boxShadow: "0 0 0 rgba(196,181,253,0)" }}
          onMouseEnter={(e) => (e.currentTarget.style.boxShadow = "0 0 36px 8px rgba(196,181,253,0.35)")}
          onMouseLeave={(e) => (e.currentTarget.style.boxShadow = "0 0 0 rgba(196,181,253,0)")}
        >
          Join the waitlist
        </button>
      </section>

      <WaitlistOverlay
        open={waitlistOpen}
        referredBy={referredBy}
        onClose={() => {
          setWaitlistOpen(false);
          if (window.location.pathname.replace(/\/+$/, "") === "/waitlist") {
            window.history.replaceState({}, "", "/");
          }
        }}
      />

      {/* Footer */}
      <footer className="border-t border-black/[0.06]">
        <div className="max-w-6xl mx-auto px-6 py-10 flex flex-col sm:flex-row items-center justify-between gap-4">
          <Logo />
          <div className="flex items-center flex-wrap justify-center gap-4">
            <p className="text-xs text-neutral-400">© Guido team</p>
            <a href="/login" className="text-xs text-neutral-400 hover:text-neutral-700">
              Sign in
            </a>
            <a href="/privacy.html" className="text-xs text-neutral-400 hover:text-neutral-700">
              Privacy policy
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}
