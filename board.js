const {sg,sgConfigured,sgError,sgElement,sgPhoto}=window;
let oldStatus=new Map(),soundEnabled=false,hasLoaded=false;
const soundBtn=document.getElementById('sound');
soundBtn.addEventListener('click',()=>{soundEnabled=!soundEnabled;soundBtn.textContent=soundEnabled?'🔊 Silenciar':'🔇 Activar sonido';if(soundEnabled)playSound(true);});
function playSound(test=false){try{const ctx=new(window.AudioContext||window.webkitAudioContext)();const osc=ctx.createOscillator(),gain=ctx.createGain();osc.type='sawtooth';osc.frequency.setValueAtTime(test?450:250,ctx.currentTime);osc.frequency.exponentialRampToValueAtTime(test?600:70,ctx.currentTime+.27);gain.gain.setValueAtTime(.06,ctx.currentTime);gain.gain.exponentialRampToValueAtTime(.001,ctx.currentTime+.32);osc.connect(gain);gain.connect(ctx.destination);osc.start();osc.stop(ctx.currentTime+.33);osc.onended=()=>ctx.close();}catch(e){console.warn(e)}}
// Avisos temporales: se muestran solamente para eliminaciones nuevas, no al abrir la pagina.
const eliminationQueue=[];
let showingElimination=false;
const notice= document.createElement('aside');
notice.className='elimination-notice';
notice.setAttribute('role','status');
notice.setAttribute('aria-live','polite');
notice.setAttribute('aria-atomic','true');
notice.hidden=true;
notice.innerHTML='<div class="notice-head">△ &nbsp; ATENCIÓN · SQUID GAME &nbsp; ○</div><div class="notice-body"><div class="notice-photo"></div><div class="notice-copy"><div class="notice-number"></div><strong class="notice-name"></strong><div class="notice-out">ELIMINADO</div><p>El juego continúa... ¿Quién será el siguiente?</p></div></div><div class="notice-progress"></div>';
document.body.append(notice);
function showNextElimination(){
 if(showingElimination||!eliminationQueue.length)return;
 showingElimination=true;
 const player=eliminationQueue.shift();
 notice.querySelector('.notice-number').textContent='JUGADOR '+String(player.id).padStart(3,'0');
 notice.querySelector('.notice-name').textContent=player.name||'Participante';
 const photo=notice.querySelector('.notice-photo');photo.replaceChildren();
 if(sgPhoto(player.photo_url)){
  const img=document.createElement('img');img.src=player.photo_url;img.alt='Foto de '+(player.name||'participante');
  img.onerror=()=>img.replaceWith(document.createTextNode('○'));
  photo.append(img);
 }else photo.textContent='○';
 notice.hidden=false;
 // Reiniciar la animacion incluso si hay varias eliminaciones seguidas.
 notice.classList.remove('visible');void notice.offsetWidth;notice.classList.add('visible');
 setTimeout(()=>{notice.classList.remove('visible');setTimeout(()=>{notice.hidden=true;showingElimination=false;showNextElimination()},450)},4550);
}
function draw(allPlayers,settings){const players=allPlayers.filter(p=>Number(p.id)<=18);document.getElementById('total').textContent=players.length;document.getElementById('active').textContent=players.filter(p=>!p.eliminated).length;document.getElementById('out').textContent=players.filter(p=>p.eliminated).length;document.getElementById('status').textContent=({waiting:'Esperando el inicio',playing:'Juego en directo',finished:'Juego finalizado'})[settings?.game_status]||'Tablero en directo';const root=document.getElementById('players');root.replaceChildren();for(const p of players){const card=sgElement('article','player'+(p.eliminated?' eliminated':''));const photo=sgElement('div','photo');if(sgPhoto(p.photo_url)){const img=sgElement('img');img.src=p.photo_url;img.alt='Foto de '+p.name;img.loading='lazy';img.onerror=()=>img.replaceWith(sgElement('span','placeholder','◯'));photo.append(img)}else photo.append(sgElement('span','placeholder','◯'));photo.append(sgElement('span','number',String(p.id).padStart(3,'0')));const info=sgElement('div','playerInfo');info.append(sgElement('strong','',p.name),sgElement('span','',p.eliminated?'ELIMINADO':'EN JUEGO'));card.append(photo,info);root.append(card)}const newlyEliminated=hasLoaded?players.filter(p=>p.eliminated && oldStatus.get(p.id)===false):[];if(newlyEliminated.length){eliminationQueue.push(...newlyEliminated);showNextElimination();if(soundEnabled)playSound();}oldStatus=new Map(players.map(p=>[p.id,p.eliminated]));hasLoaded=true;}
async function refresh(){const [p,s]=await Promise.all([sg.from('participants').select('*').order('id'),sg.from('game_settings').select('*').eq('id',1).single()]);if(p.error||s.error){sgError('No se pudo cargar el tablero: '+(p.error?.message||s.error?.message));return}sgError('');draw(p.data.filter(p=>p.id<=18),s.data)}
if(!sgConfigured||!sg){sgError('Falta configurar config.js con la URL y la clave publicable de Supabase.');document.getElementById('status').textContent='Sin configurar';}else{refresh();sg.channel('squid-board').on('postgres_changes',{event:'*',schema:'public',table:'participants'},refresh).on('postgres_changes',{event:'*',schema:'public',table:'game_settings'},refresh).subscribe();document.addEventListener('visibilitychange',()=>{if(!document.hidden)refresh()});setInterval(refresh,15000);}
