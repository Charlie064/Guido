import { useState } from "react";
import GlassMascot from "@mascot/GlassMascot.jsx";
import GlassMascotCursor from "@mascot/GlassMascotCursor.jsx";
import { FLASH_PINK, FLASH_BLUE, GoogleMark, GuidoButton, Logo, PlusGrid } from "./brand.jsx";

const ERRORS = {
  not_configured: "Google sign-in isn’t set up on this Worker yet.",
  desktop_only: "Open Guido on your desktop to sign in. This page finishes a login the app started.",
  google: "Google cancelled or rejected the sign-in. You can try again.",
  missing_code: "The sign-in response was incomplete. Start again from the app.",
  expired: "That sign-in link expired. Start again from the app.",
  token: "Couldn’t finish signing in with Google. Try again.",
  profile: "Google didn’t return an email we could use. Try another account.",
};

export default function Login() {
  const params = new URLSearchParams(window.location.search);
  const loopback = params.get("loopback");
  const error = ERRORS[params.get("error")] ?? null;
  const startHref = loopback
    ? `/auth/google/start?loopback=${encodeURIComponent(loopback)}`
    : null;
  const face = error ? "error" : startHref ? "happy" : "idle";
  const [touchPointer] = useState(() =>
    typeof window !== "undefined" && window.matchMedia("(pointer: coarse)").matches
  );

  return (
    <div className="min-h-screen text-[#0A0A0A]" style={{ background: "#ffffff", fontFamily: "'Inter', sans-serif" }}>
      <GlassMascotCursor disabled={touchPointer} size={72} style={{ zIndex: 20 }} />
      <header className="sticky top-0 z-30 backdrop-blur-md bg-white/85 border-b border-black/[0.06]">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <a href="/" className="no-underline text-inherit">
            <Logo />
          </a>
          <a href="/privacy.html" className="text-sm font-medium text-neutral-600 hover:text-black transition-colors">
            Privacy
          </a>
        </div>
      </header>

      <PlusGrid className="min-h-[calc(100vh-4rem)] flex items-center justify-center px-6 py-16">
        <div className="w-full max-w-md rounded-3xl border border-black/10 bg-white shadow-[0_30px_80px_-30px_rgba(0,0,0,0.25)] overflow-hidden">
          <div className="flex flex-col items-center gap-6 px-8 py-14 text-center">
            <GlassMascot state={face} size={120} />
            <div>
              <h1
                className="uppercase font-extrabold tracking-wide text-xl sm:text-2xl leading-tight"
                style={{ fontFamily: "'Space Grotesk', sans-serif", color: FLASH_PINK }}
              >
                Sign in to Guido
              </h1>
              <p className="mt-3 text-neutral-600 text-[15px] leading-relaxed">
                Same Google account the desktop app uses.{" "}
                <span className="font-bold text-neutral-800">
                  Learn any app by{" "}
                  <span className="relative whitespace-nowrap">
                    <span className="relative z-10">doing it, live.</span>
                    <span className="absolute inset-x-0 bottom-0.5 h-2.5 -z-0" style={{ background: `${FLASH_BLUE}55` }} />
                  </span>
                </span>
              </p>
            </div>

            {error ? (
              <p className="text-sm text-neutral-600 leading-relaxed max-w-sm">{error}</p>
            ) : null}

            {startHref ? (
              <GuidoButton href={startHref} className="px-7 py-3.5 text-[15px] w-full max-w-xs">
                <GoogleMark />
                Sign in with Google
              </GuidoButton>
            ) : (
              <p className="text-sm text-neutral-500 leading-relaxed max-w-sm">
                Sign-in starts from the Guido desktop app. It will open this page with a one-time return address.
              </p>
            )}

            <a href="/" className="text-xs text-neutral-400 hover:text-neutral-700">
              Back to the site
            </a>
          </div>
        </div>
      </PlusGrid>
    </div>
  );
}
