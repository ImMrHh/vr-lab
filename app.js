// =============================================================================
// app.js — VR Lab CEAM · portalvr.tech
// Punto de entrada. Sin onclick en HTML — todos los listeners aquí.
// =============================================================================

import {
  PROXY, AUTH_URL,
  DAYS, FDAYS, ROWS,
  TEACHING, HOLIDAYS, SCHOOL_END,
  ROLE_LABELS, ROLE_COLORS,
  TEACHER_DATA,
} from './config.js';

// ─── Estado global ────────────────────────────────────────────────────────────

let isAdmin    = false;
let weekOff    = 0;
let currentView = 'grid';
let pinVal     = '';
let bookings   = {};
let mBlocked   = {};
let pendingModal = null;
let role       = null;   // null | 'profesor' | 'coordinacion' | 'admin'
let authToken  = sessionStorage.getItem('vr-booking-token') || null;

// ─── Utilidades DOM ───────────────────────────────────────────────────────────

const esc = s => String(s).replace(/[&<>"']/g, c =>
  ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' })[c]);

function sanitizeField(str) {
  if (typeof str !== 'string') return '';
  return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;').replace(/'/g,'&#x27;').trim().slice(0, 500);
}

// ─── Utilidades de fecha ──────────────────────────────────────────────────────

const getMonday = off => {
  const n = new Date(), dy = n.getDay(), m = new Date(n);
  m.setDate(n.getDate() - dy + (dy === 0 ? -6 : 1) + off * 7);
  m.setHours(0, 0, 0, 0);
  return m;
};
const getCellDate = (w, d) => { const m = getMonday(w), dt = new Date(m); dt.setDate(dt.getDate() + d); return dt; };
const dStr    = d  => d.toISOString().slice(0, 10);
const fmtDate = (w, d) => getCellDate(w, d).toLocaleDateString('es-MX', { day:'numeric', month:'short' });
const slotKey = (w, d, p) => `${dStr(getCellDate(w, d))}_${p}`;
const isToday = (w, d) => { const dt = getCellDate(w, d), n = new Date(); n.setHours(0,0,0,0); return dt.getTime() === n.getTime(); };
const isPast  = (w, d, t) => {
  const dt = getCellDate(w, d), start = t.split('–')[0];
  dt.setHours(parseInt(start), parseInt(start.split(':')[1] || '0'), 0, 0);
  return dt < new Date();
};
const isPastSchoolEnd = (w, d) => getCellDate(w, d) > SCHOOL_END;

// ─── Toast / Status bar ───────────────────────────────────────────────────────

function showToast(msg, type = 'ok') {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.className = `toast toast-${type} show`;
  setTimeout(() => t.classList.remove('show'), 3000);
}
function showStatus(msg, type = 'ok') {
  const s = document.getElementById('status-bar');
  s.textContent = msg;
  s.className = `status-bar status-${type}`;
  s.classList.remove('hidden');
}
function hideStatus() { document.getElementById('status-bar').classList.add('hidden'); }

// ─── API helpers ──────────────────────────────────────────────────────────────

async function proxyGetUrl(url) {
  const r = await fetch(url, { method: 'GET' });
  const text = await r.text();
  try {
    const data = JSON.parse(text);
    return data.records ? data : { records: [] };
  } catch (e) { return { records: [] }; }
}

async function proxyPost(fields) {
  const r = await fetch(PROXY, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${authToken}` },
    body: JSON.stringify({ fields }),
  });
  const text = await r.text();
  try {
    const data = JSON.parse(text);
    if (data.id) return data;
    throw new Error(data.error?.message || 'Error al guardar');
  } catch (e) {
    if (e.message === 'Error al guardar') throw e;
    throw new Error('Respuesta inválida del servidor');
  }
}

async function proxyPatch(id, fields) {
  const r = await fetch(`${PROXY}?id=${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${authToken}` },
    body: JSON.stringify({ fields }),
  });
  const text = await r.text();
  try {
    const data = JSON.parse(text);
    if (data.error) throw new Error(data.error.message || 'Error en servidor');
    return data;
  } catch (e) {
    if (!(e instanceof SyntaxError)) throw e;
    throw new Error('Respuesta inválida del servidor');
  }
}

// ─── Carga de reservas ────────────────────────────────────────────────────────

async function loadBookings() {
  bookings = {}; mBlocked = {};
  let offset = '', all = [];
  do {
    const formula = encodeURIComponent("NOT({Status}='Cancelled')");
    const url = `${PROXY}?filterByFormula=${formula}&pageSize=100${offset ? '&offset=' + offset : ''}`;
    const raw  = await proxyGetUrl(url);
    const data = raw.records ? raw : (raw.$return_value || raw);
    all = [...all, ...(data.records || [])];
    offset = data.offset || '';
  } while (offset);

  for (const rec of all) {
    const f = rec.fields;
    if (!f.SlotKey && !(f.Fecha && f.Period)) continue;
    const key = f.Fecha && f.Period ? `${f.Fecha}_${f.Period}` : f.SlotKey;
    if (f.Status === 'Blocked') {
      mBlocked[key] = rec.id;
    } else if (f.Status === 'Confirmed') {
      bookings[key] = {
        id:          rec.id,
        profesor:    f.Profesor || '',
        grupo:       f.Grupo    || '',
        materia:     f.Materia  || '',
        actividad:   f.Actividad || '',
        aprendizaje: f['Aprendizaje esperado/producto'] || '',
        observaciones: f.Observaciones || '',
        pLabel: f.Period    || '',
        pTime:  f.Hora      || '',
        dIdx:   f.DayIndex  || 0,
        wOff:   f.WeekOffset || 0,
      };
    }
  }
}

async function saveBooking(key, data) {
  const cd = getCellDate(data.wOff, data.dIdx);
  const fields = {
    Profesor:    data.profesor,
    Grupo:       data.grupo,
    Materia:     data.materia,
    Fecha:       dStr(cd),
    Hora:        data.pTime,
    Actividad:   data.actividad,
    'Aprendizaje esperado/producto': data.aprendizaje,
    Observaciones: data.observaciones || '',
    Period:      data.pLabel,
    DayOfWeek:   FDAYS[data.dIdx],
    WeekOffset:  data.wOff,
    DayIndex:    data.dIdx,
    SlotKey:     key,
    Status:      'Confirmed',
    TipoSesion:  data.tipoSesion || 'Clase',
  };
  const resp = await proxyPost(fields);
  return resp.id;
}

async function cancelOnServer(id, reason) {
  const fields = { Status: 'Cancelled' };
  if (reason) fields.Observaciones = reason;
  await proxyPatch(id, fields);
}

async function checkConflict(key) {
  const safeKey = String(key).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
  const formula = encodeURIComponent(`AND({SlotKey}='${safeKey}', {Status}='Confirmed')`);
  const url  = `${PROXY}?filterByFormula=${formula}&pageSize=1`;
  const raw  = await proxyGetUrl(url);
  const data = raw.records ? raw : (raw.$return_value || raw);
  return (data.records || []).length > 0;
}

async function blockOnServer(key, wOff, dIdx, pLabel, pTime) {
  const cd = getCellDate(wOff, dIdx);
  const fields = {
    Profesor: 'Bloqueado', Grupo: '-', Materia: '-',
    Fecha: dStr(cd), Hora: pTime, Actividad: '-',
    'Aprendizaje esperado/producto': '-',
    Period: pLabel, DayOfWeek: FDAYS[dIdx],
    WeekOffset: wOff, DayIndex: dIdx, SlotKey: key, Status: 'Blocked',
  };
  const resp = await proxyPost(fields);
  return resp.id;
}

// ─── App entry ────────────────────────────────────────────────────────────────

async function enterApp() {
  document.getElementById('auth-screen').classList.add('hidden');
  document.getElementById('main-app').classList.remove('hidden');
  document.getElementById('admin-btn').classList.remove('hidden');
  renderWeekLabel(); renderGrid(true); updateTodayBtn();
  showStatus('Cargando disponibilidad…', 'ok');
  try { await loadBookings(); hideStatus(); renderGrid(); }
  catch (e) { showStatus('Error al conectar: ' + e.message, 'err'); renderGrid(); }
}

// ─── Semana ───────────────────────────────────────────────────────────────────

function renderWeekLabel() {
  const m = getMonday(weekOff), f = new Date(m);
  f.setDate(f.getDate() + 4);
  document.getElementById('week-label').textContent =
    m.toLocaleDateString('es-MX', { day:'numeric', month:'short' }) + ' – ' +
    f.toLocaleDateString('es-MX', { day:'numeric', month:'short', year:'numeric' });
}

async function changeWeek(dir) { weekOff += dir; renderWeekLabel(); renderGrid(); updateTodayBtn(); }

function goToday() {
  if (weekOff === 0) return;
  weekOff = 0;
  renderWeekLabel(); renderGrid(); updateTodayBtn();
}

function updateTodayBtn() {
  const btn = document.getElementById('btn-today');
  if (!btn) return;
  if (weekOff === 0) { btn.classList.add('at-today');    btn.title = 'Ya estás en la semana actual'; }
  else               { btn.classList.remove('at-today'); btn.title = 'Ir a la semana actual'; }
}

// ─── Grid ─────────────────────────────────────────────────────────────────────

function renderGrid(loading = false) {
  const g = document.getElementById('grid');
  g.innerHTML = '';
  g.appendChild(document.createElement('div'));

  DAYS.forEach((d, di) => {
    const cd  = getCellDate(weekOff, di);
    const hol = HOLIDAYS.has(dStr(cd)), today = isToday(weekOff, di);
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
      const hol  = HOLIDAYS.has(dStr(cd));
      const cell = document.createElement('div');

      if (row.type === 'recess') { cell.className = 'slot slot-recess'; g.appendChild(cell); return; }
      if (loading)               { cell.className = 'slot slot-loading'; g.appendChild(cell); return; }

      const teaching = (TEACHING[di] || []).includes(row.label);
      const past     = isPast(weekOff, di, row.time);
      const pastEnd  = isPastSchoolEnd(weekOff, di);
      const booked   = bookings[key];
      const blocked  = mBlocked.hasOwnProperty(key);

      if (hol) {
        cell.className = 'slot slot-holiday';
        cell.title     = 'Día no hábil';
      } else if (teaching) {
        cell.className = 'slot slot-teaching';
        cell.innerHTML = `<span class="s-text">No disponible</span>`;
      } else if (blocked) {
        cell.className = 'slot slot-blocked' + (isAdmin ? ' admin' : '');
        cell.innerHTML = `<span class="s-text">Bloqueado</span>`;
        if (isAdmin) { cell.title = 'Clic para desbloquear'; cell.addEventListener('click', () => doUnblock(key)); }
      } else if (booked) {
        const b = booked;
        const canCancel = (role === 'coordinacion' || role === 'admin');
        cell.className = 'slot slot-booked' + (canCancel ? ' admin' : '');
        cell.innerHTML = `<span class="s-text">${esc(b.grupo)} · ${esc(b.materia)}</span><span class="s-sub">${esc(b.profesor)}</span>`;
        cell.title     = `${esc(b.profesor)} · ${esc(b.grupo)} · ${esc(b.materia)}${canCancel ? '\nClic para cancelar' : ''}`;
        if (canCancel) cell.addEventListener('click', () => doCancel(key, b));
      } else if (past || pastEnd) {
        cell.className = 'slot slot-past';
        cell.innerHTML = `<span class="s-text" style="color:var(--gray-400);font-weight:400;font-size:10px">—</span>`;
        cell.title     = past ? 'Periodo pasado' : 'Fuera del ciclo escolar';
      } else {
        const canBook = (role === 'profesor' || role === 'coordinacion' || role === 'admin');
        cell.className = 'slot slot-free' + (canBook ? ' admin' : '');
        if (canBook) {
          cell.innerHTML = `<span style="font-size:18px;color:var(--gray-200)">+</span>`;
          cell.addEventListener('click', () => openModal(weekOff, di, row.label, row.time, key));
          if (isAdmin) {
            cell.addEventListener('contextmenu', e => { e.preventDefault(); doBlock(key, weekOff, di, row.label, row.time); });
          }
        }
      }
      g.appendChild(cell);
    });
  });

  document.getElementById('admin-hint').classList.toggle('hidden', !role);
}

// ─── Modal de reserva ─────────────────────────────────────────────────────────

function openModal(wOff, dIdx, pLabel, pTime, key) {
  pendingModal = { wOff, dIdx, pLabel, pTime, key };
  document.getElementById('modal-title').textContent = `Reservar ${pLabel}`;
  document.getElementById('modal-sub').textContent   = `${FDAYS[dIdx]}, ${fmtDate(wOff, dIdx)} · ${pTime}`;
  document.getElementById('f-actividad').value    = '';
  document.getElementById('f-aprendizaje').value  = '';
  document.getElementById('f-observaciones').value = '';
  hideAdminExtras();
  populateTeachers();
  document.getElementById('f-grupo-row').classList.remove('hidden');
  document.getElementById('f-materia').innerHTML = '<option value="">Seleccionar materia…</option>';
  document.getElementById('f-profesor').value    = '';
  document.getElementById('f-materia').disabled  = true;
  document.getElementById('f-grupo').disabled    = true;
  document.getElementById('modal').classList.remove('hidden');
  setTimeout(() => document.getElementById('f-profesor').focus(), 50);
}

function closeModal() { document.getElementById('modal').classList.add('hidden'); pendingModal = null; }

function populateTeachers() {
  const sel = document.getElementById('f-profesor');
  sel.innerHTML = '<option value="">Seleccionar profesor…</option>';
  Object.keys(TEACHER_DATA).sort().forEach(name => {
    const opt = document.createElement('option');
    opt.value = name; opt.textContent = name;
    sel.appendChild(opt);
  });
}

function onTeacherChange() {
  const teacher = document.getElementById('f-profesor').value;
  const matSel  = document.getElementById('f-materia');
  restoreGrupoDropdown();
  hideAdminExtras();
  const grpSel  = document.getElementById('f-grupo');
  matSel.innerHTML = '<option value="">Seleccionar materia…</option>';
  grpSel.innerHTML = '<option value="">Seleccionar grupo…</option>';
  grpSel.disabled  = true;
  if (!teacher || !TEACHER_DATA[teacher]) { matSel.disabled = true; return; }
  const subjects = Object.keys(TEACHER_DATA[teacher].subjects);
  matSel.disabled = false;
  subjects.forEach(sub => {
    const opt = document.createElement('option');
    opt.value = sub; opt.textContent = sub;
    matSel.appendChild(opt);
  });
  if (subjects.length === 1) { matSel.value = subjects[0]; onSubjectChange(); }
}

function onSubjectChange() {
  const teacher  = document.getElementById('f-profesor').value;
  const subject  = document.getElementById('f-materia').value;
  const grpRow   = document.getElementById('f-grupo-row');
  restoreGrupoDropdown();
  const grpSel = document.getElementById('f-grupo');
  hideAdminExtras();

  if (subject === 'Admin') {
    grpRow.classList.add('hidden');
    grpSel.innerHTML = '<option value="-">-</option>';
    grpSel.value     = '-';
    grpSel.disabled  = false;
    showAdminExtras();
    return;
  }

  if (subject === 'Demo') {
    grpRow.classList.remove('hidden');
    const label = grpRow.querySelector('label');
    label.innerHTML = 'Escuela visitante <span class="req">*</span>';
    grpRow.innerHTML = '';
    grpRow.appendChild(label);
    const inp = document.createElement('input');
    inp.type = 'text'; inp.id = 'f-grupo-demo';
    inp.placeholder = 'Nombre de la escuela visitante…';
    inp.style.cssText = 'width:100%;padding:8px 12px;border:1px solid var(--gray-200);border-radius:8px;font-size:14px;font-family:inherit;background:var(--bg-card);color:var(--text-primary);box-sizing:border-box';
    grpRow.appendChild(inp);
    setTimeout(() => inp.focus(), 50);
    return;
  }

  grpRow.classList.remove('hidden');
  grpSel.innerHTML = '<option value="">Seleccionar grupo…</option>';
  if (!teacher || !subject || !TEACHER_DATA[teacher]?.subjects[subject]) { grpSel.disabled = true; return; }
  const groups = TEACHER_DATA[teacher].subjects[subject];
  grpSel.disabled = false;
  groups.forEach(grp => {
    const opt = document.createElement('option');
    opt.value = grp; opt.textContent = grp;
    grpSel.appendChild(opt);
  });
  if (groups.length === 1) grpSel.value = groups[0];
}

function restoreGrupoDropdown() {
  const grpRow = document.getElementById('f-grupo-row');
  if (document.getElementById('f-grupo')) return;
  grpRow.innerHTML = `
    <label>Grupo <span class="req">*</span></label>
    <select id="f-grupo" disabled>
      <option value="">Seleccionar grupo…</option>
    </select>`;
}

function showAdminExtras() {
  document.getElementById('admin-session-row').classList.remove('hidden');
  onAdminTypeChange();
}

function hideAdminExtras() {
  document.getElementById('admin-session-row')?.classList.add('hidden');
  document.getElementById('admin-guest-row')?.classList.add('hidden');
  const grpRow = document.getElementById('f-grupo-row');
  const label  = grpRow?.querySelector('label');
  if (label) label.innerHTML = 'Grupo <span class="req">*</span>';
  restoreGrupoDropdown();
}

function onAdminTypeChange() {
  const type     = document.getElementById('f-admin-type').value;
  const guestRow = document.getElementById('admin-guest-row');
  if (type === 'Planeación') {
    guestRow.classList.remove('hidden');
    const guestSel = document.getElementById('f-admin-guest');
    guestSel.innerHTML = '<option value="">Seleccionar profesor…</option>';
    Object.keys(TEACHER_DATA).sort().forEach(name => {
      if (name === 'Henrik') return;
      const opt = document.createElement('option');
      opt.value = name; opt.textContent = name;
      guestSel.appendChild(opt);
    });
  } else {
    guestRow.classList.add('hidden');
  }
}

async function confirmBooking() {
  const subject = document.getElementById('f-materia').value.trim();
  let grupo = '';
  if (subject === 'Demo') {
    grupo = document.getElementById('f-grupo-demo')?.value.trim() || '';
  } else if (subject === 'Admin') {
    grupo = '-';
  } else {
    grupo = document.getElementById('f-grupo').value.trim();
  }

  let tipoSesion = 'Clase', actividadOverride = null;
  if (subject === 'Demo') {
    tipoSesion = 'Demo';
  } else if (subject === 'Admin') {
    const adminType = document.getElementById('f-admin-type')?.value || 'Mantenimiento';
    if (adminType === 'Planeación') {
      tipoSesion = 'Planeación';
      const guestProf = document.getElementById('f-admin-guest')?.value || '';
      actividadOverride = guestProf ? `Planeación con ${guestProf}` : 'Planeación';
    } else {
      tipoSesion = 'Admin';
    }
  }

  const vals = {
    profesor:     sanitizeField(document.getElementById('f-profesor').value),
    grupo:        sanitizeField(grupo),
    materia:      sanitizeField(subject),
    actividad:    sanitizeField(actividadOverride || document.getElementById('f-actividad').value),
    aprendizaje:  sanitizeField(document.getElementById('f-aprendizaje').value),
    observaciones: sanitizeField(document.getElementById('f-observaciones').value),
    tipoSesion,
  };

  const required = ['profesor', 'materia', 'aprendizaje'];
  if (subject !== 'Admin') required.push('grupo');
  if (!actividadOverride) required.push('actividad');
  if (tipoSesion === 'Planeación') {
    const guest = document.getElementById('f-admin-guest')?.value || '';
    if (!guest) { showToast('Selecciona el profesor invitado', 'err'); return; }
  }
  if (required.some(k => !vals[k])) { showToast('Por favor llena todos los campos requeridos', 'err'); return; }

  const btn = document.getElementById('confirm-btn');
  btn.disabled = true; btn.innerHTML = '<span class="spinner"></span> Guardando…';
  try {
    const conflict = await checkConflict(pendingModal.key);
    if (conflict) {
      showToast('⚠️ Este periodo ya fue reservado por otro usuario', 'err');
      await loadBookings(); renderGrid();
      btn.disabled = false; btn.textContent = 'Confirmar reserva';
      closeModal(); return;
    }
    const itemId = await saveBooking(pendingModal.key, { ...vals, ...pendingModal });
    bookings[pendingModal.key] = { ...vals, ...pendingModal, id: itemId };
    closeModal(); renderGrid();
    if (currentView === 'list') renderList();
    const label = subject === 'Demo' ? `Demo — ${vals.grupo}` : subject === 'Admin' ? `Admin (${tipoSesion})` : `${vals.grupo} · ${vals.materia}`;
    showToast(`¡Reservado! ${vals.profesor} — ${label}`);
  } catch (e) { showToast('Error al guardar: ' + e.message, 'err'); }
  finally { btn.disabled = false; btn.textContent = 'Confirmar reserva'; }
}

// ─── Cancelar / Bloquear / Desbloquear ────────────────────────────────────────

async function doCancel(key, b) {
  document.getElementById('cancel-modal-title').textContent = '¿Cancelar reserva?';
  document.getElementById('cancel-modal-info').innerHTML =
    `<strong>${esc(b.profesor)}</strong> — ${esc(b.grupo)} · ${esc(b.materia)}<br>${FDAYS[b.dIdx]}, ${fmtDate(b.wOff, b.dIdx)} · ${esc(b.pLabel)} (${esc(b.pTime)})`;
  document.getElementById('cancel-reason').value = '';
  document.getElementById('cancel-modal').classList.remove('hidden');

  document.getElementById('cancel-confirm-btn').onclick = async () => {
    const reason = document.getElementById('cancel-reason').value.trim();
    if (!reason) { showToast('Por favor ingresa un motivo de cancelación', 'err'); return; }
    const obs = b.observaciones ? `${b.observaciones} | [Cancelado: ${reason}]` : `[Cancelado: ${reason}]`;
    try {
      if (b.id) await cancelOnServer(b.id, obs);
      delete bookings[key]; renderGrid();
      if (currentView === 'list') renderList();
      showToast('Reserva cancelada');
    } catch (e) { showToast('Error: ' + e.message, 'err'); }
    document.getElementById('cancel-modal').classList.add('hidden');
  };
}

async function doUnblock(key) {
  showConfirmDialog('¿Desbloquear slot?', 'Este slot quedará disponible para reservas.', 'Desbloquear', 'primary', async () => {
    try {
      if (mBlocked[key]) await cancelOnServer(mBlocked[key]);
      delete mBlocked[key]; renderGrid(); showToast('Slot desbloqueado');
    } catch (e) { showToast('Error: ' + e.message, 'err'); }
  });
}

async function doBlock(key, wOff, dIdx, pLabel, pTime) {
  showConfirmDialog(`¿Bloquear slot?`, `${pLabel} · ${FDAYS[dIdx]}, ${fmtDate(wOff, dIdx)}`, 'Bloquear', 'danger', async () => {
    try {
      const conflict = await checkConflict(key);
      if (conflict) { showToast('⚠️ Este periodo ya fue reservado por otro usuario', 'err'); await loadBookings(); renderGrid(); return; }
      const id = await blockOnServer(key, wOff, dIdx, pLabel, pTime);
      mBlocked[key] = id; renderGrid(); showToast('Slot bloqueado');
    } catch (e) { showToast('Error: ' + e.message, 'err'); }
  });
}

// ─── Vista lista ──────────────────────────────────────────────────────────────

function renderList() {
  const c = document.getElementById('list-card');
  const entries = Object.entries(bookings).sort((a, b) => {
    const [d1, p1] = a[0].split('_'), [d2, p2] = b[0].split('_');
    if (d1 !== d2) return d1 < d2 ? -1 : 1;
    return ROWS.findIndex(r => r.label === p1) - ROWS.findIndex(r => r.label === p2);
  });
  if (!entries.length) { c.innerHTML = '<p style="font-size:13px;color:var(--gray-400);padding:4px 0">No hay reservas registradas.</p>'; return; }
  const canCancel = (role === 'coordinacion' || role === 'admin');
  c.innerHTML = entries.map(([key, b]) => `
    <div class="booking-row">
      <div style="flex:1;min-width:0">
        <div class="b-main">${esc(b.profesor)} <span style="font-weight:400;color:var(--gray-400)">· ${esc(b.grupo)} · ${esc(b.materia)}</span></div>
        <div class="b-meta">
          ${FDAYS[b.dIdx]}, ${fmtDate(b.wOff, b.dIdx)} · ${esc(b.pLabel)} (${esc(b.pTime)})<br>
          <span style="color:var(--gray-600)">${esc(b.actividad)}</span>
        </div>
      </div>
      <div class="b-actions">
        <span class="b-badge">Confirmada</span>
        ${canCancel ? `<button class="btn btn-sm" data-key="${key}">Cancelar</button>` : ''}
      </div>
    </div>`).join('');
  c.querySelectorAll('[data-key]').forEach(btn => {
    btn.addEventListener('click', () => doCancel(btn.dataset.key, bookings[btn.dataset.key]));
  });
}

// ─── Vista estadísticas ───────────────────────────────────────────────────────

function setView(v) {
  currentView = v;
  ['grid', 'list', 'stats'].forEach(n => {
    document.getElementById(`view-${n}`).classList.toggle('hidden', v !== n);
    document.getElementById(`tab-${n}`).classList.toggle('active', v === n);
  });
  if (v === 'list')  renderList();
  if (v === 'stats') renderStats();
}

function getWeekBookings(weekOffset) {
  const mon = getMonday(weekOffset), fri = new Date(mon);
  fri.setDate(mon.getDate() + 4);
  return Object.entries(bookings)
    .filter(([key]) => { const d = key.split('_')[0]; return d >= dStr(mon) && d <= dStr(fri); })
    .map(([, b]) => b);
}

function getMonthBookings() {
  const now = new Date();
  const prefix = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  return Object.entries(bookings).filter(([key]) => key.split('_')[0].startsWith(prefix)).map(([, b]) => b);
}

function getUsageRate() {
  const mon = getMonday(0), periods = ROWS.filter(r => r.type === 'period');
  let available = 0, booked = 0;
  for (let d = 0; d < 5; d++) {
    const dt = new Date(mon); dt.setDate(mon.getDate() + d);
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

function getTopTeachers(n) {
  const counts = {};
  getMonthBookings().forEach(b => { if (b.profesor) counts[b.profesor] = (counts[b.profesor] || 0) + 1; });
  return Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, n);
}

function getBusiestDay() {
  const counts = [0, 0, 0, 0, 0];
  Object.keys(bookings).forEach(key => { const dow = new Date(key.split('_')[0]).getDay(); if (dow >= 1 && dow <= 5) counts[dow - 1]++; });
  const max = Math.max(...counts), idx = counts.indexOf(max);
  return { day: FDAYS[idx], count: max };
}

function renderStats() {
  const thisWeek = getWeekBookings(0).length, lastWeek = getWeekBookings(-1).length;
  const delta    = thisWeek - lastWeek;
  const deltaHtml = delta === 0 ? '' : `<span class="stat-delta ${delta > 0 ? 'positive' : 'negative'}">${delta > 0 ? '+' : ''}${delta}</span>`;
  const thisMonth = getMonthBookings().length;
  const usage     = getUsageRate();
  const blocked   = Object.keys(mBlocked).length;
  const topTeachers = getTopTeachers(5);
  const busiest   = getBusiestDay();

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
    </div>`;
}

// ─── PIN / Auth ───────────────────────────────────────────────────────────────

function showPin() {
  pinVal = ''; document.getElementById('pin-error').textContent = ''; updateDots();
  document.getElementById('pin-screen').classList.remove('hidden');
  document.getElementById('main-app').classList.add('hidden');
}

function hidePinScreen() {
  document.getElementById('pin-screen').classList.add('hidden');
  document.getElementById('main-app').classList.remove('hidden');
}

function updateDots() {
  for (let i = 0; i < 4; i++)
    document.getElementById('d' + i).className = 'pin-dot' + (i < pinVal.length ? ' filled' : '');
}

function pinPress(v) {
  if (v === 'del') { pinVal = pinVal.slice(0, -1); document.getElementById('pin-error').textContent = ''; updateDots(); return; }
  if (pinVal.length >= 4) return;
  pinVal += v; updateDots();
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
      enterRole(role);
    } else {
      const dots = document.getElementById('pin-dots');
      dots.classList.add('shake');
      for (let i = 0; i < 4; i++) document.getElementById('d' + i).className = 'pin-dot error';
      document.getElementById('pin-error').textContent = data.error || 'PIN incorrecto';
      setTimeout(() => { dots.classList.remove('shake'); pinVal = ''; updateDots(); }, 500);
    }
  } catch (e) {
    document.getElementById('pin-error').textContent = 'Error de conexión';
    setTimeout(() => { pinVal = ''; updateDots(); }, 500);
  } finally {
    document.querySelectorAll('.pin-key').forEach(k => k.disabled = false);
  }
}

function enterRole(r) {
  isAdmin = (r === 'admin'); role = r;
  hidePinScreen();
  const badge = document.getElementById('admin-badge');
  badge.textContent = ROLE_LABELS[r] || r;
  badge.style.background = ROLE_COLORS[r] || '#1e40af';
  badge.classList.remove('hidden');
  document.getElementById('exit-admin-btn').classList.remove('hidden');
  document.getElementById('admin-btn').classList.add('hidden');
  document.getElementById('view-tabs').classList.remove('hidden');
  renderGrid();
}

function exitRole() {
  try { fetch(`${AUTH_URL}/logout`, { method: 'POST', headers: { Authorization: `Bearer ${authToken}` } }); } catch (e) {}
  sessionStorage.removeItem('vr-booking-token');
  sessionStorage.removeItem('vr-booking-role');
  authToken = null; role = null; isAdmin = false;
  document.getElementById('admin-badge').classList.add('hidden');
  document.getElementById('exit-admin-btn').classList.add('hidden');
  document.getElementById('admin-btn').classList.remove('hidden');
  document.getElementById('view-tabs').classList.add('hidden');
  setView('grid'); renderGrid();
}

// ─── CSV export ───────────────────────────────────────────────────────────────

function exportCSV() {
  const entries = Object.entries(bookings).sort((a, b) => {
    const [d1, p1] = a[0].split('_'), [d2, p2] = b[0].split('_');
    if (d1 !== d2) return d1 < d2 ? -1 : 1;
    return ROWS.findIndex(r => r.label === p1) - ROWS.findIndex(r => r.label === p2);
  });
  if (!entries.length) { showToast('No hay reservas para exportar', 'err'); return; }
  const headers = ['GRUPO','MATERIA','FECHA','HORA','Actividad','PROFESOR','Aprendizaje esperado/producto','Observaciones'];
  const rows = entries.map(([, b]) => {
    const cd = getCellDate(b.wOff, b.dIdx);
    const fecha = cd.toLocaleDateString('es-MX', { day:'2-digit', month:'2-digit', year:'numeric' });
    return [b.grupo, b.materia, fecha, b.pTime.split('–')[0].trim(), b.actividad, b.profesor, b.aprendizaje, b.observaciones || '']
      .map(v => { const s = String(v ?? ''); const safe = (['+','-','=','@','\t','\r'].includes(s[0])) ? `'${s}` : s; return '"' + safe.replace(/"/g, '""') + '"'; }).join(',');
  });
  const csv  = [headers.join(',')].concat(rows).join('\n');
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url;
  a.download = 'VRLab_Reservas_' + new Date().toLocaleDateString('es-MX', { day:'2-digit', month:'2-digit', year:'numeric' }).split('/').join('-') + '.csv';
  a.click();
  URL.revokeObjectURL(url);
  showToast('CSV exportado correctamente');
}

// ─── Confirm dialog ───────────────────────────────────────────────────────────

let _confirmCallback = null;

function showConfirmDialog(title, message, actionText, actionClass, onConfirm) {
  _confirmCallback = onConfirm;
  document.getElementById('confirm-title').textContent   = title;
  document.getElementById('confirm-message').innerHTML   = message;
  const btn = document.getElementById('confirm-action-btn');
  btn.textContent = actionText;
  btn.className   = 'btn ' + (actionClass === 'danger' ? 'btn-danger' : 'btn-primary');
  btn.onclick     = () => { closeConfirmDialog(); if (_confirmCallback) _confirmCallback(); };
  document.getElementById('confirm-modal').classList.remove('hidden');
}

function closeConfirmDialog() {
  document.getElementById('confirm-modal').classList.add('hidden');
  _confirmCallback = null;
}

function closeCancelModal() {
  document.getElementById('cancel-modal').classList.add('hidden');
  document.getElementById('cancel-reason').value = '';
  document.getElementById('cancel-confirm-btn').onclick = null;
}

// ─── Tema ─────────────────────────────────────────────────────────────────────

function toggleTheme() {
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

// ─── Keyboard ─────────────────────────────────────────────────────────────────

document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    if (!document.getElementById('confirm-modal').classList.contains('hidden')) { closeConfirmDialog(); return; }
    if (!document.getElementById('cancel-modal').classList.contains('hidden'))  { closeCancelModal();   return; }
    if (!document.getElementById('modal').classList.contains('hidden'))         { closeModal();         return; }
    if (!document.getElementById('pin-screen').classList.contains('hidden'))    { hidePinScreen();      return; }
  }
  if (e.key === 'Enter') {
    if (!document.getElementById('confirm-modal').classList.contains('hidden')) { document.getElementById('confirm-action-btn').click(); return; }
  }
  if (document.getElementById('pin-screen').classList.contains('hidden')) return;
  if (e.key >= '0' && e.key <= '9') pinPress(e.key);
  else if (e.key === 'Backspace')   pinPress('del');
});

// ─── Online / Offline ─────────────────────────────────────────────────────────

window.addEventListener('offline', () => showToast('Sin conexión — modo offline', 'err'));
window.addEventListener('online',  () => showToast('Conexión restaurada'));

// ─── Init — registrar todos los listeners del HTML ────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
  // Tema
  const themeBtn = document.getElementById('theme-toggle');
  if (themeBtn) {
    themeBtn.addEventListener('click', toggleTheme);
    if (document.documentElement.getAttribute('data-theme') === 'dark') themeBtn.textContent = '☀️';
  }

  // Auth screen
  document.getElementById('btn-enter-app')?.addEventListener('click', enterApp);

  // PIN screen — teclado numérico via data-pin
  document.querySelectorAll('.pin-key[data-pin]').forEach(btn => {
    btn.addEventListener('click', () => pinPress(btn.dataset.pin));
  });
  document.getElementById('btn-cancel-pin')?.addEventListener('click', hidePinScreen);

  // Top bar
  document.getElementById('admin-btn')    ?.addEventListener('click', showPin);
  document.getElementById('exit-admin-btn')?.addEventListener('click', exitRole);

  // Navegación de semana
  document.getElementById('btn-prev-week')?.addEventListener('click', () => changeWeek(-1));
  document.getElementById('btn-next-week')?.addEventListener('click', () => changeWeek(1));
  document.getElementById('btn-today')    ?.addEventListener('click', goToday);

  // Tabs
  document.getElementById('tab-grid')  ?.addEventListener('click', () => setView('grid'));
  document.getElementById('tab-list')  ?.addEventListener('click', () => setView('list'));
  document.getElementById('tab-stats') ?.addEventListener('click', () => setView('stats'));
  document.getElementById('tab-export')?.addEventListener('click', exportCSV);

  // Modal de reserva
  document.getElementById('f-profesor')  ?.addEventListener('change', onTeacherChange);
  document.getElementById('f-materia')   ?.addEventListener('change', onSubjectChange);
  document.getElementById('f-admin-type')?.addEventListener('change', onAdminTypeChange);
  document.getElementById('confirm-btn') ?.addEventListener('click', confirmBooking);
  document.getElementById('btn-close-modal')?.addEventListener('click', closeModal);
  document.getElementById('modal')?.addEventListener('click', e => { if (e.target === document.getElementById('modal')) closeModal(); });

  // Confirm dialog
  document.getElementById('confirm-cancel-btn')?.addEventListener('click', closeConfirmDialog);
  document.getElementById('confirm-modal')?.addEventListener('click', e => { if (e.target === document.getElementById('confirm-modal')) closeConfirmDialog(); });

  // Cancel modal
  document.getElementById('btn-close-cancel-modal')?.addEventListener('click', closeCancelModal);
  document.getElementById('cancel-modal')?.addEventListener('click', e => { if (e.target === document.getElementById('cancel-modal')) closeCancelModal(); });
});

// ─── Restore session ──────────────────────────────────────────────────────────

(async () => {
  if (authToken) {
    try {
      const r = await fetch(`${AUTH_URL}/auth/check`, { headers: { Authorization: `Bearer ${authToken}` } });
      const d = await r.json();
      if (d.valid && d.role) {
        role = d.role;
        sessionStorage.setItem('vr-booking-role', role);
        enterRole(role);
        return;
      }
    } catch (e) {}
    sessionStorage.removeItem('vr-booking-token');
    sessionStorage.removeItem('vr-booking-role');
    authToken = null; role = null;
  }
})();
