import { useEffect, useState } from "react";
import { Check } from "lucide-react";
import WaitlistOverlay from "./Waitlist.jsx";
import { SiteFooter, SiteHeader } from "./SiteChrome.jsx";
import { currencyForCountry, formatMoney, localeCountry } from "./currency.js";

const TIERS = [
  {
    id: "pro",
    name: "Guido Pro",
    amount: 7.99,
    period: "/ month",
    tagline: "Keep going, and keep what you learn.",
    features: [
      "20 new skills every month",
      "Save skills and pick them back up",
      "Teach, Show, and Do",
    ],
    featured: true,
  },
  {
    id: "free",
    name: "Free",
    amount: 0,
    period: "",
    tagline: "Try the whole loop on your own screen.",
    features: ["1 new skill", "Teach, Show, and Do", "No saved skills"],
  },
];

function PricingCard({ tier, currency, onJoin }) {
  return (
    <article className={`pricing-card${tier.featured ? " pricing-card-pro" : ""}`}>
      {tier.featured ? <p className="pricing-badge">Recommended</p> : null}
      <h3 className="pricing-name">{tier.name}</h3>
      <p className="pricing-tagline">{tier.tagline}</p>
      <p className="pricing-amount">
        <span>{formatMoney(tier.amount, currency)}</span>
        {tier.period ? <span className="pricing-period">{tier.period}</span> : null}
      </p>
      <ul className="pricing-features">
        {tier.features.map((f) => (
          <li key={f}>
            <Check size={16} strokeWidth={2.2} aria-hidden="true" />
            {f}
          </li>
        ))}
      </ul>
      <button
        type="button"
        onClick={onJoin}
        className={tier.featured ? "pricing-cta-pro" : "waitlist-cta pricing-cta"}
      >
        Join the waitlist
      </button>
    </article>
  );
}

export default function Pricing() {
  const [currency, setCurrency] = useState(() => currencyForCountry(localeCountry()));
  const [waitlistOpen, setWaitlistOpen] = useState(false);
  const referredBy = new URLSearchParams(window.location.search).get("ref") || "";

  useEffect(() => {
    let cancelled = false;
    fetch("/api/geo")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((data) => {
        if (!cancelled && data.country) setCurrency(currencyForCountry(data.country));
      })
      .catch(() => {
        if (!cancelled) setCurrency(currencyForCountry(localeCountry()));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="min-h-screen text-[#0A0A0A] bg-white" style={{ fontFamily: "'Inter', sans-serif" }}>
      <SiteHeader current="pricing" onJoin={() => setWaitlistOpen(true)} />

      <section className="pricing-page">
        <div className="pricing-hero">
          <p className="pricing-kicker">Pricing</p>
          <h1 className="hero-headline pricing-title">
            Start free. Go further with Guido Pro.
          </h1>
          <p className="pricing-lead">
            Same three modes on every plan. Prices show in your local currency.
          </p>
        </div>

        <div className="pricing-grid">
          {TIERS.map((tier) => (
            <PricingCard
              key={tier.id}
              tier={tier}
              currency={currency}
              onJoin={() => setWaitlistOpen(true)}
            />
          ))}
        </div>

        <p className="pricing-note">
          Guido Pro's price and included skills are subject to change.
        </p>
      </section>

      <WaitlistOverlay
        open={waitlistOpen}
        referredBy={referredBy}
        onClose={() => setWaitlistOpen(false)}
      />

      <SiteFooter />
    </div>
  );
}
