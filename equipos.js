
'use strict';
const {sg,sgConfigured,sgError,sgPhoto,sgElement}=window;
const $=id=>document.getElementById(id);
const countSelect=$('team-count'),startBtn=$('start'),skipBtn=$('skip');
let pool=[],sequence=[],cursor=0,timer=null,running=false,audioCtx=null;
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
}
function updateProgress(){
 $('draw-count').textContent=`${cursor} / ${sequence.length} asignados`;
 $('progress-fill').style.width=`${sequence.length?100*cursor/sequence.length:0}%`;
}
function finish(){
 running=false;clearTimeout(timer);timer=null;
 startBtn.disabled=!pool.length;countSelect.disabled=false;skipBtn.disabled=true;
 setMachine('SORTEO FINALIZADO',`${sequence.length} participantes distribuidos. ¡Que comience el juego!`);
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
 startBtn.disabled=true;countSelect.disabled=true;skipBtn.disabled=false;
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
 if(!running){buildTeams(Number(countSelect.value));$('progress-fill').style.width='0%';$('draw-count').textContent='0 / 0 asignados'}
});
async function loadPlayers(){
 if(!sgConfigured||!sg){sgError('No se pudo conectar con Supabase. Comprueba config.js.');setMachine('SIN CONEXIÓN','Revisa la configuración.');return}
 const {data,error}=await sg.from('participants').select('id,name,photo_url,eliminated').order('id');
 if(error){sgError('Error al cargar participantes: '+error.message);setMachine('ERROR','No se pudieron cargar los jugadores.');return}
 // Misma selección de 18 plazas que el tablero. Los eliminados no participan.
 pool=(data||[]).filter(p=>Number(p.id)<=18&&!p.eliminated);
 $('pool-count').textContent=`${pool.length} participantes en juego`;
 startBtn.disabled=pool.length<Number(countSelect.value);
 if(pool.length<2)setMachine('SIN PARTICIPANTES','Se necesitan al menos dos jugadores activos.');
 else setMachine('MÁQUINA LISTA','Pulsa INICIAR SORTEO para formar los equipos.');
}
buildTeams(2);
loadPlayers();
