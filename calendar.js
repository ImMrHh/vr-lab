// =============================================================================
// calendar.js — VR Lab CEAM · portalvr.tech
// Lógica pura de fechas, semanas y slots. Sin efectos secundarios en el DOM.
// =============================================================================

import { ROWS, FDAYS, TEACHING, HOLIDAYS, SCHOOL_END } from './config.js';

// ─── Semana ───────────────────────────────────────────────────────────────────

/**
 * Devuelve el lunes de la semana actual + offset de semanas.
 * @param {number} off — 0 = esta semana, -1 = anterior, 1 = siguiente
 * @returns {Date}
 */
export function getMonday(off) {
  const n = new Date(), dy = n.getDay();
  const m = new Date(n);
  m.setDate(n.getDate() - dy + (dy === 0 ? -6 : 1) + off * 7);
  m.setHours(0, 0, 0, 0);
  return m;
}

/**
 * Devuelve la fecha de una celda dada semana (offset) y día (0=Lun…4=Vie).
 * @param {number} weekOff
 * @param {number} dayIdx
 * @returns {Date}
 */
export function getCellDate(weekOff, dayIdx) {
  const m  = getMonday(weekOff);
  const dt = new Date(m);
  dt.setDate(dt.getDate() + dayIdx);
  return dt;
}

// ─── Formateo de fechas ───────────────────────────────────────────────────────

/**
 * Formato ISO: "YYYY-MM-DD"
 * @param {Date} d
 * @returns {string}
 */
export const dStr = d => d.toISOString().slice(0, 10);

/**
 * Formato legible para encabezado de columna: "3 abr"
 * @param {number} weekOff
 * @param {number} dayIdx
 * @returns {string}
 */
export const fmtDate = (weekOff, dayIdx) =>
  getCellDate(weekOff, dayIdx).toLocaleDateString('es-MX', { day: 'numeric', month: 'short' });

/**
 * Etiqueta de rango semanal: "31 mar – 4 abr 2026"
 * @param {number} weekOff
 * @returns {string}
 */
export function fmtWeekRange(weekOff) {
  const m = getMonday(weekOff);
  const f = new Date(m);
  f.setDate(f.getDate() + 4);
  return (
    m.toLocaleDateString('es-MX', { day: 'numeric', month: 'short' }) +
    ' – ' +
    f.toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' })
  );
}

// ─── Slot key ─────────────────────────────────────────────────────────────────

/**
 * Clave única de un slot: "2026-04-03_P2"
 * @param {number} weekOff
 * @param {number} dayIdx
 * @param {string} periodLabel — "P1"…"P8"
 * @returns {string}
 */
export const slotKey = (weekOff, dayIdx, periodLabel) =>
  `${dStr(getCellDate(weekOff, dayIdx))}_${periodLabel}`;

// ─── Estado de celdas ─────────────────────────────────────────────────────────

/**
 * ¿La celda corresponde al día de hoy?
 * @param {number} weekOff
 * @param {number} dayIdx
 * @returns {boolean}
 */
export function isToday(weekOff, dayIdx) {
  const dt = getCellDate(weekOff, dayIdx);
  const n  = new Date();
  n.setHours(0, 0, 0, 0);
  return dt.getTime() === n.getTime();
}

/**
 * ¿El periodo ya pasó (hora de inicio < ahora)?
 * @param {number} weekOff
 * @param {number} dayIdx
 * @param {string} timeRange — "7:20–8:10"
 * @returns {boolean}
 */
export function isPast(weekOff, dayIdx, timeRange) {
  const dt    = getCellDate(weekOff, dayIdx);
  const start = timeRange.split('–')[0];
  dt.setHours(parseInt(start), parseInt(start.split(':')[1] || '0'), 0, 0);
  return dt < new Date();
}

/**
 * ¿La celda está más allá del fin del ciclo escolar?
 * @param {number} weekOff
 * @param {number} dayIdx
 * @returns {boolean}
 */
export const isPastSchoolEnd = (weekOff, dayIdx) =>
  getCellDate(weekOff, dayIdx) > SCHOOL_END;

/**
 * ¿La celda cae en día no hábil (festivo o vacación)?
 * @param {number} weekOff
 * @param {number} dayIdx
 * @returns {boolean}
 */
export const isHoliday = (weekOff, dayIdx) =>
  HOLIDAYS.has(dStr(getCellDate(weekOff, dayIdx)));

/**
 * ¿El periodo está ocupado por clase de Henrik?
 * @param {number} dayIdx  — 0=Lun…4=Vie
 * @param {string} periodLabel — "P1"…"P8"
 * @returns {boolean}
 */
export const isTeaching = (dayIdx, periodLabel) =>
  (TEACHING[dayIdx] || []).includes(periodLabel);

// ─── Estadísticas de uso ──────────────────────────────────────────────────────

/**
 * Devuelve bookings de la semana indicada.
 * @param {Object} bookings — mapa slotKey → booking
 * @param {number} weekOffset
 * @returns {Array}
 */
export function getWeekBookings(bookings, weekOffset) {
  const mon = getMonday(weekOffset);
  const fri = new Date(mon);
  fri.setDate(mon.getDate() + 4);
  const monStr = dStr(mon), friStr = dStr(fri);
  return Object.entries(bookings)
    .filter(([key]) => { const d = key.split('_')[0]; return d >= monStr && d <= friStr; })
    .map(([, b]) => b);
}

/**
 * Devuelve bookings del mes actual.
 * @param {Object} bookings
 * @returns {Array}
 */
export function getMonthBookings(bookings) {
  const now    = new Date();
  const prefix = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  return Object.entries(bookings)
    .filter(([key]) => key.split('_')[0].startsWith(prefix))
    .map(([, b]) => b);
}

/**
 * Calcula tasa de uso de la semana actual.
 * @param {Object} bookings
 * @param {Object} mBlocked
 * @returns {{ available: number, booked: number, rate: number }}
 */
export function getUsageRate(bookings, mBlocked) {
  const mon     = getMonday(0);
  const periods = ROWS.filter(r => r.type === 'period');
  let available = 0, booked = 0;

  for (let d = 0; d < 5; d++) {
    const dt = new Date(mon);
    dt.setDate(mon.getDate() + d);
    const ds = dStr(dt);
    if (HOLIDAYS.has(ds) || dt > SCHOOL_END) continue;
    for (const row of periods) {
      if ((TEACHING[d] || []).includes(row.label)) continue;
      const key = `${ds}_${row.label}`;
      if (mBlocked[key]) continue;
      available++;
      if (bookings[key]) booked++;
    }
  }
  return { available, booked, rate: available > 0 ? Math.round(booked / available * 100) : 0 };
}

/**
 * Top N profesores por número de reservas en el mes.
 * @param {Object} bookings
 * @param {number} n
 * @returns {Array<[string, number]>}
 */
export function getTopTeachers(bookings, n) {
  const counts = {};
  getMonthBookings(bookings).forEach(b => {
    if (b.profesor) counts[b.profesor] = (counts[b.profesor] || 0) + 1;
  });
  return Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, n);
}

/**
 * Día de la semana con más reservas acumuladas.
 * @param {Object} bookings
 * @returns {{ day: string, count: number }}
 */
export function getBusiestDay(bookings) {
  const counts = [0, 0, 0, 0, 0];
  Object.keys(bookings).forEach(key => {
    const dow = new Date(key.split('_')[0]).getDay();
    if (dow >= 1 && dow <= 5) counts[dow - 1]++;
  });
  const max = Math.max(...counts);
  const idx = counts.indexOf(max);
  return { day: FDAYS[idx], count: max };
}
