const {sg,sgConfigured,sgError,sgElement,sgPhoto}=window;
let oldStatus=new Map(),soundEnabled=false,hasLoaded=false;
const I18N={
 es:{navBoard:'Tablero',navAdmin:'Administrar',edition:'○ △ □   SQUID GAME · EDICIÓN HALLOWEEN   🎃',birthday:'🎃 Celebrando el <em>cumple de Mayra</em> 🎂',subtitle:'¿Quién sobrevivirá a esta noche de juegos?',qrAria:'Abrir tablero en el celular',qrAlt:'Código QR para ver el tablero desde el celular',scan:'ESCANEA Y SIGUE EL JUEGO',participants:'PARTICIPANTES',inGame:'EN JUEGO',eliminated:'ELIMINADOS',stats:'Estadísticas',footer:'🎃   EL CUMPLE DE MAYRA · SQUID GAME HALLOWEEN   ○ △ □',mute:'🔊 Silenciar',sound:'🔇 Activar sonido',waiting:'Esperando el inicio',playing:'Juego en directo',finished:'Juego finalizado',live:'Tablero en directo',connecting:'Conectando…',noConfig:'Sin configurar',player:'JUGADOR',participant:'Participante',photo:'Foto de ',active:'EN JUEGO',sentenced:'SENTENCIADO',out:'ELIMINADO',attention:'△   ATENCIÓN · SQUID GAME   ○',pending:'Su destino está pendiente…',continues:'El juego continúa... ¿Quién será el siguiente?',loadError:'No se pudo cargar el tablero: ',configError:'Falta configurar config.js con la URL y la clave publicable de Supabase.'},
 fr:{navBoard:'Tableau',navAdmin:'Administration',edition:'○ △ □   SQUID GAME · ÉDITION HALLOWEEN   🎃',birthday:'🎃 Nous fêtons <em>l’anniversaire de Mayra</em> 🎂',subtitle:'Qui survivra à cette soirée de jeux ?',qrAria:'Ouvrir le tableau sur votre téléphone',qrAlt:'Code QR pour voir le tableau sur votre téléphone',scan:'SCANEZ POUR SUIVRE LE JEU',participants:'PARTICIPANTS',inGame:'EN JEU',eliminated:'ÉLIMINÉS',stats:'Statistiques',footer:'🎃   ANNIVERSAIRE DE MAYRA · SQUID GAME HALLOWEEN   ○ △ □',mute:'🔊 Couper le son',sound:'🔇 Activer le son',waiting:'En attente du début',playing:'Jeu en cours',finished:'Jeu terminé',live:'Tableau en direct',connecting:'Connexion…',noConfig:'Non configuré',player:'JOUEUR',participant:'Participant',photo:'Photo de ',active:'EN JEU',sentenced:'CONDAMNÉ',out:'ÉLIMINÉ',attention:'△   ATTENTION · SQUID GAME   ○',pending:'Son sort reste en suspens…',continues:'Le jeu continue… Qui sera le prochain ?',loadError:'Impossible de charger le tableau : ',configError:'Veuillez configurer config.js avec l’URL et la clé publique de Supabase.'}
};
let boardLanguage='es';try{boardLanguage=localStorage.getItem('squid-board-language')==='fr'?'fr':'es'}catch(_){}
const t=(key)=>I18N[boardLanguage][key]||key;
function applyLanguage(){document.documentElement.lang=boardLanguage;document.querySelectorAll('[data-i18n]').forEach(el=>el.textContent=t(el.dataset.i18n));document.querySelectorAll('[data-i18n-html]').forEach(el=>el.innerHTML=t(el.dataset.i18nHtml));document.querySelectorAll('[data-i18n-aria]').forEach(el=>el.setAttribute('aria-label',t(el.dataset.i18nAria)));document.querySelectorAll('[data-i18n-alt]').forEach(el=>el.alt=t(el.dataset.i18nAlt));document.getElementById('languageToggle').textContent=boardLanguage==='es'?'🇫🇷 Français':'🇪🇸 Español';document.getElementById('languageToggle').setAttribute('aria-label',boardLanguage==='es'?'Passer en français':'Cambiar a español');soundBtn.textContent=t(soundEnabled?'mute':'sound');notice.querySelector('.notice-head').textContent=t('attention');if(!notice.hidden){const p=notice.currentPlayer;if(p)updateNoticeText(p)}if(lastBoardPlayers&&lastBoardSettings)draw(lastBoardPlayers,lastBoardSettings,false);else document.getElementById('status').textContent=t('connecting');}
let lastBoardPlayers=null,lastBoardSettings=null;

const soundBtn=document.getElementById('sound');
soundBtn.addEventListener('click',()=>{soundEnabled=!soundEnabled;soundBtn.textContent=t(soundEnabled?'mute':'sound');if(soundEnabled)playSound(true);});
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
function updateNoticeText(player){const sentenced=player.status==='sentenced';notice.classList.toggle('sentencing-notice',sentenced);notice.querySelector('.notice-out').textContent=t(sentenced?'sentenced':'out');notice.querySelector('.notice-copy p').textContent=t(sentenced?'pending':'continues');notice.querySelector('.notice-number').textContent=t('player')+' '+String(player.id).padStart(3,'0');notice.querySelector('.notice-name').textContent=player.name||t('participant');notice.querySelector('.notice-head').textContent=t('attention');}
function showNextElimination(){
 if(showingElimination||!eliminationQueue.length)return;
 showingElimination=true;
 const player=eliminationQueue.shift();
 notice.currentPlayer=player;updateNoticeText(player);
 notice.querySelector('.notice-number').textContent=t('player')+' '+String(player.id).padStart(3,'0');
 notice.querySelector('.notice-name').textContent=player.name||t('participant');
 const photo=notice.querySelector('.notice-photo');photo.replaceChildren();
 if(sgPhoto(player.photo_url)){
  const img=document.createElement('img');img.src=player.photo_url;img.alt=t('photo')+(player.name||t('participant'));
  img.onerror=()=>img.replaceWith(document.createTextNode('○'));
  photo.append(img);
 }else photo.textContent='○';
 notice.hidden=false;
 // Reiniciar la animacion incluso si hay varias eliminaciones seguidas.
 notice.classList.remove('visible');void notice.offsetWidth;notice.classList.add('visible');
 setTimeout(()=>{notice.classList.remove('visible');setTimeout(()=>{notice.hidden=true;showingElimination=false;showNextElimination()},450)},4550);
}
function draw(allPlayers,settings,detectChanges=true){lastBoardPlayers=allPlayers;lastBoardSettings=settings;const players=allPlayers.filter(p=>Number(p.id)<=18);document.getElementById('total').textContent=players.length;document.getElementById('active').textContent=players.filter(p=>!p.eliminated).length;document.getElementById('out').textContent=players.filter(p=>p.eliminated).length;document.getElementById('status').textContent=({waiting:t('waiting'),playing:t('playing'),finished:t('finished')})[settings?.game_status]||t('live');const root=document.getElementById('players');root.replaceChildren();for(const p of players){const card=sgElement('article','player'+(p.eliminated?' eliminated':p.status==='sentenced'?' sentenced':''));const photo=sgElement('div','photo');if(sgPhoto(p.photo_url)){const img=sgElement('img');img.src=p.photo_url;img.alt=t('photo')+p.name;img.loading='lazy';img.onerror=()=>img.replaceWith(sgElement('span','placeholder','◯'));photo.append(img)}else photo.append(sgElement('span','placeholder','◯'));photo.append(sgElement('span','number',String(p.id).padStart(3,'0')));const info=sgElement('div','playerInfo');info.append(sgElement('strong','',p.name),sgElement('span','',p.eliminated?t('out'):p.status==='sentenced'?t('sentenced'):t('active')));card.append(photo,info);root.append(card)}const changes=detectChanges&&hasLoaded?players.filter(p=>['sentenced','eliminated'].includes(p.status|| (p.eliminated?'eliminated':'active')) && oldStatus.get(p.id)!==(p.status||(p.eliminated?'eliminated':'active'))):[];if(changes.length){eliminationQueue.push(...changes);showNextElimination();if(soundEnabled)playSound();}oldStatus=new Map(players.map(p=>[p.id,p.status||(p.eliminated?'eliminated':'active')]));hasLoaded=true;}
async function refresh(){const [p,s]=await Promise.all([sg.from('participants').select('*').order('id'),sg.from('game_settings').select('*').eq('id',1).single()]);if(p.error||s.error){sgError(t('loadError')+(p.error?.message||s.error?.message));return}sgError('');draw(p.data.filter(p=>p.id<=18),s.data)}
if(!sgConfigured||!sg){sgError(t('configError'));document.getElementById('status').textContent=t('noConfig');}else{refresh();sg.channel('squid-board').on('postgres_changes',{event:'*',schema:'public',table:'participants'},refresh).on('postgres_changes',{event:'*',schema:'public',table:'game_settings'},refresh).subscribe();document.addEventListener('visibilitychange',()=>{if(!document.hidden)refresh()});setInterval(refresh,15000);}

document.getElementById('languageToggle').addEventListener('click',()=>{boardLanguage=boardLanguage==='es'?'fr':'es';try{localStorage.setItem('squid-board-language',boardLanguage)}catch(_){}applyLanguage()});
applyLanguage();
