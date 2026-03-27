// =============================================================================
// auth.js — VR Lab CEAM · portalvr.tech
// Autenticación: SSO MSAL (profesores) + PIN (coordinación/admin)
// =============================================================================

import { AUTH_URL, ROLE_LABELS, ROLE_COLORS } from './config.js';

// ─── MSAL config ─────────────────────────────────────────────────────────────

const MSAL_CONFIG = {
  auth: {
    clientId:    '656b2863-b415-478d-875a-bc96cd132f00',
    authority:   'https://login.microsoftonline.com/8cef89d5-ca02-46a1-8397-b9c461acb2e6',
    redirectUri: 'https://dev.vr-lab.pages.dev/auth/callback',
  },
  cache: { cacheLocation: 'sessionStorage', storeAuthStateInCookie: false },
};

const MSAL_SCOPES = ['User.Read'];

let _msalInstance = null;

async function getMSAL() {
  if (_msalInstance) return _msalInstance;
  // Carga MSAL desde CDN si no está disponible
  if (!window.msal) {
    await new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = 'https://alcdn.msauth.net/browser/2.35.0/js/msal-browser.min.js';
      s.onload = resolve;
      s.onerror = reject;
      document.head.appendChild(s);
    });
  }
  _msalInstance = new window.msal.PublicClientApplication(MSAL_CONFIG);
  await _msalInstance.initialize();
  return _msalInstance;
}

// ─── Estado interno ───────────────────────────────────────────────────────────

let authToken = null;
let role = null;
let msalUser = null;   // { name, email }
let _pinHandler = null;

export function getAuthToken()  { return authToken; }
export function getRole()       { return role; }
export function getMSALUser()   { return msalUser; }

// ─── SSO Login ───────────────────────────────────────────────────────────────

export async function msalLogin(onSuccess) {
  try {
    const msalApp = await getMSAL();

    // Intentar silent primero (cuenta ya en cache)
    let account = msalApp.getAllAccounts()[0] || null;
    let tokenResponse;

    if (account) {
      try {
        tokenResponse = await msalApp.acquireTokenSilent({ scopes: MSAL_SCOPES, account });
      } catch {
        tokenResponse = await msalApp.loginPopup({ scopes: MSAL_SCOPES });
      }
    } else {
      tokenResponse = await msalApp.loginPopup({ scopes: MSAL_SCOPES });
    }

    const name  = tokenResponse.account?.name  || tokenResponse.account?.username || 'Profesor';
    const email = tokenResponse.account?.username || '';

    msalUser  = { name, email };
    authToken = tokenResponse.accessToken;
    role      = 'profesor';

    sessionStorage.setItem('vr-msal-name',  name);
    sessionStorage.setItem('vr-msal-email', email);
    sessionStorage.setItem('vr-booking-role', 'profesor');

    enterRole('profesor', onSuccess);
  } catch (e) {
    if (e.errorCode !== 'user_cancelled') {
      showAuthError('Error al iniciar sesión: ' + (e.message || e));
    }
  }
}

// ─── Restore session ─────────────────────────────────────────────────────────

export async function restoreSession(onSuccess) {
  const savedRole = sessionStorage.getItem('vr-booking-role');

  // Restore MSAL session
  if (savedRole === 'profesor') {
    const name  = sessionStorage.getItem('vr-msal-name');
    const email = sessionStorage.getItem('vr-msal-email');
    if (name) {
      msalUser  = { name, email };
      role      = 'profesor';
      // Intentar token silent para verificar que la sesión sigue válida
      try {
        const msalApp = await getMSAL();
        const account = msalApp.getAllAccounts()[0];
        if (account) {
          const t = await msalApp.acquireTokenSilent({ scopes: MSAL_SCOPES, account });
          authToken = t.accessToken;
        }
      } catch { /* sesión expirada, pero dejamos entrar en modo lectura */ }
      enterRole('profesor', onSuccess);
      return true;
    }
  }

  // Restore PIN session (coordinacion/admin)
  authToken = sessionStorage.getItem('vr-booking-token');
  if (authToken) {
    try {
      const r = await fetch(`${AUTH_URL}/auth/check`, {
        headers: { Authorization: `Bearer ${authToken}` },
      });
      const d = await r.json();
      if (d.valid && d.role) {
        role = d.role;
        sessionStorage.setItem('vr-booking-role', role);
        enterRole(role, onSuccess);
        return true;
      }
    } catch {}
    sessionStorage.removeItem('vr-booking-token');
    sessionStorage.removeItem('vr-booking-role');
    authToken = null;
    role = null;
  }

  return false;
}

// ─── Entrar a un rol ──────────────────────────────────────────────────────────

export function enterRole(r, onSuccess) {
  role = r;
  if (r !== 'profesor') {
    authToken = sessionStorage.getItem('vr-booking-token');
  }
  hidePinScreen();

  const badge = document.getElementById('admin-badge');
  badge.textContent = ROLE_LABELS[r] || r;
  badge.style.background = ROLE_COLORS[r] || '#1e40af';
  badge.classList.remove('hidden');

  document.getElementById('exit-admin-btn').classList.remove('hidden');
  document.getElementById('admin-btn').classList.add('hidden');
  document.getElementById('view-tabs').classList.remove('hidden');

  // Mostrar nombre de usuario MSAL si aplica
  if (r === 'profesor' && msalUser) {
    badge.textContent = msalUser.name;
  }

  onSuccess && onSuccess();
}

// ─── Cerrar sesión ────────────────────────────────────────────────────────────

export function exitRole() {
  // Logout MSAL si aplica
  if (role === 'profesor' && msalUser) {
    getMSAL().then(app => {
      const account = app.getAllAccounts()[0];
      if (account) app.logoutPopup({ account }).catch(() => {});
    }).catch(() => {});
    sessionStorage.removeItem('vr-msal-name');
    sessionStorage.removeItem('vr-msal-email');
    msalUser = null;
  } else {
    // Logout PIN
    fetch(`${AUTH_URL}/logout`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${authToken}` },
    }).catch(() => {});
    sessionStorage.removeItem('vr-booking-token');
  }

  sessionStorage.removeItem('vr-booking-role');
  authToken = null;
  role = null;

  document.getElementById('admin-badge').classList.add('hidden');
  document.getElementById('exit-admin-btn').classList.add('hidden');
  document.getElementById('admin-btn').classList.remove('hidden');
  document.getElementById('view-tabs').classList.add('hidden');
}

// ─── PIN (coordinación / admin) ───────────────────────────────────────────────

export function showPin(onSuccess) {
  let pinVal = '';
  document.getElementById('pin-error').textContent = '';
  updateDots(pinVal);
  document.getElementById('pin-screen').classList.remove('hidden');
  document.getElementById('main-app').classList.add('hidden');

  if (_pinHandler) document.removeEventListener('keydown', _pinHandler);
  _pinHandler = function (e) {
    if (document.getElementById('pin-screen').classList.contains('hidden')) return;
    if (e.key >= '0' && e.key <= '9') pinPress(e.key);
    else if (e.key === 'Backspace') pinPress('del');
    else if (e.key === 'Escape') hidePinScreen();
  };
  document.addEventListener('keydown', _pinHandler);

  document.querySelectorAll('.pin-key[data-pin]').forEach(btn => {
    btn.onclick = () => pinPress(btn.dataset.pin);
  });
  document.getElementById('btn-cancel-pin')?.addEventListener('click', hidePinScreen);

  function pinPress(v) {
    if (v === 'del') {
      pinVal = pinVal.slice(0, -1);
      document.getElementById('pin-error').textContent = '';
      updateDots(pinVal);
      return;
    }
    if (pinVal.length >= 4) return;
    pinVal += v;
    updateDots(pinVal);
    if (pinVal.length === 4) submitPin();
  }

  async function submitPin() {
    document.querySelectorAll('.pin-key').forEach(k => k.disabled = true);
    document.getElementById('pin-error').textContent = 'Verificando…';
    try {
      const r = await fetch(`${AUTH_URL}/auth`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin: pinVal }),
      });
      const data = await r.json();
      if (data.token) {
        authToken = data.token;
        role = data.role;
        sessionStorage.setItem('vr-booking-token', authToken);
        sessionStorage.setItem('vr-booking-role', role);
        enterRole(role, onSuccess);
      } else {
        const dots = document.getElementById('pin-dots');
        dots.classList.add('shake');
        for (let i = 0; i < 4; i++) document.getElementById('d' + i).className = 'pin-dot error';
        document.getElementById('pin-error').textContent = data.error || 'PIN incorrecto';
        setTimeout(() => { dots.classList.remove('shake'); pinVal = ''; updateDots(pinVal); }, 500);
      }
    } catch {
      document.getElementById('pin-error').textContent = 'Error de conexión';
      setTimeout(() => { pinVal = ''; updateDots(pinVal); }, 500);
    } finally {
      document.querySelectorAll('.pin-key').forEach(k => k.disabled = false);
    }
  }
}

export function hidePinScreen() {
  document.getElementById('pin-screen').classList.add('hidden');
  document.getElementById('main-app').classList.remove('hidden');
  if (_pinHandler) {
    document.removeEventListener('keydown', _pinHandler);
    _pinHandler = null;
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function updateDots(pinVal) {
  for (let i = 0; i < 4; i++) {
    document.getElementById('d' + i).className = 'pin-dot' + (i < pinVal.length ? ' filled' : '');
  }
}

function showAuthError(msg) {
  const el = document.getElementById('auth-error');
  if (el) { el.textContent = msg; el.classList.remove('hidden'); }
  else console.error(msg);
}
