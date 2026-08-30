import { Logo } from "./brand.jsx";

export function SiteHeader({ onJoin, current = "home" }) {
  return (
    <header className="site-header">
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
        <button type="button" onClick={onJoin} className="waitlist-cta">
          Join the waitlist
        </button>
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
        </div>
      </div>
    </footer>
  );
}
