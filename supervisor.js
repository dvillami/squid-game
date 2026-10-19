// Voice MVP. No secret OpenAI key is ever placed in this browser code.
const {sg,sgError}=window;
const loginPanel=document.getElementById('loginPanel'),voicePanel=document.getElementById('voicePanel');
const startBtn=document.getElementById('startVoice'),stopBtn=document.getElementById('stopVoice'),muteBtn=document.getElementById('muteVoice');
let pc=null,micStream=null,audioEl=null,muted=false,connecting=false;
let audioContext=null, audioSource=null, audioDestination=null, robotOsc=null, robotGain=null, wetGain=null, dryGain=null;
const robotToggle=document.getElementById('robotToggle');
const robotIntensity=document.getElementById('robotIntensity');
const robotIntensityValue=document.getElementById('robotIntensityValue');
const audioNotice=document.getElementById('audioNotice');
function setAudioNotice(message){audioNotice.textContent=message}
function updateRobotMix(){
  const enabled=robotToggle.checked;
  const intensity=Number(robotIntensity.value)/100;
  robotIntensityValue.textContent=`${robotIntensity.value}%`;
  robotIntensity.disabled=!enabled;
  if(!wetGain||!dryGain||!robotGain)return;
  // Keep intelligibility: always retain some clean audio.
  const wet=enabled?0.18+intensity*0.62:0;
  wetGain.gain.setTargetAtTime(wet,audioContext.currentTime,0.015);
  dryGain.gain.setTargetAtTime(1-wet*0.5,audioContext.currentTime,0.015);
  robotGain.gain.setTargetAtTime(0.48+intensity*0.42,audioContext.currentTime,0.015);
}
robotToggle.addEventListener('change',updateRobotMix);
robotIntensity.addEventListener('input',updateRobotMix);
async function createVoiceProcessor(stream){
  const Context=window.AudioContext||window.webkitAudioContext;
  if(!Context)throw new Error('Este navegador no permite procesar audio.');
  audioContext=new Context();
  audioSource=audioContext.createMediaStreamSource(stream);
  audioDestination=audioContext.createMediaStreamDestination();
  dryGain=audioContext.createGain();
  wetGain=audioContext.createGain();
  const highpass=audioContext.createBiquadFilter();highpass.type='highpass';highpass.frequency.value=160;
  const peak=audioContext.createBiquadFilter();peak.type='peaking';peak.frequency.value=900;peak.Q.value=1.3;peak.gain.value=8;
  const lowpass=audioContext.createBiquadFilter();lowpass.type='lowpass';lowpass.frequency.value=3400;
  const compressor=audioContext.createDynamicsCompressor();compressor.threshold.value=-22;compressor.ratio.value=3;
  robotGain=audioContext.createGain();
  // Ring modulation: creates an audible synthetic/metallic texture.
  robotOsc=audioContext.createOscillator();robotOsc.type='sine';robotOsc.frequency.value=48;
  const modDepth=audioContext.createGain();modDepth.gain.value=0.34;
  robotOsc.connect(modDepth);modDepth.connect(robotGain.gain);
  audioSource.connect(dryGain);dryGain.connect(audioDestination);
  audioSource.connect(highpass);highpass.connect(peak);peak.connect(lowpass);
  lowpass.connect(robotGain);robotGain.connect(compressor);compressor.connect(wetGain);wetGain.connect(audioDestination);
  updateRobotMix();robotOsc.start();
  await audioContext.resume();
  if(audioContext.state!=='running')throw new Error('Safari bloqueó el audio. Toca la pantalla e inténtalo de nuevo.');
  return audioDestination.stream;
}
async function disposeVoiceProcessor(){
  try{robotOsc?.stop()}catch{}
  robotOsc=null;robotGain=null;wetGain=null;dryGain=null;audioSource=null;audioDestination=null;
  if(audioContext){const old=audioContext;audioContext=null;try{await old.close()}catch{}}
}

function status(t){document.getElementById('voiceStatus').textContent=t}
function controls(active){startBtn.disabled=active||connecting;stopBtn.disabled=!active;muteBtn.disabled=!active;muteBtn.textContent=muted?'🎤 Activar micrófono':'🔇 Silenciar micrófono'}
async function checkAdmin(){if(!sg){sgError('No hay conexión con Supabase.');return}const {data:{user},error:userError}=await sg.auth.getUser();if(userError){sgError(userError.message);return}let admin=false;if(user){const {data,error}=await sg.from('admin_users').select('user_id').eq('user_id',user.id).maybeSingle();if(error)throw error;admin=!!data}loginPanel.hidden=admin;voicePanel.hidden=!admin;if(admin){document.getElementById('account').textContent=user.email;sgError('')}else if(user){sgError('Esta cuenta no tiene permisos de administrador.');document.getElementById('loginForm').hidden=true}}
document.getElementById('loginForm').addEventListener('submit',async e=>{e.preventDefault();const {error}=await sg.auth.signInWithPassword({email:document.getElementById('email').value,password:document.getElementById('password').value});if(error)sgError(error.message);else await checkAdmin()});
document.getElementById('logout').addEventListener('click',async()=>{stop();await sg.auth.signOut();location.reload()});
function stop(){disposeVoiceProcessor();setAudioNotice('');if(micStream){micStream.getTracks().forEach(t=>t.stop());micStream=null}if(pc){pc.close();pc=null}if(audioEl){audioEl.pause();audioEl.srcObject=null;audioEl.remove();audioEl=null}muted=false;connecting=false;controls(false);status('En espera')}
startBtn.addEventListener('click',async()=>{if(connecting||pc)return;connecting=true;controls(false);status('Conectando…');sgError('');try{
  // iOS Safari requires the call to originate from a user gesture.
  micStream=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true,autoGainControl:true}});
  const {data:{session}}=await sg.auth.getSession();if(!session)throw Error('Tu sesión ha caducado. Vuelve a iniciar sesión.');
  const response=await fetch(`${window.SQUID_CONFIG.supabaseUrl}/functions/v1/supervisor-session`,{method:'POST',headers:{'Authorization':`Bearer ${session.access_token}`,'apikey':window.SQUID_CONFIG.supabaseKey,'Content-Type':'application/json'},body:'{}'});
  const result=await response.json().catch(()=>({}));if(!response.ok)throw Error(result.error||`No se pudo crear la sesión (${response.status}).`);
  const ephemeral=result.client_secret?.value||result.value;if(!ephemeral)throw Error('OpenAI no devolvió una credencial temporal.');
  pc=new RTCPeerConnection();audioEl=document.createElement('audio');audioEl.autoplay=true;audioEl.playsInline=true;audioEl.style.display='none';document.body.append(audioEl);
  pc.ontrack=async event=>{
    const remoteStream=event.streams[0];
    // Prefer processed output; on unsupported devices, fall back to original voice.
    try{
      audioEl.srcObject=await createVoiceProcessor(remoteStream);
      setAudioNotice('Procesador de voz activo. Puedes alternar entre voz original y robótica.');
    }catch(error){
      await disposeVoiceProcessor();audioEl.srcObject=remoteStream;
      robotToggle.checked=false;robotToggle.disabled=true;robotIntensity.disabled=true;
      setAudioNotice('Efecto no disponible en este dispositivo. Usando voz original.');
    }
    audioEl.play().catch(()=>{
      setAudioNotice('El navegador bloqueó el sonido. Pulsa «Activar audio» para escucharlo.');
      document.getElementById('unlockAudio').hidden=false;
    });
  };
  pc.onconnectionstatechange=()=>{if(pc?.connectionState==='failed'||pc?.connectionState==='disconnected'){sgError('Se perdió la conexión de voz.');stop()}};
  micStream.getTracks().forEach(track=>pc.addTrack(track,micStream));
  const channel=pc.createDataChannel('oai-events');channel.onopen=()=>{channel.send(JSON.stringify({type:'response.create',response:{instructions:'Preséntate brevemente en español como EL SUPERVISOR y da una bienvenida teatral y sarcástica a la fiesta. No afirmes que puedes modificar el tablero todavía.'}}))};
  const offer=await pc.createOffer();await pc.setLocalDescription(offer);
  const sdp=await fetch('https://api.openai.com/v1/realtime/calls',{method:'POST',headers:{'Authorization':`Bearer ${ephemeral}`,'Content-Type':'application/sdp'},body:offer.sdp});if(!sdp.ok)throw Error('Error al establecer audio con OpenAI: '+(await sdp.text()).slice(0,250));
  await pc.setRemoteDescription({type:'answer',sdp:await sdp.text()});connecting=false;controls(true);status('🎙️ Conversación activa');
}catch(err){stop();sgError('No se pudo iniciar la voz: '+err.message)}});
document.getElementById('unlockAudio').addEventListener('click',async()=>{
  try{await audioContext?.resume();await audioEl?.play();document.getElementById('unlockAudio').hidden=true;setAudioNotice('Audio activado.')}catch(e){sgError('No se pudo activar el audio: '+e.message)}
});
muteBtn.addEventListener('click',()=>{if(!micStream)return;muted=!muted;micStream.getAudioTracks().forEach(t=>t.enabled=!muted);controls(true);status(muted?'Micrófono silenciado':'🎙️ Conversación activa')});stopBtn.addEventListener('click',stop);
window.addEventListener('pagehide',stop);checkAdmin().catch(e=>sgError(e.message));
