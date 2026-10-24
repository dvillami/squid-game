'use strict';
const {sg}=window;
let player=null,ytReady=false,authorized=false,unlocked=false,revision=-1,currentVideoId=null,channel=null,refreshTimer=null;
const el=id=>document.getElementById(id);
function note(t){el('video-status').textContent=t}
function videoId(url){try{const u=new URL(url);const h=u.hostname.toLowerCase();if(h==='youtu.be'||h==='www.youtu.be')return /^[\w-]{11}$/.test(u.pathname.slice(1))?u.pathname.slice(1):null;if(['youtube.com','www.youtube.com','m.youtube.com','youtube-nocookie.com','www.youtube-nocookie.com'].includes(h)){let id=u.searchParams.get('v');if(!id&&u.pathname.startsWith('/shorts/'))id=u.pathname.split('/')[2];if(!id&&u.pathname.startsWith('/embed/'))id=u.pathname.split('/')[2];return /^[\w-]{11}$/.test(id||'')?id:null}}catch{}return null}
window.onYouTubeIframeAPIReady=()=>{ytReady=true;initPlayer()};
function initPlayer(){if(!ytReady||player)return;player=new YT.Player('yt-player',{width:'100%',height:'100%',playerVars:{playsinline:1,rel:0,autoplay:0,enablejsapi:1},events:{onReady:()=>{if(authorized){revision=-1;sync()}},onError:e=>note('YouTube no puede reproducir este video ('+e.data+').')}})}
async function isAdmin(){const {data:{user}}=await sg.auth.getUser();if(!user)return false;const {data,error}=await sg.from('admin_users').select('user_id').eq('user_id',user.id).maybeSingle();return !error&&!!data}
async function authorize(){authorized=await isAdmin();el('video-login').hidden=authorized;if(!authorized){note('Acceso restringido');return}note('Pantalla conectada · pulsa ACTIVAR PANTALLA');initPlayer();await sync();if(channel)sg.removeChannel(channel);channel=sg.channel('videos-pantalla').on('postgres_changes',{event:'*',schema:'public',table:'video_playback',filter:'id=eq.1'},()=>sync()).subscribe();clearInterval(refreshTimer);refreshTimer=setInterval(sync,4000)}
async function sync(){if(!authorized||!sg)return;const {data:state,error}=await sg.from('video_playback').select('*').eq('id',1).single();if(error){note('Error de sincronización: '+error.message);return}if(state.revision===revision)return;revision=state.revision;
 if(state.action==='stop'||!state.video_id){currentVideoId=null;player?.stopVideo?.();el('video-placeholder').hidden=false;el('video-title').textContent='Ningún video seleccionado';el('video-description').textContent='Esperando una orden del Supervisor';note('Pantalla en espera');return}
 if(state.action==='pause'){player?.pauseVideo?.();note('Video en pausa');return}
 const {data:video,error:ve}=await sg.from('game_videos').select('*').eq('id',state.video_id).single();if(ve||!video){note('No se encontró el video');return}const id=videoId(video.youtube_url);if(!id){note('Enlace de YouTube inválido');return}
 el('video-title').textContent=video.name;el('video-description').textContent=video.description||video.game_name||'';el('video-placeholder').hidden=true;
 if(!player){note('Esperando reproductor de YouTube…');return}
 if(currentVideoId!==id){currentVideoId=id;player.loadVideoById(id)}else player.playVideo();note(unlocked?'Reproduciendo: '+video.name:'Video seleccionado · pulsa ACTIVAR PANTALLA para habilitar sonido');
}
el('activate').addEventListener('click',()=>{unlocked=true;try{player?.unMute();player?.setVolume(100);player?.playVideo()}catch{}el('activate').textContent='🔊 SONIDO ACTIVADO';note('Pantalla activada. Esperando órdenes.');});
el('fullscreen').addEventListener('click',()=>el('player-shell').requestFullscreen?.().catch(()=>note('Pantalla completa no disponible en este navegador')));
el('video-login-form').addEventListener('submit',async e=>{e.preventDefault();const {error}=await sg.auth.signInWithPassword({email:el('video-email').value,password:el('video-password').value});if(error)note(error.message);else await authorize()});
if(sg)authorize();else note('Falta la configuración de Supabase');
