import { PROXY, FDAYS } from './config.js';

/**
 * GET genérico vía proxy con autenticación.
 */
export async function proxyGetUrl(url, authToken) {
  const headers = authToken
    ? { 'Authorization': `Bearer ${authToken}` }
    : {};
  const r = await fetch(url, { method: 'GET', headers });
  const text = await r.text();
  try {
    const data = JSON.parse(text);
    return data.records ? data : { records: [] };
  } catch {
    return { records: [] };
  }
}

/**
 * POST genérico vía proxy.
 */
export async function proxyPost(fields, authToken) {
  const r = await fetch(PROXY, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${authToken}`,
    },
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

/**
 * PATCH genérico vía proxy.
 */
export async function proxyPatch(id, fields, authToken) {
  const r = await fetch(`${PROXY}?id=${id}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${authToken}`,
    },
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

/**
 * Carga todas las reservas (excluye cancelados), y separa bloqueados.
 * Devuelve { bookings, mBlocked }
 */
export async function loadBookings(authToken) {
  let bookings = {}, mBlocked = {};
  let offset = '', all = [];
  do {
    const formula = encodeURIComponent("NOT({Status}='Cancelled')");
    const url = `${PROXY}?filterByFormula=${formula}&pageSize=100${offset ? '&offset=' + offset : ''}`;
    const raw = await proxyGetUrl(url, authToken);
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
        id: rec.id,
        profesor: f.Profesor || '',
        grupo: f.Grupo || '',
        materia: f.Materia || '',
        actividad: f.Actividad || '',
        aprendizaje: f['Aprendizaje esperado/producto'] || '',
        observaciones: f.Observaciones || '',
        pLabel: f.Period || '',
        pTime: f.Hora || '',
        dIdx: f.DayIndex || 0,
        wOff: f.WeekOffset || 0,
      };
    }
  }
  return { bookings, mBlocked };
}

/**
 * Guarda una nueva reserva confirmada.
 */
export async function saveBooking(key, data, authToken, getCellDate, dStr, FDAYS) {
  const cd = getCellDate(data.wOff, data.dIdx);
  const fields = {
    Profesor: data.profesor,
    Grupo: data.grupo,
    Materia: data.materia,
    Fecha: dStr(cd),
    Hora: data.pTime,
    Actividad: data.actividad,
    'Aprendizaje esperado/producto': data.aprendizaje,
    Observaciones: data.observaciones || '',
    Period: data.pLabel,
    DayOfWeek: FDAYS[data.dIdx],
    WeekOffset: data.wOff,
    DayIndex: data.dIdx,
    SlotKey: key,
    Status: 'Confirmed',
    TipoSesion: data.tipoSesion || 'Clase',
  };
  const resp = await proxyPost(fields, authToken);
  return resp.id;
}

/**
 * Cancela una reserva.
 */
export async function cancelOnServer(id, reason, authToken) {
  const fields = { Status: 'Cancelled' };
  if (reason) fields.Observaciones = reason;
  await proxyPatch(id, fields, authToken);
}

/**
 * Devuelve true si ya existe una reserva confirmada para el slotKey.
 */
export async function checkConflict(key, authToken) {
  const safeKey = String(key).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
  const formula = encodeURIComponent(`AND({SlotKey}='${safeKey}', {Status}='Confirmed')`);
  const url = `${PROXY}?filterByFormula=${formula}&pageSize=1`;
  const raw = await proxyGetUrl(url, authToken);
  const data = raw.records ? raw : (raw.$return_value || raw);
  return (data.records || []).length > 0;
}

/**
 * Bloquea un slot como "Blocked".
 */
export async function blockOnServer(key, wOff, dIdx, pLabel, pTime, authToken, getCellDate, dStr, FDAYS) {
  const cd = getCellDate(wOff, dIdx);
  const fields = {
    Profesor: 'Bloqueado',
    Grupo: '-',
    Materia: '-',
    Fecha: dStr(cd),
    Hora: pTime,
    Actividad: '-',
    'Aprendizaje esperado/producto': '-',
    Period: pLabel,
    DayOfWeek: FDAYS[dIdx],
    WeekOffset: wOff,
    DayIndex: dIdx,
    SlotKey: key,
    Status: 'Blocked',
  };
  const resp = await proxyPost(fields, authToken);
  return resp.id;
}