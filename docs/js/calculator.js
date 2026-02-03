// Calculation Logic
import { fetchPriceCentsPerKwh, moneyEuro } from './pricing.js';
import { collectDeviceData } from './devices.js';
import { $ } from './ui.js';

export async function calculateSavings() {
  const devicesData = collectDeviceData();
  
  const startDateEl = $("startDate");
  const startHourEl = $("startHour");
  const endDateEl = $("endDate");
  const endHourEl = $("endHour");

  if (!startDateEl || !startHourEl || !endDateEl || !endHourEl) {
    console.error("Date/hour elements not found");
    return;
  }

  const startDate = startDateEl.value;
  const startHour = startHourEl.value;
  const endDate = endDateEl.value;
  const endHour = endHourEl.value;

  if (!startDate || !startHour || !endDate || !endHour) {
    alert("Täytä kaikki päivä- ja tuntiKentät");
    return;
  }

  let totalSavings = 0;

  try {
    const startPrice = await fetchPriceCentsPerKwh(startDate, startHour);
    const endPrice = await fetchPriceCentsPerKwh(endDate, endHour);

    for (const dev of devicesData) {
      if (dev.kwh <= 0) continue;
      const oldCost = moneyEuro(startPrice, dev.kwh);
      const newCost = moneyEuro(endPrice, dev.kwh);
      totalSavings += (oldCost - newCost);
    }

    const resultEl = $("savingsResult");
    if (resultEl) {
      resultEl.textContent = totalSavings >= 0
        ? `Säästösi: ${totalSavings.toFixed(2)} €`
        : `Lisäkulusi: ${Math.abs(totalSavings).toFixed(2)} €`;
    }
  } catch (err) {
    alert("Virhe laskennassa: " + err.message);
  }
}
