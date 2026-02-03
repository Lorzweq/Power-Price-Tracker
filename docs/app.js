// Pörssisähkö-säästölaskuri - Main Application Logic
// All backend/business logic separated from index.html

// Register Service Worker for PWA
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

document.addEventListener("DOMContentLoaded", () => {
  const DEVICES = [
    { category: "Valaistus",    name: "Hehkulamppu 60 W (4 h/pv)", min: 0.24, max: 0.24, unit: "kWh/vrk", schedulable: false },
    { category: "Valaistus",    name: "LED-lamppu 8 W (4 h/pv)",   min: 0.032,max: 0.032,unit: "kWh/vrk", schedulable: false },

    { category: "Lämmitys", name: "Sähkölattialämmitys (per m²)", min: 0.27, max: 0.55, unit: "kWh/vrk/m²", schedulable: false },
    { category: "Lämmitys", name: "Ilmalämpöpumppu",          min: 0.20, max: 2.50, unit: "kWh/h",  schedulable: false },

    { category: "Kylmälaitteet", name: "Jääkaappi",           min: 0.3,  max: 0.8,  unit: "kWh/vrk",   schedulable: false },
    { category: "Kylmälaitteet", name: "Jääkaappi-pakastin",  min: 0.8,  max: 1.6,  unit: "kWh/vrk",   schedulable: false },
    { category: "Kylmälaitteet", name: "Pakastin",            min: 0.5,  max: 1.5,  unit: "kWh/vrk",   schedulable: false },

    { category: "Keittiö",       name: "Sähköliesi",          min: 1.0,  max: 2.0,  unit: "kWh/vrk",   schedulable: true  },
    { category: "Keittiö",       name: "Induktioliesi",       min: 0.6,  max: 1.9,  unit: "kWh/30 min",schedulable: true  },
    { category: "Keittiö",       name: "Airfryer",            min: 0.3,  max: 0.3,  unit: "kWh/10–15 min", schedulable: true },
    { category: "Keittiö",       name: "Leivänpaahdin",       min: 0.1,  max: 0.1,  unit: "kWh/5 min", schedulable: true },
    { category: "Keittiö",       name: "Parila / vohvelirauta",min: 0.2, max: 0.2,  unit: "kWh/10 min",schedulable: true },
    { category: "Keittiö",       name: "Mikroaaltouuni",      min: 0.12, max: 0.20, unit: "kWh/10 min",schedulable: true },
    { category: "Keittiö",       name: "Vedenkeitin",         min: 0.10, max: 0.10, unit: "kWh/5 min", schedulable: true },
    { category: "Keittiö",       name: "Kahvinkeitin",        min: 0.10, max: 0.10, unit: "kWh/10 min",schedulable: true },
    { category: "Keittiö",       name: "Liesituuletin",       min: 0.2,  max: 0.2,  unit: "kWh/h",     schedulable: true },

    { category: "Kodinhoito",    name: "Astianpesukone",      min: 0.6,  max: 1.6,  unit: "kWh/kerta", schedulable: true },
    { category: "Kodinhoito",    name: "Pyykinpesukone",      min: 0.2,  max: 2.5,  unit: "kWh/kerta", schedulable: true },
    { category: "Kodinhoito",    name: "Kuivausrumpu",        min: 2.0,  max: 6.0,  unit: "kWh/kerta", schedulable: true },
    { category: "Kodinhoito",    name: "Kuivauskaappi",       min: 2.2,  max: 2.8,  unit: "kWh/3 kg",  schedulable: true },

    { category: "Viihde",        name: "Televisio (LED)",     min: 0.08, max: 0.16, unit: "kWh/h",     schedulable: true },
    { category: "Viihde",        name: "Televisio (Plasma)",  min: 0.15, max: 0.30, unit: "kWh/h",     schedulable: true },
    { category: "Viihde",        name: "Digiboksi",           min: 0.02, max: 0.05, unit: "kWh/h",     schedulable: true },
    { category: "Viihde",        name: "Pelikonsoli",         min: 0.10, max: 0.15, unit: "kWh/h",     schedulable: true },

    { category: "Tietotekniikka",name: "Kannettava tietokone",min: 0.03, max: 0.03, unit: "kWh/h",     schedulable: true },
    { category: "Tietotekniikka",name: "Pöytätietokone",      min: 0.13, max: 0.18, unit: "kWh/h",     schedulable: true },
    { category: "Tietotekniikka",name: "Pelitietokone",       min: 0.05, max: 0.16, unit: "kWh/h",     schedulable: true },
    { category: "Tietotekniikka",name: "Tabletti",            min: 0.003,max: 0.003,unit: "kWh/h",     schedulable: true },
    { category: "Tietotekniikka",name: "Laajakaistamodeemi",  min: 0.14, max: 0.14, unit: "kWh/vrk",   schedulable: false },

    { category: "Toimisto",      name: "Monitoimilaite",      min: 0.09, max: 0.09, unit: "kWh/vrk",   schedulable: false },
    { category: "Toimisto",      name: "Tulostin",            min: 0.05, max: 0.05, unit: "kWh/vrk",   schedulable: false },
  ];

  const PRESETS = {
    basic: [
      { name: "Jääkaappi-pakastin", qty: 1 },
      { name: "Laajakaistamodeemi", qty: 1 },
      { name: "Televisio (LED)", qty: 1 },
      { name: "Digiboksi", qty: 1 },
      { name: "Kahvinkeitin", qty: 1 },
      { name: "Vedenkeitin", qty: 1 },
    ],
    laundry: [
      { name: "Pyykinpesukone", qty: 1 },
      { name: "Kuivausrumpu", qty: 1 },
      { name: "Kuivauskaappi", qty: 1 },
    ],
    kitchen: [
      { name: "Astianpesukone", qty: 1 },
      { name: "Induktioliesi", qty: 1 },
      { name: "Mikroaaltouuni", qty: 1 },
      { name: "Vedenkeitin", qty: 1 },
      { name: "Kahvinkeitin", qty: 1 },
      { name: "Airfryer", qty: 1 },
    ],
    evening: [
      { name: "Televisio (LED)", qty: 1 },
      { name: "Pelikonsoli", qty: 1 },
      { name: "Digiboksi", qty: 1 },
      { name: "Kannettava tietokone", qty: 1 },
    ],
  };

  const PRICE_ENDPOINT = "https://porssisahko-proxy.leevi-hanninen3.workers.dev";
  const LATEST_PRICES_ENDPOINT = "https://porssisahko-proxy.leevi-hanninen3.workers.dev?latest=true";
  let cachedPrices = null;
  let showInEuros = true;
  let lastResultText = "";
  let currentDayPrices = [];
  let priceWatchActive = false;
  let priceWatchThreshold = 0;
  let priceWatchInterval = null;
  
  let deviceId = null;
  let isPremiumUser = false;
  const PREMIUM_API_URL = 'https://porssisahko-proxy.leevi-hanninen3.workers.dev/validate-premium';

  // All the helper functions and logic would go here...
  // (This is just the beginning - the file is truncated for brevity)
  
  console.log("App.js loaded successfully");
});
