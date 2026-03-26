import { AUTH_URL, ROLE_LABELS, ROLE_COLORS } from './config.js';

let authToken = null;
let role = null;
let _pinHandler = null;

export function getAuthToken() { return authToken; }
export function getRole() { return role; }

function updateDots(pinVal) {
  for (let i = 0; i < 4; i++) {
    document.getElementById('d' + i).className = 'pin-dot' + (i < pinVal.length ? ' filled' : '');
  }
}

export function showPin(onSuccess) {
  let pinVal = '';
  document.getElementById('pin-error').textContent = '';
  updateDots(pinVal);
  document.getElementById('pin-screen').classList.remove('hidden');
  document.getElementById('main-app').classList.add('hidden');

  // limpiar handler anterior, si lo había
  if (_pinHandler) document.removeEventListener('keydown', _pinHandler);

  // handler local con acceso a pinVal
  _pinHandler = function(e) {
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
        authToken = data.token; role = data.role;
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
    } catch (e) {
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
  // remover listener
  if (_pinHandler) {
    document.removeEventListener('keydown', _pinHandler);
    _pinHandler = null;
  }
}

export function enterRole(r, onSuccess) {
  role = r;
  authToken = sessionStorage.getItem('vr-booking-token');
  hidePinScreen();
  const badge = document.getElementById('admin-badge');
  badge.textContent = ROLE_LABELS[r] || r;
  badge.style.background = ROLE_COLORS[r] || '#1e40af';
  badge.classList.remove('hidden');
  document.getElementById('exit-admin-btn').classList.remove('hidden');
  document.getElementById('admin-btn').classList.add('hidden');
  document.getElementById('view-tabs').classList.remove('hidden');
  onSuccess && onSuccess();
}

export function exitRole() {
  fetch(`${AUTH_URL}/logout`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${authToken}` }
  }).catch(() => {});
  sessionStorage.removeItem('vr-booking-token');
  sessionStorage.removeItem('vr-booking-role');
  authToken = null; role = null;
  document.getElementById('admin-badge').classList.add('hidden');
  document.getElementById('exit-admin-btn').classList.add('hidden');
  document.getElementById('admin-btn').classList.remove('hidden');
  document.getElementById('view-tabs').classList.add('hidden');
}

export async function restoreSession(onSuccess) {
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
    } catch (e) {}
    sessionStorage.removeItem('vr-booking-token');
    sessionStorage.removeItem('vr-booking-role');
    authToken = null; role = null;
  }
  return false;
}