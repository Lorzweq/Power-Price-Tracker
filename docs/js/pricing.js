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
    const [y, m, d] = dateStr.split("-").map(Number);
    const promises = Array.from({ length: 24 }, async (_, h) => {
      const local = new Date(y, m - 1, d, h, 0, 0);
      const isoUtc = local.toISOString();
      const url = `${CONFIG.PRICE_ENDPOINT}?date=${encodeURIComponent(isoUtc)}`;
      
      try {
        const res = await fetch(url, { cache: "no-store" });
        const data = await res.json().catch(() => null);
        if (data && typeof data.price === 'number') {
          return data.price;
        }
        return null;
      } catch {
        return null;
      }
    });

    const prices = await Promise.all(promises);
    const validPrices = prices.filter(p => p !== null);
    
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
