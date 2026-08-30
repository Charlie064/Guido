import { useEffect, useRef, useState } from "react";
import { ArrowRight, MousePointer2 } from "lucide-react";
import GlassMascotCursor from "@mascot/GlassMascotCursor.jsx";
import WaitlistOverlay from "./Waitlist.jsx";
import { FLASH_BLUE } from "./brand.jsx";
import { SiteFooter, SiteHeader } from "./SiteChrome.jsx";

const INTRO_MS = 4200;
const LANDING_HASHES = new Set(["how-it-works", "works-with", "waitlist"]);

function landingHash() {
  return window.location.hash.replace(/^#/, "");
}

function skipIntro() {
  return LANDING_HASHES.has(landingHash());
}

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
  { name: "DaVinci Resolve", img: "/assets/davinci-resolve.svg" },
];

function WorksWithMarquee() {
  const items = [...WORKS_WITH, ...WORKS_WITH];
  return (
    <div
      className="works-marquee"
      style={{ maskImage: "linear-gradient(to right, transparent, black 8%, black 92%, transparent)" }}
    >
      <div className="works-track">
        {items.map((app, i) => (
          <div key={i} className="works-item">
            <div className="works-tile">
              <img src={app.img} alt="" className="works-logo" />
            </div>
            <span className="works-label">{app.name}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function Landing({ startWaitlist = false }) {
  const referredBy = new URLSearchParams(window.location.search).get("ref") || "";
  const [waitlistOpen, setWaitlistOpen] = useState(startWaitlist);
  const [introDone, setIntroDone] = useState(() => skipIntro());
  const [touchPointer] = useState(() =>
    typeof window !== "undefined" && window.matchMedia("(pointer: coarse)").matches
  );
  const heroGuidoRef = useRef(null);
  const heroVideoRef = useRef(null);

  useEffect(() => {
    const id = landingHash();
    if (!LANDING_HASHES.has(id)) return;
    const jump = () => document.getElementById(id)?.scrollIntoView();
    jump();
    const raf = requestAnimationFrame(jump);
    return () => cancelAnimationFrame(raf);
  }, []);

  useEffect(() => {
    const video = heroVideoRef.current;
    if (!video) return;
    const settle = () => {
      const t = Number.isFinite(video.duration) ? Math.min(0.45, video.duration * 0.16) : 0.4;
      video.muted = true;
      const freeze = () => {
        video.pause();
        video.currentTime = t;
      };
      const play = video.play();
      if (play && typeof play.then === "function") play.then(freeze).catch(freeze);
      else freeze();
    };
    if (video.readyState >= 2) settle();
    else video.addEventListener("loadeddata", settle, { once: true });
    return () => video.removeEventListener("loadeddata", settle);
  }, []);

  return (
    <div className="min-h-screen text-[#0A0A0A]" style={{ background: "#ffffff", fontFamily: "'Inter', sans-serif" }}>
      {introDone ? null : <IntroAnimation onDone={setIntroDone} />}
      {introDone ? (
        <GlassMascotCursor
          disabled={touchPointer}
          size={72}
          restRef={heroGuidoRef}
          style={{ zIndex: 20 }}
        />
      ) : null}

      {/* Nav — links stay laptop-only (`site-nav`). Phone keeps logo + CTA. */}
      <SiteHeader onJoin={() => setWaitlistOpen(true)} />

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
              className="hero-mark relative w-full max-w-3xl mx-auto overflow-hidden mb-8"
              style={{
                background: "#fcfcfc",
                maskImage: "radial-gradient(ellipse 65% 70% at center, black 55%, transparent 100%)",
                WebkitMaskImage: "radial-gradient(ellipse 65% 70% at center, black 55%, transparent 100%)",
              }}
            >
              <video
                ref={heroVideoRef}
                src="/assets/hero-demo.mp4"
                className="w-full h-auto block"
                muted
                playsInline
                preload="auto"
              />
              <span ref={heroGuidoRef} className="hero-guido-rest" aria-hidden="true" />
            </div>

            <h2 className="hero-headline">
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

        <div className="hero-path" aria-hidden="true">
          {["Ask", "Learn", "Master"].map((word, i) => (
            <span key={word} className="hero-path-item">
              {i > 0 ? <ArrowRight size={14} strokeWidth={2.2} /> : null}
              <span data-step={i}>{word}</span>
            </span>
          ))}
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
          className="waitlist-cta waitlist-cta-lg"
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

      <SiteFooter />
    </div>
  );
}
