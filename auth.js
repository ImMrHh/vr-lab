// =============================================================================
// auth.js — VR Lab CEAM · portalvr.tech
// Autenticación: PIN flow (profesor / coordinación / admin) + SSO MSAL (Azure AD)
// =============================================================================

import { AUTH_URL } from './config.js';

// ─── Estado interno ───────────────────────────────────────────────────────────

let _authToken = null;   // token de sesión (KV Worker)
let _role      = null;   // 'profesor' | 'coordinacion' | 'admin'
let _msalUser  = null;   // { name, email } si autenticado vía SSO

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
  const btnMsal = document.getElementById('btn-msal-login');
  const errEl   = document.getElementById('sso-error');

  if (errEl) errEl.classList.add('hidden');

  if (typeof msal === 'undefined') {
    _showSSOError('SSO no disponible. Usa PIN para continuar.');
    return;
  }

  try {
    const msalApp = new msal.PublicClientApplication(getMSALConfig());
    await msalApp.initialize();

    // Manejar redirect si viene de un flujo previo
    await msalApp.handleRedirectPromise();

    const result = await msalApp.loginPopup({ scopes: MSAL_SCOPES });

    if (!result?.account) {
      _showSSOError('No se pudo obtener la cuenta. Intenta de nuevo.');
      return;
    }

    const account = result.account;
    const email   = account.username || account.idTokenClaims?.email || '';
    const name    = account.name || account.idTokenClaims?.name || email.split('@')[0];

    // Verificar dominio institucional
    if (!email.endsWith('@cuam.edu.mx') && !email.endsWith('@ceam.edu.mx')) {
      _showSSOError('Usa tu cuenta institucional (@cuam.edu.mx o @ceam.edu.mx).');
      return;
    }

    // Obtener token de sesión del Worker
    const token = await _exchangeForSessionToken(email, name);
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

// ─── Intercambio MSAL token → sesión Worker ───────────────────────────────────

async function _exchangeForSessionToken(email, name) {
  try {
    const r = await fetch(`${AUTH_URL}/sso`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, name }),
    });
    const data = await r.json();
    return data.token || null;
  } catch {
    return null;
  }
}

// ─── PIN flow ─────────────────────────────────────────────────────────────────

/**
 * Muestra el panel de PIN y autentica contra el Worker.
 * onSuccess se llama con el rol obtenido.
 */
export function showPin(onSuccess) {
  const overlay = document.getElementById('pin-overlay');
  const input   = document.getElementById('pin-input');
  const errEl   = document.getElementById('pin-error');
  const btn     = document.getElementById('pin-submit');

  if (!overlay) { console.error('pin-overlay no encontrado'); return; }

  errEl?.classList.add('hidden');
  if (input) input.value = '';
  overlay.classList.remove('hidden');
  setTimeout(() => input?.focus(), 100);

  // Limpiar listeners previos clonando el botón
  const newBtn = btn.cloneNode(true);
  btn.parentNode.replaceChild(newBtn, btn);

  const doSubmit = async () => {
    const pin = input?.value.trim();
    if (!pin) return;

    newBtn.disabled = true;
    newBtn.textContent = 'Verificando…';
    errEl?.classList.add('hidden');

    try {
      const result = await _verifyPin(pin);
      if (result.ok) {
        _authToken = result.token;
        _role      = result.role;
        _msalUser  = null;

        _persistSession();
        _updateRoleBadge();
        overlay.classList.add('hidden');
        if (onSuccess) await onSuccess();
      } else {
        _showPinError(result.message || 'PIN incorrecto');
      }
    } catch (e) {
      _showPinError('Error de red. Intenta de nuevo.');
    } finally {
      newBtn.disabled = false;
      newBtn.textContent = 'Entrar';
    }
  };

  newBtn.addEventListener('click', doSubmit);
  input?.addEventListener('keydown', e => { if (e.key === 'Enter') doSubmit(); });

  // Botón cerrar overlay
  document.getElementById('pin-close')?.addEventListener('click', () => {
    overlay.classList.add('hidden');
  });
}

async function _verifyPin(pin) {
  const r = await fetch(`${AUTH_URL}/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ pin }),
  });
  const data = await r.json();
  if (data.token) return { ok: true, token: data.token, role: data.role };
  return { ok: false, message: data.error || 'PIN incorrecto' };
}

// ─── Salir de rol (volver a público) ─────────────────────────────────────────

export function exitRole() {
  _authToken = null;
  _role      = null;
  _msalUser  = null;
  sessionStorage.removeItem('vr_session');
  _updateRoleBadge();
}

// ─── Restaurar sesión al cargar ───────────────────────────────────────────────

export async function restoreSession(onRestored) {
  try {
    const saved = sessionStorage.getItem('vr_session');
    if (!saved) return;

    const { token, role, msalUser } = JSON.parse(saved);
    if (!token || !role) return;

    // Validar token con el Worker
    const r = await fetch(`${AUTH_URL}/verify`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
    });
    const data = await r.json();
    if (!data.valid) { sessionStorage.removeItem('vr_session'); return; }

    _authToken = token;
    _role      = role;
    _msalUser  = msalUser || null;

    _updateRoleBadge();

    // Si había sesión, entrar directo a la app
    document.getElementById('auth-screen')?.classList.add('hidden');
    document.getElementById('main-app')?.classList.remove('hidden');
    document.getElementById('admin-btn')?.classList.remove('hidden');

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
  const badge = document.getElementById('role-badge');
  const exitBtn = document.getElementById('exit-admin-btn');
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
  if (errEl) { errEl.textContent = msg; errEl.classList.remove('hidden'); }
}

function _showSSOError(msg) {
  const errEl = document.getElementById('sso-error');
  if (errEl) { errEl.textContent = msg; errEl.classList.remove('hidden'); }
}
