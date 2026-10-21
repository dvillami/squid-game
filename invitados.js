'use strict';
// Guest-only page: no admin Supabase login, service keys, dossiers or elimination actions.
const $ = id => document.getElementById(id);
const endpoint = `${window.SQUID_CONFIG.supabaseUrl}/functions/v1/supervisor-invitados`;
const state = { token:null, pc:null, channel:null, stream:null, audio:null, timer:null, muted:false, speaking:false, playing:false, stopping:false, handled:new Set(), robotCtx:null, robotGain:null, robotSource:null, remoteStream:null, robotReady:false, robotOn:true, analysisBusy:false, lastAnalysis:0, analyzed:new Set() };
function showError(message){$('message').textContent=message||'';}
function voiceStatus(message){$('voiceState').textContent=message;}
async function api(payload){
  const res=await fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json','apikey':window.SQUID_CONFIG.supabaseKey},body:JSON.stringify(payload)});
  const json=await res.json().catch(()=>({}));
  if(!res.ok)throw Error(json.error||`Error del servidor (${res.status})`);
  return json;
}
let robotPitch=null,robotMetal=null,robotDelay=null;
const pitchWorkletSource=`
class VoiceMachinePitch extends AudioWorkletProcessor {
 constructor(){super();this.buf=new Float32Array(32768);this.write=0;this.t=0;this.grain=Math.max(1024,Math.round(sampleRate*.085));this.lag=this.grain*2;this.ratio=Math.pow(2,-7/12);}
 sample(p){let n=this.buf.length;let a=((p%n)+n)%n;let i=Math.floor(a);let f=a-i;return this.buf[i]*(1-f)+this.buf[(i+1)%n]*f;}
 process(inputs,outputs){const input=inputs[0],out=outputs[0];if(!out?.[0])return true;let src=input?.[0];for(let i=0;i<out[0].length;i++){
 let x=src?.[i]||0;this.buf[this.write]=x;
 let phase=this.t%this.grain,half=this.grain/2;
 let read1=this.write-this.lag-phase+phase*this.ratio;
 let phase2=(phase+half)%this.grain;
 let read2=this.write-this.lag-phase2+phase2*this.ratio;
 let w1=.5-.5*Math.cos(2*Math.PI*phase/this.grain),w2=.5-.5*Math.cos(2*Math.PI*phase2/this.grain);
 let y=(this.sample(read1)*w1+this.sample(read2)*w2)/Math.max(.01,w1+w2);
 for(const ch of out)ch[i]=y;
 this.write=(this.write+1)%this.buf.length;this.t++;
 }return true;}
}registerProcessor('voice-machine-pitch',VoiceMachinePitch);`;
async function setupRobot(){
 if(state.robotReady||!state.remoteStream)return;
 const Context=window.AudioContext||window.webkitAudioContext;
 if(!Context||!window.AudioWorkletNode)throw Error('Este navegador no admite el procesador de voz.');
 state.robotCtx=new Context();
 const url=URL.createObjectURL(new Blob([pitchWorkletSource],{type:'application/javascript'}));
 try{await state.robotCtx.audioWorklet.addModule(url)}finally{URL.revokeObjectURL(url)}
 state.robotSource=state.robotCtx.createMediaStreamSource(state.remoteStream);
 robotPitch=new AudioWorkletNode(state.robotCtx,'voice-machine-pitch');
 const dry=state.robotCtx.createGain();dry.gain.value=.9;
 const ring=state.robotCtx.createGain();ring.gain.value=.1;
 const osc=state.robotCtx.createOscillator();osc.frequency.value=37;
 const mod=state.robotCtx.createGain();mod.gain.value=.65;
 osc.connect(mod);mod.connect(ring.gain);osc.start();
 robotMetal=state.robotCtx.createBiquadFilter();robotMetal.type='lowpass';robotMetal.frequency.value=3900;
 robotDelay=state.robotCtx.createDelay(.1);robotDelay.delayTime.value=.018;
 const echoGain=state.robotCtx.createGain();echoGain.gain.value=.1;
 state.robotGain=state.robotCtx.createGain();state.robotGain.gain.value=0;
 state.robotSource.connect(robotPitch);
 robotPitch.connect(dry);robotPitch.connect(ring);
 dry.connect(robotMetal);ring.connect(robotMetal);
 robotMetal.connect(state.robotGain);
 robotMetal.connect(robotDelay);robotDelay.connect(echoGain);echoGain.connect(state.robotGain);
 state.robotGain.connect(state.robotCtx.destination);
 state.robotReady=true;
}

async function enableRobot(){
  state.robotOn=true;
  if(!state.remoteStream)return;
  try{
    await setupRobot();
    await state.robotCtx.resume();
    if(state.robotCtx.state!=='running')throw Error('Audio suspendido');
    state.robotGain.gain.value=.85;
    if(state.audio)state.audio.muted=true;
  }catch(err){
    console.warn('Efecto robótico no disponible:',err);
    state.robotOn=false;
    $('robotToggle').checked=false;
    if(state.audio)state.audio.muted=false;
    showError('No se pudo activar la voz robótica. Se usará la voz original.');
  }
}
function disableRobot(){state.robotOn=false;if(state.robotGain)state.robotGain.gain.value=0;if(state.audio)state.audio.muted=false;}
function clearRobot(){disableRobot();if(state.robotCtx)state.robotCtx.close().catch(()=>{});state.robotCtx=null;state.robotGain=null;state.robotSource=null;state.remoteStream=null;state.robotReady=false;robotPitch=robotMetal=robotDelay=null;}

function send(event){if(state.channel?.readyState==='open')state.channel.send(JSON.stringify(event));}
function syncMic(){state.stream?.getAudioTracks().forEach(t=>{t.enabled=!state.muted&&!state.speaking&&!state.playing;});}
function stop(){
  state.stopping=true;
  if(state.timer){clearTimeout(state.timer);state.timer=null;}
  state.stream?.getTracks().forEach(t=>t.stop());state.stream=null;
  clearRobot();
  if(state.pc){state.pc.onconnectionstatechange=null;state.pc.close();state.pc=null;}
  if(state.audio){state.audio.pause();state.audio.srcObject=null;state.audio.remove();state.audio=null;}
  state.channel=null;state.token=null;state.handled.clear();state.analyzed.clear();state.muted=false;state.speaking=false;state.playing=false;
  $('access').hidden=false;$('session').hidden=true;$('enter').disabled=false;$('guestPin').value='';$('startConversation').disabled=false;$('startConversation').hidden=false;
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
async function analyzeMemory(transcript, itemId){
  if(!transcript || transcript.length<20 || state.analysisBusy || !state.token)return;
  if(state.analyzed.has(itemId))return;
  state.analyzed.add(itemId);
  if(Date.now()-state.lastAnalysis<35000)return;
  state.lastAnalysis=Date.now();state.analysisBusy=true;
  try{
    const result=await api({action:'analyze_memory',token:state.token,transcript});
    if(result.saved){$('memoryState').textContent='🧠 Anécdota relevante guardada en Supabase.';}
    else {$('memoryState').textContent='🧠 Conversación analizada; sin nuevo recuerdo relevante.';}
  }catch(err){console.error('Memoria automática:',err);$('memoryState').textContent='⚠️ No se pudo verificar el guardado: '+err.message;}
  finally{state.analysisBusy=false;}
}
function onEvent(event){
  let msg;try{msg=JSON.parse(event.data);}catch{return;}
  if(msg.type==='conversation.item.input_audio_transcription.completed'){analyzeMemory(String(msg.transcript||''),String(msg.item_id||Date.now()));}
  if(msg.type==='conversation.item.input_audio_transcription.failed')console.warn('Transcripción no disponible:',msg.error);
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
  state.pc.ontrack=e=>{state.remoteStream=e.streams[0];state.audio.srcObject=state.remoteStream;state.audio.play().catch(()=>showError('Toca la pantalla para permitir el sonido.'));if($('robotToggle').checked)enableRobot();};
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
    $('access').hidden=true;$('session').hidden=false;voiceStatus('Acceso concedido. Pulsa Iniciar conversación.');
  }catch(err){stop();showError(err.message||'No se pudo iniciar la conversación.');}
});
$('startConversation').addEventListener('click',async()=>{ $('startConversation').disabled=true;showError('');try{await startVoice();$('startConversation').hidden=true;}catch(err){showError(err.message||'No se pudo conectar.');$('startConversation').disabled=false;}});
$('robotToggle').addEventListener('change',()=>{if($('robotToggle').checked)enableRobot();else disableRobot();});
$('stop').addEventListener('click',()=>{stop();showError('Conversación terminada.');});
$('mute').addEventListener('click',()=>{state.muted=!state.muted;syncMic();$('mute').textContent=state.muted?'🎤 Activar micrófono':'🔇 Silenciar';});
$('interrupt').addEventListener('click',()=>{
  if(state.channel?.readyState!=='open')return;
  state.speaking=false;state.playing=false;
  send({type:'response.cancel'});
  if(state.audio)state.audio.muted=true;
  voiceStatus('✋ Interrupción solicitada…');
  setTimeout(()=>{if(state.audio)state.audio.muted=state.robotOn;if(state.robotGain)state.robotGain.gain.value=state.robotOn?.85:0;syncMic();voiceStatus('🎙️ Conversación activa.');},900);
});
window.addEventListener('pagehide',stop);
