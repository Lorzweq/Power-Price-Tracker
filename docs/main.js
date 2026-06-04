// Main Application Logic
import { CONFIG, DEVICES, PRESETS, DEVICE_INDEX_BY_NAME } from './js/config.js';
import { initConsent } from './js/consent.js';
import { $, showToast, copyTextToClipboard, twoDigits, setTodayDefaults } from './js/ui.js';
import { fetchPriceCentsPerKwh, moneyEuro, updateDateAvgPrice, fetchLatestPrices, setPricesData, clearCachedPrices } from './js/pricing.js';
import { renderDevicesHTML, collectDeviceData, getDevice } from './js/devices.js';
import { calculateSavings } from './js/calculator.js';
import { drawHourlyChart, draw15MinChart, drawTop3Chart } from './js/chart.js';

import { getCurrentLanguage, setLanguage, t, translateCategory, translateDeviceName } from './js/translations.js';

// ========== SERVICE WORKER REGISTRATION ==========
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js')
      .then((registration) => {
        console.log('SW registered:', registration);
      })
      .catch((error) => {
        console.log('SW registration failed:', error);
      });
  });
}

// ========== APPLICATION STATE ==========
let showInEuros = true;
let lastResultText = "";
let currentDayPrices = [];
let quarterMinPrices = [];
let priceWatchActive = false;
let priceWatchThreshold = 0;
let priceWatchInterval = null;
let chartOffset = 0;
let chartLoading = false;
let resizeRaf = null;
let lastPricesSignature = "";
let chartBaseDate = null;
let chartStartHour = 0;

const STORAGE_KEY = "psl_state_v1";
const SAVINGS_KEY = "psl_savings_v1";

// ========== SAVINGS TRACKING ==========
function loadSavings() {
  try {
    return JSON.parse(localStorage.getItem(SAVINGS_KEY)) || { total: 0, runs: 0 };
  } catch {
    return { total: 0, runs: 0 };
  }
}

function addSavings(euro) {
  const s = loadSavings();
  s.total = (Number(s.total) || 0) + (Number(euro) || 0);
  s.runs = (Number(s.runs) || 0) + 1;
  localStorage.setItem(SAVINGS_KEY, JSON.stringify(s));
  return s;
}

// ========== STATE MANAGEMENT ==========
function saveState() {
  const selected = Array.from(document.querySelectorAll('input[name="device"]:checked'))
    .map(cb => Number(cb.value))
    .filter(Number.isFinite);

  const qty = {};
  document.querySelectorAll('input[name="qty"]').forEach(inp => {
    const i = inp.dataset.i;
    qty[i] = Number(inp.value) || 1;
  });

  const cats = {};
  document.querySelectorAll("[data-cat-body]").forEach(div => {
    cats[div.id] = div.classList.contains("hidden");
  });

  const state = { selected, qty, cats, pick: $("pick").value };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

window.saveState = saveState;

function loadState() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}

// ========== DEVICE UTILITIES ==========
function unitQtyLabel(unit) {
  if (unit.includes("m²")) return "m²";
  if (unit.includes("kWh/h")) return "h";
  if (unit.includes("kWh/vrk")) return "vrk";
  if (unit.includes("kWh/kerta")) return "krt";
  return "krt";
}

function getQtyForIndex(i) {
  const el = document.querySelector(`input[name="qty"][data-i="${i}"]`);
  const v = el ? Number(el.value) : 1;
  return Number.isFinite(v) && v > 0 ? v : 1;
}

function avg(a, b) { return (a + b) / 2; }

function pickedKwh(device, pickMode) {
  if (pickMode === "min") return device.min;
  if (pickMode === "max") return device.max;
  return avg(device.min, device.max);
}

function getSelectedDeviceIndexes() {
  return Array.from(document.querySelectorAll('input[name="device"]:checked'))
    .map(el => Number(el.value))
    .filter(n => Number.isFinite(n));
}

// ========== PRESET MANAGEMENT ==========
function applyPresetById(presetId) {
  const preset = PRESETS[presetId];
  if (!preset) {
    showToast("Valitse esiasetus");
    return;
  }

  const required = [
    { name: "Hehkulamppu 60 W (4 h/pv)", qty: 1 },
    { name: "LED-lamppu 8 W (4 h/pv)", qty: 1 },
    { name: "Jääkaappi", qty: 1 },
    { name: "Pakastin", qty: 1 },
  ];

  const mergedPreset = [
    ...required,
    ...preset.filter(item => !required.some(r => r.name === item.name)),
  ];

  document.querySelectorAll('input[name="device"]').forEach(cb => {
    cb.checked = false;
    const qtyEl = document.querySelector(`input[name="qty"][data-i="${cb.value}"]`);
    if (qtyEl) {
      qtyEl.value = 1;
      qtyEl.disabled = true;
    }
  });

  const catsToOpen = new Set();

  mergedPreset.forEach(item => {
    const i = DEVICE_INDEX_BY_NAME[item.name];
    if (i === undefined) return;

    const cb = document.querySelector(`input[name="device"][value="${i}"]`);
    if (cb) cb.checked = true;

    const qtyEl = document.querySelector(`input[name="qty"][data-i="${i}"]`);
    if (qtyEl) {
      qtyEl.value = Number(item.qty) || 1;
      qtyEl.disabled = false;
    }

    catsToOpen.add(DEVICES[i].category);
  });

  catsToOpen.forEach(cat => {
    const id = `cat-${cat.replace(/\s+/g, "-")}`;
    const el = document.getElementById(id);
    if (el) el.classList.remove("hidden");
  });

  onSelectionChange();
  saveState();
  showToast("Esiasetus käytetty. Voit muokata valintoja.");
}

// ========== DEVICE RENDERING ==========
function renderDevices() {
  
  const groups = DEVICES.reduce((acc, d, i) => {
    (acc[d.category] ||= []).push({ d, i });
    return acc;
  }, {});


  const html = Object.entries(groups).map(([cat, items]) => {
    const bodyId = `cat-${cat.replace(/\s+/g, "-")}`;

    const rows = items.map(({ d, i }) => {
      const qtyLabel = unitQtyLabel(d.unit);

      return `
        <label class="flex items-center gap-3 rounded-xl border p-3 hover:bg-slate-50">
          <input type="checkbox" name="device" value="${i}" class="h-4 w-4">

          <div class="flex-1">
            <div class="text-sm font-medium">${translateDeviceName(d.name)}</div>
            <div class="text-xs text-slate-600">${d.min}–${d.max} ${d.unit}</div>
          </div>

          <div class="flex flex-col items-end gap-1">
            <span class="text-[11px] px-3 py-1 rounded-full ${
              d.schedulable
                ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                : "bg-slate-100 text-slate-700"
            }">
              ${d.schedulable ? translateCategory("ajastettava") : translateCategory("jatkuva")}
            </span>

            <div class="flex items-center gap-1">
              <input
                type="number"
                name="qty"
                data-i="${i}"
                min="1"
                step="1"
                value="1"
                disabled
                class="w-16 rounded-lg border p-1 text-center text-sm disabled:bg-slate-100"
              />
              <span class="text-xs text-slate-600">${qtyLabel}</span>
            </div>
          </div>
        </label>
      `;
    }).join("");

    return `
      <div class="mt-4">
        <button
          type="button"
          class="flex w-full items-center justify-between text-xs font-semibold uppercase text-slate-600 tracking-wide mb-2"
          onclick="document.getElementById('${bodyId}').classList.toggle('hidden'); saveState();"
        >
          <span>${translateCategory(cat)}</span>
          <span>▾</span>
        </button>

        <div id="${bodyId}" data-cat-body class="grid gap-2 hidden">
          ${rows}
        </div>
      </div>
    `;
  }).join("");

  const deviceListEl = $("deviceList");
  
  if (!deviceListEl) {
    console.error("❌ deviceList element not found!");
    return;
  }
  
  deviceListEl.innerHTML = html;

  document.querySelectorAll('input[name="device"]').forEach(cb => {
    cb.addEventListener("change", () => {
      const i = Number(cb.value);
      const qty = document.querySelector(`input[name="qty"][data-i="${i}"]`);
      if (qty) qty.disabled = !cb.checked;

      onSelectionChange();
      saveState();
    });
  });

  document.querySelectorAll('input[name="qty"]').forEach(q => {
    q.addEventListener("input", () => {
      onSelectionChange();
      saveState();
    });
  });

  const st = loadState();
  if (st) {
    if (st.pick) $("pick").value = st.pick;

    if (st.cats) {
      Object.entries(st.cats).forEach(([id, isHidden]) => {
        const el = document.getElementById(id);
        if (!el) return;
        el.classList.toggle("hidden", !!isHidden);
      });
    }

    if (st.qty) {
      Object.entries(st.qty).forEach(([i, v]) => {
        const el = document.querySelector(`input[name="qty"][data-i="${i}"]`);
        if (el) el.value = v;
      });
    }

    if (Array.isArray(st.selected)) {
      document.querySelectorAll('input[name="device"]').forEach(cb => {
        const i = Number(cb.value);
        const checked = st.selected.includes(i);
        cb.checked = checked;

        const qtyEl = document.querySelector(`input[name="qty"][data-i="${i}"]`);
        if (qtyEl) qtyEl.disabled = !checked;
      });
    }
  } else {
    const defaults = [
      "Hehkulamppu 60 W (4 h/pv)",
      "LED-lamppu 8 W (4 h/pv)",
      "Jääkaappi",
      "Pakastin",
    ];

    defaults.forEach(name => {
      const i = DEVICE_INDEX_BY_NAME[name];
      if (i === undefined) return;
      const cb = document.querySelector(`input[name="device"][value="${i}"]`);
      if (cb) cb.checked = true;
      const q = document.querySelector(`input[name="qty"][data-i="${i}"]`);
      if (q) q.disabled = false;
    });
  }

  onSelectionChange();
}

function onSelectionChange() {
  const idxs = getSelectedDeviceIndexes();
  const pickMode = $("pick").value;

  if (idxs.length === 0) {
    $("unitBadge").textContent = "";
    $("consumptionText").textContent = "Valitse vähintään yksi laite.";
    $("note").classList.add("hidden");
    return;
  }

  const selected = idxs.map(i => DEVICES[i]);

  const totalKwh = selected.reduce((sum, d, idx) => {
    const i = idxs[idx];
    const qty = getQtyForIndex(i);
    return sum + pickedKwh(d, pickMode) * qty;
  }, 0);

  const units = Array.from(new Set(selected.map(d => d.unit)));
  $("unitBadge").textContent = units.length === 1 ? units[0] : "yhteensä";

  const names = selected.map(d => d.name).join(", ");
  $("consumptionText").textContent = `${names} → yhteensä ${totalKwh.toFixed(2)} (valitulla arvolla)`;

  const hasNonSched = selected.some(d => !d.schedulable || d.unit.includes("kWh/vrk"));
  const note = $("note");
  if (hasNonSched) {
    note.classList.remove("hidden");
    note.textContent =
      "Mukana on jatkuvaa kulutusta (kWh/vrk). Kellonajan vaihtaminen ei yleensä tuo selkeää säästöä samalla tavalla kuin 'kerta'-laitteissa, mutta laskenta näyttää silti hintojen erotuksen valitulla kulutusarvolla.";
  } else {
    note.classList.add("hidden");
  }
}

// ========== CALCULATION ==========
async function calculate() {
  const idxs = getSelectedDeviceIndexes();
  if (idxs.length === 0) {
    $("out").textContent = "Valitse vähintään yksi laite.";
    return;
  }

  const pickMode = $("pick").value;
  const selected = idxs.map(i => DEVICES[i]);

  const date1 = $("date1").value;
  const date2 = $("date2").value;
  const hour1 = $("hour1").value;
  const hour2 = $("hour2").value;

  const perDevice = selected.map((d, ix) => {
    const i = idxs[ix];
    const qty = getQtyForIndex(i);
    const base = pickedKwh(d, pickMode);
    return {
      name: d.name,
      unit: d.unit,
      qty,
      qtyLabel: unitQtyLabel(d.unit),
      kwh: base * qty,
    };
  });

  const totalKwh = perDevice.reduce((s, x) => s + x.kwh, 0);
  $("out").textContent = "Haetaan hintoja…";

  try {
    const [p1, p2] = await Promise.all([
      fetchPriceCentsPerKwh(date1, hour1),
      fetchPriceCentsPerKwh(date2, hour2),
    ]);

    const cost1 = moneyEuro(p1, totalKwh);
    const cost2 = moneyEuro(p2, totalKwh);
    const diff = cost1 - cost2;

    const better = diff > 0 ? "Aika 2" : "Aika 1";
    const abs = Math.abs(diff);

    const savedNow = Math.max(0, abs);
    const totals = addSavings(savedNow);

    const box = document.getElementById("savingsBox");
    if (box) {
      box.innerHTML = `
        <b>Säästit tässä laskennassa:</b> ${savedNow.toFixed(3)} € (valitsemalla ${better})<br/>
        <b>Yhteensä säästetty:</b> ${totals.total.toFixed(3)} € (${totals.runs} laskua)
      `;
      box.classList.remove("hidden");
    }

    const rows = perDevice.map(x =>
      `<div class="text-slate-700">• ${x.name}: ${x.qty} ${x.qtyLabel} → ${x.kwh.toFixed(2)} kWh</div>`
    ).join("");

    const priceDiff = p1 - p2;
    
    let resultText = "";
    
    if (showInEuros) {
      $("out").innerHTML = `
        <div style="line-height:1.6">
          <div><b>Valitut laitteet</b> (${idxs.length} kpl)</div>
          <div class="mt-1">${rows}</div>

          <div class="mt-2"><b>Yhteiskulutus:</b> ${totalKwh.toFixed(2)} kWh</div>

          <div class="mt-2">Aika 1 (${date1} klo ${twoDigits(Number(hour1))}): <b>${p1.toFixed(2)} snt/kWh</b> → <b>${cost1.toFixed(3)} €</b></div>
          <div>Aika 2 (${date2} klo ${twoDigits(Number(hour2))}): <b>${p2.toFixed(2)} snt/kWh</b> → <b>${cost2.toFixed(3)} €</b></div>

          <div class="mt-2">Säästö yhteensä: <b>${abs.toFixed(3)} €</b> (edullisempi: <b>${better}</b>)</div>
        </div>
      `;
      
      resultText = `Pörssisähkö-säästölaskuri - Tulos\n\n` +
        `Valitut laitteet (${idxs.length} kpl):\n${perDevice.map(x => `• ${x.name}: ${x.qty} ${x.qtyLabel} → ${x.kwh.toFixed(2)} kWh`).join('\n')}\n\n` +
        `Yhteiskulutus: ${totalKwh.toFixed(2)} kWh\n\n` +
        `Aika 1 (${date1} klo ${twoDigits(Number(hour1))}): ${p1.toFixed(2)} snt/kWh → ${cost1.toFixed(3)} €\n` +
        `Aika 2 (${date2} klo ${twoDigits(Number(hour2))}): ${p2.toFixed(2)} snt/kWh → ${cost2.toFixed(3)} €\n\n` +
        `Säästö yhteensä: ${abs.toFixed(3)} € (edullisempi: ${better})`;
    } else {
      $("out").innerHTML = `
        <div style="line-height:1.6">
          <div><b>Valitut laitteet</b> (${idxs.length} kpl)</div>
          <div class="mt-1">${rows}</div>

          <div class="mt-2"><b>Yhteiskulutus:</b> ${totalKwh.toFixed(2)} kWh</div>

          <div class="mt-2">Aika 1 (${date1} klo ${twoDigits(Number(hour1))}): <b>${p1.toFixed(2)} snt/kWh</b></div>
          <div>Aika 2 (${date2} klo ${twoDigits(Number(hour2))}): <b>${p2.toFixed(2)} snt/kWh</b></div>

          <div class="mt-2">Hintaero: <b>${Math.abs(priceDiff).toFixed(2)} snt/kWh</b> (edullisempi: <b>${better}</b>)</div>
          <div class="text-xs text-slate-600 mt-1">(Säästö euroina: ${abs.toFixed(3)} €)</div>
        </div>
      `;
      
      resultText = `Pörssisähkö-säästölaskuri - Tulos\n\n` +
        `Valitut laitteet (${idxs.length} kpl):\n${perDevice.map(x => `• ${x.name}: ${x.qty} ${x.qtyLabel} → ${x.kwh.toFixed(2)} kWh`).join('\n')}\n\n` +
        `Yhteiskulutus: ${totalKwh.toFixed(2)} kWh\n\n` +
        `Aika 1 (${date1} klo ${twoDigits(Number(hour1))}): ${p1.toFixed(2)} snt/kWh\n` +
        `Aika 2 (${date2} klo ${twoDigits(Number(hour2))}): ${p2.toFixed(2)} snt/kWh\n\n` +
        `Hintaero: ${Math.abs(priceDiff).toFixed(2)} snt/kWh (edullisempi: ${better})\n` +
        `Säästö euroina: ${abs.toFixed(3)} €`;
    }
    
    lastResultText = resultText;
    $("copyResults").classList.remove("hidden");
  } catch (e) {
    $("out").textContent = `Virhe: ${e.message}`;
    console.error(e);
  }
}

// ========== SUGGESTION CALCULATOR ==========
function parseHour(x, fallback = 0) {
  const n = Number(x);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(0, Math.min(23, Math.floor(n)));
}

function parseIntClamped(x, min, max, fallback) {
  const n = Math.floor(Number(x));
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

function unitKind(unit) {
  if (unit.includes("kWh/vrk")) return "daily";
  if (unit.includes("kWh/h")) return "perHour";
  return "perUse";
}

function getSchedulableSelection(idxs, pickMode) {
  const rows = [];
  const daily = [];

  idxs.forEach(i => {
    const d = DEVICES[i];
    const qty = getQtyForIndex(i);
    const kwhBase = pickedKwh(d, pickMode) * qty;

    const kind = unitKind(d.unit);
    const row = { i, name: d.name, unit: d.unit, kind, kwhBase, schedulable: d.schedulable };

    if (kind === "daily" || !d.schedulable) daily.push(row);
    else rows.push(row);
  });

  return { rows, daily };
}

function findCheapestStart(prices24, winStart, winEnd, durHours) {
  const start = parseHour(winStart, 0);
  const end = parseHour(winEnd, 23);
  const dur = parseIntClamped(durHours, 1, 24, 1);

  const s = Math.min(start, end);
  const e = Math.max(start, end);

  const maxStart = e - (dur - 1);
  if (maxStart < s) return null;

  let best = { hour: s, avgPrice: Infinity, slice: [] };

  for (let h = s; h <= maxStart; h++) {
    const slice = prices24.slice(h, h + dur);
    const avgPrice = slice.reduce((a, b) => a + b, 0) / slice.length;

    if (avgPrice < best.avgPrice) {
      best = { hour: h, avgPrice, slice };
    }
  }
  return best;
}

function costForSliceEuro(slicePricesCents, perUseKwh, perHourKwhPerHour) {
  const avgPrice = slicePricesCents.reduce((a, b) => a + b, 0) / slicePricesCents.length;
  const perUseEuro = moneyEuro(avgPrice, perUseKwh);

  const perHourEuro = slicePricesCents.reduce(
    (sum, priceCents) => sum + moneyEuro(priceCents, perHourKwhPerHour),
    0
  );

  return perUseEuro + perHourEuro;
}

async function suggest() {
  const idxs = getSelectedDeviceIndexes();
  if (idxs.length === 0) {
    $("suggestOut").textContent = "Valitse vähintään yksi laite.";
    return;
  }

  const dayStr = $("date3").value;
  const pickMode = $("pick").value;

  $("suggestOut").textContent = "Haetaan päivän hinnat ja etsitään halvin aika…";

  try {
    const [y, m, d] = dayStr.split("-").map(Number);

    const pricesLocal = await Promise.all(
      Array.from({ length: 24 }, async (_, h) => {
        const local = new Date(y, m - 1, d, h, 0, 0);
        const isoUtc = local.toISOString();
        const url = `${CONFIG.PRICE_ENDPOINT}?date=${encodeURIComponent(isoUtc)}`;
        const res = await fetch(url, { cache: "no-store" });
        const data = await res.json().catch(() => null);
        if (!res.ok || !data) {
          if (data && data.error === "No data yet") {
            throw new Error("Ei dataa vielä saatavilla tälle päivälle. Valitse lähempi päivämäärä.");
          }
          throw new Error("Päivähintojen haku epäonnistui");
        }
        if (typeof data.price !== "number") throw new Error("Päivähintojen haku epäonnistui");
        return data.price;
      })
    );

    const winStart = $("winStart").value;
    const winEnd = $("winEnd").value;
    const durHours = parseIntClamped($("durHours").value, 1, 24, 1);

    const best = findCheapestStart(pricesLocal, winStart, winEnd, durHours);
    if (!best) {
      $("suggestOut").textContent = "Valittu aikaväli on liian lyhyt valitulle kestolle.";
      return;
    }

    const { rows, daily } = getSchedulableSelection(idxs, pickMode);

    const s = Math.min(parseHour(winStart, 0), parseHour(winEnd, 23));
    const e = Math.max(parseHour(winStart, 0), parseHour(winEnd, 23));
    const candidates = [];
    const maxStart = e - (durHours - 1);
    for (let h = s; h <= maxStart; h++) {
      const slice = pricesLocal.slice(h, h + durHours);
      const avgP = slice.reduce((a,b)=>a+b,0) / slice.length;
      candidates.push({ h, avgP });
    }
    candidates.sort((a,b)=>a.avgP - b.avgP);

    let costEuro = 0;

    const perUse = rows.filter(r => r.kind === "perUse");
    const perUseKwh = perUse.reduce((s, r) => s + r.kwhBase, 0);
    costEuro += moneyEuro(best.avgPrice, perUseKwh);

    const perHour = rows.filter(r => r.kind === "perHour");
    const perHourKwhPerHour = perHour.reduce((s, r) => s + r.kwhBase, 0);
    const perHourEuro = best.slice.reduce((sum, priceCents) => sum + moneyEuro(priceCents, perHourKwhPerHour), 0);
    costEuro += perHourEuro;

    const hh = String(best.hour).padStart(2, "0");
    const hhEnd = String(best.hour + durHours - 1).padStart(2, "0");

    const noteDaily = `
      ${daily.length ? `
        <div class="mt-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-xl p-3">
          <b>Huom:</b> mukana on jatkuvaa kulutusta (kWh/vrk / "jatkuva"), jota ei kannata optimoida kellonajalla:
          ${daily.map(x => x.name).join(", ")}.
        </div>
      ` : ""}
    `;

    const candidateCosts = candidates.map(({ h }) => {
      const slice = pricesLocal.slice(h, h + durHours);
      const euro = costForSliceEuro(slice, perUseKwh, perHourKwhPerHour);
      return { h, euro };
    });

    const avgEuro = candidateCosts.reduce((s, x) => s + x.euro, 0) / candidateCosts.length;
    const worstEuro = candidateCosts.reduce((m, x) => Math.max(m, x.euro), -Infinity);

    const savingVsAvg = avgEuro - costEuro;
    const savingVsWorst = worstEuro - costEuro;

    const savedNow = Math.max(0, savingVsAvg);
    const totals = addSavings(savedNow);

    const box = document.getElementById("savingsBox");
    if (box) {
      box.innerHTML = `
        <b>Säästit tässä haussa:</b> ${savedNow.toFixed(3)} € (verrattuna keskimääräiseen aloitusaikaan)<br/>
        <b>Yhteensä säästetty:</b> ${totals.total.toFixed(3)} € (${totals.runs} hakua)
      `;
      box.classList.remove("hidden");
    }

    const top3 = candidates.slice(0, 3)
      .map(x => `klo ${String(x.h).padStart(2,"0")} (avg ${x.avgP.toFixed(2)} snt/kWh)`)
      .join(" • ");

    $("suggestOut").innerHTML = `
      <div style="line-height:1.6">
        <div><b>Halvin aloitusaika</b> valitulla aikavälillä:</div>
        <div class="mt-1">
          <b>${dayStr} klo ${hh}:00</b> ${durHours > 1 ? `– ${hhEnd}:59 (${durHours} h)` : "(1 h)"}
          <br/>
          Keskimääräinen hinta: <b>${best.avgPrice.toFixed(2)} snt/kWh</b>
        </div>

        <div class="mt-2">
          Arvioitu kustannus (ajastettavat valinnat): <b>${costEuro.toFixed(3)} €</b>
        </div>

        <div class="mt-2 text-xs text-slate-600">
          Seuraavat vaihtoehdot: ${top3}
        </div>

        ${noteDaily}
      </div>
    `;
  } catch (e) {
    $("suggestOut").textContent = `Virhe: ${e.message}`;
    console.error(e);
  }
}

// ========== CHART DRAWING ==========
function clamp01(x) { return Math.max(0, Math.min(1, x)); }
function lerp(a, b, t) { return a + (b - a) * t; }

function getPricesSignature(prices) {
  if (!Array.isArray(prices) || prices.length === 0) return "";
  const first = prices[0] || {};
  const last = prices[prices.length - 1] || {};
  return [
    prices.length,
    first.startDate || "",
    first.endDate || "",
    first.price ?? "",
    last.startDate || "",
    last.endDate || "",
    last.price ?? "",
  ].join("|");
}

function colorForT_Solid(t) {
  t = clamp01(t);
  let hue;
  if (t < 0.5) {
    const tt = t / 0.5;
    hue = lerp(120, 50, tt);
  } else {
    const tt = (t - 0.5) / 0.5;
    hue = lerp(50, 0, tt);
  }
  return `hsl(${hue.toFixed(0)} 75% 45%)`;
}

function ensureTooltip(canvas) {
  const parent = canvas.parentElement;
  if (getComputedStyle(parent).position === "static") {
    parent.style.position = "relative";
  }

  let tip = parent.querySelector(".chart-tooltip");
  if (!tip) {
    tip = document.createElement("div");
    tip.className = "chart-tooltip";
    tip.style.position = "absolute";
    tip.style.pointerEvents = "none";
    tip.style.zIndex = "20";
    tip.style.display = "none";
    tip.style.minWidth = "160px";
    tip.style.maxWidth = "240px";
    tip.style.padding = "10px 12px";
    tip.style.borderRadius = "12px";
    tip.style.background = "rgba(15,23,42,0.92)";
    tip.style.color = "white";
    tip.style.font = "12px system-ui";
    tip.style.boxShadow = "0 10px 25px rgba(0,0,0,0.18)";
    tip.style.border = "1px solid rgba(255,255,255,0.12)";
    parent.appendChild(tip);
  }
  return tip;
}

function drawBarChartSolidWithHover(canvas, hourlyPrices, startHour = 0, quarterMinPrices = null) {
  try {
      
    if (!canvas) {
      console.error("❌ Canvas element is null!");
      return;
    }

    const prices = (hourlyPrices || []).slice(0, 24);
      
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      console.error("❌ Could not get canvas context!");
      return;
    }

    const parentWidth = canvas.parentElement?.clientWidth || 400;
    const cssW = Math.min(parentWidth, window.innerWidth - 40);
    const cssH = 220;

    const dpr = window.devicePixelRatio || 1;
    console.log("🟦 Setting canvas size: width=" + Math.floor(cssW * dpr) + " height=" + Math.floor(cssH * dpr) + " dpr=" + dpr);
    
    canvas.width = Math.floor(cssW * dpr);
    canvas.height = Math.floor(cssH * dpr);
    canvas.style.width = cssW + 'px';
    canvas.style.height = cssH + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const w = cssW, h = cssH;
    ctx.clearRect(0, 0, w, h);

    const padL = 46, padR = 10, padT = 10, padB = 34;
    const chartW = w - padL - padR;
    const chartH = h - padT - padB;

    const min = Math.min(...prices);
    const max = Math.max(...prices);
    const span = Math.max(1e-9, max - min);
    const n = prices.length;
    const barW = chartW / n;

    const isDark = document.documentElement.classList.contains("dark");
    const axisColor = isDark ? "rgba(226,232,240,0.85)" : "rgba(15,23,42,0.45)";
    const gridColor = isDark ? "rgba(226,232,240,0.18)" : "rgba(15,23,42,0.12)";
    const textColor = isDark ? "#e2e8f0" : "#0f172a";

    ctx.lineWidth = 1;
    ctx.strokeStyle = axisColor;
    ctx.beginPath();
    ctx.moveTo(padL, padT);
    ctx.lineTo(padL, padT + chartH);
    ctx.lineTo(padL + chartW, padT + chartH);
    ctx.stroke();

    ctx.fillStyle = textColor;
    ctx.font = "12px system-ui";
    ctx.textAlign = "right";
    ctx.textBaseline = "middle";

    const yForVal = (v) => padT + (1 - (v - min) / span) * chartH;

    [max, (min + max) / 2, min].forEach((v) => {
      const y = yForVal(v);
      ctx.fillText(v.toFixed(2), padL - 8, y);

      ctx.strokeStyle = gridColor;
      ctx.beginPath();
      ctx.moveTo(padL, y);
      ctx.lineTo(padL + chartW, y);
      ctx.stroke();
    });

    for (let i = 0; i < n; i++) {
      const v = prices[i];
      const t = (v - min) / span;
      const bh = ((v - min) / span) * chartH;

      const x = padL + i * barW;
      const y = padT + (chartH - bh);

      ctx.fillStyle = colorForT_Solid(t);
      ctx.fillRect(x, y, Math.max(1, barW), bh);

      ctx.strokeStyle = "rgba(15,23,42,0.10)";
      ctx.strokeRect(x + 0.5, y + 0.5, Math.max(1, barW) - 1, Math.max(0, bh - 1));
    }

    ctx.fillStyle = textColor;
    ctx.font = "10px system-ui";
    ctx.textAlign = "center";
    ctx.textBaseline = "top";

    const approxLabelW = 10;
    const step = Math.max(1, Math.ceil(approxLabelW / Math.max(1, barW)));

    for (let i = 0; i < n; i += step) {
      const displayHour = (startHour + i) % 24;
      const x = padL + i * barW + barW / 2;
      ctx.fillText(String(displayHour).padStart(2, "0"), x, padT + chartH + 6);
    }

    const tip = ensureTooltip(canvas);
    canvas.__chartMeta = { padL, padT, chartW, chartH, barW, prices, startHour, quarterMinPrices };

    const onMove = (ev) => {
      const rect = canvas.getBoundingClientRect();
      const mx = ev.clientX - rect.left;
      const my = ev.clientY - rect.top;

      const meta = canvas.__chartMeta;
      if (!meta) return;

      const inside =
        mx >= meta.padL && mx <= meta.padL + meta.chartW &&
        my >= meta.padT && my <= meta.padT + meta.chartH;

      if (!inside) {
        tip.style.display = "none";
        return;
      }

      const idx = Math.floor((mx - meta.padL) / meta.barW);
      const hour = Math.max(0, Math.min(meta.prices.length - 1, idx));
      const v = meta.prices[hour];
      const displayHour = (meta.startHour + hour) % 24;

      const hourLabel = `${String(displayHour).padStart(2,"0")}:00–${String(displayHour).padStart(2,"0")}:59`;

      let detailHTML = ``;
      if (meta.quarterMinPrices && meta.quarterMinPrices[hour]) {
        const qPrices = meta.quarterMinPrices[hour];
        const details = [
          `00–14 min: ${qPrices[0].toFixed(2)}`,
          `15–29 min: ${qPrices[1].toFixed(2)}`,
          `30–44 min: ${qPrices[2].toFixed(2)}`,
          `45–59 min: ${qPrices[3].toFixed(2)}`
        ].join(" | ");
        detailHTML = `<div style="font-size:10px; opacity:0.8; margin-top:4px;">${details} snt/kWh</div>`;
      }

      tip.innerHTML = `
        <div style="display:flex; align-items:center; justify-content:space-between; gap:10px;">
          <div style="font-weight:700">${hourLabel}</div>
          <div style="font-weight:700">${v.toFixed(2)} <span style="font-weight:500; opacity:.85">snt/kWh</span></div>
        </div>
        ${detailHTML}
      `;

      const parentRect = canvas.parentElement.getBoundingClientRect();
      let left = (ev.clientX - parentRect.left) + 12;
      let top  = (ev.clientY - parentRect.top) - 12;

      tip.style.display = "block";
      tip.style.left = left + "px";
      tip.style.top = top + "px";

      const tipRect = tip.getBoundingClientRect();
      const maxLeft = parentRect.width - tipRect.width - 8;
      const maxTop  = parentRect.height - tipRect.height - 8;
      if (left > maxLeft) tip.style.left = Math.max(8, maxLeft) + "px";
      if (top > maxTop) tip.style.top = Math.max(8, maxTop) + "px";
    };

    const onLeave = () => { tip.style.display = "none"; };

    if (canvas.__hoverBound) {
      canvas.removeEventListener("mousemove", canvas.__hoverBound.onMove);
      canvas.removeEventListener("mouseleave", canvas.__hoverBound.onLeave);
    }
    canvas.__hoverBound = { onMove, onLeave };
    canvas.addEventListener("mousemove", onMove);
    canvas.addEventListener("mouseleave", onLeave);
  } catch (e) {
    console.error("❌ Error in drawBarChartSolidWithHover:", e);
  }
}

async function loadDayAndDraw(hoursOffset = 0) {
  if (chartLoading) return;
  chartLoading = true;

  chartOffset = hoursOffset;
  const now = new Date();
  const currentHour = now.getHours();
  const currentDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  const startingHourWithOffset = currentHour + hoursOffset;
  const startHour = ((startingHourWithOffset % 24) + 24) % 24;
  const dayOffset = Math.floor(startingHourWithOffset / 24);

  const displayDate = new Date(currentDate);
  displayDate.setDate(displayDate.getDate() + dayOffset);
  chartBaseDate = new Date(displayDate);
  chartStartHour = startHour;

  const dateStr = `${displayDate.getFullYear()}-${String(displayDate.getMonth() + 1).padStart(2, '0')}-${String(displayDate.getDate()).padStart(2, '0')}`;
  
  if (hoursOffset === 0) {
    $("chartTitle").textContent = `${t('next22Hours')} (${t('starting')} ${String(startHour).padStart(2, "0")}:00) - ${t('currentTime')} ⏳`;
  } else if (hoursOffset > 0) {
    $("chartTitle").textContent = `${t('next22Hours')} (${t('starting')} ${String(startHour).padStart(2, "0")}:00) - +${hoursOffset}h ⏳`;
  } else {
    $("chartTitle").textContent = `${t('next22Hours')} (${t('starting')} ${String(startHour).padStart(2, "0")}:00) - ${hoursOffset}h ⏳`;
  }

  const dayChartElement = $("dayChart");
  if (!dayChartElement) {
    console.error("❌ dayChart element not found!");
    chartLoading = false;
    return;
  }

  try {
    // Use shared cache from pricing.js
    const cachedPrices = await fetchLatestPrices();
    
    if (!cachedPrices || cachedPrices.length === 0) {
        } else {
      // Update signature to track changes
      const currentSig = getPricesSignature(cachedPrices);
      if (currentSig) lastPricesSignature = currentSig;
    }

  
    const pricesLocal = [];
    const quarterMinPricesLocal = [];

    for (let i = 0; i < 22; i++) {
      const hourOffset = startHour + i;
      const daysOffset = Math.floor(hourOffset / 24);
      const hourOfDay = hourOffset % 24;

      const fetchDate = new Date(displayDate);
      fetchDate.setDate(fetchDate.getDate() + daysOffset);

      const y = fetchDate.getFullYear();
      const mo = fetchDate.getMonth();
      const d = fetchDate.getDate();

      const quarterHourPrices = [];
      for (let q = 0; q < 4; q++) {
        const qDate = new Date(y, mo, d, hourOfDay, q * 15, 0);
        
        let price = 5.0;
        if (cachedPrices && cachedPrices.length > 0) {
          const matching = cachedPrices.find(
            p => {
              const pStart = new Date(p.startDate);
              const pEnd = new Date(p.endDate);
              return pStart <= qDate && pEnd > qDate;
            }
          );
          if (matching) {
            let rawPrice = matching.price;
            if (typeof rawPrice === 'string') {
              rawPrice = parseFloat(rawPrice.replace(',', '.'));
            }
            if (typeof rawPrice === 'number' && !isNaN(rawPrice)) {
              price = rawPrice;
            }
          }
        }
        quarterHourPrices.push(price);
      }

      const hourlyAvg = quarterHourPrices.reduce((a, b) => a + b, 0) / quarterHourPrices.length;
      pricesLocal.push(hourlyAvg);
      quarterMinPricesLocal.push(quarterHourPrices);
    }

    currentDayPrices = pricesLocal.map((price, idx) => ({
      hour: (startHour + idx) % 24,
      price: price
    }));

    quarterMinPrices = quarterMinPricesLocal;

      drawBarChartSolidWithHover(dayChartElement, pricesLocal, startHour, quarterMinPricesLocal);
      
    if (hoursOffset === 0) {
      $("chartTitle").textContent = `${t('next22Hours')} (${t('starting')} ${String(startHour).padStart(2, "0")}:00) - ${t('currentTime')} ⏳`;
    } else if (hoursOffset > 0) {
      $("chartTitle").textContent = `${t('next22Hours')} (${t('starting')} ${String(startHour).padStart(2, "0")}:00) - +${hoursOffset}h ⏳`;
    } else {
      $("chartTitle").textContent = `${t('next22Hours')} (${t('starting')} ${String(startHour).padStart(2, "0")}:00) - ${hoursOffset}h ⏳`;
    }
  } catch (e) {
    console.error("❌ Error in loadDayAndDraw:", e);
      drawBarChartSolidWithHover($("dayChart"), Array(22).fill(5.0), startHour);
    $("chartTitle").textContent = `${t('errorFetchingPrices')}: ${e.message}`;
  } finally {
    chartLoading = false;
    }
}

async function refreshLatestPricesIfChanged() {
  if (chartLoading) return;
  try {
    clearCachedPrices(); // Clear cache to force refresh
    const nextPrices = await fetchLatestPrices();
    
    if (!Array.isArray(nextPrices) || nextPrices.length === 0) return;

    const nextSig = getPricesSignature(nextPrices);
    if (nextSig && nextSig !== lastPricesSignature) {
      lastPricesSignature = nextSig;
      await loadDayAndDraw(chartOffset);
    }
  } catch (e) {
    console.error("❌ Error in refreshLatestPricesIfChanged:", e);
  }
}

// ========== PRICE WATCH ==========
function checkPricesForWatch() {
  if (!currentDayPrices || currentDayPrices.length === 0) return;

  const cheapestPrice = Math.min(...currentDayPrices.map(p => p.price || 999));
  
  if (cheapestPrice <= priceWatchThreshold) {
    const cheapestHour = currentDayPrices.find(p => p.price === cheapestPrice);
    
    if ("Notification" in window && Notification.permission === "granted") {
      new Notification("Price Watch - Hinta laski!", {
        body: `Hinta laski alle ${priceWatchThreshold.toFixed(2)} snt/kWh!\nHalvin hinta: ${cheapestPrice.toFixed(2)} snt/kWh klo ${cheapestHour ? cheapestHour.hour.toString().padStart(2, '0') + ':00' : 'tuntematon'}`,
        icon: "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text x='50' y='70' font-size='70' text-anchor='middle'>⚡</text></svg>",
        badge: "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text x='50' y='70' font-size='70' text-anchor='middle'>⚡</text></svg>",
        tag: "price-watch",
        requireInteraction: true,
        vibrate: [200, 100, 200]
      });
    }
  }
}

// ========== PWA INSTALLATION ==========
let installPrompt = null;

// Check if app is already installed
function isAppInstalled() {
  return window.navigator.standalone === true || 
         window.matchMedia('(display-mode: standalone)').matches ||
         window.navigator.standalone;
}

window.addEventListener('beforeinstallprompt', (event) => {
  event.preventDefault();
  installPrompt = event;
  const installBtn = $('installPromptBtn');
  if (installBtn && !isAppInstalled()) {
    installBtn.classList.remove('hidden');
  }
});

const installBtn = $('installPromptBtn');
if (installBtn) {
  // Show install prompt on page load if not installed
  window.addEventListener('load', () => {
    if (!isAppInstalled() && installPrompt) {
      installBtn.classList.remove('hidden');
    } else if (isAppInstalled()) {
      installBtn.classList.add('hidden');
    }
  });

  installBtn.addEventListener('click', async () => {
    if (!installPrompt) return;
    installPrompt.prompt();
    const result = await installPrompt.userChoice;
    if (result.outcome === 'accepted') {
      showToast('Kiitos sovelluksen asentamisesta!');
      installBtn.classList.add('hidden');
    }
    installPrompt = null;
  });
}


// ========== EVENT HANDLERS ==========
document.addEventListener("DOMContentLoaded", async () => {
  // Translation System
  function applyTranslations() {
    document.querySelectorAll('[data-i18n]').forEach(el => {
      const key = el.getAttribute('data-i18n');
      const translation = t(key);
      
      if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
        if (el.hasAttribute('placeholder')) {
          el.placeholder = translation;
        } else {
          el.value = translation;
        }
      } else if (el.tagName === 'OPTION') {
        el.textContent = translation;
      } else {
        el.textContent = translation;
      }
    });
    
    // Update page title
    document.title = t('pageTitle');
    
    // Update meta description
    const metaDesc = document.querySelector('meta[name="description"]');
    if (metaDesc) metaDesc.setAttribute('content', t('metaDescription'));
  }
  
  const toggleLanguage = () => {
    const currentLang = getCurrentLanguage();
    const newLang = currentLang === 'fi' ? 'en' : 'fi';
    setLanguage(newLang);
    applyTranslations();
    
    // Update theme button text separately since it changes based on theme
    const isDark = document.documentElement.classList.contains("dark");
    const btn = $("themeToggle");
    if (btn) btn.textContent = isDark ? t("lightMode") : t("darkMode");
    
    // Redraw chart with new language
    if ($("dayChart") && currentDayPrices && currentDayPrices.length > 0) {
      loadDayAndDraw(chartOffset).catch(() => {});
    }
    
    // Re-render devices to update category names
    renderDevices();
    const st = loadState();
    if (st) {
      st.selected?.forEach(i => {
        const cb = document.querySelector(`input[name="device"][value="${i}"]`);
        if (cb) cb.checked = true;
      });
      Object.keys(st.qty || {}).forEach(i => {
        const inp = document.querySelector(`input[name="qty"][data-i="${i}"]`);
        if (inp) inp.value = st.qty[i];
      });
      Object.keys(st.cats || {}).forEach(catId => {
        const div = document.getElementById(catId);
        if (div && st.cats[catId]) div.classList.add("hidden");
      });
    }
    onSelectionChange();
  };
  
  // Apply translations on load
  applyTranslations();
  
  // Language toggle button
  $("languageToggle")?.addEventListener("click", toggleLanguage);
  
  // Theme
  const applyTheme = (mode) => {
    const isDark = mode === "dark";
    document.documentElement.classList.toggle("dark", isDark);
    const btn = $("themeToggle");
    if (btn) btn.textContent = isDark ? t("lightMode") : t("darkMode");
    if ($("dayChart") && currentDayPrices && currentDayPrices.length > 0) {
      loadDayAndDraw(chartOffset).catch(() => {});
    }
  };

  const storedTheme = localStorage.getItem("theme");
  const prefersDark = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
  applyTheme(storedTheme || (prefersDark ? "dark" : "light"));

  $("themeToggle")?.addEventListener("click", () => {
    const isDarkNow = !document.documentElement.classList.contains("dark");
    localStorage.setItem("theme", isDarkNow ? "dark" : "light");
    applyTheme(isDarkNow ? "dark" : "light");
  });

  // Initialize Cookie Consent
  initConsent();

  // Setup Price Watch toggle
  const priceWatchHeader = $('priceWatchHeader');
  if (priceWatchHeader) {
    priceWatchHeader.addEventListener('click', () => {
      const content = $('priceWatchContent');
      if (content) {
        const isHidden = content.classList.toggle('hidden');
        localStorage.setItem('priceWatchCollapsed', isHidden);
        const tog = document.getElementById('priceWatchToggle'); if (tog) tog.textContent = isHidden ? '▶' : '▼';
      }
    });
    
    const wasCollapsed = localStorage.getItem('priceWatchCollapsed') === 'true';
    if (wasCollapsed) {
      const content = $('priceWatchContent');
      if (content) {
        content.classList.add('hidden');
        const tog2 = document.getElementById('priceWatchToggle'); if (tog2) tog2.textContent = '▶';
      }
    }
  }


  // Setup suggestion calculator
  const suggestBtn = $("suggest");
  if (suggestBtn) suggestBtn.addEventListener("click", suggest);

  // Setup basic calculator
  const calcBtn = $("calc");
  if (calcBtn) calcBtn.addEventListener("click", calculate);

  // Setup chart navigation
  const loadDayBtn = $("loadDay");
  if (loadDayBtn) loadDayBtn.addEventListener("click", () => loadDayAndDraw(0));

  const refreshChartBtn = $("refreshChart");
  if (refreshChartBtn) {
    refreshChartBtn.addEventListener("click", async () => {
      showToast("Päivitetään...");
      await loadDayAndDraw(chartOffset);
      showToast("Päivitetty");
    });
  }

  const chartPrevBtn = $("chartPrev");
  if (chartPrevBtn) {
    chartPrevBtn.addEventListener("click", async () => {
      if (chartOffset - 6 < -168) {
        showToast("Ei dataa vanhemmille päiville");
        return;
      }
      await loadDayAndDraw(chartOffset - 6);
    });
  }

  const chartNextBtn = $("chartNext");
  if (chartNextBtn) {
    chartNextBtn.addEventListener("click", async () => {
      if (chartOffset + 6 > 0) {
        showToast("Hinnat saatavilla vain tänään");
        return;
      }
      await loadDayAndDraw(chartOffset + 6);
    });
  }

  // Date change listeners
  $("date1")?.addEventListener("change", () => {
    loadDayAndDraw(0).catch(() => {});
    updateDateAvgPrice("date1");
  });

  $("date2")?.addEventListener("change", () => {
    updateDateAvgPrice("date2");
  });

  $("date3")?.addEventListener("change", () => {
    updateDateAvgPrice("date3");
  });

  // Clamp hour inputs to 0–23
  const clampHourInput = (el) => {
    if (!el) return;
    const n = Math.floor(Number(el.value));
    if (!Number.isFinite(n)) return;
    el.value = Math.max(0, Math.min(23, n));
  };
  $("hour1")?.addEventListener("input", (e) => clampHourInput(e.target));
  $("hour1")?.addEventListener("change", (e) => clampHourInput(e.target));
  $("hour2")?.addEventListener("input", (e) => clampHourInput(e.target));
  $("hour2")?.addEventListener("change", (e) => clampHourInput(e.target));
  $("winStart")?.addEventListener("input", (e) => clampHourInput(e.target));
  $("winStart")?.addEventListener("change", (e) => clampHourInput(e.target));
  $("winEnd")?.addEventListener("input", (e) => clampHourInput(e.target));
  $("winEnd")?.addEventListener("change", (e) => clampHourInput(e.target));

  // Window resize
  window.addEventListener("resize", () => {
    if (resizeRaf) cancelAnimationFrame(resizeRaf);
    resizeRaf = requestAnimationFrame(() => {
      loadDayAndDraw(chartOffset).catch(() => {});
    });
  });

  // Pick mode change
  $("pick")?.addEventListener("change", onSelectionChange);

  // Reset button
  $("resetBtn")?.addEventListener("click", () => {
    document.querySelectorAll('input[name="device"]').forEach(cb => cb.checked = false);
    document.querySelectorAll('input[name="qty"]').forEach(q => {
      q.value = 1;
      q.disabled = true;
    });
    $("out").innerHTML = "Valitse laite ja paina \"Laske säästö\".";
    $("suggestOut").innerHTML = "";
    $("copyResults")?.classList.add("hidden");
    localStorage.removeItem("psl_state_v1");
    onSelectionChange();
    showToast("Valinnat tyhjennetty");
  });

  // Close categories
  $("closeAllCategories")?.addEventListener("click", () => {
    document.querySelectorAll("[data-cat-body]").forEach(el => {
      el.classList.add("hidden");
    });
    showToast("Kategoriat suljettu");
  });

  // Favorites
  $("saveFavorites")?.addEventListener("click", () => {
    const currentState = loadState();
    if (!currentState || !currentState.selected || currentState.selected.length === 0) {
      showToast("Ei valintoja tallennettavana");
      return;
    }
    localStorage.setItem("psl_favorites_v1", JSON.stringify(currentState));
    showToast("✅ Suosikit tallennettu!");
  });

  $("loadFavorites")?.addEventListener("click", () => {
    const favs = localStorage.getItem("psl_favorites_v1");
    if (!favs) {
      showToast("Ei tallennettuja suosikkeja");
      return;
    }
    try {
      localStorage.setItem("psl_state_v1", favs);
      location.reload();
    } catch (e) {
      showToast("Virhe ladattaessa suosikkeja");
    }
  });

  // Presets
  $("applyPreset")?.addEventListener("click", () => {
    const presetId = $("presetSelect")?.value;
    if (presetId) applyPresetById(presetId);
  });

  // Price Watch
  $("startPriceWatch")?.addEventListener("click", () => {
    const threshold = parseFloat($("priceWatchThreshold")?.value);
    if (!threshold || threshold <= 0) {
      showToast("Aseta hinnan raja");
      return;
    }

    priceWatchThreshold = threshold;
    priceWatchActive = true;

    if ("Notification" in window && Notification.permission === "default") {
      Notification.requestPermission();
    }

    $("startPriceWatch")?.classList.add("hidden");
    $("stopPriceWatch")?.classList.remove("hidden");
    $("priceWatchStatus").textContent = `Seurannan kohde: ${threshold} snt/kWh. Tarkistetaan hinnat...`;

    if (priceWatchInterval) clearInterval(priceWatchInterval);
    priceWatchInterval = setInterval(checkPricesForWatch, 5 * 60 * 1000);
    
    checkPricesForWatch();
    showToast("Price Watch käynnistetty");
  });

  $("stopPriceWatch")?.addEventListener("click", () => {
    priceWatchActive = false;
    if (priceWatchInterval) {
      clearInterval(priceWatchInterval);
      priceWatchInterval = null;
    }
    $("startPriceWatch")?.classList.remove("hidden");
    $("stopPriceWatch")?.classList.add("hidden");
    $("priceWatchStatus").textContent = "";
    showToast("Price Watch pysäytetty");
  });

  // Auto-optimize
  $("autoOptimize")?.addEventListener("click", async () => {
    const idxs = getSelectedDeviceIndexes();
    if (idxs.length === 0) {
      showToast("Valitse ensin laite");
      return;
    }

    const today = new Date();
    $("date3").value = today.toISOString().split('T')[0];
    const h1 = $("hour1")?.value;
    if (h1 !== undefined && h1 !== null && h1 !== "") {
      $("winStart").value = h1;
    } else {
      $("winStart").value = 0;
    }
    $("winEnd").value = 23;
    $("durHours").value = 1;

    showToast("Optimoidaan...");
    $("suggest")?.click();
  });

  // Copy results
  $("copyResults")?.addEventListener("click", async () => {
    if (!lastResultText) {
      showToast("Ei tulosta kopioitavana");
      return;
    }
    try {
      await copyTextToClipboard(lastResultText);
      showToast("Tulos kopioitu leikepöydälle!");
    } catch (e) {
      showToast("Virhe kopioinnissa");
    }
  });

  // Price display toggle
  $("priceToggle")?.addEventListener("click", () => {
    showInEuros = !showInEuros;
    $("priceToggle").textContent = showInEuros ? "Näytä snt/kWh" : "Näytä euroina";
    showToast(showInEuros ? "Näytetään euroina" : "Näytetään snt/kWh");
    if (lastResultText) {
      calculate();
    }
  });

  // Initialize
  
  try {
      setTodayDefaults();
    } catch (e) {
    console.error("❌ Error in setTodayDefaults:", e);
  }
  
  try {
      renderDevices();
    } catch (e) {
    console.error("❌ Error in renderDevices:", e);
  }
  
  try {
    onSelectionChange();
  } catch (e) {
    console.error("❌ Error in onSelectionChange:", e);
  }

  // Load chart
  loadDayAndDraw(0).catch(e => {
    $("chartTitle").textContent = `${t('error')}: ${e.message}`;
  });

  // Auto-update chart every 15 minutes if new data is available
  setInterval(() => {
    refreshLatestPricesIfChanged();
  }, 15 * 60 * 1000);

  // Auto-refresh chart every hour
  setInterval(() => {
    loadDayAndDraw(chartOffset).catch(e => {
      console.error('Auto-refresh chart error:', e);
    });
  }, 60 * 60 * 1000); // 1 hour

  // Update average prices
  updateDateAvgPrice("date1");
  updateDateAvgPrice("date2");
  updateDateAvgPrice("date3");

  // Update current price hero
  updateCurrentPriceHero();
  setInterval(updateCurrentPriceHero, 5 * 60 * 1000);

  // Add Huominen button listener
  const loadTomorrowBtn = $("loadTomorrow");
  if (loadTomorrowBtn) loadTomorrowBtn.addEventListener("click", async () => {
    const now = new Date();
    const tomorrowMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 0);
    const hoursToTomorrow = Math.round((tomorrowMidnight.getTime() - now.getTime()) / 3600000);
    await loadDayAndDraw(hoursToTomorrow);
    showToast("Huomisen hinnat — saatavilla yleensä klo 14 jälkeen");
  });
});

// ========== CURRENT PRICE HERO ==========
function priceColor(price) {
  if (price < 5) return 'green';
  if (price < 10) return 'yellow';
  if (price < 15) return 'orange';
  return 'red';
}

function updateFavicon(price) {
  try {
    const canvas = document.createElement('canvas');
    canvas.width = 32; canvas.height = 32;
    const ctx = canvas.getContext('2d');
    const color = price < 5 ? '#22c55e' : price < 10 ? '#eab308' : price < 15 ? '#f97316' : '#ef4444';
    ctx.beginPath();
    ctx.arc(16, 16, 15, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
    ctx.fillStyle = 'white';
    ctx.font = 'bold 11px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(price < 10 ? price.toFixed(1) : Math.round(price).toString(), 16, 17);
    let link = document.querySelector("link[rel~='icon']");
    if (!link) { link = document.createElement('link'); link.rel = 'icon'; document.head.appendChild(link); }
    link.href = canvas.toDataURL();
  } catch(e) {}
}

function updateKannattaako(price) {
  const laitteet = [
    { id: 'k-pyykinpesu', kwh: 0.7 },
    { id: 'k-astianpesukone', kwh: 1.1 },
    { id: 'k-sauna', kwh: 4.5 },
    { id: 'k-sahkoauto', kwh: 9 },
  ];
  laitteet.forEach(({ id, kwh }) => {
    const el = document.getElementById(id);
    if (!el) return;
    const cost = (price / 100) * kwh;
    const tulos = el.querySelector('.k-tulos');
    const hinta = el.querySelector('.k-hinta');
    let label, bgClass, borderClass, textClass;
    if (price < 5) {
      label = 'Kyllä'; bgClass = 'bg-green-50'; borderClass = 'border-green-300'; textClass = 'text-green-700';
    } else if (price < 10) {
      label = 'Ihan ok'; bgClass = 'bg-yellow-50'; borderClass = 'border-yellow-300'; textClass = 'text-yellow-700';
    } else if (price < 15) {
      label = 'Odota'; bgClass = 'bg-orange-50'; borderClass = 'border-orange-300'; textClass = 'text-orange-700';
    } else {
      label = 'Kallista'; bgClass = 'bg-red-50'; borderClass = 'border-red-300'; textClass = 'text-red-700';
    }
    el.className = `rounded-xl border p-3 text-center transition-colors ${bgClass} ${borderClass}`;
    if (tulos) { tulos.textContent = label; tulos.className = `k-tulos mt-1 text-xs font-bold ${textClass}`; }
    if (hinta) { hinta.textContent = `n. ${cost.toFixed(2)} €`; hinta.className = `k-hinta mt-0.5 text-xs ${textClass} opacity-70`; }
  });
}

async function updateCurrentPriceHero() {
  try {
    const prices = await fetchLatestPrices();
    if (!prices || prices.length === 0) return;
    const now = new Date();
    const current = prices.find(p => {
      const start = new Date(p.startDate);
      const end = new Date(p.endDate);
      return start <= now && end > now;
    });
    if (!current) return;
    const price = typeof current.price === 'string' ? parseFloat(current.price.replace(',', '.')) : current.price;

    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const todayEnd = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000);
    const byHour = {};
    prices
      .filter(p => new Date(p.startDate) >= todayStart && new Date(p.startDate) < todayEnd)
      .forEach(p => {
        const h = new Date(p.startDate).getHours();
        const v = typeof p.price === 'string' ? parseFloat(p.price.replace(',', '.')) : p.price;
        if (!(h in byHour) && Number.isFinite(v)) byHour[h] = { price: v, hour: h };
      });
    const hourly = Object.values(byHour);
    const cheapest = hourly.length ? hourly.reduce((a, b) => a.price < b.price ? a : b) : null;
    const mostExpensive = hourly.length ? hourly.reduce((a, b) => a.price > b.price ? a : b) : null;

    const color = priceColor(price);
    const colorMap = { green: 'text-green-600', yellow: 'text-yellow-600', orange: 'text-orange-600', red: 'text-red-600' };
    const labelMap = { green: 'Halpaa', yellow: 'Kohtalaista', orange: 'Kallista', red: 'Hyvin kallista' };

    const heroEl = document.getElementById('heroPriceValue');
    const labelEl = document.getElementById('heroPriceLabel');
    const cheapestEl = document.getElementById('heroCheapest');
    const expensiveEl = document.getElementById('heroMostExpensive');

    if (heroEl) { heroEl.textContent = price.toFixed(2); heroEl.className = `text-6xl font-bold tabular-nums ${colorMap[color]}`; }
    if (labelEl) { labelEl.textContent = labelMap[color]; labelEl.className = `mt-2 text-sm font-semibold ${colorMap[color]}`; }
    if (cheapestEl && cheapest) cheapestEl.textContent = `${cheapest.price.toFixed(2)} snt — klo ${cheapest.hour}`;
    if (expensiveEl && mostExpensive) expensiveEl.textContent = `${mostExpensive.price.toFixed(2)} snt — klo ${mostExpensive.hour}`;

    updateFavicon(price);
    updateKannattaako(price);
  } catch (e) {
    console.error('Hero update error:', e);
  }
}
