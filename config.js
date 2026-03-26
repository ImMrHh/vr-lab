// =============================================================================
// config.js — VR Lab CEAM · portalvr.tech
// Todas las constantes del sistema en un solo lugar.
// Para cambiar URLs, horarios, profesores o festivos: edita SOLO este archivo.
// =============================================================================


// ─── Workers (Cloudflare) ────────────────────────────────────────────────────

export const PROXY    = 'https://vr-lab-proxy.6z5fznmp4m.workers.dev';
export const AUTH_URL = 'https://vr-lab-auth.6z5fznmp4m.workers.dev';


// ─── Días de la semana ────────────────────────────────────────────────────────

export const DAYS  = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie'];
export const FDAYS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes'];


// ─── Horario escolar (periodos y recesos) ────────────────────────────────────
// type: 'period' | 'recess'

export const ROWS = [
  { type: 'period', label: 'P1', time: '7:20–8:10'  },
  { type: 'period', label: 'P2', time: '8:10–9:00'  },
  { type: 'period', label: 'P3', time: '9:00–9:50'  },
  { type: 'recess', label: 'R1', time: '9:50–10:20' },
  { type: 'period', label: 'P4', time: '10:20–11:10' },
  { type: 'period', label: 'P5', time: '11:10–12:00' },
  { type: 'period', label: 'P6', time: '12:00–12:50' },
  { type: 'recess', label: 'R2', time: '12:50–13:10' },
  { type: 'period', label: 'P7', time: '13:10–14:00' },
  { type: 'period', label: 'P8', time: '14:00–14:50' },
];


// ─── Periodos bloqueados por clase de Henrik (0=Lun … 4=Vie) ─────────────────

export const TEACHING = {
  0: ['P1', 'P6', 'P8'],
  1: ['P1', 'P2', 'P6', 'P7'],
  2: ['P1', 'P6', 'P8'],
  3: ['P6'],
  4: ['P1', 'P2', 'P3', 'P7', 'P8'],
};


// ─── Días no hábiles y vacaciones ────────────────────────────────────────────

const _fixedHolidays = [
  '2025-09-01', '2025-09-12', '2025-10-30', '2025-12-12',
  '2026-01-01', '2026-01-02', '2026-02-02',
  '2026-03-27', '2026-03-30', '2026-03-31',
  '2026-05-01', '2026-05-29', '2026-06-26',
];

// Vacaciones de invierno: 22 dic 2025 → 9 ene 2026 (19 días)
const _winterBreak = Array.from({ length: 19 }, (_, i) => {
  const d = new Date(2025, 11, 22);
  d.setDate(d.getDate() + i);
  return d.toISOString().slice(0, 10);
});

// Semana Santa: 1–10 abr 2026
const _holyWeek = Array.from({ length: 10 }, (_, i) =>
  `2026-04-${String(1 + i).padStart(2, '0')}`
);

export const HOLIDAYS = new Set([
  ..._fixedHolidays,
  ..._winterBreak,
  ..._holyWeek,
]);

// Fin del ciclo escolar
export const SCHOOL_END = new Date(2026, 6, 15); // 15 jul 2026


// ─── Roles ───────────────────────────────────────────────────────────────────

export const ROLE_LABELS = {
  profesor:     'Modo Profesor',
  coordinacion: 'Coordinación',
  admin:        'Admin',
};

export const ROLE_COLORS = {
  profesor:     '#065f46',
  coordinacion: '#7c3aed',
  admin:        '#1e40af',
};


// ─── Directorio de profesores y materias ─────────────────────────────────────
// Estructura: { NombreProfesor: { subjects: { Materia: ['grupo', ...] } } }

export const TEACHER_DATA = {
  'Alma':         { subjects: { 'Matemáticas':  ['201','202','206','301','302','303','304','305'] } },
  'Silvia':       { subjects: { 'Biología':     ['101','102','103','104','105'] } },
  'Carlos':       { subjects: { 'Física':       ['201','202','203','204','205','206','Robótica'] } },
  'Araceli':      { subjects: { 'Español':      ['103','104','105','301','302','303','304','305'] } },
  'Gustavo':      { subjects: { 'Español':      ['101','102','201','202','203','204','205','206'] } },
  'Guillermo':    { subjects: { 'Matemáticas':  ['101','102','103','104','105','203','204','205'] } },
  'Regino':       { subjects: { 'Química':      ['301','302','303','304','305'] } },
  'Óscar S.':     { subjects: { 'Geografía':    ['101','102','103','104','105'] } },
  'Patricia':     { subjects: { 'Historia':     ['101','102','103','104','105','201','202','203','204','205','206'] } },
  'Cecilia':      { subjects: {
    'Historia':   ['101','102','103','104','105','201','202','203','204','205','206','301','302','303','304','305'],
    'FCE':        ['101','102','103','104','105','201','202','203','204','205','206','301','302','303','304','305'],
    'Socioemoc.': ['101','102','103','104','105','201','202','203','204','205','206','301','302','303','304','305'],
  }},
  'José Antonio': { subjects: { 'Tecnología':   ['101','102','103','104','105','201','202','203','204','205','206'] } },
  'Henrik':       { subjects: {
    'Tecnología': ['301','302','303','304','305'],
    'Admin':      ['101','102','103','104','105','201','202','203','204','205','206','301','302','303','304','305','1A','1B','2A','2B','3A','3B','Robótica'],
    'Demo':       [],
  }},
  'Jessica':      { subjects: { 'Demo':         [] } },
  'Luis':         { subjects: { 'Educ. Física': ['101','102','103','104','105','301','302'] } },
  'Eduardo':      { subjects: { 'Educ. Física': ['201','202','203','204','205','206','303','304','305'] } },
  'Mariana':      { subjects: { 'Francés':      ['101','102','103','104','105','201','202','203','204','205','206','301','302','303','304','305'] } },
  'María':        { subjects: { 'Arte':         ['202','203','204','205','206','301','302','303','304','305'] } },
  'Karina':       { subjects: { 'Arte':         ['101','102','103','104','105','201','202'] } },
  'Pablo':        { subjects: { 'FCE':          ['102','103','104','201','202','203','204','205','206','301','302','303','304'] } },
  'Marcela':      { subjects: { 'Inglés':       ['1A','1B','2A','2B','3A','3B'] } },
  'Daniela':      { subjects: { 'Inglés':       ['1A','1B','2A','2B','3A','3B'] } },
  'Natalia':      { subjects: { 'Inglés':       ['1A','1B','2A','2B','3A'] } },
  'Marling':      { subjects: { 'Socioemoc.':   ['301','302','303','304','305'] } },
  'Daniel':       { subjects: { 'Inglés':       ['1A','1B','2A','2B','3A','3B'] } },
};
