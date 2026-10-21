'use strict';
// Guest-only page: no admin Supabase login, service keys, dossiers or elimination actions.
const $ = id => document.getElementById(id);
const endpoint = `${window.SQUID_CONFIG.supabaseUrl}/functions/v1/supervisor-invitados`;
const state = { token:null, pc:null, channel:null, stream:null, audio:null, timer:null, muted:false, speaking:false, playing:false, stopping:false, handled:new Set() };
function showError(message){$('message').textContent=message||'';}
function voiceStatus(message){$('voiceState').textContent=message;}
async function api(payload){
  const res=await fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json','apikey':window.SQUID_CONFIG.supabaseKey},body:JSON.stringify(payload)});
  const json=await res.json().catch(()=>({}));
  if(!res.ok)throw Error(json.error||`Error del servidor (${res.status})`);
  return json;
}
function send(event){if(state.channel?.readyState==='open')state.channel.send(JSON.stringify(event));}
function syncMic(){state.stream?.getAudioTracks().forEach(t=>{t.enabled=!state.muted&&!state.speaking&&!state.playing;});}
function stop(){
  state.stopping=true;
  if(state.timer){clearTimeout(state.timer);state.timer=null;}
  state.stream?.getTracks().forEach(t=>t.stop());state.stream=null;
  if(state.pc){state.pc.onconnectionstatechange=null;state.pc.close();state.pc=null;}
  if(state.audio){state.audio.pause();state.audio.srcObject=null;state.audio.remove();state.audio=null;}
  state.channel=null;state.token=null;state.handled.clear();state.muted=false;state.speaking=false;state.playing=false;
  $('access').hidden=false;$('session').hidden=true;$('enter').disabled=false;$('guestPin').value='';
  $('interrupt').disabled=true;$('mute').textContent='🔇 Silenciar';
}
async function saveMemory(call){
  let output;
  try{
    const args=JSON.parse(call.arguments||'{}');
    const content=String(args.anecdota||'').trim();
    if(!content)throw Error('No se recibió ninguna anécdota.');
    const saved=await api({action:'save_memory',token:state.token,content});
    output={ok:true,message:saved.message||'Recuerdo guardado'};
  }catch(err){output={ok:false,error:err.message};}
  send({type:'conversation.item.create',item:{type:'function_call_output',call_id:call.call_id,output:JSON.stringify(output)}});
  send({type:'response.create'});
}
function onEvent(event){
  let msg;try{msg=JSON.parse(event.data);}catch{return;}
  if(msg.type==='response.created'){state.speaking=true;state.playing=true;syncMic();}
  if(msg.type==='output_audio_buffer.started'){state.playing=true;syncMic();}
  if(msg.type==='output_audio_buffer.stopped'){state.playing=false;state.speaking=false;syncMic();}
  if(msg.type==='response.done'){
    state.speaking=false;
    if(msg.response?.status==='failed'||msg.response?.status==='cancelled')state.playing=false;
    syncMic();
  }
  if(msg.type==='response.output_item.done'&&msg.item?.type==='function_call'&&msg.item.name==='guardar_anecdota_invitado'){
    const call=msg.item;
    if(call.call_id&&!state.handled.has(call.call_id)){state.handled.add(call.call_id);saveMemory(call);}
  }
  if(msg.type==='error'){console.error('Realtime:',msg.error);showError('El Supervisor encontró un problema: '+(msg.error?.message||'error desconocido'));}
}
async function startVoice(){
  state.stopping=false;
  voiceStatus('Solicitando permiso para el micrófono…');
  state.stream=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true,autoGainControl:true}});
  voiceStatus('Preparando la voz…');
  const secret=await api({action:'voice',token:state.token});
  const ephemeral=secret.client_secret?.value||secret.value;
  if(!ephemeral)throw Error('No se recibió la credencial temporal de voz.');
  state.pc=new RTCPeerConnection();
  state.audio=document.createElement('audio');state.audio.autoplay=true;state.audio.playsInline=true;state.audio.hidden=true;document.body.append(state.audio);
  state.pc.ontrack=e=>{state.audio.srcObject=e.streams[0];state.audio.play().catch(()=>showError('Toca la pantalla para permitir el sonido.'));};
  state.pc.onconnectionstatechange=()=>{if(!state.stopping&&['failed','disconnected'].includes(state.pc?.connectionState)){showError('Se perdió la conexión.');stop();}};
  state.stream.getTracks().forEach(t=>state.pc.addTrack(t,state.stream));
  state.channel=state.pc.createDataChannel('oai-events');state.channel.onmessage=onEvent;
  const offer=await state.pc.createOffer();await state.pc.setLocalDescription(offer);
  const answer=await fetch('https://api.openai.com/v1/realtime/calls',{method:'POST',headers:{Authorization:`Bearer ${ephemeral}`,'Content-Type':'application/sdp'},body:offer.sdp});
  if(!answer.ok)throw Error('No se pudo establecer la llamada de voz.');
  await state.pc.setRemoteDescription({type:'answer',sdp:await answer.text()});
  $('interrupt').disabled=false;voiceStatus('🎙️ Conversación activa. Habla con EL SUPERVISOR.');
  // Client-side maximum duration; not a substitute for server-side cost enforcement.
  state.timer=setTimeout(()=>{showError('La conversación terminó al llegar a 10 minutos.');stop();},10*60*1000);
}
$('accessForm').addEventListener('submit',async e=>{
  e.preventDefault();if(!$('consent').checked)return;
  $('enter').disabled=true;showError('');
  try{
    const guest_name=$('guestName').value.trim();const pin=$('guestPin').value;
    const login=await api({action:'login',guest_name,pin});
    state.token=login.token;$('guestPin').value='';
    $('access').hidden=true;$('session').hidden=false;
    await startVoice();
  }catch(err){stop();showError(err.message||'No se pudo iniciar la conversación.');}
});
$('stop').addEventListener('click',()=>{stop();showError('Conversación terminada.');});
$('mute').addEventListener('click',()=>{state.muted=!state.muted;syncMic();$('mute').textContent=state.muted?'🎤 Activar micrófono':'🔇 Silenciar';});
$('interrupt').addEventListener('click',()=>{
  if(state.channel?.readyState!=='open')return;
  state.speaking=false;state.playing=false;
  send({type:'response.cancel'});
  if(state.audio)state.audio.muted=true;
  voiceStatus('✋ Interrupción solicitada…');
  setTimeout(()=>{if(state.audio)state.audio.muted=false;syncMic();voiceStatus('🎙️ Conversación activa.');},900);
});
window.addEventListener('pagehide',stop);
