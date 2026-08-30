// Sticker amounts stay the same number everywhere; only the ISO code
// changes so the price reads as local. Not a live FX conversion.

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

const ZERO_DECIMAL = new Set(["JPY", "KRW", "CLP", "HUF", "ISK"]);

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

export function formatMoney(amount, currency) {
  const code = currency || "USD";
  const zero = ZERO_DECIMAL.has(code);
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: code,
    minimumFractionDigits: zero ? 0 : amount === 0 ? 0 : 2,
    maximumFractionDigits: zero ? 0 : amount === 0 ? 0 : 2,
  }).format(zero ? Math.round(amount) : amount);
}
