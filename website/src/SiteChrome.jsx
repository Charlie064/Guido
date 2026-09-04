import { useEffect, useRef, useState } from "react";
import { Logo } from "./brand.jsx";

/** Scroll distance (px) over which the header eases from full bar → pill. */
const COMPACT_RANGE = 100;

function smoothstep(t) {
  const x = Math.min(1, Math.max(0, t));
  return x * x * (3 - 2 * x);
}

export function SiteHeader({ onJoin, current = "home" }) {
  const headerRef = useRef(null);
  const [compact, setCompact] = useState(false);

  useEffect(() => {
    const header = headerRef.current;
    if (!header) return;

    let raf = 0;
    let last = -1;

    const apply = () => {
      raf = 0;
      const y = window.scrollY;
      const t = smoothstep(y / COMPACT_RANGE);
      if (Math.abs(t - last) < 0.001) return;
      last = t;
      header.style.setProperty("--header-t", t.toFixed(4));
      setCompact(t > 0.55);
    };

    const onScroll = () => {
      if (raf) return;
      raf = requestAnimationFrame(apply);
    };

    apply();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("scroll", onScroll);
    };
  }, []);

  return (
    <header ref={headerRef} className={`site-header${compact ? " is-compact" : ""}`}>
      <div className="site-header-inner">
        {current === "home" ? (
          <Logo />
        ) : (
          <a href="/" className="no-underline text-inherit">
            <Logo />
          </a>
        )}
        <nav className="site-nav" aria-label="Primary">
          <a href="/#how-it-works">How it works</a>
          <a href="/#works-with">Usecases</a>
          <a href="/pricing" aria-current={current === "pricing" ? "page" : undefined}>
            Pricing
          </a>
        </nav>
        <div className="site-header-actions">
          <button type="button" onClick={onJoin} className="waitlist-cta">
            Join the waitlist
          </button>
        </div>
      </div>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="site-footer-inner">
        <Logo />
        <div className="site-footer-links">
          <p>© Guido team</p>
          <a href="/login">Sign in</a>
          <a href="/privacy.html">Privacy policy</a>
          <a href="/terms.html">Terms of service</a>
        </div>
      </div>
    </footer>
  );
}
