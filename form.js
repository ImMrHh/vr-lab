// =============================================================================
// form.js — VR Lab CEAM · portalvr.tech
// Lógica del formulario de reserva: dropdowns, validación, confirmBooking.
// =============================================================================

import { TEACHER_DATA, FDAYS } from './config.js';
import { showToast } from './ui.js';

function sanitizeField(str) {
  if (typeof str !== 'string') return '';
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#x27;').trim().slice(0, 500);
}

// ─── Poblar dropdown de profesores ───────────────────────────────────────────

export function populateTeachers() {
  const sel = document.getElementById('f-profesor');
  sel.innerHTML = '<option value="">Seleccionar profesor…</option>';
  Object.keys(TEACHER_DATA).sort().forEach(name => {
    const opt = document.createElement('option');
    opt.value = name; opt.textContent = name;
    sel.appendChild(opt);
  });
  sel.onchange = onTeacherChange;
 
  // Pre-llenar y bloquear si hay usuario MSAL activo
  // Importar getMSALUser desde auth.js:
  //   import { getMSALUser } from './auth.js';  ← agregar al import de form.js
  const msalUser = getMSALUser();
  if (msalUser) {
    // Buscar nombre en TEACHER_DATA (coincidencia parcial por primer nombre)
    const match = Object.keys(TEACHER_DATA).find(name =>
      msalUser.name.toLowerCase().includes(name.toLowerCase()) ||
      name.toLowerCase().includes(msalUser.name.split(' ')[0].toLowerCase())
    );
    if (match) {
      sel.value = match;
      onTeacherChange();
    } else {
      // Si no hay match exacto, agregar como opción temporal
      const opt = document.createElement('option');
      opt.value = msalUser.name; opt.textContent = msalUser.name;
      sel.appendChild(opt);
      sel.value = msalUser.name;
    }
    sel.disabled = true;  // bloquear campo
  }
}
// ─── Cambio de profesor → actualiza materias ─────────────────────────────────

export function onTeacherChange() {
  const teacher = document.getElementById('f-profesor').value;
  const matSel = document.getElementById('f-materia');
  restoreGrupoDropdown();
  hideAdminExtras();
  const grpSel = document.getElementById('f-grupo');
  matSel.innerHTML = '<option value="">Seleccionar materia…</option>';
  grpSel.innerHTML = '<option value="">Seleccionar grupo…</option>';
  grpSel.disabled = true;
  if (!teacher || !TEACHER_DATA[teacher]) { matSel.disabled = true; return; }
  const subjects = Object.keys(TEACHER_DATA[teacher].subjects);
  matSel.disabled = false;
  subjects.forEach(sub => {
    const opt = document.createElement('option');
    opt.value = sub; opt.textContent = sub;
    matSel.appendChild(opt);
  });
  matSel.onchange = onSubjectChange;
  if (subjects.length === 1) { matSel.value = subjects[0]; onSubjectChange(); }
}

// ─── Cambio de materia → actualiza grupos ────────────────────────────────────

export function onSubjectChange() {
  const teacher = document.getElementById('f-profesor').value;
  const subject = document.getElementById('f-materia').value;
  const grpRow = document.getElementById('f-grupo-row');
  restoreGrupoDropdown();
  const grpSel = document.getElementById('f-grupo');
  hideAdminExtras();

  if (subject === 'Admin') {
    grpRow.classList.add('hidden');
    grpSel.innerHTML = '<option value="-">-</option>';
    grpSel.value = '-';
    grpSel.disabled = false;
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
  if (!teacher || !subject || !TEACHER_DATA[teacher]?.subjects[subject]) {
    grpSel.disabled = true; return;
  }
  const groups = TEACHER_DATA[teacher].subjects[subject];
  grpSel.disabled = false;
  groups.forEach(grp => {
    const opt = document.createElement('option');
    opt.value = grp; opt.textContent = grp;
    grpSel.appendChild(opt);
  });
  if (groups.length === 1) grpSel.value = groups[0];
}

// ─── Helpers de UI del formulario ────────────────────────────────────────────

export function restoreGrupoDropdown() {
  const grpRow = document.getElementById('f-grupo-row');
  if (document.getElementById('f-grupo')) return;
  grpRow.innerHTML = `
    <label>Grupo <span class="req">*</span></label>
    <select id="f-grupo" disabled>
      <option value="">Seleccionar grupo…</option>
    </select>`;
}

export function showAdminExtras() {
  document.getElementById('admin-session-row').classList.remove('hidden');
  onAdminTypeChange();
}

export function hideAdminExtras() {
  document.getElementById('admin-session-row')?.classList.add('hidden');
  document.getElementById('admin-guest-row')?.classList.add('hidden');
  const grpRow = document.getElementById('f-grupo-row');
  const label = grpRow?.querySelector('label');
  if (label) label.innerHTML = 'Grupo <span class="req">*</span>';
  restoreGrupoDropdown();
}

export function onAdminTypeChange() {
  const type = document.getElementById('f-admin-type').value;
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

// ─── Confirmar reserva ────────────────────────────────────────────────────────

export function initConfirmBooking({ checkConflict, saveBooking, loadBookings, renderGrid, renderList, getCurrentView, closeModal }) {
  document.getElementById('confirm-btn').onclick = async () => {
    const subject = document.getElementById('f-materia').value.trim();

    let grupo = '';
    if (subject === 'Demo') {
      grupo = document.getElementById('f-grupo-demo')?.value.trim() || '';
    } else if (subject === 'Admin') {
      grupo = '-';
    } else {
      grupo = document.getElementById('f-grupo').value.trim();
    }

    let tipoSesion = 'Clase';
    let actividadOverride = null;
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
      observaciones:sanitizeField(document.getElementById('f-observaciones').value),
      tipoSesion,
    };

    const required = ['profesor', 'materia', 'aprendizaje'];
    if (subject !== 'Admin') required.push('grupo');
    if (!actividadOverride) required.push('actividad');
    if (tipoSesion === 'Planeación') {
      const guest = document.getElementById('f-admin-guest')?.value || '';
      if (!guest) { showToast('Selecciona el profesor invitado', 'err'); return; }
    }
    if (required.some(k => !vals[k])) {
      showToast('Por favor llena todos los campos requeridos', 'err'); return;
    }

    const btn = document.getElementById('confirm-btn');
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span> Guardando…';

    try {
      const pendingModal = window.pendingModal;
      const conflict = await checkConflict(pendingModal.key);
      if (conflict) {
        showToast('⚠️ Este periodo ya fue reservado por otro usuario', 'err');
        await loadBookings();
        renderGrid();
        closeModal();
        return;
      }
      const itemId = await saveBooking(pendingModal.key, { ...vals, ...pendingModal });
      // Actualizar bookings en memoria vía recarga completa
      await loadBookings();
      closeModal();
      renderGrid();
      if (getCurrentView() === 'list') renderList();
      const label = subject === 'Demo' ? `Demo — ${vals.grupo}`
        : subject === 'Admin' ? `Admin (${tipoSesion})`
        : `${vals.grupo} · ${vals.materia}`;
      showToast(`¡Reservado! ${vals.profesor} — ${label}`);
    } catch (e) {
      showToast('Error al guardar: ' + e.message, 'err');
    } finally {
      btn.disabled = false;
      btn.textContent = 'Confirmar reserva';
    }
  };

  // Admin type change listener
  document.getElementById('f-admin-type')?.addEventListener('change', onAdminTypeChange);
}
