import { useState } from "react";
import { Check } from "lucide-react";
import { FLASH_PINK } from "./brand.jsx";
import WaitlistOverlay from "./Waitlist.jsx";
import { SiteFooter, SiteHeader } from "./SiteChrome.jsx";

const TIERS = [
  {
    id: "free",
    name: "Free",
    amount: 0,
    period: "",
    tagline: "Try the whole loop.",
    features: ["1 new skill", "Full Teach / Show / Do access", "No saved skills"],
  },
  {
    id: "premium",
    name: "Premium",
    amount: 7.99,
    period: "/month",
    tagline: "For daily learning.",
    features: [
      "20 new skills / month",
      "Save your skills and come back anytime",
      "Full Teach / Show / Do access",
    ],
    featured: true,
  },
];

// Rough locale-based currency guess — same numeric amount everywhere,
// just a symbol swap so the sticker looks native to the visitor.
const REGION_CURRENCY = {
  US: "$",
  CA: "$",
  AU: "$",
  NZ: "$",
  GB: "£",
  CH: "CHF ",
  JP: "¥",
};
const EURO_REGIONS = new Set([
  "FR", "DE", "ES", "IT", "NL", "BE", "AT", "PT", "IE", "FI",
  "GR", "LU", "EE", "LV", "LT", "SK", "SI", "CY", "MT",
]);

function detectCurrencySymbol() {
  try {
    const locale = navigator.language || "en-US";
    const region = new Intl.Locale(locale).maximize().region;
    if (REGION_CURRENCY[region]) return REGION_CURRENCY[region];
    if (EURO_REGIONS.has(region)) return "€";
    return "$";
  } catch {
    return "€";
  }
}

function formatPrice(symbol, amount) {
  if (amount === 0) return `${symbol}0`;
  return `${symbol}${amount.toFixed(2)}`;
}

function PricingCard({ tier, currencySymbol, onJoin }) {
  return (
    <div
      className="flex-1 min-w-[260px] max-w-sm rounded-3xl flex flex-col p-8 bg-white"
      style={{
        border: tier.featured ? "1px solid rgba(139,92,246,0.4)" : "1px solid rgba(0,0,0,0.08)",
        boxShadow: tier.featured
          ? "0 30px 80px -30px rgba(0,0,0,0.15), 0 0 60px -15px rgba(196,181,253,0.35)"
          : "0 30px 80px -30px rgba(0,0,0,0.15)",
      }}
    >
      <div>
        <h3
          className="text-xl font-semibold tracking-tight text-[#0A0A0A]"
          style={{ fontFamily: "'Space Grotesk', sans-serif" }}
        >
          {tier.name}
        </h3>
        <p className="text-sm mt-1 text-neutral-500">{tier.tagline}</p>
      </div>

      <div className="mt-6 flex items-baseline gap-1">
        <span
          className={`font-bold tracking-tight text-[#0A0A0A] ${tier.featured ? "text-6xl" : "text-4xl"}`}
          style={{ fontFamily: "'Space Grotesk', sans-serif" }}
        >
          {formatPrice(currencySymbol, tier.amount)}
        </span>
        {tier.period ? <span className="text-sm text-neutral-500">{tier.period}</span> : null}
      </div>

      <ul className="mt-6 flex flex-col gap-3 flex-1">
        {tier.features.map((f) => (
          <li key={f} className="flex items-start gap-2 text-sm text-neutral-700">
            <Check size={16} className="mt-0.5 shrink-0" color="#8B5CF6" />
            {f}
          </li>
        ))}
      </ul>

      <button type="button" onClick={onJoin} className="waitlist-cta waitlist-cta-lg mt-8 self-start">
        Join the waitlist
      </button>
    </div>
  );
}

export default function Pricing() {
  const [currencySymbol] = useState(detectCurrencySymbol);
  const [waitlistOpen, setWaitlistOpen] = useState(false);
  const referredBy = new URLSearchParams(window.location.search).get("ref") || "";

  return (
    <div className="min-h-screen text-[#0A0A0A] bg-white" style={{ fontFamily: "'Inter', sans-serif" }}>
      <SiteHeader current="pricing" onJoin={() => setWaitlistOpen(true)} />

      <div className="pt-20 pb-24 px-6">
        <div className="max-w-3xl mx-auto text-center mb-14">
          <div
            className="text-[11px] font-semibold uppercase mb-4 text-neutral-400"
            style={{ letterSpacing: "0.2em" }}
          >
            Pricing
          </div>
          <h1
            className="uppercase font-extrabold tracking-wide text-2xl sm:text-3xl mb-4 leading-tight"
            style={{ fontFamily: "'Space Grotesk', sans-serif", color: FLASH_PINK }}
          >
            Start free. Upgrade when you need more.
          </h1>
          <p className="text-[17px] leading-relaxed max-w-lg mx-auto text-neutral-600">
            Learn with the three modes on every plan.
          </p>
        </div>

        <div className="max-w-2xl mx-auto flex flex-wrap justify-center items-stretch gap-6">
          {TIERS.map((tier) => (
            <PricingCard
              key={tier.id}
              tier={tier}
              currencySymbol={currencySymbol}
              onJoin={() => setWaitlistOpen(true)}
            />
          ))}
        </div>

        <p className="text-xs text-center mt-8 text-neutral-400">
          Premium's price and included skills are subject to change.
        </p>
      </div>

      <WaitlistOverlay
        open={waitlistOpen}
        referredBy={referredBy}
        onClose={() => setWaitlistOpen(false)}
      />

      <SiteFooter />
    </div>
  );
}
