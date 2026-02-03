// Supabase and Premium System
// 
// SECURITY NOTES:
// ================
// 1. Salasanat lähetetään HTTPS:llä (TLS 1.3+) - salattu matkalla
// 2. Supabase hashaa salasanat palvelimella bcrypt:llä - eivät tallennu plaintekstinä
// 3. Client ei koskaan näe hattua salasanoista - vain Supabase auth API
// 4. Istuntotunnukset tallennetaan paikallisesti mutta ovat allekirjoitettuja JWT-tokeneita
// 5. Premium-avaimet tallennetaan tietokantaan, mutta käyttäjätunnisteet ovat hajautettuja
//
import { CONFIG } from './config.js';
import { $, showToast } from './ui.js';

// Initialize Supabase client
const SUPABASE_URL = CONFIG.SUPABASE_URL;
const SUPABASE_ANON_KEY = CONFIG.SUPABASE_ANON_KEY;

export let supabase = null;
export let currentUser = null;
export let isPremium = false;

// Initialize Supabase with proper error handling
function initializeSupabase() {
  // Validate URL format first
  if (!SUPABASE_URL || !SUPABASE_URL.startsWith('http')) {
    console.warn('⚠️ Invalid Supabase URL:', SUPABASE_URL);
    return null;
  }

  if (!SUPABASE_ANON_KEY) {
    console.warn('⚠️ Missing Supabase Anon Key');
    return null;
  }

  if (!window.supabase) {
    console.warn('⚠️ Supabase library not loaded yet');
    return null;
  }

  try {
    const client = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    console.log('✅ Supabase initialized successfully');
    return client;
  } catch (error) {
    console.error('❌ Error initializing Supabase:', error);
    return null;
  }
}

// Don't try to initialize immediately - wait for DOMContentLoaded
// This is called from initSupabase() in main.js

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

  const premiumKey = keyInput.value.trim().toUpperCase();
  if (!premiumKey) {
    alert('Anna premium-avain!');
    return;
  }

  if (!supabase) {
    alert('Supabase ei ole konfiguroitu');
    return;
  }

  try {
    // Check if premium key exists and is valid
    const { data: keyData, error: keyError } = await supabase
      .from('premium_keys')
      .select('*')
      .eq('key', premiumKey)
      .eq('is_used', false)
      .single();

    if (keyError || !keyData) {
      alert('Virheellinen tai jo käytetty premium-avain!');
      return;
    }

    // Check if key has expired
    if (keyData.expires_at && new Date(keyData.expires_at) < new Date()) {
      alert('Premium-avain on vanhentunut!');
      return;
    }

    // If user is logged in, save to Supabase
    if (currentUser) {
      const { error: updateError } = await supabase
        .from('premium_keys')
        .update({ is_used: true, used_by_user_id: currentUser.id, used_at: new Date().toISOString() })
        .eq('key', premiumKey);

      if (updateError) throw updateError;

      // Save to premium_users table
      await activatePremiumInSupabase(premiumKey);
    } else {
      // Offline mode - save locally
      localStorage.setItem('isPremium', 'true');
      localStorage.setItem('premiumKey', premiumKey);
    }

    isPremium = true;
    localStorage.setItem('isPremium', 'true');
    updatePremiumUI();
    alert('Premium aktivoitu onnistuneesti!');
    keyInput.value = '';
  } catch (error) {
    console.error('Premium activation error:', error);
    alert('Virhe premium-aktivoinnissa: ' + error.message);
  }
}

async function activatePremiumInSupabase(premiumKey) {
  if (!supabase || !currentUser) return;

  try {
    const { error } = await supabase
      .from('premium_users')
      .upsert({
        user_id: currentUser.id,
        premium_key: premiumKey,
        is_premium: true,
        activated_at: new Date().toISOString()
      }, {
        onConflict: 'user_id'
      });

    if (error) {
      console.error('Error saving to Supabase:', error);
    } else {
      console.log('Premium status saved to Supabase');
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
  const statusBadge = $('authStatusBadge');
  const userInfo = $('userInfo');
  const loginForm = $('loginForm');

  if (isPremium) {
    if (badge) {
      badge.classList.remove('hidden');
    }
    if (keySection) {
      keySection.classList.add('hidden');
    }
    if (statusBadge) {
      statusBadge.textContent = '✅ Premium aktiivinen';
      statusBadge.classList.remove('bg-slate-200', 'text-slate-700');
      statusBadge.classList.add('bg-yellow-200', 'text-yellow-700');
    }
  } else {
    if (badge) {
      badge.classList.add('hidden');
    }
    if (keySection) {
      keySection.classList.remove('hidden');
    }
    if (statusBadge) {
      const isLoggedIn = userInfo && !userInfo.classList.contains('hidden');
      if (isLoggedIn) {
        statusBadge.textContent = '🔑 Kirjautunut - Lisää premium';
        statusBadge.classList.remove('bg-slate-200', 'text-slate-700', 'bg-yellow-200', 'text-yellow-700');
        statusBadge.classList.add('bg-blue-200', 'text-blue-700');
      } else {
        statusBadge.textContent = 'Ei kirjautunut';
        statusBadge.classList.remove('bg-blue-200', 'text-blue-700', 'bg-yellow-200', 'text-yellow-700');
        statusBadge.classList.add('bg-slate-200', 'text-slate-700');
      }
    }
  }
}

export async function handleLogin() {
  const email = $('authEmail')?.value;
  const password = $('authPassword')?.value;

  if (!email || !password) {
    showToast('⚠️ Täytä sähköposti ja salasana');
    return;
  }

  if (!supabase) {
    showToast('❌ Supabase ei ole konfiguroitu');
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
    showToast('✅ Tervetuloa! Kirjauduttu sisään');
  } catch (error) {
    showToast('❌ Kirjautuminen epäonnistui: ' + error.message);
  }
}

export async function handleSignup() {
  // Old handleSignup - now just opens the modal
  showSignupModal();
}

export function showSignupModal() {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  
  const modal = document.createElement('div');
  modal.className = 'modal-content';
  
  modal.innerHTML = `
    <div class="text-center">
      <h2 class="text-2xl font-bold text-slate-900 mb-1">Rekisteröidy</h2>
      <p class="text-xs text-slate-500 mb-4">Luo uusi käyttäjätili</p>
      
      <div class="flex flex-col gap-2">
        <input
          id="signupEmail"
          type="email"
          placeholder="Sähköposti"
          class="h-9 rounded-lg border border-slate-300 p-2 text-xs"
        />
        <input
          id="signupPassword"
          type="password"
          placeholder="Salasana (vähintään 6 merkkiä)"
          class="h-9 rounded-lg border border-slate-300 p-2 text-xs"
        />
        <input
          id="signupPasswordConfirm"
          type="password"
          placeholder="Vahvista salasana"
          class="h-9 rounded-lg border border-slate-300 p-2 text-xs"
        />
        
        <button id="submitSignup" class="mt-2 w-full rounded-lg bg-slate-600 text-white py-2 px-4 font-bold hover:bg-slate-500 text-xs">
          Rekisteröidy
        </button>
        <button id="closeSignupModalBtn" class="w-full rounded-lg bg-slate-200 text-slate-700 py-2 px-4 font-medium hover:bg-slate-300 text-xs">
          Peruuta
        </button>
      </div>
      
      <p class="mt-3 text-xs text-slate-500">
        Sinulla on jo tunnus? <button id="goBackToLogin" class="underline hover:text-slate-700 font-semibold">Kirjaudu sisään</button>
      </p>
    </div>
  `;
  
  overlay.appendChild(modal);
  document.body.appendChild(overlay);
  
  // Event listeners
  const submitBtn = modal.querySelector('#submitSignup');
  const closeBtn = modal.querySelector('#closeSignupModalBtn');
  const goBackBtn = modal.querySelector('#goBackToLogin');
  const emailInput = modal.querySelector('#signupEmail');
  const passwordInput = modal.querySelector('#signupPassword');
  const confirmInput = modal.querySelector('#signupPasswordConfirm');
  
  submitBtn.addEventListener('click', async () => {
    const email = emailInput.value;
    const password = passwordInput.value;
    const confirm = confirmInput.value;
    
    if (!email || !password || !confirm) {
      showToast('⚠️ Täytä kaikki kentät');
      return;
    }
    
    if (password !== confirm) {
      showToast('⚠️ Salasanat eivät täsmää');
      return;
    }
    
    if (password.length < 6) {
      showToast('⚠️ Salasana on liian lyhyt (vähintään 6 merkkiä)');
      return;
    }
    
    // Perform signup
    if (!supabase) {
      showToast('❌ Supabase ei ole konfiguroitu');
      return;
    }
    
    try {
      submitBtn.disabled = true;
      submitBtn.textContent = 'Rekisteröidään...';
      
      // Get current URL for redirect (without hash)
      const redirectUrl = window.location.origin + window.location.pathname;
      
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: redirectUrl
        }
      });
      
      if (error) throw error;
      
      // Close modal and show success
      overlay.style.opacity = '0';
      overlay.style.transition = 'opacity 0.3s ease';
      setTimeout(() => overlay.remove(), 300);
      
      showSignupSuccessModal(email);
    } catch (error) {
      showToast('❌ Rekisteröinti epäonnistui: ' + error.message);
      submitBtn.disabled = false;
      submitBtn.textContent = 'Rekisteröidy';
    }
  });
  
  closeBtn.addEventListener('click', () => {
    overlay.style.opacity = '0';
    overlay.style.transition = 'opacity 0.3s ease';
    setTimeout(() => overlay.remove(), 300);
  });
  
  goBackBtn.addEventListener('click', () => {
    overlay.style.opacity = '0';
    overlay.style.transition = 'opacity 0.3s ease';
    setTimeout(() => overlay.remove(), 300);
  });
  
  // Click outside to close
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) {
      overlay.style.opacity = '0';
      overlay.style.transition = 'opacity 0.3s ease';
      setTimeout(() => overlay.remove(), 300);
    }
  });
  
  // Focus on first input
  emailInput.focus();
}

export function showPasswordResetModal() {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  
  const modal = document.createElement('div');
  modal.className = 'modal-content';
  
  modal.innerHTML = `
    <div class="text-center">
      <h2 class="text-2xl font-bold text-slate-900 mb-1">Palauta salasana</h2>
      <p class="text-xs text-slate-500 mb-4">Lähetämme palautuslinking sähköpostiisi</p>
      
      <div class="flex flex-col gap-2">
        <input
          id="resetEmail"
          type="email"
          placeholder="Sähköposti"
          class="h-9 rounded-lg border border-slate-300 p-2 text-xs"
        />
        
        <button id="submitReset" class="mt-2 w-full rounded-lg bg-slate-600 text-white py-2 px-4 font-bold hover:bg-slate-500 text-xs">
          Lähetä palautuslinkki
        </button>
        <button id="closeResetModal" class="w-full rounded-lg bg-slate-200 text-slate-700 py-2 px-4 font-medium hover:bg-slate-300 text-xs">
          Peruuta
        </button>
      </div>
    </div>
  `;
  
  overlay.appendChild(modal);
  document.body.appendChild(overlay);
  
  const submitBtn = modal.querySelector('#submitReset');
  const closeBtn = modal.querySelector('#closeResetModal');
  const emailInput = modal.querySelector('#resetEmail');
  
  submitBtn.addEventListener('click', async () => {
    const email = emailInput.value.trim();
    
    if (!email) {
      showToast('⚠️ Anna sähköpostiosoite');
      return;
    }
    
    if (!supabase) {
      showToast('❌ Supabase ei ole konfiguroitu');
      return;
    }
    
    try {
      submitBtn.disabled = true;
      submitBtn.textContent = 'Lähetetään...';
      
      const redirectUrl = window.location.origin + window.location.pathname;
      
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: redirectUrl
      });
      
      if (error) throw error;
      
      overlay.style.opacity = '0';
      overlay.style.transition = 'opacity 0.3s ease';
      setTimeout(() => overlay.remove(), 300);
      
      showToast('✅ Palautuslinkki lähetetty! Tarkista sähköpostisi');
    } catch (error) {
      showToast('❌ Virhe: ' + error.message);
      submitBtn.disabled = false;
      submitBtn.textContent = 'Lähetä palautuslinkki';
    }
  });
  
  closeBtn.addEventListener('click', () => {
    overlay.style.opacity = '0';
    overlay.style.transition = 'opacity 0.3s ease';
    setTimeout(() => overlay.remove(), 300);
  });
  
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) {
      overlay.style.opacity = '0';
      overlay.style.transition = 'opacity 0.3s ease';
      setTimeout(() => overlay.remove(), 300);
    }
  });
  
  emailInput.focus();
}

export function showNewPasswordModal() {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  
  const modal = document.createElement('div');
  modal.className = 'modal-content';
  
  modal.innerHTML = `
    <div class="text-center">
      <h2 class="text-2xl font-bold text-slate-900 mb-1">Aseta uusi salasana</h2>
      <p class="text-xs text-slate-500 mb-4">Valitse uusi salasana tilillesi</p>
      
      <div class="flex flex-col gap-2">
        <input
          id="newPassword"
          type="password"
          placeholder="Uusi salasana (vähintään 6 merkkiä)"
          class="h-9 rounded-lg border border-slate-300 p-2 text-xs"
        />
        <input
          id="newPasswordConfirm"
          type="password"
          placeholder="Vahvista uusi salasana"
          class="h-9 rounded-lg border border-slate-300 p-2 text-xs"
        />
        
        <button id="submitNewPassword" class="mt-2 w-full rounded-lg bg-slate-600 text-white py-2 px-4 font-bold hover:bg-slate-500 text-xs">
          Vaihda salasana
        </button>
      </div>
    </div>
  `;
  
  overlay.appendChild(modal);
  document.body.appendChild(overlay);
  
  const submitBtn = modal.querySelector('#submitNewPassword');
  const passwordInput = modal.querySelector('#newPassword');
  const confirmInput = modal.querySelector('#newPasswordConfirm');
  
  submitBtn.addEventListener('click', async () => {
    const password = passwordInput.value;
    const confirm = confirmInput.value;
    
    if (!password || !confirm) {
      showToast('⚠️ Täytä molemmat kentät');
      return;
    }
    
    if (password !== confirm) {
      showToast('⚠️ Salasanat eivät täsmää');
      return;
    }
    
    if (password.length < 6) {
      showToast('⚠️ Salasana on liian lyhyt (vähintään 6 merkkiä)');
      return;
    }
    
    if (!supabase) {
      showToast('❌ Supabase ei ole konfiguroitu');
      return;
    }
    
    try {
      submitBtn.disabled = true;
      submitBtn.textContent = 'Vaihdetaan...';
      
      const { error } = await supabase.auth.updateUser({
        password: password
      });
      
      if (error) throw error;
      
      overlay.style.opacity = '0';
      overlay.style.transition = 'opacity 0.3s ease';
      setTimeout(() => overlay.remove(), 300);
      
      showToast('✅ Salasana vaihdettu onnistuneesti!');
      
      // Clean up URL
      window.history.replaceState({}, document.title, window.location.pathname);
    } catch (error) {
      showToast('❌ Virhe: ' + error.message);
      submitBtn.disabled = false;
      submitBtn.textContent = 'Vaihda salasana';
    }
  });
  
  passwordInput.focus();
}

export function showSignupSuccessModal(email) {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  
  const modal = document.createElement('div');
  modal.className = 'modal-content';
  
  modal.innerHTML = `
    <div class="text-center">
      <div class="text-5xl mb-4">✅</div>
      <h2 class="text-2xl font-bold text-slate-900 mb-2">Rekisteröinti onnistui!</h2>
      <p class="text-sm text-slate-600 mb-4">
        Olemme lähettäneet vahvistuslinkin osoitteeseen:
      </p>
      <p class="text-sm font-mono bg-slate-100 p-2 rounded-lg mb-4 break-all text-xs">${email}</p>
      <p class="text-xs text-slate-500 mb-6">
        Tarkista sähköpostisi (ja roskapostin kansio) ja klikkaa vahvistuslinkkiä jatkaaksesi.
      </p>
      <button id="closeSignupSuccessModal" class="w-full rounded-lg bg-slate-600 text-white py-2 px-4 font-bold hover:bg-slate-500 text-xs">
        Ymmärretty
      </button>
    </div>
  `;
  
  overlay.appendChild(modal);
  document.body.appendChild(overlay);
  
  // Close button functionality
  const closeBtn = modal.querySelector('#closeSignupSuccessModal');
  closeBtn.addEventListener('click', () => {
    overlay.style.opacity = '0';
    overlay.style.transition = 'opacity 0.3s ease';
    setTimeout(() => overlay.remove(), 300);
  });
  
  // Click outside to close
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) {
      overlay.style.opacity = '0';
      overlay.style.transition = 'opacity 0.3s ease';
      setTimeout(() => overlay.remove(), 300);
    }
  });
}

export async function handleLogout() {
  if (!supabase) return;

  try {
    await supabase.auth.signOut();
    currentUser = null;
    isPremium = false;
    localStorage.removeItem('isPremium');
    updateAuthUI();
    updatePremiumUI();
    showToast('👋 Kirjauduttu ulos');
  } catch (error) {
    showToast('❌ Uloskirjautuminen epäonnistui: ' + error.message);
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
  // Try to initialize Supabase client first
  if (!supabase) {
    console.log('⏳ Initializing Supabase...');
    supabase = initializeSupabase();
    
    // If still not available, wait and retry
    if (!supabase) {
      for (let i = 0; i < 50; i++) {
        await new Promise(resolve => setTimeout(resolve, 100));
        supabase = initializeSupabase();
        if (supabase) break;
      }
    }
  }

  if (!supabase) {
    console.warn('⚠️ Supabase not available - running in offline mode');
    const localPremium = localStorage.getItem('isPremium');
    isPremium = localPremium === 'true';
    return;
  }

  try {
    const { data: { session } } = await supabase.auth.getSession();
    
    // Check if user came from email confirmation link or password reset
    const hashParams = new URLSearchParams(window.location.hash.substring(1));
    const isEmailConfirmation = hashParams.has('access_token') && hashParams.get('type') === 'signup';
    const isPasswordRecovery = hashParams.has('access_token') && hashParams.get('type') === 'recovery';
    
    if (session?.user) {
      currentUser = session.user;
      isPremium = await checkSupabasePremiumStatus();
      
      if (isPremium) {
        localStorage.setItem('isPremium', 'true');
      }
      
      // Show success message if coming from email confirmation
      if (isEmailConfirmation) {
        showToast('✅ Sähköposti vahvistettu! Olet nyt kirjautunut sisään');
        // Clean up URL
        window.history.replaceState({}, document.title, window.location.pathname);
      }
      
      // Show password reset modal if coming from password reset link
      if (isPasswordRecovery) {
        showNewPasswordModal();
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
