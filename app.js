import * as api from './api.js';
import * as ui from './ui.js';
import * as modal from './modal.js';
import * as auth from './auth.js';
import {
  DAYS, FDAYS, ROWS, HOLIDAYS, TEACHING, SCHOOL_END
} from './config.js';
import {
  getMonday, getCellDate, dStr, fmtDate, slotKey,
  isToday, isPast, isPastSchoolEnd,
  getWeekBookings, getMonthBookings, getUsageRate, getTopTeachers, getBusiestDay
} from './calendar.js';

let isAdmin = false;
let weekOff = 0;
let currentView = 'grid';
let bookings = {};
let mBlocked = {};

// Helpers para sesión
function getToken() { return auth.getAuthToken(); }
function getRole() { return auth.getRole(); }

// Render helpers
function renderGrid() {
  isAdmin = getRole() === 'admin';
  ui.renderGrid({
    DAYS, ROWS, HOLIDAYS, TEACHING, SCHOOL_END, FDAYS,
    weekOff, isAdmin, currentView, role: getRole(), bookings, mBlocked,
    getCellDate, fmtDate, slotKey, isToday, isPast, isPastSchoolEnd,
    openModal, doUnblock, doCancel, doBlock,
  });
}
function renderList() {
  ui.renderList({
    bookings, ROWS, FDAYS, currentView, role: getRole(), doCancel
  });
}
function renderStats() {
  ui.renderStats({
    getWeekBookings, getMonthBookings, getUsageRate, getTopTeachers, getBusiestDay,
    bookings, mBlocked, ROWS, FDAYS,
  });
}

// Modals delegates
function openModal(wOff, dIdx, pLabel, pTime, key) {
  modal.openModal({
    wOff, dIdx, pLabel, pTime, key,
    FDAYS, fmtDate,
    hideAdminExtras: () => {},
    populateTeachers: () => {},
  });
}
function doCancel(key, booking) {
  modal.doCancel(
    key, booking, FDAYS, fmtDate, ui.showToast,
    renderGrid, currentView, renderList,
    (id, reason) => api.cancelOnServer(id, reason, getToken())
  );
}
function doUnblock(key) {
  modal.doUnblock(
    key,
    modal.showConfirmDialog,
    (id) => api.cancelOnServer(id, null, getToken()),
    mBlocked,
    renderGrid,
    ui.showToast
  );
}
function doBlock(key, wOff, dIdx, pLabel, pTime) {
  modal.doBlock(
    key, wOff, dIdx, pLabel, pTime,
    FDAYS, fmtDate, modal.showConfirmDialog,
    (key) => api.checkConflict(key, getToken()),
    ui.showToast,
    async () => {
      const loaded = await api.loadBookings(getToken());
      bookings = loaded.bookings || {};
      mBlocked = loaded.mBlocked || {};
    },
    renderGrid
  );
}

// Semana, navegación y vistas
function renderWeekLabel() {
  ui.renderWeekLabel({ getMonday, weekOff });
}
function changeWeek(dir) {
  weekOff += dir; renderWeekLabel(); renderGrid(); updateTodayBtn();
}
function goToday() {
  if (weekOff === 0) return;
  weekOff = 0; renderWeekLabel(); renderGrid(); updateTodayBtn();
}
function updateTodayBtn() {
  const btn = document.getElementById('btn-today');
  if (!btn) return;
  if (weekOff === 0) {
    btn.classList.add('at-today');
    btn.title = 'Ya estás en la semana actual';
  } else {
    btn.classList.remove('at-today');
    btn.title = 'Ir a la semana actual';
  }
}
function setView(v) {
  currentView = v;
  ['grid', 'list', 'stats'].forEach(n => {
    document.getElementById(`view-${n}`).classList.toggle('hidden', v !== n);
    document.getElementById(`tab-${n}`).classList.toggle('active', v === n);
  });
  if (v === 'list')  renderList();
  if (v === 'stats') renderStats();
}

async function enterApp() {
  document.getElementById('auth-screen').classList.add('hidden');
  document.getElementById('main-app').classList.remove('hidden');
  document.getElementById('admin-btn').classList.remove('hidden');
  renderWeekLabel(); renderGrid(true); updateTodayBtn();
  ui.showStatus('Cargando disponibilidad…', 'ok');
  try {
    const loaded = await api.loadBookings(getToken());
    bookings = loaded.bookings || {};
    mBlocked = loaded.mBlocked || {};
    ui.hideStatus(); renderGrid();
  } catch (e) {
    ui.showStatus('Error al conectar: ' + e.message, 'err');
    renderGrid();
  }
}

// Admin PIN/rol
function enterAdmin() {
  auth.showPin(() => {
    renderGrid();
  });
}
function salirAdmin() {
  auth.exitRole();
  renderGrid();
}

// Restore session
auth.restoreSession(() => {
  renderGrid();
});

// DOMContentLoaded: listeners
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('btn-enter-app')?.addEventListener('click', enterApp);
  document.getElementById('btn-prev-week')?.addEventListener('click', () => changeWeek(-1));
  document.getElementById('btn-next-week')?.addEventListener('click', () => changeWeek(1));
  document.getElementById('btn-today')?.addEventListener('click', goToday);
  document.getElementById('tab-grid')?.addEventListener('click', () => setView('grid'));
  document.getElementById('tab-list')?.addEventListener('click', () => setView('list'));
  document.getElementById('tab-stats')?.addEventListener('click', () => setView('stats'));
  document.getElementById('admin-btn')?.addEventListener('click', enterAdmin);
  document.getElementById('exit-admin-btn')?.addEventListener('click', salirAdmin);

  // Modo oscuro
  document.getElementById('theme-toggle')?.addEventListener('click', ui.toggleTheme);
  ui.setInitialThemeIcon();

  // Modals generales y cierre
  document.getElementById('btn-close-modal')?.addEventListener('click', modal.closeModal);
  document.getElementById('modal')?.addEventListener('click', e => {
    if (e.target === document.getElementById('modal')) modal.closeModal();
  });
  document.getElementById('confirm-cancel-btn')?.addEventListener('click', modal.closeConfirmDialog);
  document.getElementById('confirm-modal')?.addEventListener('click', e => {
    if (e.target === document.getElementById('confirm-modal')) modal.closeConfirmDialog();
  });
  document.getElementById('btn-close-cancel-modal')?.addEventListener('click', modal.closeCancelModal);
  document.getElementById('cancel-modal')?.addEventListener('click', e => {
    if (e.target === document.getElementById('cancel-modal')) modal.closeCancelModal();
  });

  renderWeekLabel();
  renderGrid();
  updateTodayBtn();
});