// Pricing API and Data Management
import { CONFIG } from './config.js';
import { $ } from './ui.js';

export let cachedPrices = null;
let _fetchPromise = null;

// ========== ALV ==========
// Rajapinnan (porssisahko.net) hinnat sisältävät ALV:n 25,5 %. Käyttäjä voi valita, näytetäänkö
// hinnat ilman sitä. Välimuistissa pidetään aina alkuperäiset hinnat, ja valinta tehdään lukiessa,
// joten vaihto ei vaadi uutta hakua. Negatiiviseen hintaan ei lisätä ALV:tä, joten sitä ei vähennetä.
export const VAT_RATE = 0.255;
const VAT_KEY = "vatIncluded";

export function isVatIncluded() {
  try { return localStorage.getItem(VAT_KEY) !== "false"; } catch { return true; }
}

export function setVatIncluded(included) {
  try { localStorage.setItem(VAT_KEY, String(included)); } catch {}
}

export function applyVat(price) {
  const n = typeof price === "string" ? parseFloat(price.replace(",", ".")) : price;
  if (isVatIncluded() || !(n > 0)) return n;
  return n / (1 + VAT_RATE);
}

function withVatSetting(prices) {
  return prices.map(p => ({ ...p, price: applyVat(p.price) }));
}

export async function fetchPriceCentsPerKwh(dateStr, hour) {
  const [y, m, d] = dateStr.split("-").map(Number);
  const h = Number(hour);

  if (!y || !m || !d || Number.isNaN(h)) {
    throw new Error("Päivä tai tunti puuttuu/virheellinen");
  }

  const local = new Date(y, m - 1, d, h, 0, 0);
  if (Number.isNaN(local.getTime())) {
    throw new Error("Invalid Date (päivä/tunti)");
  }

  // Try to get price from cached data first
  const prices = await fetchLatestPrices();
  if (prices && prices.length > 0) {
    const matching = prices.find(p => {
      const pStart = new Date(p.startDate);
      const pEnd = new Date(p.endDate);
      return pStart <= local && pEnd > local;
    });

    if (matching) {
      let rawPrice = matching.price;
      if (typeof rawPrice === 'string') {
        rawPrice = parseFloat(rawPrice.replace(',', '.'));
      }
      if (typeof rawPrice === 'number' && !isNaN(rawPrice)) {
        return rawPrice;
      }
    }
  }

  // Fallback to API call if not found in cache
  const isoUtc = local.toISOString();
  const url = `${CONFIG.PRICE_ENDPOINT}?date=${encodeURIComponent(isoUtc)}`;

  const res = await fetch(url, { cache: "no-store" });
  const data = await res.json().catch(() => null);

  if (!res.ok || !data || typeof data.price !== "number") {
    throw new Error("API ei palauttanut data.price-numeroa");
  }

  return applyVat(data.price);
}

export function moneyEuro(centsPerKwh, kwh) {
  return (centsPerKwh / 100) * kwh;
}

export async function updateDateAvgPrice(dateInputId) {
  const dateStr = $(dateInputId).value;
  if (!dateStr) return;

  const dateInput = $(dateInputId);
  const label = dateInput.previousElementSibling;
  if (label) {
    const originalText = label.textContent.split(" - ")[0].split("  ")[0];
    label.textContent = originalText;
  }

  try {
    // Ensure we have cached prices
    const prices = await fetchLatestPrices();
    if (!prices || prices.length === 0) {
      if (label) label.textContent = `${label.textContent}  Ei dataa`;
      return;
    }

    const [y, m, d] = dateStr.split("-").map(Number);
    const validPrices = [];

    // Get prices for each hour from cached data
    for (let h = 0; h < 24; h++) {
      const local = new Date(y, m - 1, d, h, 0, 0);
      
      // Find matching price from cached data
      const matching = prices.find(p => {
        const pStart = new Date(p.startDate);
        const pEnd = new Date(p.endDate);
        return pStart <= local && pEnd > local;
      });

      if (matching) {
        let rawPrice = matching.price;
        if (typeof rawPrice === 'string') {
          rawPrice = parseFloat(rawPrice.replace(',', '.'));
        }
        if (typeof rawPrice === 'number' && !isNaN(rawPrice)) {
          validPrices.push(rawPrice);
        }
      }
    }
    
    if (validPrices.length > 0 && label) {
      const avgPrice = validPrices.reduce((a, b) => a + b, 0) / validPrices.length;
      label.textContent = `  ${avgPrice.toFixed(2)} snt/kWh`;
    } else if (validPrices.length === 0 && label) {
      label.textContent = `${label.textContent}  Ei dataa`;
    }
  } catch (e) {
    console.error("Error fetching avg price:", e);
  }
}

export async function fetchLatestPrices() {
  if (cachedPrices) return withVatSetting(cachedPrices);
  if (_fetchPromise) return _fetchPromise.then(withVatSetting);

  _fetchPromise = (async () => {
    try {
      const res = await fetch(CONFIG.LATEST_PRICES_ENDPOINT);
      if (res.ok) {
        const data = await res.json();
        // Tyhjä vastaus näytetään tyhjänä ("–"), ei koskaan keksittyinä hintoina.
        cachedPrices = data.prices || data || [];
        return cachedPrices;
      }
    } catch (e) {
      console.error("Failed to fetch latest prices:", e);
    }
    cachedPrices = [];
    return cachedPrices;
  })().finally(() => { _fetchPromise = null; });

  return _fetchPromise.then(withVatSetting);
}

export function clearCachedPrices() {
  cachedPrices = null;
}
