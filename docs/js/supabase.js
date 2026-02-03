// Supabase and Premium System
import { CONFIG } from './config.js';
import { $ } from './ui.js';

// Initialize Supabase client
const SUPABASE_URL = CONFIG.SUPABASE_URL;
const SUPABASE_ANON_KEY = CONFIG.SUPABASE_ANON_KEY;

export let supabase = null;
export let currentUser = null;
export let isPremium = false;

if (SUPABASE_URL && SUPABASE_ANON_KEY) {
  supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
}

export async function generateDeviceId() {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  ctx.textBaseline = 'top';
  ctx.font = '14px Arial';
  ctx.fillText('Device fingerprint', 2, 2);

  const canvasData = canvas.toDataURL();
  const fingerprint = `${canvasData}-${navigator.userAgent}-${navigator.language}-${new Date().getTimezoneOffset()}`;

  if (window.crypto && window.crypto.subtle) {
    try {
      const encoder = new TextEncoder();
      const data = encoder.encode(fingerprint);
      const hashBuffer = await crypto.subtle.digest('SHA-256', data);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    } catch (e) {
      console.warn('crypto.subtle failed, using fallback', e);
    }
  }

  // Fallback simple hash
  let hash = 0;
  for (let i = 0; i < fingerprint.length; i++) {
    const char = fingerprint.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(16);
}

export async function activatePremium() {
  const keyInput = $('premiumKeyInput');
  if (!keyInput) return;

  const premiumKey = keyInput.value.trim();
  if (!premiumKey) {
    alert('Anna premium-avain!');
    return;
  }

  const deviceId = await generateDeviceId();

  try {
    const response = await fetch(`${CONFIG.WORKER_URL}/validate-premium`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ deviceId, premiumKey })
    });

    const result = await response.json();

    if (result.valid) {
      isPremium = true;
      localStorage.setItem('isPremium', 'true');
      localStorage.setItem('premiumDeviceId', deviceId);

      if (supabase && currentUser) {
        await activatePremiumInSupabase(deviceId, premiumKey);
      }

      updatePremiumUI();
      alert('Premium aktivoitu onnistuneesti!');
    } else {
      alert('Virheellinen premium-avain!');
    }
  } catch (error) {
    console.error('Premium activation error:', error);
    
    localStorage.setItem('isPremium', 'true');
    localStorage.setItem('premiumDeviceId', deviceId);
    isPremium = true;
    updatePremiumUI();
    
    alert('Premium aktivoitu paikallisesti (offline mode)');
  }
}

async function activatePremiumInSupabase(deviceId, premiumKey) {
  if (!supabase || !currentUser) return;

  try {
    const { error } = await supabase
      .from('premium_users')
      .upsert({
        user_id: currentUser.id,
        device_id: deviceId,
        premium_key: premiumKey,
        is_premium: true,
        activated_at: new Date().toISOString()
      }, {
        onConflict: 'user_id'
      });

    if (error) {
      console.error('Error saving to Supabase:', error);
    }
  } catch (error) {
    console.error('Supabase activation error:', error);
  }
}

export async function checkSupabasePremiumStatus() {
  if (!supabase || !currentUser) return false;

  try {
    const { data, error } = await supabase
      .from('premium_users')
      .select('is_premium')
      .eq('user_id', currentUser.id)
      .single();

    if (error) {
      console.error('Error checking premium status:', error);
      return false;
    }

    return data?.is_premium || false;
  } catch (error) {
    console.error('Supabase check error:', error);
    return false;
  }
}

export function updatePremiumUI() {
  const badge = $('premiumBadge');
  const keySection = $('premiumKeySection');

  if (isPremium) {
    if (badge) {
      badge.classList.remove('hidden');
    }
    if (keySection) {
      keySection.classList.add('hidden');
    }
  } else {
    if (badge) {
      badge.classList.add('hidden');
    }
    if (keySection) {
      keySection.classList.remove('hidden');
    }
  }
}

export async function handleLogin() {
  const email = $('authEmail')?.value;
  const password = $('authPassword')?.value;

  if (!email || !password) {
    alert('Täytä sähköposti ja salasana');
    return;
  }

  if (!supabase) {
    alert('Supabase ei ole konfiguroitu');
    return;
  }

  try {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password
    });

    if (error) throw error;

    currentUser = data.user;
    isPremium = await checkSupabasePremiumStatus();
    
    if (isPremium) {
      localStorage.setItem('isPremium', 'true');
    }

    updateAuthUI();
    updatePremiumUI();
    alert('Kirjauduttu sisään!');
  } catch (error) {
    alert('Kirjautuminen epäonnistui: ' + error.message);
  }
}

export async function handleSignup() {
  const email = $('authEmail')?.value;
  const password = $('authPassword')?.value;

  if (!email || !password) {
    alert('Täytä sähköposti ja salasana');
    return;
  }

  if (!supabase) {
    alert('Supabase ei ole konfiguroitu');
    return;
  }

  try {
    const { data, error } = await supabase.auth.signUp({
      email,
      password
    });

    if (error) throw error;

    alert('Rekisteröinti onnistui! Tarkista sähköpostisi vahvistusta varten.');
  } catch (error) {
    alert('Rekisteröinti epäonnistui: ' + error.message);
  }
}

export async function handleLogout() {
  if (!supabase) return;

  try {
    await supabase.auth.signOut();
    currentUser = null;
    updateAuthUI();
    alert('Kirjauduttu ulos');
  } catch (error) {
    alert('Uloskirjautuminen epäonnistui: ' + error.message);
  }
}

export function updateAuthUI() {
  const loginForm = $('loginForm');
  const signupForm = $('signupForm');
  const userInfo = $('userInfo');
  const userEmail = $('userEmail');

  if (currentUser) {
    if (loginForm) loginForm.classList.add('hidden');
    if (signupForm) signupForm.classList.add('hidden');
    if (userInfo) {
      userInfo.classList.remove('hidden');
      if (userEmail) userEmail.textContent = currentUser.email;
    }
  } else {
    if (loginForm) loginForm.classList.remove('hidden');
    if (signupForm) signupForm.classList.remove('hidden');
    if (userInfo) userInfo.classList.add('hidden');
  }
}

export async function initSupabase() {
  if (!supabase) return;

  try {
    const { data: { session } } = await supabase.auth.getSession();
    
    if (session?.user) {
      currentUser = session.user;
      isPremium = await checkSupabasePremiumStatus();
      
      if (isPremium) {
        localStorage.setItem('isPremium', 'true');
      }
    } else {
      const localPremium = localStorage.getItem('isPremium');
      isPremium = localPremium === 'true';
    }

    updateAuthUI();
    updatePremiumUI();

    supabase.auth.onAuthStateChange((event, session) => {
      currentUser = session?.user || null;
      updateAuthUI();
    });
  } catch (error) {
    console.error('Supabase init error:', error);
    
    const localPremium = localStorage.getItem('isPremium');
    isPremium = localPremium === 'true';
    updatePremiumUI();
  }
}
