// Cookie Consent Management
import { CONFIG } from './config.js';

export function getConsent() {
  try {
    return JSON.parse(localStorage.getItem(CONFIG.CONSENT_KEY) || "null");
  } catch {
    return null;
  }
}

export function setConsent(value) {
  localStorage.setItem(CONFIG.CONSENT_KEY, JSON.stringify(value));
}

export function showConsentBanner(force = false) {
  const banner = document.getElementById("consentBanner");
  if (!banner) return;

  const consent = getConsent();
  if (!force && consent) return;

  banner.classList.remove("hidden");
}

export function hideConsentBanner() {
  const banner = document.getElementById("consentBanner");
  if (!banner) return;
  banner.classList.add("hidden");
}

export function loadGoogleAnalytics() {
  const consent = getConsent();

  if (consent?.analytics && !window.__gaLoaded) {
    window.__gaLoaded = true;

    const gtagScript = document.createElement("script");
    gtagScript.async = true;
    gtagScript.src = `https://www.googletagmanager.com/gtag/js?id=${CONFIG.GA_MEASUREMENT_ID}`;
    document.head.appendChild(gtagScript);

    window.dataLayer = window.dataLayer || [];
    function gtag() { window.dataLayer.push(arguments); }
    window.gtag = gtag;
    gtag('js', new Date());
    // Asennetun PWA:n käyttäjät erottuvat selainkäyttäjistä GA:n raporteissa.
    const displayMode = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone
      ? 'standalone' : 'browser';
    gtag('set', 'user_properties', { display_mode: displayMode });
    gtag('config', CONFIG.GA_MEASUREMENT_ID);
  }
}

// Lähettää GA-tapahtuman vain, jos käyttäjä on hyväksynyt analytiikan
// (window.gtag on olemassa vasta loadGoogleAnalytics()-kutsun jälkeen).
export function trackEvent(name, params = {}) {
  if (typeof window.gtag === 'function') window.gtag('event', name, params);
}

export function initConsent() {
  showConsentBanner(false);

  document.getElementById("openConsent")?.addEventListener("click", () => {
    showConsentBanner(true);
  });

  document.getElementById("consentAccept")?.addEventListener("click", () => {
    setConsent({ analytics: true, ts: Date.now() });
    hideConsentBanner();
    window.dispatchEvent(new Event("consent-updated"));
  });

  document.getElementById("consentReject")?.addEventListener("click", () => {
    setConsent({ analytics: false, ts: Date.now() });
    hideConsentBanner();
    window.dispatchEvent(new Event("consent-updated"));
  });

  loadGoogleAnalytics();

  window.addEventListener("consent-updated", loadGoogleAnalytics);
}
