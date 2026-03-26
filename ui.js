export const esc = s => String(s).replace(/[&<>"']/g, c =>
  ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":"&#39;" })[c]);

export function toggleTheme() {
  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
  if (isDark) {
    document.documentElement.removeAttribute('data-theme');
    document.getElementById('theme-toggle').textContent = '🌙';
    localStorage.setItem('vr-dark-mode', 'false');
  } else {
    document.documentElement.setAttribute('data-theme', 'dark');
    document.getElementById('theme-toggle').textContent = '☀️';
    localStorage.setItem('vr-dark-mode', 'true');
  }
}
export function setInitialThemeIcon() {
  const el = document.getElementById('theme-toggle');
  if (!el) return;
  if (document.documentElement.getAttribute('data-theme') === 'dark')
    el.textContent = '☀️';
  else
    el.textContent = '🌙';
}

export function showToast(msg, type = 'ok') {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.className = `toast toast-${type} show`;
  setTimeout(() => t.classList.remove('show'), 3000);
}
export function showStatus(msg, type = 'ok') {
  const s = document.getElementById('status-bar');
  s.textContent = msg;
  s.className = `status-bar status-${type}`;
  s.classList.remove('hidden');
}
export function hideStatus() {
  document.getElementById('status-bar').classList.add('hidden');
}

// Las siguientes funciones DEBEN existir en tu archivo, copia tu renderGrid/modularización:
export function renderGrid(args) { /* ...tu lógica de render... */ }
export function renderList(args) { /* ... */ }
export function renderStats(args) { /* ... */ }
export function renderWeekLabel({ getMonday, weekOff }) {
  const m = getMonday(weekOff), f = new Date(m);
  f.setDate(m.getDate() + 4);
  document.getElementById('week-label').textContent =
    m.toLocaleDateString('es-MX', { day:'numeric', month:'short' }) + ' – ' +
    f.toLocaleDateString('es-MX', { day:'numeric', month:'short', year:'numeric' });
}