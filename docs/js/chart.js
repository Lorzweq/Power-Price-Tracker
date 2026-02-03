// Chart Drawing and Visualization
import { currentDayPrices, quarterMinPrices } from './pricing.js';
import { $ } from './ui.js';

export function drawHourlyChart() {
  const canvas = $("hourlyChart");
  if (!canvas) return;

  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const prices = currentDayPrices;
  if (!prices || prices.length === 0) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "#333";
    ctx.font = "14px sans-serif";
    ctx.fillText("Ei hintadataa", 10, canvas.height / 2);
    return;
  }

  const w = canvas.width;
  const h = canvas.height;
  const pad = 40;

  ctx.clearRect(0, 0, w, h);

  const vals = prices.map(p => p.price);
  const minVal = Math.min(...vals);
  const maxVal = Math.max(...vals);
  const range = maxVal - minVal || 1;

  const barW = (w - 2 * pad) / prices.length;

  // Draw bars
  prices.forEach((p, i) => {
    const x = pad + i * barW;
    const barH = ((p.price - minVal) / range) * (h - 2 * pad);
    const y = h - pad - barH;

    ctx.fillStyle = p.price < 5 ? "#4ade80" : p.price < 10 ? "#facc15" : "#f87171";
    ctx.fillRect(x, y, barW - 2, barH);
  });

  // Draw axes
  ctx.strokeStyle = "#333";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(pad, pad);
  ctx.lineTo(pad, h - pad);
  ctx.lineTo(w - pad, h - pad);
  ctx.stroke();

  // Labels
  ctx.fillStyle = "#333";
  ctx.font = "10px sans-serif";
  ctx.fillText(maxVal.toFixed(1) + " snt", 5, pad + 10);
  ctx.fillText(minVal.toFixed(1) + " snt", 5, h - pad - 5);
  ctx.fillText("0h", pad, h - pad + 15);
  ctx.fillText("24h", w - pad - 15, h - pad + 15);
}

export function draw15MinChart() {
  const canvas = $("quarterChart");
  if (!canvas) return;

  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const prices = quarterMinPrices;
  if (!prices || prices.length === 0) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "#333";
    ctx.font = "14px sans-serif";
    ctx.fillText("Ei 15-min dataa", 10, canvas.height / 2);
    return;
  }

  const w = canvas.width;
  const h = canvas.height;
  const pad = 40;

  ctx.clearRect(0, 0, w, h);

  const vals = prices.map(p => p.price);
  const minVal = Math.min(...vals);
  const maxVal = Math.max(...vals);
  const range = maxVal - minVal || 1;

  const barW = (w - 2 * pad) / prices.length;

  // Draw bars
  prices.forEach((p, i) => {
    const x = pad + i * barW;
    const barH = ((p.price - minVal) / range) * (h - 2 * pad);
    const y = h - pad - barH;

    ctx.fillStyle = p.price < 3 ? "#4ade80" : p.price < 6 ? "#facc15" : "#f87171";
    ctx.fillRect(x, y, Math.max(barW - 1, 1), barH);
  });

  // Draw axes
  ctx.strokeStyle = "#333";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(pad, pad);
  ctx.lineTo(pad, h - pad);
  ctx.lineTo(w - pad, h - pad);
  ctx.stroke();

  // Labels
  ctx.fillStyle = "#333";
  ctx.font = "10px sans-serif";
  ctx.fillText(maxVal.toFixed(2) + " snt", 5, pad + 10);
  ctx.fillText(minVal.toFixed(2) + " snt", 5, h - pad - 5);
}

export function drawTop3Chart(top3) {
  const canvas = $("top3Chart");
  if (!canvas) return;

  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  if (!top3 || top3.length === 0) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    return;
  }

  const w = canvas.width;
  const h = canvas.height;
  const pad = 40;

  ctx.clearRect(0, 0, w, h);

  const maxCost = Math.max(...top3.map(d => d.totalCost));
  const barW = (w - 2 * pad) / top3.length;

  top3.forEach((device, i) => {
    const x = pad + i * barW;
    const barH = (device.totalCost / maxCost) * (h - 2 * pad);
    const y = h - pad - barH;

    ctx.fillStyle = ["#3b82f6", "#8b5cf6", "#ec4899"][i] || "#666";
    ctx.fillRect(x, y, barW - 10, barH);

    // Label
    ctx.fillStyle = "#333";
    ctx.font = "10px sans-serif";
    ctx.save();
    ctx.translate(x + (barW - 10) / 2, h - pad + 15);
    ctx.rotate(-Math.PI / 4);
    ctx.fillText(device.name.substring(0, 15), 0, 0);
    ctx.restore();

    ctx.fillText(device.totalCost.toFixed(2) + "€", x + 5, y - 5);
  });

  // Axes
  ctx.strokeStyle = "#333";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(pad, pad);
  ctx.lineTo(pad, h - pad);
  ctx.lineTo(w - pad, h - pad);
  ctx.stroke();
}
