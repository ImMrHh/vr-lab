import * as api from './api.js';
import * as ui from './ui.js';
import * as modal from './modal.js';
import {
  DAYS, FDAYS, ROWS, HOLIDAYS, TEACHING, SCHOOL_END
} from './config.js';

import {
  getMonday, getCellDate, dStr, fmtDate, slotKey,
  isToday, isPast, isPastSchoolEnd,
  getWeekBookings, getMonthBookings, getUsageRate, getTopTeachers, getBusiestDay
} from './calendar.js'; // Cambia esto si tus helpers están en config.js

// Estado global
let isAdmin    = false;
let weekOff    = 0;
let currentView = 'grid';
let role       = null;
let authToken  = null; // Integra después desde SSO o tu nuevo auth
let bookings   = {};
let mBlocked   = {};

// ─── Render helpers binding ──────────────────────────────────────────────

// Wrapper directo para montar la cuadrícula
function renderGrid() {
  ui.renderGrid({
    DAYS, ROWS, HOLIDAYS, TEACHING, SCHOOL_END, FDAYS,
    weekOff, isAdmin, currentView, role, bookings, mBlocked,
    getCellDate, fmtDate, slotKey, isToday, isPast, isPastSchoolEnd,
    openModal, doUnblock, doCancel, doBlock,
  });
}

function renderList() {
  ui.renderList({
    bookings, ROWS, FDAYS, currentView, role, doCancel
  });
}

function renderStats() {
  ui.renderStats({
    getWeekBookings, getMonthBookings, getUsageRate, getTopTeachers, getBusiestDay,
    bookings, mBlocked, ROWS, FDAYS,
  });
}

// ─── Modal (alta, cancelar, bloquear…) ──────────────────────────────

function openModal(wOff, dIdx, pLabel, pTime, key) {
  modal.openModal({
    wOff, dIdx, pLabel, pTime, key,
    FDAYS, fmtDate,
    hideAdminExtras: () => {}, // Completa según UI
    populateTeachers: () => {}, // Completa según UI
  });
}

function doCancel(key, booking) {
  modal.doCancel(
    key, booking, FDAYS, fmtDate, ui.showToast,
    renderGrid, currentView, renderList,
    (id, reason) => api.cancelOnServer(id, reason, authToken)
  );
}

function doUnblock(key) {
  modal.doUnblock(
    key,
    modal.showConfirmDialog,
    (id) => api.cancelOnServer(id, null, authToken),
    mBlocked,
    renderGrid,
    ui.showToast
  );
}

function doBlock(key, wOff, dIdx, pLabel, pTime) {
  modal.doBlock(
    key, wOff, dIdx, pLabel, pTime,
    FDAYS, fmtDate, modal.showConfirmDialog,
    (key) => api.checkConflict(key, authToken),
    ui.showToast,
    async () => {
      ({ bookings, mBlocked } = await api.loadBookings(authToken));
    },
    renderGrid
  );
}

// ─── Navegación de semana y vistas ────────────────────────────────────

function renderWeekLabel() {
  ui.renderWeekLabel({ getMonday, weekOff });
}

function changeWeek(dir) {
  weekOff += dir;
  renderWeekLabel();
  renderGrid();
  updateTodayBtn();
}

function goToday() {
  if (weekOff === 0) return;
  weekOff = 0;
  renderWeekLabel();
  renderGrid();
  updateTodayBtn();
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

// Tabs
function setView(v) {
  currentView = v;
  ['grid', 'list', 'stats'].forEach(n => {
    document.getElementById(`view-${n}`).classList.toggle('hidden', v !== n);
    document.getElementById(`tab-${n}`).classList.toggle('active', v === n);
  });
  if (v === 'list')  renderList();
  if (v === 'stats') renderStats();
}

// ─── App entry/init ──────────────────────────────────────────────

async function enterApp() {
  document.getElementById('auth-screen').classList.add('hidden');
  document.getElementById('main-app').classList.remove('hidden');
  document.getElementById('admin-btn').classList.remove('hidden');
  renderWeekLabel();
  renderGrid(true);
  updateTodayBtn();
  ui.showStatus('Cargando disponibilidad…', 'ok');
  try {
    const loaded = await api.loadBookings(authToken);
    bookings = loaded.bookings || {};
    mBlocked = loaded.mBlocked || {};
    ui.hideStatus();
    renderGrid();
  } catch (e) {
    ui.showStatus('Error al conectar: ' + e.message, 'err');
    renderGrid();
  }
}

// ─── Event listeners (DOMContentLoaded) ──────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
  // Entrar app
  document.getElementById('btn-enter-app')?.addEventListener('click', enterApp);

  // Navegación de semana y tabs
  document.getElementById('btn-prev-week')?.addEventListener('click', () => changeWeek(-1));
  document.getElementById('btn-next-week')?.addEventListener('click', () => changeWeek(1));
  document.getElementById('btn-today')?.addEventListener('click', goToday);
  
  document.getElementById('tab-grid')?.addEventListener('click', () => setView('grid'));
  document.getElementById('tab-list')?.addEventListener('click', () => setView('list'));
  document.getElementById('tab-stats')?.addEventListener('click', () => setView('stats'));

  // Exportar Excel: TODO, conecta cuando muevas función de export a un módulo
  
  // Modal cancel/reset
  document.getElementById('btn-close-modal')?.addEventListener('click', modal.closeModal);
  document.getElementById('modal')?.addEventListener('click', e => {
    if (e.target === document.getElementById('modal')) modal.closeModal();
  });

  // Confirm dialogs
  document.getElementById('confirm-cancel-btn')?.addEventListener('click', modal.closeConfirmDialog);
  document.getElementById('confirm-modal')?.addEventListener('click', e => {
    if (e.target === document.getElementById('confirm-modal')) modal.closeConfirmDialog();
  });

  // Cancelar modal
  document.getElementById('btn-close-cancel-modal')?.addEventListener('click', modal.closeCancelModal);
  document.getElementById('cancel-modal')?.addEventListener('click', e => {
    if (e.target === document.getElementById('cancel-modal')) modal.closeCancelModal();
  });
  
  // Init default view
  renderWeekLabel();
  renderGrid();
  updateTodayBtn();
});
