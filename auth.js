// =============================================================================
// auth.js — VR Lab CEAM · portalvr.tech
// Autenticación: CF Access (identidad) + PIN flow (coordinación / admin)
// =============================================================================

import { AUTH_URL } from './config.js';

// ─── Estado interno ───────────────────────────────────────────────────────────

let _authToken = null;   // token de sesión (KV Worker)
let _role      = null;   // 'profesor' | 'coordinacion' | 'admin'
let _cfUser    = null;   // { name, email } desde CF Access
let _pinBuffer = '';     // dígitos acumulados del keypad

// ─── Getters públicos ─────────────────────────────────────────────────────────

export const getAuthToken = () => _authToken;
export const getRole      = () => _role;
export const getMSALUser  = () => _cfUser;   // alias para compatibilidad con módulos existentes

// ─── CF Access — obtener identidad ───────────────────────────────────────────

export async function initCFIdentity(onSuccess) {
  try {
    const r = await fetch('/cdn-cgi/access/get-identity', { credentials: 'include' });
    if (!r.ok) return;

    const identity = await r.json();
    const email = identity.email || '';
    const name  = identity.name  || email.split('@')[0];

    if (!email) return;

    // Obtener session token del Worker
    const token = await _exchangeForSessionToken(email, name);
    if (!token) return;

    _cfUser    = { name, email };
    _authToken = token;
    _role      = 'profesor';

    _persistSession();
    _updateRoleBadge();

    document.getElementById('auth-screen')?.classList.add('hidden');
    document.getElementById('main-app')?.classList.remove('hidden');

    if (onSuccess) await onSuccess();

  } catch (err) {
    console.warn('[auth] CF identity error:', err);
  }
}

// ─── Intercambio identidad CF → sesión Worker ─────────────────────────────────

async function _exchangeForSessionToken(email, name) {
  try {
    const r = await fetch(`${AUTH_URL}/sso`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ email, name }),
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

  _pinBuffer = '';
  _updateDots();
  if (errEl) errEl.textContent = '';

  document.getElementById('auth-screen')?.classList.add('hidden');
  screen.classList.remove('hidden');

  const closePin = () => {
    document.removeEventListener('keydown', keyHandler);
    screen.classList.add('hidden');
    document.getElementById('auth-screen')?.classList.remove('hidden');
    _pinBuffer = '';
    _updateDots();
    if (errEl) errEl.textContent = '';
  };

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
        _cfUser    = null;

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
  _cfUser    = null;
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
    _cfUser    = msalUser || null;

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
    msalUser: _cfUser,
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
    badge.textContent = _cfUser
      ? `${_cfUser.name.split(' ')[0]} · ${labels[_role]}`
      : labels[_role];
    badge.style.background = colors[_role] || '#374151';
    badge.classList.remove('hidden');
  }

  exitBtn?.classList.remove('hidden');
  adminBtn?.classList.add('hidden');
}
