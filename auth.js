// =============================================================================
// auth.js — VR Lab CEAM · portalvr.tech
// Autenticación: PASS flow (profesor / coordinación / admin)
// =============================================================================

import { AUTH_URL } from './config.js';

// ─── Estado interno ───────────────────────────────────────────────────────────

let _authToken = null;   // token de sesión (KV Worker)
let _role      = null;   // 'profesor' | 'coordinacion' | 'admin'
let _pinBuffer = '';     // dígitos acumulados del keypad

// ─── Getters públicos ─────────────────────────────────────────────────────────

export const getAuthToken = () => _authToken;
export const getRole      = () => _role;
export const getMSALUser  = () => null;  // alias para compatibilidad

// ─── PIN flow ─────────────────────────────────────────────────────────────────

export function showPin(onSuccess) {
  const screen    = document.getElementById('pin-screen');
  const input     = document.getElementById('passphrase-input');
  const submitBtn = document.getElementById('passphrase-submit');
  const errEl     = document.getElementById('pin-error');
  const cancelBtn = document.getElementById('btn-cancel-pin');

  if (!screen) { console.error('pin-screen no encontrado'); return; }

  if (input) input.value = '';
  if (errEl) errEl.textContent = '';

  document.getElementById('auth-screen')?.classList.add('hidden');
  screen.classList.remove('hidden');

  // Focus automático
  setTimeout(() => input?.focus(), 100);

  const closePin = () => {
    document.removeEventListener('keydown', keyHandler);
    screen.classList.add('hidden');
    document.getElementById('auth-screen')?.classList.remove('hidden');
    if (input) input.value = '';
    if (errEl) errEl.textContent = '';
  };

  const doSubmit = async () => {
    const passphrase = input?.value || '';
    if (!passphrase) return;

    if (submitBtn) submitBtn.disabled = true;
    if (errEl) errEl.textContent = '';

    try {
      const r = await fetch(`${AUTH_URL}/auth`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ pin: passphrase }),
      });
      const data = await r.json();

      if (data.token) {
        _authToken = data.token;
        _role      = data.role;
        _persistSession();
        _updateRoleBadge();
        screen.classList.add('hidden');
        document.removeEventListener('keydown', keyHandler);
        if (onSuccess) await onSuccess();
      } else {
        if (errEl) errEl.textContent = data.error || 'Contraseña incorrecta';
        if (input) input.value = '';
        input?.focus();
      }
    } catch {
      if (errEl) errEl.textContent = 'Error de red. Intenta de nuevo.';
      if (input) input.value = '';
      input?.focus();
    } finally {
      if (submitBtn) submitBtn.disabled = false;
    }
  };

  const keyHandler = (e) => {
    if (e.key === 'Escape') { closePin(); return; }
    if (e.key === 'Enter')  { doSubmit(); return; }
  };
  document.addEventListener('keydown', keyHandler);

  // Clonar botones para limpiar listeners anteriores
  const freshSubmit = submitBtn?.cloneNode(true);
  if (freshSubmit && submitBtn) {
    submitBtn.parentNode.replaceChild(freshSubmit, submitBtn);
    freshSubmit.addEventListener('click', doSubmit);
  }

  const freshCancel = cancelBtn?.cloneNode(true);
  if (freshCancel && cancelBtn) {
    cancelBtn.parentNode.replaceChild(freshCancel, cancelBtn);
    freshCancel.addEventListener('click', closePin);
  }
}

// ─── Salir de rol ─────────────────────────────────────────────────────────────

export function exitRole() {
  _authToken = null;
  _role      = null;
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

    const { token, role } = JSON.parse(saved);
    if (!token || !role) return;

    const r = await fetch(`${AUTH_URL}/auth/check`, {
      headers: { 'Authorization': `Bearer ${token}` },
    });
    const data = await r.json();
    if (!data.valid) { sessionStorage.removeItem('vr_session'); return; }

    _authToken = token;
    _role      = role;

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
    token: _authToken,
    role:  _role,
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
    badge.textContent      = labels[_role] || _role;
    badge.style.background = colors[_role] || '#374151';
    badge.classList.remove('hidden');
  }

  exitBtn?.classList.remove('hidden');
  adminBtn?.classList.add('hidden');
}
