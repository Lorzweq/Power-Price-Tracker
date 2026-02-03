// Device Management and Rendering
import { DEVICES, DEVICE_INDEX_BY_NAME } from './config.js';
import { $ } from './ui.js';

export function getDevice(identifier) {
  if (typeof identifier === 'number') {
    return DEVICES[identifier] || null;
  }
  const idx = DEVICE_INDEX_BY_NAME[identifier];
  return idx !== undefined ? DEVICES[idx] : null;
}

export function renderDevicesHTML() {
  const container = $("deviceList");
  if (!container) return;

  container.innerHTML = DEVICES.map((dev, i) => {
    const nameId = `devName${i}`;
    const kwhId = `devKwh${i}`;
    return `
      <div class="bg-white rounded-lg shadow p-4 device-card">
        <h3 class="font-bold text-lg mb-2">${dev.name}</h3>
        <label class="block text-sm mb-2">
          Nimi:
          <input
            type="text"
            id="${nameId}"
            value="${dev.name}"
            class="border px-2 py-1 rounded w-full"
          />
        </label>
        <label class="block text-sm mb-2">
          Kulutus (kWh):
          <input
            type="number"
            id="${kwhId}"
            value="${dev.kwh}"
            step="0.01"
            min="0"
            class="border px-2 py-1 rounded w-full"
          />
        </label>
      </div>
    `;
  }).join('');
}

export function collectDeviceData() {
  return DEVICES.map((dev, i) => {
    const nameEl = $(`devName${i}`);
    const kwhEl = $(`devKwh${i}`);
    return {
      name: nameEl ? nameEl.value : dev.name,
      kwh: kwhEl ? parseFloat(kwhEl.value) || 0 : dev.kwh
    };
  });
}
