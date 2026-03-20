/* schedule.js — Public parent-facing schedule page
   Self-contained; does NOT import from app.js.
   All UI text in Spanish (es-MX locale). */

'use strict';

// ── Constants ──────────────────────────────────────────────────────────────
const PROXY = 'https://vr-lab-proxy.6z5fznmp4m.workers.dev';
const FDAYS = ['Lunes','Martes','Miércoles','Jueves','Viernes'];
const ROWS = [
  {type:'period',label:'P1',time:'7:20–8:10'},
  {type:'period',label:'P2',time:'8:10–9:00'},
  {type:'period',label:'P3',time:'9:00–9:50'},
  {type:'period',label:'P4',time:'10:20–11:10'},
  {type:'period',label:'P5',time:'11:10–12:00'},
  {type:'period',label:'P6',time:'12:00–12:50'},
  {type:'period',label:'P7',time:'13:10–14:00'},
  {type:'period',label:'P8',time:'14:00–14:50'},
];

// ── State ──────────────────────────────────────────────────────────────────
let weekOff = 0;           // offset from current week (0 = this week)
let allBookings = [];      // all confirmed bookings loaded from API
let selectedGrupo = '';    // currently selected group filter
let toastTimer = null;

// ── XSS protection ─────────────────────────────────────────────────────────
const esc = s => String(s).replace(/[&<>"']/g, c => (
  {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}
)[c]);

// ── Date helpers ───────────────────────────────────────────────────────────
/** Returns the Monday of the week at weekOff offset from today. */
function getMonday(off) {
  const n = new Date();
  const dy = n.getDay();
  const m = new Date(n);
  m.setDate(n.getDate() - dy + (dy === 0 ? -6 : 1) + off * 7);
  m.setHours(0, 0, 0, 0);
  return m;
}

/** Returns YYYY-MM-DD string for a date. */
function dStr(d) {
  return d.toISOString().slice(0, 10);
}

/** Returns the 5 weekday Date objects for the current weekOff. */
function getWeekDates() {
  const mon = getMonday(weekOff);
  return Array.from({length: 5}, (_, i) => {
    const d = new Date(mon);
    d.setDate(mon.getDate() + i);
    return d;
  });
}

// ── Theme ──────────────────────────────────────────────────────────────────
function toggleTheme() {
  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
  document.documentElement.setAttribute('data-theme', isDark ? '' : 'dark');
  localStorage.setItem('vr-dark-mode', String(!isDark));
  document.getElementById('theme-toggle').textContent = isDark ? '🌙' : '☀️';
}

function initThemeIcon() {
  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
  document.getElementById('theme-toggle').textContent = isDark ? '☀️' : '🌙';
}

// ── Toast ──────────────────────────────────────────────────────────────────
function showToast(msg, type = 'ok') {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.className = 'toast show' + (type === 'err' ? ' toast-err' : '');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.className = 'toast'; }, 3500);
}

// ── Data fetching ──────────────────────────────────────────────────────────
async function fetchAllBookings() {
  let offset = '';
  const all = [];
  do {
    const formula = encodeURIComponent("NOT({Status}='Cancelled')");
    const url = `${PROXY}?filterByFormula=${formula}&pageSize=100${offset ? '&offset=' + offset : ''}`;
    const raw = await fetch(url);
    if (!raw.ok) throw new Error(`HTTP ${raw.status}`);
    const data = await raw.json();
    const records = data.records || (data.$return_value && data.$return_value.records) || [];
    const nextOffset = data.offset || (data.$return_value && data.$return_value.offset) || '';
    all.push(...records);
    offset = nextOffset;
  } while (offset);

  // Only keep Confirmed (not Blocked)
  return all
    .filter(rec => rec.fields && rec.fields.Status === 'Confirmed')
    .map(rec => ({
      grupo:    rec.fields.Grupo    || '',
      materia:  rec.fields.Materia  || '',
      profesor: rec.fields.Profesor || '',
      actividad:rec.fields.Actividad|| '',
      fecha:    rec.fields.Fecha    || '',
      hora:     rec.fields.Hora     || '',
      period:   rec.fields.Period   || '',
    }));
}

// ── Group filter helpers ───────────────────────────────────────────────────
function getUniqueGroups(bookings) {
  const seen = new Set();
  bookings.forEach(b => { if (b.grupo) seen.add(b.grupo); });
  return Array.from(seen).sort((a, b) => a.localeCompare(b, 'es'));
}

function populateGrupoDropdown(bookings) {
  const sel = document.getElementById('grupo-filter');
  const groups = getUniqueGroups(bookings);
  // Keep the first "Todos los grupos" option, replace the rest
  while (sel.options.length > 1) sel.remove(1);
  groups.forEach(g => {
    const opt = document.createElement('option');
    opt.value = g;
    opt.textContent = g;
    sel.appendChild(opt);
  });
  if (selectedGrupo) sel.value = selectedGrupo;
}

function onGrupoChange() {
  const sel = document.getElementById('grupo-filter');
  selectedGrupo = sel.value;
  // Update URL query param so parents can share filtered links
  const url = new URL(window.location.href);
  if (selectedGrupo) {
    url.searchParams.set('grupo', selectedGrupo);
  } else {
    url.searchParams.delete('grupo');
  }
  history.replaceState(null, '', url.toString());
  renderWeek();
}

// ── Week navigation ────────────────────────────────────────────────────────
function changeWeek(dir) {
  weekOff += dir;
  renderWeekLabel();
  updateTodayBtn();
  renderWeek();
}

function goToday() {
  weekOff = 0;
  renderWeekLabel();
  updateTodayBtn();
  renderWeek();
}

function renderWeekLabel() {
  const dates = getWeekDates();
  const mon = dates[0];
  const fri = dates[4];
  const fmt = d => d.toLocaleDateString('es-MX', {day:'numeric', month:'short'});
  const year = fri.getFullYear();
  document.getElementById('week-label').textContent =
    `${fmt(mon)} – ${fmt(fri)} ${year}`;
}

function updateTodayBtn() {
  const btn = document.getElementById('btn-today');
  btn.classList.toggle('at-today', weekOff === 0);
}

// ── Period time lookup ─────────────────────────────────────────────────────
function getPeriodTime(label) {
  const row = ROWS.find(r => r.label === label);
  return row ? row.time : '';
}

// ── Render ─────────────────────────────────────────────────────────────────
function renderWeek() {
  const content = document.getElementById('content');
  const dates = getWeekDates();
  const weekDateStrings = new Set(dates.map(dStr));

  // Filter bookings: current week + optional group
  const filtered = allBookings.filter(b => {
    if (!weekDateStrings.has(b.fecha)) return false;
    if (selectedGrupo && b.grupo !== selectedGrupo) return false;
    return true;
  });

  if (filtered.length === 0) {
    content.innerHTML = renderEmpty();
    return;
  }

  // Group by date
  const byDate = {};
  filtered.forEach(b => {
    if (!byDate[b.fecha]) byDate[b.fecha] = [];
    byDate[b.fecha].push(b);
  });

  // Sort sessions within each day by period label
  const periodOrder = {};
  ROWS.forEach((r, i) => { periodOrder[r.label] = i; });
  Object.values(byDate).forEach(sessions => {
    sessions.sort((a, b) =>
      (periodOrder[a.period] ?? 99) - (periodOrder[b.period] ?? 99)
    );
  });

  // Render cards in weekday order
  let html = '';
  dates.forEach(d => {
    const key = dStr(d);
    const sessions = byDate[key];
    if (!sessions || sessions.length === 0) return;

    const dayIdx = d.getDay() - 1; // 0=Mon…4=Fri
    const dayName = FDAYS[dayIdx] || '';
    const dayDateStr = d.toLocaleDateString('es-MX', {day:'numeric', month:'short'});

    html += `<div class="day-card">
  <div class="day-header">
    <span class="day-icon">📅</span>
    <span class="day-name">${esc(dayName)}</span>
    <span class="day-date">${esc(dayDateStr)}</span>
  </div>
  <div class="session-list">`;

    sessions.forEach(s => {
      const time = s.hora || getPeriodTime(s.period);
      html += `
    <div class="session-row">
      <div class="session-period">
        <span class="period-badge">${esc(s.period)}</span>
        <span class="period-time">${esc(time)}</span>
      </div>
      <div class="session-body">
        <div class="session-header">
          <span class="session-grupo">${esc(s.grupo)}</span>
          <span class="session-materia">${esc(s.materia)}</span>
        </div>
        <div class="session-actividad">${esc(s.actividad)}</div>
        <div class="session-profesor">👤 ${esc(s.profesor)}</div>
      </div>
    </div>`;
    });

    html += `
  </div>
</div>`;
  });

  content.innerHTML = html;
}

function renderLoading() {
  return `<div class="loading-state">
  <div class="spinner"></div>
  <div class="loading-text">Cargando...</div>
</div>`;
}

function renderEmpty() {
  const msg = selectedGrupo
    ? `No hay sesiones programadas para el grupo <strong>${esc(selectedGrupo)}</strong> esta semana.`
    : 'No hay sesiones programadas esta semana.';
  return `<div class="empty-state">
  <div class="empty-emoji">🗓️</div>
  <div class="empty-title">Sin sesiones</div>
  <div class="empty-sub">${msg}</div>
</div>`;
}

function renderError(msg) {
  return `<div class="error-state">
  <div class="error-emoji">⚠️</div>
  <div class="error-title">Error al cargar los datos</div>
  <div class="error-sub">${esc(msg)}</div>
  <button class="btn btn-retry" onclick="init()">Reintentar</button>
</div>`;
}

// ── Init ───────────────────────────────────────────────────────────────────
async function init() {
  // Read ?grupo= from URL on load
  const params = new URLSearchParams(window.location.search);
  const grupoParam = params.get('grupo') || '';
  if (grupoParam) selectedGrupo = grupoParam;

  initThemeIcon();
  renderWeekLabel();
  updateTodayBtn();

  const content = document.getElementById('content');
  content.innerHTML = renderLoading();

  try {
    allBookings = await fetchAllBookings();
    populateGrupoDropdown(allBookings);
    renderWeek();
  } catch (err) {
    content.innerHTML = renderError(err.message || 'Error de red');
    showToast('No se pudieron cargar los datos', 'err');
  }
}

// Start
init();
