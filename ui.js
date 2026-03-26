// =============================================================================
// ui.js — VR Lab CEAM · portalvr.tech
// Renderizado de UI: cuadrícula, lista, estadísticas, barra de estado y toasts
// TODO: asegurarse de importar todos los helpers/módulos necesarios en app.js
// =============================================================================

/**
 * Limpieza de HTML para inserciones seguras.
 */
export const esc = s => String(s).replace(/[&<>"']/g, c =>
  ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":"&#39;" })[c]);

/**
 * Renderiza la cuadrícula semanal (vista principal de calendario).
 */
export function renderGrid({
  DAYS, ROWS, HOLIDAYS, TEACHING, SCHOOL_END, FDAYS,
  weekOff,
  isAdmin,
  currentView,
  role,
  bookings,
  mBlocked,
  getCellDate,
  fmtDate,
  slotKey,
  isToday,
  isPast,
  isPastSchoolEnd,
  openModal,
  doUnblock,
  doCancel,
  doBlock,
}) {
  const g = document.getElementById('grid');
  g.innerHTML = '';
  g.appendChild(document.createElement('div'));

  DAYS.forEach((d, di) => {
    const cd  = getCellDate(weekOff, di);
    const hol = HOLIDAYS.has(cd.toISOString().slice(0,10)), today = isToday(weekOff, di);
    const el  = document.createElement('div');
    el.className = 'col-head' + (today ? ' today' : '') + (hol ? ' holiday' : '');
    el.innerHTML = `<div>${d}</div><div class="col-date">${fmtDate(weekOff, di)}${hol ? ' ✕' : ''}</div>`;
    g.appendChild(el);
  });

  ROWS.forEach(row => {
    const lbl = document.createElement('div');
    if (row.type === 'recess') { lbl.className = 'r-label'; lbl.textContent = 'receso'; }
    else { lbl.className = 'p-label'; lbl.innerHTML = `${row.label}<span class="ptime">${row.time}</span>`; }
    g.appendChild(lbl);

    DAYS.forEach((_, di) => {
      const key  = slotKey(weekOff, di, row.label);
      const cd   = getCellDate(weekOff, di);
      const hol  = HOLIDAYS.has(cd.toISOString().slice(0,10));
      const cell = document.createElement('div');
      if (row.type === 'recess') { cell.className = 'slot slot-recess'; g.appendChild(cell); return; }
      const teaching = (TEACHING[di] || []).includes(row.label);
      const past     = isPast(weekOff, di, row.time);
      const pastEnd  = isPastSchoolEnd(weekOff, di);
      const booked   = bookings[key];
      const blocked  = mBlocked && mBlocked.hasOwnProperty(key);

      if (hol) {
        cell.className = 'slot slot-holiday';
        cell.title     = 'Día no hábil';
      } else if (teaching) {
        cell.className = 'slot slot-teaching';
        cell.innerHTML = `<span class="s-text">No disponible</span>`;
      } else if (blocked) {
        cell.className = 'slot slot-blocked' + (isAdmin ? ' admin' : '');
        cell.innerHTML = `<span class="s-text">Bloqueado</span>`;
        if (isAdmin && doUnblock) {
          cell.title = 'Clic para desbloquear';
          cell.addEventListener('click', () => doUnblock(key));
        }
      } else if (booked) {
        const b = booked;
        const canCancel = (role === 'coordinacion' || role === 'admin');
        cell.className = 'slot slot-booked' + (canCancel ? ' admin' : '');
        cell.innerHTML = `<span class="s-text">${esc(b.grupo)} · ${esc(b.materia)}</span><span class="s-sub">${esc(b.profesor)}</span>`;
        cell.title     = `${esc(b.profesor)} · ${esc(b.grupo)} · ${esc(b.materia)}${canCancel ? '\nClic para cancelar' : ''}`;
        if (canCancel && doCancel) cell.addEventListener('click', () => doCancel(key, b));
      } else if (past || pastEnd) {
        cell.className = 'slot slot-past';
        cell.innerHTML = `<span class="s-text" style="color:var(--gray-400);font-weight:400;font-size:10px">—</span>`;
        cell.title     = past ? 'Periodo pasado' : 'Fuera del ciclo escolar';
      } else {
        const canBook = (role === 'profesor' || role === 'coordinacion' || role === 'admin');
        cell.className = 'slot slot-free' + (canBook ? ' admin' : '');
        if (canBook && openModal) {
          cell.innerHTML = `<span style="font-size:18px;color:var(--gray-200)">+</span>`;
          cell.addEventListener('click', () => openModal(weekOff, di, row.label, row.time, key));
          if (isAdmin && doBlock) {
            cell.addEventListener('contextmenu', e => {
              e.preventDefault(); doBlock(key, weekOff, di, row.label, row.time);
            });
          }
        }
      }
      g.appendChild(cell);
    });
  });

  if (document.getElementById('admin-hint'))
    document.getElementById('admin-hint').classList.toggle('hidden', !role);
}

/**
 * Renderiza la lista de bookings.
 */
export function renderList({
  bookings, ROWS, FDAYS, currentView, role, doCancel
}) {
  const c = document.getElementById('list-card');
  const entries = Object.entries(bookings).sort((a, b) => {
    const [d1, p1] = a[0].split('_'), [d2, p2] = b[0].split('_');
    if (d1 !== d2) return d1 < d2 ? -1 : 1;
    return ROWS.findIndex(r => r.label === p1) - ROWS.findIndex(r => r.label === p2);
  });
  if (!entries.length) {
    c.innerHTML = '<p style="font-size:13px;color:var(--gray-400);padding:4px 0">No hay reservas registradas.</p>';
    return;
  }
  const canCancel = (role === 'coordinacion' || role === 'admin');
  c.innerHTML = entries.map(([key, b]) => `
    <div class="booking-row">
      <div style="flex:1;min-width:0">
        <div class="b-main">${esc(b.profesor)} <span style="font-weight:400;color:var(--gray-400)">· ${esc(b.grupo)} · ${esc(b.materia)}</span></div>
        <div class="b-meta">
          ${FDAYS[b.dIdx]}, ${b.dateDisplay ?? ''} · ${esc(b.pLabel)} (${esc(b.pTime)})<br>
          <span style="color:var(--gray-600)">${esc(b.actividad)}</span>
        </div>
      </div>
      <div class="b-actions">
        <span class="b-badge">Confirmada</span>
        ${canCancel && doCancel ? `<button class="btn btn-sm" data-key="${key}">Cancelar</button>` : ''}
      </div>
    </div>
  `).join('');
  if (canCancel && doCancel) {
    c.querySelectorAll('[data-key]').forEach(btn => {
      btn.addEventListener('click', () => doCancel(btn.dataset.key, bookings[btn.dataset.key]));
    });
  }
}

/**
 * Renderiza las estadísticas de uso.
 */
export function renderStats({
  getWeekBookings, getMonthBookings, getUsageRate, getTopTeachers, getBusiestDay,
  bookings, mBlocked, ROWS, FDAYS
}) {
  const thisWeek = getWeekBookings(bookings, 0).length;
  const lastWeek = getWeekBookings(bookings, -1).length;
  const delta    = thisWeek - lastWeek;
  const deltaHtml = delta === 0 ? '' : `<span class="stat-delta ${delta > 0 ? 'positive' : 'negative'}">${delta > 0 ? '+' : ''}${delta}</span>`;
  const thisMonth = getMonthBookings(bookings).length;
  const usage     = getUsageRate(bookings, mBlocked);
  const blocked   = Object.keys(mBlocked).length;
  const topTeachers = getTopTeachers(bookings, 5);
  const busiest   = getBusiestDay(bookings);

  const topHtml = topTeachers.length
    ? topTeachers.map(([name, count], i) => `
        <div class="stat-rank-row">
          <span class="stat-rank-pos">${i + 1}.</span>
          <span class="stat-rank-name">${esc(name)}</span>
          <span class="stat-rank-count">${count} reserva${count !== 1 ? 's' : ''}</span>
        </div>`).join('')
    : '<div style="font-size:13px;color:var(--gray-400)">Sin reservas este mes</div>';

  document.getElementById('stats-grid').innerHTML = `
    <div class="stat-card">
      <div class="stat-number">${thisWeek}${deltaHtml}</div>
      <div class="stat-label">Reservas esta semana</div>
      ${lastWeek > 0 || thisWeek > 0 ? `<div class="stat-hint">vs ${lastWeek} la semana pasada</div>` : ''}
    </div>
    <div class="stat-card">
      <div class="stat-number">${thisMonth}</div>
      <div class="stat-label">Reservas este mes</div>
    </div>
    <div class="stat-card">
      <div class="stat-number">${usage.rate}%</div>
      <div class="stat-label">Tasa de uso esta semana</div>
      <div class="stat-bar-wrap"><div class="stat-bar" style="width:${usage.rate}%"></div></div>
      <div class="stat-hint">${usage.booked} de ${usage.available} slots disponibles</div>
    </div>
    <div class="stat-card">
      <div class="stat-number">${blocked}</div>
      <div class="stat-label">Slots bloqueados</div>
    </div>
    <div class="stat-card stat-card-wide">
      <div class="stat-label" style="margin-bottom:10px">Top profesores este mes</div>
      <div class="stat-rank">${topHtml}</div>
    </div>
    <div class="stat-card">
      <div class="stat-number">${busiest.count > 0 ? busiest.day : '—'}</div>
      <div class="stat-label">Día más ocupado</div>
      ${busiest.count > 0 ? `<div class="stat-hint">${busiest.count} reserva${busiest.count !== 1 ? 's' : ''} en total</div>` : ''}
    </div>
  `;
}

/**
 * Renderiza la semana en el label superior.
 */
export function renderWeekLabel({ getMonday, weekOff }) {
  const m = getMonday(weekOff), f = new Date(m);
  f.setDate(m.getDate() + 4);
  document.getElementById('week-label').textContent =
    m.toLocaleDateString('es-MX', { day:'numeric', month:'short' }) + ' – ' +
    f.toLocaleDateString('es-MX', { day:'numeric', month:'short', year:'numeric' });
}

// Barra de estado y toasts
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