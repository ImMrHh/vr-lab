// =============================================================================
// modal.js — VR Lab CEAM · portalvr.tech
// Modales para reservas: abrir/cerrar, confirmación, cancelar, bloquear.
// NO incluye lógica de red, solo orquesta el modal y validador de campos.
// =============================================================================

/**
 * Abre el modal de reservación.
 * Debe recibir un objeto con el slot/contexto y la función de populateTeachers/listeners.
 */
export function openModal({
  wOff, dIdx, pLabel, pTime, key,
  FDAYS, fmtDate,
  hideAdminExtras, populateTeachers
}) {
  window.pendingModal = { wOff, dIdx, pLabel, pTime, key };
  document.getElementById('modal-title').textContent = `Reservar ${pLabel}`;
  document.getElementById('modal-sub').textContent   = `${FDAYS[dIdx]}, ${fmtDate(wOff, dIdx)} · ${pTime}`;
  // Reset campos ANTES de populateTeachers para evitar que onTeacherChange
  // deje f-materia en estado incorrecto solapando el dropdown de profesor
  document.getElementById('f-actividad').value    = '';
  document.getElementById('f-aprendizaje').value  = '';
  document.getElementById('f-observaciones').value = '';
  document.getElementById('f-materia').innerHTML  = '<option value="">Seleccionar materia…</option>';
  document.getElementById('f-materia').disabled   = true;
  document.getElementById('f-grupo').disabled     = true;
  document.getElementById('f-grupo-row').classList.remove('hidden');
  hideAdminExtras && hideAdminExtras();
  // populateTeachers después del reset
  populateTeachers && populateTeachers();
  document.getElementById('modal').classList.remove('hidden');
  setTimeout(() => document.getElementById('f-profesor').focus(), 50);
}

export function closeModal() {
  document.getElementById('modal').classList.add('hidden');
  window.pendingModal = null;
}

/**
 * Muestra el modal para cancelar una reserva.
 */
export function doCancel(
  key, booking, FDAYS, fmtDate, showToast, renderGrid, currentView, renderList, cancelOnServer
) {
  document.getElementById('cancel-modal-title').textContent = '¿Cancelar reserva?';
  document.getElementById('cancel-modal-info').innerHTML =
    `<strong>${booking.profesor}</strong> — ${booking.grupo} · ${booking.materia}<br>${FDAYS[booking.dIdx]}, ${fmtDate(booking.wOff, booking.dIdx)} · ${booking.pLabel} (${booking.pTime})`;
  document.getElementById('cancel-reason').value = '';
  document.getElementById('cancel-modal').classList.remove('hidden');

  // Confirmar button
  document.getElementById('cancel-confirm-btn').onclick = async () => {
    const reason = document.getElementById('cancel-reason').value.trim();
    if (!reason) { showToast('Por favor ingresa un motivo de cancelación', 'err'); return; }
    const obs = booking.observaciones ? `${booking.observaciones} | [Cancelado: ${reason}]` : `[Cancelado: ${reason}]`;
    try {
      if (booking.id) await cancelOnServer(booking.id, obs);
      delete window.bookings[key];
      renderGrid();
      if (currentView === 'list' && renderList) renderList();
      showToast('Reserva cancelada');
    } catch (e) {
      showToast('Error: ' + (e?.message || e), 'err');
    }
    document.getElementById('cancel-modal').classList.add('hidden');
  };
}

export function closeCancelModal() {
  document.getElementById('cancel-modal').classList.add('hidden');
  document.getElementById('cancel-reason').value = '';
  document.getElementById('cancel-confirm-btn').onclick = null;
}

/**
 * Muestra el modal de confirmación (puedes usarlo para bloquear/desbloquear).
 */
export function showConfirmDialog(
  { title, message, actionText, actionClass = 'primary', onConfirm }
) {
  window._confirmCallback = onConfirm;
  document.getElementById('confirm-title').textContent   = title;
  document.getElementById('confirm-message').innerHTML   = message;
  const btn = document.getElementById('confirm-action-btn');
  btn.textContent = actionText;
  btn.className   = 'btn ' + (actionClass === 'danger' ? 'btn-danger' : 'btn-primary');
  btn.onclick     = () => { closeConfirmDialog(); if (window._confirmCallback) window._confirmCallback(); };
  document.getElementById('confirm-modal').classList.remove('hidden');
}

export function closeConfirmDialog() {
  document.getElementById('confirm-modal').classList.add('hidden');
  window._confirmCallback = null;
}

/**
 * Para bloquear un slot (llamado por admin desde el calendario).
 */
export function doBlock(
  key, wOff, dIdx, pLabel, pTime,
  FDAYS, fmtDate, showConfirmDialog, checkConflict, showToast, loadBookings, renderGrid
) {
  showConfirmDialog({
    title: `¿Bloquear slot?`,
    message: `${pLabel} · ${FDAYS[dIdx]}, ${fmtDate(wOff, dIdx)}`,
    actionText: 'Bloquear',
    actionClass: 'danger',
    onConfirm: async () => {
      try {
        const conflict = await checkConflict(key);
        if (conflict) {
          showToast('⚠️ Este periodo ya fue reservado por otro usuario', 'err');
          await loadBookings();
          renderGrid();
          return;
        }
        // Aquí debes llamar a blockOnServer (api.js) y actualizar mBlocked/bookings en memoria afuera de este módulo.
        showToast('Slot bloqueado');
      } catch (e) {
        showToast('Error: ' + (e?.message || e), 'err');
      }
    }
  });
}

/**
 * Para desbloquear un slot bloqueado.
 */
export function doUnblock(
  key, showConfirmDialog, cancelOnServer, mBlocked, renderGrid, showToast
) {
  showConfirmDialog({
    title: '¿Desbloquear slot?',
    message: 'Este slot quedará disponible para reservas.',
    actionText: 'Desbloquear',
    onConfirm: async () => {
      try {
        if (mBlocked[key]) await cancelOnServer(mBlocked[key]);
        delete mBlocked[key]; renderGrid(); showToast('Slot desbloqueado');
      } catch (e) { showToast('Error: ' + (e?.message || e), 'err'); }
    }
  });
}