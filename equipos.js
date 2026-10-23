
'use strict';
const {sg,sgConfigured,sgError,sgPhoto,sgElement}=window;
const $=id=>document.getElementById(id);
const countSelect=$('team-count'),startBtn=$('start'),skipBtn=$('skip');
let pool=[],sequence=[],cursor=0,timer=null,running=false,audioCtx=null;
let adminAuthorized=false,rouletteBusy=false,noticeTimer=null;
const TEAM_COLORS=['#39dca4','#ff518a','#e7b64e','#79b5ff','#ba9aff','#f28e65'];
function secureShuffle(items){
 const arr=items.slice();
 for(let i=arr.length-1;i>0;i--){
  const random=new Uint32Array(1),limit=Math.floor(4294967296/(i+1))*(i+1);
  do{crypto.getRandomValues(random)}while(random[0]>=limit);
  const j=random[0]%(i+1);[arr[i],arr[j]]=[arr[j],arr[i]];
 }
 return arr;
}
function beep(){
 try{
  audioCtx??=new(window.AudioContext||window.webkitAudioContext)();
  if(audioCtx.state==='suspended')audioCtx.resume();
  const now=audioCtx.currentTime,osc=audioCtx.createOscillator(),gain=audioCtx.createGain();
  osc.type='sine';osc.frequency.setValueAtTime(590,now);osc.frequency.exponentialRampToValueAtTime(920,now+.12);
  gain.gain.setValueAtTime(.0001,now);gain.gain.exponentialRampToValueAtTime(.09,now+.02);gain.gain.exponentialRampToValueAtTime(.0001,now+.23);
  osc.connect(gain);gain.connect(audioCtx.destination);osc.start(now);osc.stop(now+.24);
 }catch(e){console.warn('Audio no disponible',e)}
}
function setMachine(title,subtitle,active=false){
 $('machine-title').textContent=title;$('machine-subtitle').textContent=subtitle;
 $('machine').classList.toggle('running',active);
 $('machine-icon').textContent=active?'◈':'◇';
}
function makeColumns(n){$('team-grid').style.setProperty('--team-columns',n)}
function buildTeams(n){
 const root=$('team-grid');root.replaceChildren();makeColumns(n);
 for(let i=0;i<n;i++){
  const box=sgElement('section','team-box');box.style.setProperty('--team-accent',TEAM_COLORS[i]);
  const head=sgElement('div','team-head'),title=sgElement('h2','',`EQUIPO ${i+1}`);
  const size=sgElement('span','',`0 integrantes`);size.id=`size-${i}`;
  head.append(title,size);
  const pick=sgElement('button','team-pick','🎯 Elegir eliminado');pick.type='button';pick.disabled=true;pick.dataset.team=String(i);pick.addEventListener('click',()=>askEliminationCode(i));head.append(pick);
  const members=sgElement('div','team-members');members.id=`members-${i}`;
  members.append(sgElement('p','empty-team','Esperando sorteo…'));
  box.append(head,members);root.append(box);
 }
}
function showMember({person,team}){
 const root=$(`members-${team}`);root.querySelector('.empty-team')?.remove();
 const card=sgElement('article','team-member');
 const photo=sgElement('div','member-photo');
 if(sgPhoto(person.photo_url)){
  const img=sgElement('img');img.src=person.photo_url;img.alt=`Foto de ${person.name}`;
  img.onerror=()=>img.replaceWith(document.createTextNode('○'));photo.append(img);
 }else photo.append(sgElement('span','','○'));
 photo.append(sgElement('span','member-id',String(person.id).padStart(3,'0')));
 card.append(photo,sgElement('div','member-name',person.name||'Participante'));
 root.append(card);
 const total=root.querySelectorAll('.team-member').length;
 $(`size-${team}`).textContent=`${total} integrante${total===1?'':'s'}`;
 card.dataset.playerId=String(person.id);card._participant=person;
}
function updateProgress(){
 $('draw-count').textContent=`${cursor} / ${sequence.length} asignados`;
 $('progress-fill').style.width=`${sequence.length?100*cursor/sequence.length:0}%`;
}
function finish(){
 running=false;clearTimeout(timer);timer=null;
 startBtn.disabled=!pool.length;countSelect.disabled=false;skipBtn.disabled=true;
 setMachine('SORTEO FINALIZADO',`${sequence.length} participantes distribuidos. ¡Que comience el juego!`);
 updatePickButtons();
}
function next(){
 if(!running)return;
 if(cursor>=sequence.length){finish();return}
 const item=sequence[cursor++];
 showMember(item);beep();updateProgress();
 setMachine('ASIGNANDO PARTICIPANTES',`${item.person.name||'Participante'} → Equipo ${item.team+1}`,true);
 if(cursor>=sequence.length){timer=setTimeout(finish,800)}
 else timer=setTimeout(next,1300);
}
function start(){
 if(running||!pool.length)return;
 const n=Number(countSelect.value);
 if(!Number.isInteger(n)||n<2||n>6)return;
 if(pool.length<n){sgError('No hay suficientes participantes activos para ese número de equipos.');return}
 sgError('');
 // Cada participante aparece una sola vez; los tamaños difieren como máximo en uno.
 const shuffled=secureShuffle(pool);
 const targets=Array.from({length:n},(_,i)=>Math.floor(pool.length/n)+(i<pool.length%n?1:0));
 // Mezclar también el orden de aparición, manteniendo los cupos asignados.
 const slots=secureShuffle(targets.flatMap((size,team)=>Array(size).fill(team)));
 sequence=shuffled.map((person,i)=>({person,team:slots[i]}));
 cursor=0;running=true;buildTeams(n);updateProgress();
 startBtn.disabled=true;countSelect.disabled=true;skipBtn.disabled=false;updatePickButtons();
 setMachine('LA MÁQUINA ESTÁ DECIDIENDO','Preparando asignaciones…',true);
 timer=setTimeout(next,800);
}
startBtn.addEventListener('click',start);
skipBtn.addEventListener('click',()=>{
 if(!running)return;
 clearTimeout(timer);
 while(cursor<sequence.length){showMember(sequence[cursor++])}
 updateProgress();finish();
});
countSelect.addEventListener('change',()=>{
 if(!running){buildTeams(Number(countSelect.value));$('progress-fill').style.width='0%';$('draw-count').textContent='0 / 0 asignados';updatePickButtons()}
});
async function loadPlayers(){
 if(!sgConfigured||!sg){sgError('No se pudo conectar con Supabase. Comprueba config.js.');setMachine('SIN CONEXIÓN','Revisa la configuración.');return}
 const {data,error}=await sg.from('participants').select('id,name,photo_url,eliminated').order('id');
 if(error){sgError('Error al cargar participantes: '+error.message);setMachine('ERROR','No se pudieron cargar los jugadores.');return}
 // Misma selección de 18 plazas que el tablero. Los eliminados no participan.
 pool=(data||[]).filter(p=>Number(p.id)<=18&&!p.eliminated);
 $('pool-count').textContent=`${pool.length} participantes en juego`;
 startBtn.disabled=pool.length<Number(countSelect.value);updatePickButtons();
 if(pool.length<2)setMachine('SIN PARTICIPANTES','Se necesitan al menos dos jugadores activos.');
 else setMachine('MÁQUINA LISTA','Pulsa INICIAR SORTEO para formar los equipos.');
}
buildTeams(2);
loadPlayers();


// El sorteo de equipos es público. Solo una sesión administradora puede eliminar.
async function checkTeamAdmin(){
 if(!sg)return;
 const {data:{user},error:userError}=await sg.auth.getUser();
 adminAuthorized=false;
 if(user&&!userError){const {data,error}=await sg.from('admin_users').select('user_id').eq('user_id',user.id).maybeSingle();adminAuthorized=!error&&!!data}
 $('admin-state').textContent=adminAuthorized?'🔒 Administrador autorizado: eliminaciones habilitadas':'🔒 Solo el administrador puede eliminar jugadores';
 $('login-toggle').hidden=adminAuthorized;
 $('team-login').hidden=true;
 updatePickButtons();
}
$('login-toggle').addEventListener('click',()=>{$('team-login').hidden=!$('team-login').hidden});
$('team-login').addEventListener('submit',async e=>{
 e.preventDefault();if(!sg)return;
 const {error}=await sg.auth.signInWithPassword({email:$('team-email').value,password:$('team-password').value});
 $('team-password').value='';
 if(error){sgError('No se pudo iniciar sesión: '+error.message);return}
 sgError('');await checkTeamAdmin();
});
if(sg)checkTeamAdmin();
function updatePickButtons(){
 document.querySelectorAll('.team-pick').forEach(button=>{
  const members=$(`members-${button.dataset.team}`);
  const available=members?[...members.querySelectorAll('.team-member:not(.roulette-eliminated)')]:[];
  button.disabled=!adminAuthorized||running||rouletteBusy||available.length===0;
  button.title=!adminAuthorized?'Inicia sesión como administrador para eliminar':running?'Espera a que termine el sorteo':available.length?'Seleccionar un jugador activo':'Sin integrantes disponibles';
 });
}
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
function randomIndex(length){
 const values=new Uint32Array(1),limit=Math.floor(4294967296/length)*length;
 do{crypto.getRandomValues(values)}while(values[0]>=limit);
 return values[0]%length;
}
function showEliminationNotice(person,team){
 const notice=$('team-elimination-notice');clearTimeout(noticeTimer);
 $('winner-number').textContent=`EQUIPO ${team+1} · JUGADOR ${String(person.id).padStart(3,'0')}`;
 $('winner-name').textContent=person.name||'Participante';
 $('winner-text').textContent='El jugador ha sido eliminado. El tablero se actualizará automáticamente.';
 const photo=$('winner-photo');photo.replaceChildren();
 if(sgPhoto(person.photo_url)){
  const img=sgElement('img');img.src=person.photo_url;img.alt=person.name||'Participante';
  img.onerror=()=>img.replaceWith(document.createTextNode('○'));photo.append(img);
 }else photo.textContent='○';
 notice.hidden=false;notice.classList.remove('visible');void notice.offsetWidth;notice.classList.add('visible');
 noticeTimer=setTimeout(()=>{notice.classList.remove('visible');setTimeout(()=>notice.hidden=true,450)},4600);
}
async function persistElimination(person,code){
 // La misma función segura que usa el Supervisor: valida el código en Supabase.
 const {data,error}=await sg.rpc('supervisor_eliminate',{p_player_id:Number(person.id),p_code:code});
 if(error)throw Error(error.message||'Supabase rechazó el código o la eliminación.');
 if(data===false||data?.ok===false||data?.success===false)throw Error(data?.message||'La eliminación no fue autorizada.');
 return '';
}
const codeDialog=$('code-dialog'),codeInput=$('secret-code');
let pendingTeam=null;
function askEliminationCode(team){
 if(!adminAuthorized||running||rouletteBusy)return;
 const members=[...$(`members-${team}`).querySelectorAll('.team-member:not(.roulette-eliminated)')];
 if(!members.length)return;
 pendingTeam=team;
 $('code-team').textContent=`EQUIPO ${team+1} · ${members.length} participantes disponibles`;
 $('code-error').hidden=true;codeInput.value='';
 codeDialog.showModal();codeInput.focus();
}
$('code-cancel').addEventListener('click',()=>codeDialog.close());
codeDialog.addEventListener('close',()=>{pendingTeam=null;codeInput.value='';});
$('code-form').addEventListener('submit',async event=>{
 event.preventDefault();
 const code=codeInput.value.trim().toUpperCase();
 if(!/^[A-Z][0-9]{4}$/.test(code)){
  $('code-error').textContent='El código debe tener una letra y cuatro números.';
  $('code-error').hidden=false;return;
 }
 const team=pendingTeam;
 if(team===null||rouletteBusy)return;
 codeDialog.close();
 await roulette(team,code);
});
async function roulette(team,code){
 if(!adminAuthorized||running||rouletteBusy)return;
 const members=[...$(`members-${team}`).querySelectorAll('.team-member:not(.roulette-eliminated)')];
 if(!members.length)return;
 rouletteBusy=true;updatePickButtons();sgError('');
 const chosen=members[randomIndex(members.length)];
 const person=chosen._participant;
 setMachine('SELECCIÓN EN CURSO',`El Supervisor está decidiendo en el equipo ${team+1}…`,true);
 let previous=null;
 try{
  // La selección se fija de antemano. La luz recorre todos y desacelera.
  const spins=Math.max(15,members.length*3),startIndex=randomIndex(members.length);
  let index=startIndex;
  for(let step=0;step<spins;step++){
   previous?.classList.remove('roulette-lit');
   const card=members[index];card.classList.add('roulette-lit');previous=card;
   beep();
   const t=step/Math.max(1,spins-1);
   await delay(Math.round(75+560*t*t*t));
   index=(index+1)%members.length;
  }
  previous?.classList.remove('roulette-lit');
  chosen.classList.add('roulette-lit','roulette-selected');beep();
  setMachine('JUGADOR SELECCIONADO',`${person.name} · Verificando eliminación…`,true);
  const warning=await persistElimination(person,code);
  chosen.classList.remove('roulette-lit');chosen.classList.add('roulette-eliminated');
  pool=pool.filter(p=>p.id!==person.id);
  $('pool-count').textContent=`${pool.length} participantes en juego`;
  showEliminationNotice(person,team);
  setMachine('ELIMINACIÓN CONFIRMADA',`${person.name} ha sido eliminado del Equipo ${team+1}.`);
  if(warning)sgError('Aviso: '+warning);
 }catch(error){
  chosen.classList.remove('roulette-selected','roulette-lit');
  previous?.classList.remove('roulette-lit');
  setMachine('ELIMINACIÓN NO CONFIRMADA','No se mostró aviso de eliminación porque la base de datos no la confirmó.');
  sgError('No se pudo eliminar: '+(error?.message||String(error)));
 }finally{rouletteBusy=false;updatePickButtons()}
}
