
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
  const pick=sgElement('button','team-pick','🎯 Elegir eliminado');pick.type='button';pick.disabled=true;pick.dataset.team=String(i);pick.addEventListener('click',()=>askEliminationCode(i));head.append(pick);const sentence=sgElement('button','team-sentence','⚖️ Sentenciar');sentence.type='button';sentence.dataset.team=String(i);sentence.addEventListener('click',()=>askSentenceCode(i));head.append(sentence);const groupSentence=sgElement('button','team-sentence-all','⚖️ Sentenciar equipo');groupSentence.type='button';groupSentence.dataset.team=String(i);groupSentence.addEventListener('click',()=>askSentenceTeamCode(i));head.append(groupSentence);const prize=sgElement('button','team-prize','🎁 Rifar premio');prize.type='button';prize.dataset.team=String(i);prize.addEventListener('click',()=>rafflePrize(i));head.append(prize);
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
 const statusBadge=sgElement('div','member-status');card.append(statusBadge);
 root.append(card);
 const total=root.querySelectorAll('.team-member').length;
 $(`size-${team}`).textContent=`${total} integrante${total===1?'':'s'}`;
 card.dataset.playerId=String(person.id);card._participant=person;applyMemberStatus(card,person.status||(person.eliminated?'eliminated':'active'));
}
function applyMemberStatus(card,status){
 const normalized=status==='eliminated'?'eliminated':status==='sentenced'?'sentenced':'active';
 card._participant.status=normalized;card._participant.eliminated=normalized==='eliminated';
 card.classList.toggle('roulette-sentenced',normalized==='sentenced');
 card.classList.toggle('roulette-eliminated',normalized==='eliminated');
 const label=card.querySelector('.member-status');
 if(label){label.textContent=normalized==='sentenced'?'⚖ SENTENCIADO':normalized==='eliminated'?'✕ ELIMINADO':'ACTIVO';label.dataset.status=normalized;}
}
function refreshPoolCounter(){
 pool=pool.filter(p=>p.status!=='eliminated'&&!p.eliminated);
 $('pool-count').textContent=`${pool.length} participantes en juego`;
}
async function refreshTeamStatuses(team){
 const cards=[...$(`members-${team}`).querySelectorAll('.team-member')];
 if(!cards.length)return;
 const ids=cards.map(card=>Number(card.dataset.playerId));
 const {data,error}=await sg.from('participants').select('id,status,eliminated').in('id',ids);
 if(error)throw Error('No se pudo verificar el estado actual: '+error.message);
 const byId=new Map((data||[]).map(p=>[Number(p.id),p]));
 for(const card of cards){const p=byId.get(Number(card.dataset.playerId));if(p)applyMemberStatus(card,p.status||(p.eliminated?'eliminated':'active'));}
 refreshPoolCounter();updatePickButtons();
}
function updateProgress(){
 $('draw-count').textContent=`${cursor} / ${sequence.length} asignados`;
 $('progress-fill').style.width=`${sequence.length?100*cursor/sequence.length:0}%`;
}
function finish(){
 running=false;clearTimeout(timer);timer=null;
 startBtn.disabled=!adminAuthorized||!pool.length;countSelect.disabled=false;skipBtn.disabled=true;
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
 if(!adminAuthorized||running||!pool.length)return;
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
 const {data,error}=await sg.from('participants').select('id,name,photo_url,eliminated,status').order('id');
 if(error){sgError('Error al cargar participantes: '+error.message);setMachine('ERROR','No se pudieron cargar los jugadores.');return}
 // Misma selección de 18 plazas que el tablero. Los eliminados no participan.
 pool=(data||[]).filter(p=>Number(p.id)<=18&&p.status!=='eliminated'&&!p.eliminated);
 $('pool-count').textContent=`${pool.length} participantes en juego`;
 startBtn.disabled=!adminAuthorized||pool.length<Number(countSelect.value);updatePickButtons();
 if(pool.length<2)setMachine('SIN PARTICIPANTES','Se necesitan al menos dos jugadores activos.');
 else setMachine('MÁQUINA LISTA','Pulsa INICIAR SORTEO para formar los equipos.');
}
buildTeams(2);


// Verificar sesion y rol ANTES de cargar participantes o permitir sorteos.
async function checkTeamAdmin(){
 adminAuthorized=false;
 $('team-private').hidden=true;$('team-gate').hidden=false;
 $('gate-message').textContent='Verificando tu sesión…';
 if(!sgConfigured||!sg){$('gate-message').textContent='No hay conexión con Supabase.';$('gate-login').hidden=true;return}
 try{
  const {data:{user},error:userError}=await sg.auth.getUser();
  if(userError)throw userError;
  if(user){const {data,error}=await sg.from('admin_users').select('user_id').eq('user_id',user.id).maybeSingle();if(error)throw error;adminAuthorized=!!data}
  if(adminAuthorized){
   $('team-gate').hidden=true;$('team-private').hidden=false;
   $('admin-state').textContent='🔒 Administrador autorizado';
   $('login-toggle').hidden=true;$('team-login').hidden=true;
   await loadPlayers();updatePickButtons();return;
  }
  $('gate-message').textContent=user?'Esta cuenta no tiene permisos de administrador.':'Inicia sesión como administrador para continuar.';
  $('gate-login').hidden=false;startBtn.disabled=true;
 }catch(error){$('gate-message').textContent='No se pudo verificar el acceso: '+(error.message||String(error));$('gate-login').hidden=false;startBtn.disabled=true}
}
$('gate-login').addEventListener('submit',async e=>{
 e.preventDefault();if(!sg)return;
 $('gate-message').textContent='Verificando credenciales…';
 const {error}=await sg.auth.signInWithPassword({email:$('gate-email').value,password:$('gate-password').value});
 $('gate-password').value='';
 if(error){$('gate-message').textContent='No se pudo iniciar sesión: '+error.message;return}
 await checkTeamAdmin();
});
// Se conserva el control de permisos de eliminacion del codigo original.
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
 document.querySelectorAll('.team-pick,.team-sentence,.team-sentence-all,.team-prize').forEach(button=>{
  const members=$(`members-${button.dataset.team}`);
  const available=members?[...members.querySelectorAll('.team-member:not(.roulette-eliminated)')]:[];
  const eligible=available;
  button.disabled=!adminAuthorized||running||rouletteBusy||eligible.length===0;
  button.title=!adminAuthorized?'Inicia sesión como administrador para eliminar':running?'Espera a que termine el sorteo':available.length?'Seleccionar un jugador activo':'Sin integrantes disponibles';
 });
}
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
function randomIndex(length){
 const values=new Uint32Array(1),limit=Math.floor(4294967296/length)*length;
 do{crypto.getRandomValues(values)}while(values[0]>=limit);
 return values[0]%length;
}
function showEliminationNotice(person,team,kind='eliminated'){
 const sentenced=kind==='sentenced',prize=kind==='prize';
 const notice=$('team-elimination-notice');clearTimeout(noticeTimer);notice.classList.toggle('sentencing-notice',sentenced||prize);notice.querySelector('.notice-out').textContent=prize?'GANADOR DEL PREMIO':sentenced?'SENTENCIADO':'ELIMINADO';
 $('winner-number').textContent=`EQUIPO ${team+1} · JUGADOR ${String(person.id).padStart(3,'0')}`;
 $('winner-name').textContent=person.name||'Participante';
 $('winner-text').textContent=prize?'¡El equipo tiene un ganador! El estado del jugador no cambia.':sentenced?'El jugador ha sido sentenciado. El tablero se actualizará automáticamente.':'El jugador ha sido eliminado. El tablero se actualizará automáticamente.';
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
let pendingTeam=null,pendingAction='eliminate';
function askEliminationCode(team){
 if(!adminAuthorized||running||rouletteBusy)return;
 const members=[...$(`members-${team}`).querySelectorAll('.team-member:not(.roulette-eliminated)')];
 if(!members.length)return;
 pendingTeam=team;pendingAction='eliminate';
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
 try{await refreshTeamStatuses(team);if(pendingAction==='sentence_team')await sentenceWholeTeam(team,code);else await roulette(team,code,pendingAction);}catch(error){sgError(error.message||String(error));}
});
async function roulette(team,code,action='eliminate'){
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
  const priorStatus=person.status||'active';
  const warning=action==='sentence'?await persistSentence(person,code):await persistElimination(person,code);
  const newStatus=action==='eliminate'||priorStatus==='sentenced'?'eliminated':'sentenced';
  chosen.classList.remove('roulette-lit');applyMemberStatus(chosen,newStatus);refreshPoolCounter();
  showEliminationNotice(person,team,newStatus);
  setMachine(newStatus==='sentenced'?'SENTENCIA CONFIRMADA':'ELIMINACIÓN CONFIRMADA',`${person.name} ha sido ${newStatus==='sentenced'?'sentenciado':'eliminado'} del Equipo ${team+1}.`);
  if(warning)sgError('Aviso: '+warning);
 }catch(error){
  chosen.classList.remove('roulette-selected','roulette-lit');
  previous?.classList.remove('roulette-lit');
  setMachine('CAMBIO NO CONFIRMADO','La base de datos no confirmó el cambio de estado.');
  sgError('No se pudo actualizar el estado: '+(error?.message||String(error)));
 }finally{rouletteBusy=false;updatePickButtons()}
}

async function persistSentence(person,code){const {error}=await sg.rpc('supervisor_change_status',{p_player_id:Number(person.id),p_code:code,p_action:'sentence'});if(error)throw Error(error.message);return '';}
function askSentenceCode(team){if(!adminAuthorized||running||rouletteBusy)return;const members=[...$(`members-${team}`).querySelectorAll('.team-member:not(.roulette-eliminated)')];if(!members.length){sgError('No hay jugadores disponibles.');return;}pendingTeam=team;pendingAction='sentence';$('code-team').textContent=`AVANZAR ESTADO · EQUIPO ${team+1} · ${members.length} candidatos`;$('code-error').hidden=true;codeInput.value='';codeDialog.showModal();codeInput.focus();}
async function rafflePrize(team){
 if(!adminAuthorized||running||rouletteBusy)return;
 const members=[...$(`members-${team}`).querySelectorAll('.team-member:not(.roulette-eliminated)')];
 if(!members.length){sgError('No hay participantes disponibles para el sorteo.');return;}
 rouletteBusy=true;updatePickButtons();sgError('');
 const chosen=members[randomIndex(members.length)],person=chosen._participant;
 let previous=null;
 try{
  setMachine('SORTEO DE PREMIO',`La suerte recorre las casillas del Equipo ${team+1}…`,true);
  // Igual que en la eliminación: luz por cada casilla, sonidos y desaceleración.
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
  previous?.classList.remove('roulette-lit');previous=null;
  chosen.classList.add('roulette-lit','roulette-selected');beep();
  setMachine('GANADOR SELECCIONADO',`${person.name} · Registrando el premio…`,true);
  const {error}=await sg.rpc('supervisor_award_prize',{p_player_id:Number(person.id),p_team_number:team+1});
  if(error)throw Error(error.message);
  showEliminationNotice(person,team,'prize');
  setMachine('PREMIO SORTEADO',`${person.name} ganó un premio del Equipo ${team+1}.`);
 }catch(e){
  setMachine('SORTEO NO CONFIRMADO','No se pudo registrar el premio.');
  sgError('No se pudo registrar el premio: '+(e?.message||String(e)));
 }finally{
  previous?.classList.remove('roulette-lit');
  chosen.classList.remove('roulette-lit','roulette-selected');
  rouletteBusy=false;updatePickButtons();
 }
}

// Una sola transacción y un único código para todos los miembros activos del equipo.
function askSentenceTeamCode(team){
 if(!adminAuthorized||running||rouletteBusy)return;
 const members=[...$(`members-${team}`).querySelectorAll('.team-member:not(.roulette-eliminated)')];
 if(!members.length){sgError('No hay integrantes pendientes de eliminación.');return;}
 pendingTeam=team;pendingAction='sentence_team';
 $('code-team').textContent=`SENTENCIAR TODO EL EQUIPO ${team+1} · ${members.length} jugadores · UN SOLO CÓDIGO`;
 $('code-error').hidden=true;codeInput.value='';codeDialog.showModal();codeInput.focus();
}
async function sentenceWholeTeam(team,code){
 if(!adminAuthorized||running||rouletteBusy)return;
 const cards=[...$(`members-${team}`).querySelectorAll('.team-member:not(.roulette-eliminated)')];
 if(!cards.length)return;
 rouletteBusy=true;updatePickButtons();sgError('');
 setMachine('SENTENCIANDO EQUIPO',`Validando un código para ${cards.length} participantes del Equipo ${team+1}…`,true);
 try{
  const ids=cards.map(card=>Number(card._participant.id));
  const before=new Map(cards.map(card=>[Number(card.dataset.playerId),card._participant.status]));
  const {data,error}=await sg.rpc('supervisor_sentence_team',{p_player_ids:ids,p_code:code});
  if(error)throw Error(error.message||'No se pudo cambiar el estado del equipo.');
  await refreshTeamStatuses(team);
  const sentenced=cards.filter(card=>before.get(Number(card.dataset.playerId))==='active'&&card._participant.status==='sentenced').length;
  const eliminated=cards.filter(card=>before.get(Number(card.dataset.playerId))==='sentenced'&&card._participant.status==='eliminated').length;
  const notice=$('team-elimination-notice');clearTimeout(noticeTimer);
  notice.classList.add('sentencing-notice');notice.querySelector('.notice-out').textContent='SENTENCIA DEL EQUIPO';
  $('winner-number').textContent=`EQUIPO ${team+1}`;
  $('winner-name').textContent='SENTENCIA EJECUTADA';
  $('winner-text').textContent=`${sentenced} sentenciado(s) y ${eliminated} eliminado(s). El tablero se actualizará automáticamente.`;
  $('winner-photo').textContent='⚖️';
  notice.hidden=false;notice.classList.remove('visible');void notice.offsetWidth;notice.classList.add('visible');
  noticeTimer=setTimeout(()=>{notice.classList.remove('visible');setTimeout(()=>notice.hidden=true,450)},4600);
  setMachine('ESTADOS ACTUALIZADOS',`${sentenced} sentenciado(s) y ${eliminated} eliminado(s) en el Equipo ${team+1}, con un solo código.`);
 }catch(error){setMachine('SENTENCIA NO CONFIRMADA','Ningún estado local fue modificado.');sgError('No se pudo sentenciar al equipo: '+(error?.message||String(error)));}
 finally{rouletteBusy=false;updatePickButtons();}
}
