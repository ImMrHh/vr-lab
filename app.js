const PROXY = 'https://vr-lab-proxy.6z5fznmp4m.workers.dev';
const ADMIN_PIN = '2026';

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
const TEACHING = {0:['P1','P6','P8'],1:['P1','P2','P6','P7'],2:['P1','P6','P8'],3:['P6'],4:['P1','P2','P3','P7','P8']};
const HOLIDAYS = new Set([
  '2025-09-01','2025-09-12','2025-10-30','2025-12-12',
  '2026-01-01','2026-01-02','2026-02-02',
  ...Array.from({length:19},(_,i)=>{const d=new Date(2025,11,22);d.setDate(d.getDate()+i);return d.toISOString().slice(0,10);}),
  ...Array.from({length:9},(_,i)=>`2026-04-${String(2+i).padStart(2,'0')}`),
]);

let isAdmin=false,weekOff=0,currentView='grid',pinVal='';
let bookings={},mBlocked={},pendingModal=null;

const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]);

const getMonday=off=>{const n=new Date(),dy=n.getDay(),m=new Date(n);m.setDate(n.getDate()-dy+(dy===0?-6:1)+off*7);m.setHours(0,0,0,0);return m;};
const getCellDate=(w,d)=>{const m=getMonday(w),dt=new Date(m);dt.setDate(dt.getDate()+d);return dt;};
const dStr=d=>d.toISOString().slice(0,10);
const fmtDate=(w,d)=>getCellDate(w,d).toLocaleDateString('es-MX',{day:'numeric',month:'short'});
const slotKey=(w,d,p)=>`${dStr(getCellDate(w,d))}_${p}`;
const isToday=(w,d)=>{const dt=getCellDate(w,d),n=new Date();n.setHours(0,0,0,0);return dt.getTime()===n.getTime();};
const isPast=(w,d,t)=>{const dt=getCellDate(w,d);const startTime=t.split('–')[0];dt.setHours(parseInt(startTime),parseInt(startTime.split(':')[1]||'0'),0,0);return dt<new Date();};
const isTooFar=(w,d)=>{const l=new Date();l.setDate(l.getDate()+30);return getCellDate(w,d)>l;};

function showToast(msg,type='ok'){
  const t=document.getElementById('toast');
  t.textContent=msg;t.className=`toast toast-${type} show`;
  setTimeout(()=>t.classList.remove('show'),3000);
}
function showStatus(msg,type='ok'){
  const s=document.getElementById('status-bar');
  s.textContent=msg;s.className=`status-bar status-${type}`;
  s.classList.remove('hidden');
}
function hideStatus(){document.getElementById('status-bar').classList.add('hidden');}

async function proxyGetUrl(url){
  const r=await fetch(url,{method:'GET'});
  const text=await r.text();
  try{
    const data=JSON.parse(text);
    if(data.records) return data;
    return {records:[]};
  }catch(e){
    return {records:[]};
  }
}
async function proxyPost(fields){
  const r=await fetch(PROXY,{
    method:'POST',
    headers:{'Content-Type':'application/json'},
    body:JSON.stringify({fields})
  });
  const text=await r.text();
  try{
    const data=JSON.parse(text);
    if(data.id) return data;
    throw new Error(data.error?.message||'Error al guardar');
  }catch(e){
    if(e.message==='Error al guardar') throw e;
    throw new Error('Respuesta inválida del servidor');
  }
}
async function proxyPatch(id,fields){
  const r=await fetch(`${PROXY}?id=${id}`,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({fields})});
  const text=await r.text();
  try{
    const data=JSON.parse(text);
    if(data.error) throw new Error(data.error.message||'Error en servidor');
    return data;
  }catch(e){
    if(!(e instanceof SyntaxError)) throw e;
    throw new Error('Respuesta inválida del servidor');
  }
}

async function loadBookings(){
  bookings={};mBlocked={};
  let offset='',all=[];
  do{
    const formula=encodeURIComponent("NOT({Status}='Cancelled')");
    const url=`${PROXY}?filterByFormula=${formula}&pageSize=100${offset?'&offset='+offset:''}`;
    const raw=await proxyGetUrl(url);
    const data=raw.records ? raw : (raw.$return_value || raw);
    all=[...all,...(data.records||[])];
    offset=data.offset||'';
  }while(offset);
  for(const rec of all){
    const f=rec.fields;
    if(!f.SlotKey && !(f.Fecha && f.Period))continue;
    const key=f.Fecha && f.Period ? `${f.Fecha}_${f.Period}` : f.SlotKey;
    if(f.Status==='Blocked'){mBlocked[key]=rec.id;}
    else if(f.Status==='Confirmed'){
      bookings[key]={
        id:rec.id,
        profesor:f.Profesor||'',
        grupo:f.Grupo||'',
        materia:f.Materia||'',
        actividad:f.Actividad||'',
        aprendizaje:f['Aprendizaje esperado/producto']||'',
        observaciones:f.Observaciones||'',
        pLabel:f.Period||'',
        pTime:f.Hora||'',
        dIdx:f.DayIndex||0,
        wOff:f.WeekOffset||0,
      };
    }
  }
}

async function saveBooking(key,data){
  const cd=getCellDate(data.wOff,data.dIdx);
  const fields={
    Profesor:data.profesor,
    Grupo:data.grupo,
    Materia:data.materia,
    Fecha:dStr(cd),
    Hora:data.pTime,
    Actividad:data.actividad,
    'Aprendizaje esperado/producto':data.aprendizaje,
    Observaciones:data.observaciones||'',
    Period:data.pLabel,
    DayOfWeek:FDAYS[data.dIdx],
    WeekOffset:data.wOff,
    DayIndex:data.dIdx,
    SlotKey:key,
    Status:'Confirmed',
  };
  const resp=await proxyPost(fields);
  return resp.id;
}

async function cancelOnServer(id){await proxyPatch(id,{Status:'Cancelled'});}

async function blockOnServer(key,wOff,dIdx,pLabel,pTime){
  const cd=getCellDate(wOff,dIdx);
  const fields={
    Profesor:'Bloqueado',Grupo:'-',Materia:'-',
    Fecha:dStr(cd),Hora:pTime,Actividad:'-',
    'Aprendizaje esperado/producto':'-',
    Period:pLabel,DayOfWeek:FDAYS[dIdx],
    WeekOffset:wOff,DayIndex:dIdx,SlotKey:key,Status:'Blocked',
  };
  const resp=await proxyPost(fields);
  return resp.id;
}

async function enterApp(){
  document.getElementById('auth-screen').classList.add('hidden');
  document.getElementById('main-app').classList.remove('hidden');
  document.getElementById('admin-btn').classList.remove('hidden');
  renderWeekLabel();renderGrid(true);
  showStatus('Cargando disponibilidad…','ok');
  try{await loadBookings();hideStatus();renderGrid();}
  catch(e){showStatus('Error al conectar: '+e.message,'err');renderGrid();}
}

function renderWeekLabel(){
  const m=getMonday(weekOff),f=new Date(m);f.setDate(f.getDate()+4);
  document.getElementById('week-label').textContent=
    m.toLocaleDateString('es-MX',{day:'numeric',month:'short'})+' – '+
    f.toLocaleDateString('es-MX',{day:'numeric',month:'short',year:'numeric'});
}
async function changeWeek(dir){weekOff+=dir;renderWeekLabel();renderGrid();}

function renderGrid(loading=false){
  const g=document.getElementById('grid');g.innerHTML='';
  g.appendChild(document.createElement('div'));
  DAYS.forEach((d,di)=>{
    const cd=getCellDate(weekOff,di);
    const hol=HOLIDAYS.has(dStr(cd)),today=isToday(weekOff,di);
    const el=document.createElement('div');
    el.className='col-head'+(today?' today':'')+(hol?' holiday':'');
    el.innerHTML=`<div>${d}</div><div class="col-date">${fmtDate(weekOff,di)}${hol?' ✕':''}</div>`;
    g.appendChild(el);
  });
  ROWS.forEach(row=>{
    const lbl=document.createElement('div');
    if(row.type==='recess'){lbl.className='r-label';lbl.textContent='receso';}
    else{lbl.className='p-label';lbl.innerHTML=`${row.label}<span class="ptime">${row.time}</span>`;}
    g.appendChild(lbl);
    DAYS.forEach((_,di)=>{
      const key=slotKey(weekOff,di,row.label);
      const cd=getCellDate(weekOff,di);
      const hol=HOLIDAYS.has(dStr(cd));
      const cell=document.createElement('div');
      if(row.type==='recess'){cell.className='slot slot-recess';g.appendChild(cell);return;}
      if(loading){cell.className='slot slot-loading';g.appendChild(cell);return;}
      const teaching=(TEACHING[di]||[]).includes(row.label);
      const past=isPast(weekOff,di,row.time);
      const far=isTooFar(weekOff,di);
      const booked=bookings[key];
      const blocked=mBlocked.hasOwnProperty(key);
      if(hol){cell.className='slot slot-holiday';cell.title='Día no hábil';}
      else if(teaching){cell.className='slot slot-teaching';cell.innerHTML=`<span class="s-text">Clase coordinador</span>`;}
      else if(blocked){
        cell.className='slot slot-blocked'+(isAdmin?' admin':'');
        cell.innerHTML=`<span class="s-text">Bloqueado</span>`;
        if(isAdmin){cell.title='Clic para desbloquear';cell.onclick=()=>doUnblock(key);}
      }else if(booked){
        const b=booked;
        cell.className='slot slot-booked'+(isAdmin?' admin':'');
        cell.innerHTML=`<span class="s-text">${esc(b.grupo)} · ${esc(b.materia)}</span><span class="s-sub">${esc(b.profesor)}</span>`;
        cell.title=`${esc(b.profesor)} · ${esc(b.grupo)} · ${esc(b.materia)}${isAdmin?'\nClic para cancelar':''}`;
        if(isAdmin)cell.onclick=()=>doCancel(key,b);
      }else if(past||far){
        cell.className='slot slot-past';
        cell.title=past?'Periodo pasado':'Fuera de rango';
      }else{
        cell.className='slot slot-free'+(isAdmin?' admin':'');
        if(isAdmin){
          cell.innerHTML=`<span style="font-size:18px;color:var(--gray-200)">+</span>`;
          cell.onclick=()=>openModal(weekOff,di,row.label,row.time,key);
          cell.oncontextmenu=(e)=>{e.preventDefault();doBlock(key,weekOff,di,row.label,row.time);};
        }
      }
      g.appendChild(cell);
    });
  });
  document.getElementById('admin-hint').classList.toggle('hidden',!isAdmin);
}

function openModal(wOff,dIdx,pLabel,pTime,key){
  pendingModal={wOff,dIdx,pLabel,pTime,key};
  document.getElementById('modal-title').textContent=`Reservar ${pLabel}`;
  document.getElementById('modal-sub').textContent=`${FDAYS[dIdx]}, ${fmtDate(wOff,dIdx)} · ${pTime}`;
  ['profesor','grupo','materia','actividad','aprendizaje','observaciones'].forEach(f=>document.getElementById('f-'+f).value='');
  document.getElementById('modal').classList.remove('hidden');
  setTimeout(()=>document.getElementById('f-profesor').focus(),50);
}
function closeModal(){document.getElementById('modal').classList.add('hidden');pendingModal=null;}

async function confirmBooking(){
  const vals={
    profesor:document.getElementById('f-profesor').value.trim(),
    grupo:document.getElementById('f-grupo').value.trim(),
    materia:document.getElementById('f-materia').value.trim(),
    actividad:document.getElementById('f-actividad').value.trim(),
    aprendizaje:document.getElementById('f-aprendizaje').value.trim(),
    observaciones:document.getElementById('f-observaciones').value.trim(),
  };
  if(['profesor','grupo','materia','actividad','aprendizaje'].some(k=>!vals[k])){
    showToast('Por favor llena todos los campos requeridos','err');return;
  }
  const btn=document.getElementById('confirm-btn');
  btn.disabled=true;btn.innerHTML='<span class="spinner"></span> Guardando…';
  try{
    const itemId=await saveBooking(pendingModal.key,{...vals,...pendingModal});
    bookings[pendingModal.key]={...vals,...pendingModal,id:itemId};
    closeModal();renderGrid();
    if(currentView==='list')renderList();
    showToast(`¡Reservado! ${vals.profesor} — ${vals.grupo} · ${vals.materia}`);
  }catch(e){showToast('Error al guardar: '+e.message,'err');}
  finally{btn.disabled=false;btn.textContent='Confirmar reserva';}
}

async function doCancel(key,b){
  if(!confirm(`¿Cancelar reserva?\n${b.profesor} — ${b.grupo} · ${b.materia}\n${FDAYS[b.dIdx]}, ${fmtDate(b.wOff,b.dIdx)} · ${b.pLabel}`))return;
  try{
    if(b.id)await cancelOnServer(b.id);
    delete bookings[key];renderGrid();
    if(currentView==='list')renderList();
    showToast('Reserva cancelada');
  }catch(e){showToast('Error: '+e.message,'err');}
}

async function doUnblock(key){
  try{
    if(mBlocked[key])await cancelOnServer(mBlocked[key]);
    delete mBlocked[key];renderGrid();showToast('Slot desbloqueado');
  }catch(e){showToast('Error: '+e.message,'err');}
}

async function doBlock(key,wOff,dIdx,pLabel,pTime){
  if(!confirm(`¿Bloquear ${pLabel} del ${FDAYS[dIdx]}, ${fmtDate(wOff,dIdx)}?`))return;
  try{
    const id=await blockOnServer(key,wOff,dIdx,pLabel,pTime);
    mBlocked[key]=id;
    renderGrid();
    showToast('Slot bloqueado');
  }catch(e){showToast('Error: '+e.message,'err');}
}

function renderList(){
  const c=document.getElementById('list-card');
  const entries=Object.entries(bookings).sort((a,b)=>{
    const[date1,p1]=a[0].split('_');const[date2,p2]=b[0].split('_');
    if(date1!==date2)return date1<date2?-1:1;
    return ROWS.findIndex(r=>r.label===p1)-ROWS.findIndex(r=>r.label===p2);
  });
  if(!entries.length){c.innerHTML='<p style="font-size:13px;color:var(--gray-400);padding:4px 0">No hay reservas registradas.</p>';return;}
  c.innerHTML=entries.map(([key,b])=>`
    <div class="booking-row">
      <div style="flex:1;min-width:0">
        <div class="b-main">${esc(b.profesor)} <span style="font-weight:400;color:var(--gray-400)">· ${esc(b.grupo)} · ${esc(b.materia)}</span></div>
        <div class="b-meta">
          ${FDAYS[b.dIdx]}, ${fmtDate(b.wOff,b.dIdx)} · ${esc(b.pLabel)} (${esc(b.pTime)})<br>
          <span style="color:var(--gray-600)">${esc(b.actividad)}</span>
        </div>
      </div>
      <div class="b-actions">
        <span class="b-badge">Confirmada</span>
        <button class="btn btn-sm" data-key="${key}">Cancelar</button>
      </div>
    </div>
  `).join('');
  c.querySelectorAll('[data-key]').forEach(btn=>{
    btn.addEventListener('click',()=>doCancel(btn.dataset.key,bookings[btn.dataset.key]));
  });
}

function setView(v){
  currentView=v;
  document.getElementById('view-grid').classList.toggle('hidden',v!=='grid');
  document.getElementById('view-list').classList.toggle('hidden',v!=='list');
  document.getElementById('tab-grid').classList.toggle('active',v==='grid');
  document.getElementById('tab-list').classList.toggle('active',v==='list');
  if(v==='list')renderList();
}

function showPin(){
  pinVal='';document.getElementById('pin-error').textContent='';updateDots();
  document.getElementById('pin-screen').classList.remove('hidden');
  document.getElementById('main-app').classList.add('hidden');
}
function hidePinScreen(){
  document.getElementById('pin-screen').classList.add('hidden');
  document.getElementById('main-app').classList.remove('hidden');
}
function updateDots(){for(let i=0;i<4;i++)document.getElementById('d'+i).className='pin-dot'+(i<pinVal.length?' filled':'');}
function pinPress(v){
  if(v==='del'){pinVal=pinVal.slice(0,-1);document.getElementById('pin-error').textContent='';updateDots();return;}
  if(pinVal.length>=4)return;
  pinVal+=v;updateDots();
  if(pinVal.length===4){
    if(pinVal===ADMIN_PIN){enterAdmin();}
    else{
      const dots=document.getElementById('pin-dots');
      dots.classList.add('shake');
      for(let i=0;i<4;i++)document.getElementById('d'+i).className='pin-dot error';
      document.getElementById('pin-error').textContent='PIN incorrecto';
      setTimeout(()=>{dots.classList.remove('shake');pinVal='';updateDots();},500);
    }
  }
}
function enterAdmin(){
  isAdmin=true;hidePinScreen();
  document.getElementById('admin-badge').classList.remove('hidden');
  document.getElementById('exit-admin-btn').classList.remove('hidden');
  document.getElementById('admin-btn').classList.add('hidden');
  document.getElementById('view-tabs').classList.remove('hidden');
  renderGrid();
}
function exportCSV(){
  const entries=Object.entries(bookings).sort((a,b)=>{
    const[date1,p1]=a[0].split('_');const[date2,p2]=b[0].split('_');
    if(date1!==date2)return date1<date2?-1:1;
    return ROWS.findIndex(r=>r.label===p1)-ROWS.findIndex(r=>r.label===p2);
  });
  if(!entries.length){showToast('No hay reservas para exportar','err');return;}
  const headers=['GRUPO','MATERIA','FECHA','HORA','Actividad','PROFESOR','Aprendizaje esperado/producto','Observaciones'];
  const rows=entries.map(([key,b])=>{
    const cd=getCellDate(b.wOff,b.dIdx);
    const fecha=cd.toLocaleDateString('es-MX',{day:'2-digit',month:'2-digit',year:'numeric'});
    return[b.grupo,b.materia,fecha,b.pTime.split('–')[0].trim(),b.actividad,b.profesor,b.aprendizaje,b.observaciones||'']
      .map(v=>'"'+String(v).replace(/"/g,'""')+'"').join(',');
  });
  const csv=[headers.join(',')].concat(rows).join('\n');
  const blob=new Blob(['\uFEFF'+csv],{type:'text/csv;charset=utf-8'});
  const url=URL.createObjectURL(blob);
  const a=document.createElement('a');
  a.href=url;
  const today=new Date().toLocaleDateString('es-MX',{day:'2-digit',month:'2-digit',year:'numeric'}).split('/').join('-');
  a.download='VRLab_Reservas_'+today+'.csv';
  a.click();
  URL.revokeObjectURL(url);
  showToast('CSV exportado correctamente');
}
function exitAdmin(){
  isAdmin=false;
  document.getElementById('admin-badge').classList.add('hidden');
  document.getElementById('exit-admin-btn').classList.add('hidden');
  document.getElementById('admin-btn').classList.remove('hidden');
  document.getElementById('view-tabs').classList.add('hidden');
  setView('grid');renderGrid();
}

document.addEventListener('keydown',e=>{
  if(e.key==='Escape'){
    if(!document.getElementById('modal').classList.contains('hidden'))closeModal();
    else if(!document.getElementById('pin-screen').classList.contains('hidden'))hidePinScreen();
  }
  if(document.getElementById('pin-screen').classList.contains('hidden'))return;
  if(e.key>='0'&&e.key<='9')pinPress(e.key);
  else if(e.key==='Backspace')pinPress('del');
});