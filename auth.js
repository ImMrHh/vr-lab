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
      redirectUri: window.location.origin + '/',
    },
    cache: { cacheLocation: 'sessionStorage', storeAuthStateInCookie: false },
  };
}

// ─── MSAL login (popup flow) ──────────────────────────────────────────────────

export async function msalLogin(onSuccess) {
  _showSSOError('');

  if (typeof msal === 'undefined') {
    _showSSOError('SSO no disponible. Usa PIN para continuar.');
    return;
  }

  try {
    const msalApp = new msal.PublicClientApplication(getMSALConfig());
    await msalApp.initialize();
    await msalApp.handleRedirectPromise();

    const result = await msalApp.loginPopup({ scopes: MSAL_SCOPES });

    if (!result?.account) {
      _showSSOError('No se pudo obtener la cuenta. Intenta de nuevo.');
      return;
    }

    const account     = result.account;
    const email       = account.username || account.idTokenClaims?.email || '';
    const name        = account.name || account.idTokenClaims?.name || email.split('@')[0];
    const accessToken = result.accessToken;

    // Verificar dominio institucional (defensa en frontend)
    if (!email.endsWith('@cuam.edu.mx') && !email.endsWith('@ceam.edu.mx')) {
      _showSSOError('Usa tu cuenta institucional (@cuam.edu.mx o @ceam.edu.mx).');
      return;
    }

    // Intercambiar por token de sesión Worker (verificación real en servidor)
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
// El Worker llama a Graph /me con este token para verificar la identidad.

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
//
// IDs esperados en el DOM:
//   #pin-screen       — pantalla completa de PIN (hidden/visible)
//   #pin-dots         — contenedor de puntos indicadores
//   #d0 #d1 #d2 #d3  — puntos individuales
//   .pin-key          — botones del keypad (data-pin="0-9" | "del")
//   #pin-error        — mensaje de error
//   #btn-cancel-pin   — botón cancelar / volver a auth-screen

export function showPin(onSuccess) {
  const screen  = document.getElementById('pin-screen');
  const errEl   = document.getElementById('pin-error');
  const keys    = document.querySelectorAll('.pin-key');
  const cancelBtn = document.getElementById('btn-cancel-pin');

  if (!screen) { console.error('pin-screen no encontrado'); return; }

  // Reset estado
  _pinBuffer = '';
  _updateDots();
  if (errEl) errEl.textContent = '';

  // Mostrar pantalla PIN, ocultar auth-screen
  document.getElementById('auth-screen')?.classList.add('hidden');
  screen.classList.remove('hidden');

  // Limpiar listeners previos clonando cada key
  keys.forEach(key => {
    const fresh = key.cloneNode(true);
    key.parentNode.replaceChild(fresh, key);
  });
  const freshKeys = document.querySelectorAll('.pin-key');

  freshKeys.forEach(key => {
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

      // Auto-submit al completar 4 dígitos
      if (_pinBuffer.length === 4) {
        await _submitPin(onSuccess);
      }
    });
  });

  // Cancelar → volver a auth-screen
  const freshCancel = cancelBtn?.cloneNode(true);
  if (freshCancel) {
    cancelBtn.parentNode.replaceChild(freshCancel, cancelBtn);
    freshCancel.addEventListener('click', () => {
      screen.classList.add('hidden');
      document.getElementById('auth-screen')?.classList.remove('hidden');
      _pinBuffer = '';
      _updateDots();
      if (errEl) errEl.textContent = '';
    });
  }
}

function _updateDots() {
  for (let i = 0; i < 4; i++) {
    const dot = document.getElementById(`d${i}`);
    if (dot) dot.classList.toggle('filled', i < _pinBuffer.length);
  }
}

async function _submitPin(onSuccess) {
  const errEl = document.getElementById('pin-error');
  const keys  = document.querySelectorAll('.pin-key');

  // Deshabilitar keypad durante verificación
  keys.forEach(k => k.disabled = true);
  if (errEl) errEl.textContent = '';

  try {
    const result = await _verifyPin(_pinBuffer);
    if (result.ok) {
      _authToken = result.token;
      _role      = result.role;
      _msalUser  = null;

      _persistSession();
      _updateRoleBadge();
      document.getElementById('pin-screen')?.classList.add('hidden');
      if (onSuccess) await onSuccess();
    } else {
      if (errEl) errEl.textContent = result.message || 'PIN incorrecto';
      _pinBuffer = '';
      _updateDots();
    }
  } catch {
    if (errEl) errEl.textContent = 'Error de red. Intenta de nuevo.';
    _pinBuffer = '';
    _updateDots();
  } finally {
    keys.forEach(k => k.disabled = false);
  }
}

async function _verifyPin(pin) {
  const r = await fetch(`${AUTH_URL}/auth`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ pin }),
  });
  const data = await r.json();
  if (data.token) return { ok: true, token: data.token, role: data.role };
  return { ok: false, message: data.error || 'PIN incorrecto' };
}

// ─── Salir de rol (volver a pantalla de auth) ─────────────────────────────────

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

    // Validar token con el Worker (endpoint /auth/check)
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
  // IDs existentes en index.html: admin-badge, exit-admin-btn, admin-btn
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

function _showPinError(msg) {
  const errEl = document.getElementById('pin-error');
  if (errEl) errEl.textContent = msg;
}

function _showSSOError(msg) {
  // index.html usa auth-error (no sso-error)
  const errEl = document.getElementById('auth-error');
  if (errEl) {
    errEl.textContent = msg;
    errEl.classList.toggle('hidden', !msg);
  }
}
