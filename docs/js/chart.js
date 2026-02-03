// Chart Drawing and Visualization
import { $ } from './ui.js';

// Note: Main chart drawing is handled by drawBarChartSolidWithHover in main.js
// These are utility functions for other chart displays

export function drawHourlyChart() {
  // This function is called from main.js with proper data
  // The actual chart drawing is handled by drawBarChartSolidWithHover
  console.log('drawHourlyChart called - delegating to main draw function');
}

export function draw15MinChart() {
  // Placeholder - actual implementation in main.js
  console.log('draw15MinChart called');
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
