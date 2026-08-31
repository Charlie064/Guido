import { Logo } from "./brand.jsx";

export function SiteHeader({ onJoin, onDownload, current = "home" }) {
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
        <div className="site-header-actions">
          {onDownload ? (
            <button type="button" onClick={onDownload} className="download-cta">
              Download
            </button>
          ) : null}
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
          {/* "Sign in" dropped for now — glass-waitlist's /login is the
              pre-ADR-0008 Google OAuth page; a Better-Auth version isn't
              built yet. See docs/planning/glass-waitlist-integration.md. */}
          <a href="/privacy.html">Privacy policy</a>
          <a href="/terms.html">Terms of service</a>
        </div>
      </div>
    </footer>
  );
}
