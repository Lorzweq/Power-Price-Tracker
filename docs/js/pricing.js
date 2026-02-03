// Pricing API and Data Management
import { CONFIG } from './config.js';
import { $ } from './ui.js';

export let cachedPrices = null;
export let currentDayPrices = [];
export let quarterMinPrices = [];

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

  return data.price;
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
  if (cachedPrices) return cachedPrices;

  try {
    const res = await fetch(CONFIG.LATEST_PRICES_ENDPOINT);
    if (res.ok) {
      const data = await res.json();
      cachedPrices = data.prices || data || [];
      if (cachedPrices.length === 0) {
        // Test data fallback
        cachedPrices = Array(96).fill(null).map((_, i) => ({
          startDate: new Date(Date.now() - 96*15*60*1000 + i*15*60*1000).toISOString(),
          endDate: new Date(Date.now() - 96*15*60*1000 + (i+1)*15*60*1000).toISOString(),
          price: 3.5 + Math.sin(i/10) * 2
        }));
      }
      return cachedPrices;
    }
  } catch (e) {
    console.error("Failed to fetch latest prices:", e);
  }
  
  cachedPrices = [];
  return cachedPrices;
}

export function setPricesData(prices, quarterPrices) {
  currentDayPrices = prices;
  quarterMinPrices = quarterPrices;
}

export function clearCachedPrices() {
  cachedPrices = null;
}
