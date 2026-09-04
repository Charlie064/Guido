import { useEffect, useState } from "react";
import { Logo } from "./brand.jsx";

export function SiteHeader({ onJoin, current = "home" }) {
  const [compact, setCompact] = useState(false);

  useEffect(() => {
    const onScroll = () => setCompact(window.scrollY > 18);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header className={`site-header${compact ? " is-compact" : ""}`}>
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
