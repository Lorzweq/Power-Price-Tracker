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

export function loadAdSenseIfAllowed() {
  const consent = getConsent();
  const adSlot = document.getElementById("adSlot");

  if (consent?.ads) {
    if (adSlot && !window.__adsenseLoaded) {
      window.__adsenseLoaded = true;

      const script = document.createElement("script");
      script.async = true;
      script.src = "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-2933152668442386";
      script.crossOrigin = "anonymous";
      document.head.appendChild(script);

      script.onload = () => {
        if (adSlot) {
          adSlot.innerHTML = '<ins class="adsbygoogle" style="display:block" data-ad-client="ca-pub-2933152668442386" data-ad-slot="1234567890" data-ad-format="auto" data-full-width-responsive="true"></ins>';
          (window.adsbygoogle = window.adsbygoogle || []).push({});
          adSlot.classList.remove("hidden");
        }
      };
    }
  } else {
    if (adSlot) adSlot.classList.add("hidden");
  }
}

export function loadGoogleAnalytics() {
  const consent = getConsent();

  if (consent?.analytics && !window.__gaLoaded) {
    window.__gaLoaded = true;

    const gtagScript = document.createElement("script");
    gtagScript.async = true;
    gtagScript.src = "https://www.googletagmanager.com/gtag/js?id=G-Y72HX00VPT";
    document.head.appendChild(gtagScript);

    window.dataLayer = window.dataLayer || [];
    function gtag() { window.dataLayer.push(arguments); }
    window.gtag = gtag;
    gtag('js', new Date());
    gtag('config', 'G-Y72HX00VPT');
  }
}

export function initConsent() {
  showConsentBanner(false);

  document.getElementById("openConsent")?.addEventListener("click", () => {
    showConsentBanner(true);
  });

  document.getElementById("consentAccept")?.addEventListener("click", () => {
    setConsent({ ads: true, analytics: true, ts: Date.now() });
    hideConsentBanner();
    window.dispatchEvent(new Event("consent-updated"));
  });

  document.getElementById("consentReject")?.addEventListener("click", () => {
    setConsent({ ads: false, analytics: false, ts: Date.now() });
    hideConsentBanner();
    window.dispatchEvent(new Event("consent-updated"));
  });

  loadAdSenseIfAllowed();
  loadGoogleAnalytics();

  window.addEventListener("consent-updated", loadAdSenseIfAllowed);
  window.addEventListener("consent-updated", loadGoogleAnalytics);
}
