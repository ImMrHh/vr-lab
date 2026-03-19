// Unit tests for pure functions from app.js
// Run: node tests/app.test.js

// ── Inline pure function definitions (no browser globals needed) ──────────────

const DAYS  = ['Lun','Mar','Mié','Jue','Vie'];
const FDAYS = ['Lunes','Martes','Miércoles','Jueves','Viernes'];
const ROWS  = [
  {type:'period',label:'P1',time:'7:20–8:10'},
  {type:'period',label:'P2',time:'8:10–9:00'},
  {type:'period',label:'P3',time:'9:00–9:50'},
  {type:'recess',label:'R1',time:'9:50–10:20'},
  {type:'period',label:'P4',time:'10:20–11:10'},
  {type:'period',label:'P5',time:'11:10–12:00'},
  {type:'period',label:'P6',time:'12:00–12:50'},
  {type:'recess',label:'R2',time:'12:50–13:10'},
  {type:'period',label:'P7',time:'13:10–14:00'},
  {type:'period',label:'P8',time:'14:00–14:50'},
];

const HOLIDAYS = new Set([
  '2025-09-01','2025-09-12','2025-10-30','2025-12-12',
  '2026-01-01','2026-01-02','2026-02-02',
  '2026-03-27','2026-05-01','2026-05-29','2026-06-26',
  ...Array.from({length:19},(_,i)=>{const d=new Date(2025,11,22);d.setDate(d.getDate()+i);return d.toISOString().slice(0,10);}),
  ...Array.from({length:10},(_,i)=>`2026-04-${String(1+i).padStart(2,'0')}`),
]);
const SCHOOL_END = new Date(2026, 6, 15);

const esc = s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]);

const getMonday = off=>{const n=new Date(),dy=n.getDay(),m=new Date(n);m.setDate(n.getDate()-dy+(dy===0?-6:1)+off*7);m.setHours(0,0,0,0);return m;};
const getCellDate = (w,d)=>{const m=getMonday(w),dt=new Date(m);dt.setDate(dt.getDate()+d);return dt;};
const dStr = d=>d.toISOString().slice(0,10);
const slotKey = (w,d,p)=>`${dStr(getCellDate(w,d))}_${p}`;
const isToday = (w,d)=>{const dt=getCellDate(w,d),n=new Date();n.setHours(0,0,0,0);return dt.getTime()===n.getTime();};
const isPast = (w,d,t)=>{const dt=getCellDate(w,d);const startTime=t.split('–')[0];dt.setHours(parseInt(startTime),parseInt(startTime.split(':')[1]||'0'),0,0);return dt<new Date();};
const isPastSchoolEnd = (w,d)=>getCellDate(w,d)>SCHOOL_END;

// ── Minimal test runner ───────────────────────────────────────────────────────

let passed=0,failed=0;
function test(name,fn){
  try{fn();console.log(`  ✓ ${name}`);passed++;}
  catch(e){console.error(`  ✗ ${name}\n    ${e.message}`);failed++;}
}
function assert(cond,msg){if(!cond)throw new Error(msg||'Assertion failed');}
function assertEqual(a,b){if(a!==b)throw new Error(`Expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`);}

// ── Tests ─────────────────────────────────────────────────────────────────────

console.log('\ngetMonday()');
test('offset 0 returns current week Monday', ()=>{
  const m=getMonday(0);
  assert(m.getDay()===1,`Expected day 1 (Monday), got ${m.getDay()}`);
});
test('offset +1 returns next week Monday', ()=>{
  const m0=getMonday(0),m1=getMonday(1);
  const diff=(m1-m0)/(1000*60*60*24);
  assertEqual(diff,7);
});
test('offset -1 returns last week Monday', ()=>{
  const m0=getMonday(0),mm1=getMonday(-1);
  const diff=(m0-mm1)/(1000*60*60*24);
  assertEqual(diff,7);
});

console.log('\ngetCellDate()');
test('d=0 returns Monday', ()=>{
  const dt=getCellDate(0,0),m=getMonday(0);
  assertEqual(dStr(dt),dStr(m));
});
test('d=4 returns Friday (Mon+4)', ()=>{
  const dt=getCellDate(0,4),m=getMonday(0);
  const diff=(dt-m)/(1000*60*60*24);
  assertEqual(diff,4);
});

console.log('\ndStr()');
test('returns ISO date string YYYY-MM-DD', ()=>{
  const d=new Date(2026,0,15); // Jan 15, 2026
  assertEqual(dStr(d),'2026-01-15');
});
test('zero-pads month and day', ()=>{
  const d=new Date(2026,2,5); // Mar 5
  assertEqual(dStr(d),'2026-03-05');
});

console.log('\nslotKey()');
test('format is YYYY-MM-DD_PX', ()=>{
  const key=slotKey(0,0,'P1');
  assert(/^\d{4}-\d{2}-\d{2}_P1$/.test(key),`Key "${key}" does not match expected format`);
});
test('day index shifts date correctly', ()=>{
  const key0=slotKey(0,0,'P3');
  const key4=slotKey(0,4,'P3');
  const date0=key0.split('_')[0];
  const date4=key4.split('_')[0];
  const diff=(new Date(date4)-new Date(date0))/(1000*60*60*24);
  assertEqual(diff,4);
});

console.log('\nisToday()');
test('returns true for today (w=0, d=current weekday)', ()=>{
  const today=new Date();
  const dow=today.getDay();
  if(dow>=1&&dow<=5){
    assert(isToday(0,dow-1),'Expected isToday to return true for today');
  }else{
    // weekend — skip
    assert(true,'Skipped: test run on weekend');
  }
});
test('returns false for another week', ()=>{
  assert(!isToday(1,0),'Expected isToday to return false for next week');
  assert(!isToday(-1,0),'Expected isToday to return false for last week');
});

console.log('\nisPast()');
test('returns true for a past date', ()=>{
  assert(isPast(-52,0,'7:20–8:10'),'Expected a year-old slot to be in the past');
});
test('returns false for a far future date', ()=>{
  assert(!isPast(52,0,'23:00–23:50'),'Expected a year-future slot not to be in the past');
});

console.log('\nisPastSchoolEnd()');
test('returns true for a date after July 15, 2026', ()=>{
  // week offset that lands in August 2026 (26 weeks from now if now is ~Mar 2026)
  // Use a deterministic check: getCellDate for a fixed far-future week
  const farFuture=new Date(2026,7,1); // Aug 1, 2026
  assert(farFuture>SCHOOL_END,'SCHOOL_END sanity check');
  // Find offset that gives us Aug 2026
  const now=getMonday(0);
  const diff=Math.ceil((farFuture-now)/(1000*60*60*24*7));
  const result=isPastSchoolEnd(diff,0);
  assert(result,'Expected date in Aug 2026 to be past school end');
});
test('returns false for a current or near-future date within school year', ()=>{
  // Assume the tests run before July 2026 (school year)
  const now=new Date();
  if(now<SCHOOL_END){
    assert(!isPastSchoolEnd(0,0),'Expected current week to be within school year');
  }else{
    assert(true,'Skipped: test run after school year end');
  }
});

console.log('\nesc()');
test('escapes < and >', ()=>{
  assertEqual(esc('<div>'),'&lt;div&gt;');
});
test('escapes &', ()=>{
  assertEqual(esc('a & b'),'a &amp; b');
});
test('escapes double quotes', ()=>{
  assertEqual(esc('"hello"'),'&quot;hello&quot;');
});
test('escapes single quotes', ()=>{
  assertEqual(esc("it's"),'it&#39;s');
});
test('passes safe strings unchanged', ()=>{
  assertEqual(esc('Hello World'),'Hello World');
});

console.log('\nHOLIDAYS set');
test('contains known holidays', ()=>{
  assert(HOLIDAYS.has('2026-01-01'),'Jan 1 2026 should be a holiday');
  assert(HOLIDAYS.has('2025-12-25'),'Dec 25 2025 should be a holiday (winter break)');
  assert(HOLIDAYS.has('2026-04-01'),'Apr 1 2026 should be a holiday (Semana Santa)');
});
test('does not contain random non-holiday dates', ()=>{
  assert(!HOLIDAYS.has('2026-03-19'),'Mar 19 2026 should not be a holiday');
  assert(!HOLIDAYS.has('2026-02-10'),'Feb 10 2026 should not be a holiday');
});

// ── Summary ───────────────────────────────────────────────────────────────────

console.log(`\n${passed + failed} tests: ${passed} passed, ${failed} failed\n`);
if(failed>0)process.exit(1);
