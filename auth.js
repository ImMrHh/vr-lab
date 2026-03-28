// =============================================================================
// auth.js — VR Lab CEAM · portalvr.tech
// Autenticación: PIN flow (profesor / coordinación / admin) + SSO MSAL (Azure AD)
// =============================================================================

import { AUTH_URL } from './config.js';

// ─── Estado interno ───────────────────────────────────────────────────────────

let _authToken = null;   // token de sesión (KV Worker)
let _role      = null;   // 'profesor' | 'coordinacion' | 'admin'
let _msalUser  = null;   // { name, email } si autenticado vía SSO
let _pinBuffer = '';     // dígitos acumulados del keypad
let _msalApp   = null;   // instancia MSAL pre-inicializada

// ─── Getters públicos ─────────────────────────────────────────────────────────

export const getAuthToken = () => _authToken;
export const getRole      = () => _role;
export const getMSALUser  = () => _msalUser;

// ─── MSAL config ──────────────────────────────────────────────────────────────

const MSAL_CLIENT_ID = '656b2863-b415-478d-875a-bc96cd132f00';
const MSAL_TENANT_ID = '8cef89d5-ca02-46a1-8397-b9c461acb2e6';
const MSAL_SCOPES    = ['User.Read'];

function getMSALConfig() {
  return {
    auth: {
      clientId:    MSAL_CLIENT_ID,
      authority:   `https://login.microsoftonline.com/${MSAL_TENANT_ID}`,
      redirectUri: window.location.origin + '/auth/callback.html',
    },
    cache: { cacheLocation: 'localStorage', storeAuthStateInCookie: true },
  };
}

// ─── Pre-inicializar MSAL al cargar el módulo ─────────────────────────────────

export async function initMSAL() {
  if (typeof msal === 'undefined') return;
  try {
    _msalApp = new msal.PublicClientApplication(getMSALConfig());
    await _msalApp.initialize();

    // Listener para logging/diagnóstico del popup callback
    window.addEventListener('message', (event) => {
      if (event.origin !== window.location.origin) return;
      if (event.data?.type === 'msal:auth:complete') {
        console.log('[auth] mensaje recibido del callback:', event.data.response);
      }
      if (event.data?.type === 'msal:auth:error') {
        console.warn('[auth] error del callback:', event.data.error);
      }
    });

  } catch (err) {
    console.warn('MSAL init error:', err);
    _msalApp = null;
  }
}

// ─── MSAL login (popup flow) ──────────────────────────────────────────────────

export async function msalLogin(onSuccess) {
  _showSSOError('');

  if (!_msalApp) {
    _showSSOError('SSO no disponible. Usa PIN para continuar.');
    return;
  }

  try {
    // redirectUri explícito en loginPopup() — requerido en MSAL v2 para popup flow
    const result = await _msalApp.loginPopup({
      scopes:      MSAL_SCOPES,
      redirectUri: window.location.origin + '/auth/callback.html',
    });

    if (!result?.account) {
      _showSSOError('No se pudo obtener la cuenta. Intenta de nuevo.');
      return;
    }

    const account     = result.account;
    const email       = account.username || account.idTokenClaims?.email || '';
    const name        = account.name || account.idTokenClaims?.name || email.split('@')[0];
    const accessToken = result.accessToken;

    if (!email.endsWith('@cuam.edu.mx') && !email.endsWith('@ceam.edu.mx')) {
      _showSSOError('Usa tu cuenta institucional (@cuam.edu.mx o @ceam.edu.mx).');
      return;
    }

    const token = await _exchangeForSessionToken(email, name, accessToken);
    if (!token) {
      _showSSOError('Error al iniciar sesión. Intenta de nuevo.');
      return;
    }

    _msalUser  = { name, email };
    _authToken = token;
    _role      = 'profesor';

    _persistSession();
    _updateRoleBadge();
    if (onSuccess) await onSuccess();

  } catch (err) {
    console.error('MSAL error:', err);
    if (err.errorCode === 'user_cancelled') {
      _showSSOError('Inicio de sesión cancelado.');
    } else {
      _showSSOError('Error de autenticación. Usa PIN para continuar.');
    }
  }
}

// ─── Intercambio MSAL accessToken → sesión Worker ────────────────────────────

async function _exchangeForSessionToken(email, name, accessToken) {
  try {
    const r = await fetch(`${AUTH_URL}/sso`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ email, name, accessToken }),
    });
    const data = await r.json();
    return data.token || null;
  } catch {
    return null;
  }
}

// ─── PIN flow — usa el keypad numérico del index.html ─────────────────────────

export function showPin(onSuccess) {
  const screen    = document.getElementById('pin-screen');
  const errEl     = document.getElementById('pin-error');
  const cancelBtn = document.getElementById('btn-cancel-pin');

  if (!screen) { console.error('pin-screen no encontrado'); return; }

  // Reset estado
  _pinBuffer = '';
  _updateDots();
  if (errEl) errEl.textContent = '';

  // Mostrar pantalla PIN, ocultar auth-screen
  document.getElementById('auth-screen')?.classList.add('hidden');
  screen.classList.remove('hidden');

  // ── Función de cierre ──────────────────────────────────────────────────────
  const closePin = () => {
    document.removeEventListener('keydown', keyHandler);
    screen.classList.add('hidden');
    document.getElementById('auth-screen')?.classList.remove('hidden');
    _pinBuffer = '';
    _updateDots();
    if (errEl) errEl.textContent = '';
  };

  // ── Submit PIN ─────────────────────────────────────────────────────────────
  const doSubmit = async () => {
    document.removeEventListener('keydown', keyHandler);
    const keys = document.querySelectorAll('.pin-key');
    keys.forEach(k => k.disabled = true);
    if (errEl) errEl.textContent = '';

    try {
      const r = await fetch(`${AUTH_URL}/auth`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ pin: _pinBuffer }),
      });
      const data = await r.json();

      if (data.token) {
        _authToken = data.token;
        _role      = data.role;
        _msalUser  = null;

        _persistSession();
        _updateRoleBadge();
        screen.classList.add('hidden');
        if (onSuccess) await onSuccess();
      } else {
        if (errEl) errEl.textContent = data.error || 'PIN incorrecto';
        _pinBuffer = '';
        _updateDots();
        document.addEventListener('keydown', keyHandler);
      }
    } catch {
      if (errEl) errEl.textContent = 'Error de red. Intenta de nuevo.';
      _pinBuffer = '';
      _updateDots();
      document.addEventListener('keydown', keyHandler);
    } finally {
      keys.forEach(k => k.disabled = false);
    }
  };

  // ── Teclado físico ─────────────────────────────────────────────────────────
  const keyHandler = async (e) => {
    if (e.key === 'Escape') { closePin(); return; }
    if (e.key === 'Backspace') {
      _pinBuffer = _pinBuffer.slice(0, -1);
      _updateDots();
      return;
    }
    if (e.key >= '0' && e.key <= '9') {
      if (_pinBuffer.length >= 4) return;
      _pinBuffer += e.key;
      _updateDots();
      if (_pinBuffer.length === 4) await doSubmit();
    }
  };
  document.addEventListener('keydown', keyHandler);

  // ── Keypad táctil — clonar para limpiar listeners previos ─────────────────
  document.querySelectorAll('.pin-key').forEach(key => {
    const fresh = key.cloneNode(true);
    key.parentNode.replaceChild(fresh, key);
  });

  document.querySelectorAll('.pin-key').forEach(key => {
    key.addEventListener('click', async () => {
      const val = key.dataset.pin;
      if (!val) return;
      if (val === 'del') {
        _pinBuffer = _pinBuffer.slice(0, -1);
        _updateDots();
        return;
      }
      if (_pinBuffer.length >= 4) return;
      _pinBuffer += val;
      _updateDots();
      if (_pinBuffer.length === 4) await doSubmit();
    });
  });

  // ── Cancelar ───────────────────────────────────────────────────────────────
  const freshCancel = cancelBtn?.cloneNode(true);
  if (freshCancel && cancelBtn) {
    cancelBtn.parentNode.replaceChild(freshCancel, cancelBtn);
    freshCancel.addEventListener('click', closePin);
  }
}

// ─── Dots del keypad ──────────────────────────────────────────────────────────

function _updateDots() {
  for (let i = 0; i < 4; i++) {
    document.getElementById(`d${i}`)?.classList.toggle('filled', i < _pinBuffer.length);
  }
}

// ─── Salir de rol ─────────────────────────────────────────────────────────────

export function exitRole() {
  _authToken = null;
  _role      = null;
  _msalUser  = null;
  _pinBuffer = '';
  sessionStorage.removeItem('vr_session');
  _updateRoleBadge();

  document.getElementById('main-app')?.classList.add('hidden');
  document.getElementById('auth-screen')?.classList.remove('hidden');
}

// ─── Restaurar sesión al cargar ───────────────────────────────────────────────

export async function restoreSession(onRestored) {
  try {
    const saved = sessionStorage.getItem('vr_session');
    if (!saved) return;

    const { token, role, msalUser } = JSON.parse(saved);
    if (!token || !role) return;

    const r = await fetch(`${AUTH_URL}/auth/check`, {
      headers: { 'Authorization': `Bearer ${token}` },
    });
    const data = await r.json();
    if (!data.valid) { sessionStorage.removeItem('vr_session'); return; }

    _authToken = token;
    _role      = role;
    _msalUser  = msalUser || null;

    _updateRoleBadge();

    document.getElementById('auth-screen')?.classList.add('hidden');
    document.getElementById('pin-screen')?.classList.add('hidden');
    document.getElementById('main-app')?.classList.remove('hidden');

    if (onRestored) await onRestored();

  } catch {
    sessionStorage.removeItem('vr_session');
  }
}

// ─── Helpers internos ─────────────────────────────────────────────────────────

function _persistSession() {
  sessionStorage.setItem('vr_session', JSON.stringify({
    token:    _authToken,
    role:     _role,
    msalUser: _msalUser,
  }));
}

function _updateRoleBadge() {
  const badge    = document.getElementById('admin-badge');
  const exitBtn  = document.getElementById('exit-admin-btn');
  const adminBtn = document.getElementById('admin-btn');

  if (!_role) {
    badge?.classList.add('hidden');
    exitBtn?.classList.add('hidden');
    adminBtn?.classList.remove('hidden');
    return;
  }

  const labels = { profesor: 'Modo Profesor', coordinacion: 'Coordinación', admin: 'Admin' };
  const colors = { profesor: '#065f46', coordinacion: '#7c3aed', admin: '#1e40af' };

  if (badge) {
    badge.textContent = _msalUser
      ? `${_msalUser.name.split(' ')[0]} · ${labels[_role]}`
      : labels[_role];
    badge.style.background = colors[_role] || '#374151';
    badge.classList.remove('hidden');
  }

  exitBtn?.classList.remove('hidden');
  adminBtn?.classList.add('hidden');
}

function _showSSOError(msg) {
  const errEl = document.getElementById('auth-error');
  if (errEl) {
    errEl.textContent = msg;
    errEl.classList.toggle('hidden', !msg);
  }
}
