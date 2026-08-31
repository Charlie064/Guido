// Guido Pro's sticker is €7.99. Other countries see an equivalent
// local amount, charm-rounded so it reads like a real price — not
// "7.99" with a different symbol. Rates are a static EUR table
// (approx. late Aug 2026), not a live FX tick. Not a live conversion.

export const PRO_EUR = 7.99;

const EUROZONE = new Set([
  "AT", "BE", "CY", "DE", "EE", "ES", "FI", "FR", "GR", "HR",
  "IE", "IT", "LT", "LU", "LV", "MT", "NL", "PT", "SI", "SK",
]);

const COUNTRY_CURRENCY = {
  US: "USD", CA: "CAD", AU: "AUD", NZ: "NZD",
  GB: "GBP",
  CH: "CHF",
  JP: "JPY", CN: "CNY", KR: "KRW", IN: "INR",
  SG: "SGD", HK: "HKD", TW: "TWD",
  SE: "SEK", NO: "NOK", DK: "DKK", IS: "ISK",
  PL: "PLN", CZ: "CZK", HU: "HUF", RO: "RON", BG: "BGN",
  BR: "BRL", MX: "MXN", AR: "ARS", CL: "CLP", CO: "COP", PE: "PEN",
  ZA: "ZAR", NG: "NGN", KE: "KES", EG: "EGP",
  AE: "AED", SA: "SAR", IL: "ILS", TR: "TRY", QA: "QAR",
  RU: "RUB", UA: "UAH",
};

// Units of foreign currency per €1.
const EUR_RATES = {
  USD: 1.16, CAD: 1.61, AUD: 1.62, NZD: 1.75,
  GBP: 0.86,
  CHF: 0.94,
  JPY: 186, CNY: 8.3, KRW: 1600, INR: 97,
  SGD: 1.5, HKD: 9.05, TWD: 37,
  SEK: 11.09, NOK: 10.86, DKK: 7.47, ISK: 145,
  PLN: 4.25, CZK: 24.5, HUF: 395, RON: 5.1, BGN: 1.96,
  BRL: 6.3, MXN: 21.5, ARS: 1350, CLP: 1100, COP: 4700, PEN: 4.3,
  ZAR: 20.5, NGN: 1600, KES: 150, EGP: 56,
  AED: 4.26, SAR: 4.35, ILS: 3.85, TRY: 48, QAR: 4.23,
  RUB: 95, UAH: 48,
};

// Picked stickers where a raw convert would look off. SEK is 79
// (about €7.99 at a clean Nordic price), not 7.99 kr.
const PRO_STICKER = {
  EUR: 7.99,
  SEK: 79,
};

const ZERO_DECIMAL = new Set(["JPY", "KRW", "CLP", "HUF", "ISK"]);
const NORDIC_WHOLE = new Set(["SEK", "NOK", "DKK", "CZK", "PLN", "RON"]);

export function currencyForCountry(country) {
  const code = String(country || "").toUpperCase();
  if (COUNTRY_CURRENCY[code]) return COUNTRY_CURRENCY[code];
  if (EUROZONE.has(code)) return "EUR";
  return "USD";
}

export function localeCountry() {
  try {
    return new Intl.Locale(navigator.language || "en-US").maximize().region || "";
  } catch {
    return "";
  }
}

function charmRound(raw, currency) {
  if (ZERO_DECIMAL.has(currency)) {
    const step = currency === "KRW" || currency === "CLP" || currency === "COP" ? 100 : 10;
    return Math.max(step, Math.round(raw / step) * step);
  }
  if (NORDIC_WHOLE.has(currency)) {
    const tens = Math.round(raw / 10) * 10;
    return Math.max(9, tens - 1);
  }
  if (currency === "CHF") {
    return Math.round(raw * 2) / 2;
  }
  const whole = Math.max(1, Math.round(raw));
  return Number((whole - 0.01).toFixed(2));
}

export function proAmount(currency) {
  const code = currency || "EUR";
  if (PRO_STICKER[code] != null) return PRO_STICKER[code];
  const rate = EUR_RATES[code];
  if (!rate) return PRO_EUR;
  return charmRound(PRO_EUR * rate, code);
}

export function formatMoney(amount, currency) {
  const code = currency || "EUR";
  const whole = ZERO_DECIMAL.has(code) || Number.isInteger(amount);
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: code,
    minimumFractionDigits: whole ? 0 : 2,
    maximumFractionDigits: whole ? 0 : 2,
  }).format(whole ? Math.round(amount) : amount);
}
