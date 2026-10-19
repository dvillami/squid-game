// Voice MVP. No secret OpenAI key is ever placed in this browser code.
const {sg,sgError}=window;
const loginPanel=document.getElementById('loginPanel'),voicePanel=document.getElementById('voicePanel');
const startBtn=document.getElementById('startVoice'),stopBtn=document.getElementById('stopVoice'),muteBtn=document.getElementById('muteVoice');
let pc=null,micStream=null,audioEl=null,muted=false,connecting=false;
let supervisorChannel=null;

// Independent, optional voice effect. Original audio remains the fallback.
let robotCtx=null,robotSource=null,robotPitch=null,robotMetal=null,robotDelay=null,robotGain=null;
let remoteStream=null,robotOn=false,robotReady=false;
const robotPanel=document.createElement('section');
robotPanel.style.cssText='margin:18px 0;padding:16px;border:1px solid #9c5268;border-radius:12px;background:rgba(100,30,50,.13);color:inherit';
robotPanel.innerHTML=`<h3 style="margin:0 0 10px">🤖 Voz de máquina — prueba en directo</h3><label style="display:flex;gap:10px;align-items:center"><input id="robotToggle" type="checkbox"> Activar efecto robótico (voz normal de respaldo)</label><p style="margin:10px 0 0;font-size:.9em">Profundidad: <b>−7 semitonos</b> · Metal: <b>10 %</b> · Resonancia: <b>10 %</b></p><p id="robotStatus" style="font-size:.85em;margin:8px 0 0">Desactivado. El Supervisor usa la voz original.</p>`;
voicePanel.append(robotPanel);
const robotToggle=robotPanel.querySelector('#robotToggle');
const robotStatus=robotPanel.querySelector('#robotStatus');
robotToggle.addEventListener('change',async()=>{if(robotToggle.checked){await enableRobot()}else disableRobot()});
function robotMsg(message){robotStatus.textContent=message}
function disableRobot(){robotOn=false;if(audioEl)audioEl.muted=false;if(robotGain)robotGain.gain.value=0;robotMsg('Desactivado: voz original funcionando.');}
function clearRobot(){disableRobot();remoteStream=null;robotReady=false;if(robotCtx){robotCtx.close().catch(()=>{});robotCtx=null}robotSource=robotPitch=robotMetal=robotDelay=robotGain=null;}
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
 if(robotReady||!remoteStream)return;
 const Context=window.AudioContext||window.webkitAudioContext;
 if(!Context||!window.AudioWorkletNode)throw Error('Este navegador no admite el procesador de voz.');
 robotCtx=new Context();
 const url=URL.createObjectURL(new Blob([pitchWorkletSource],{type:'application/javascript'}));
 try{await robotCtx.audioWorklet.addModule(url)}finally{URL.revokeObjectURL(url)}
 robotSource=robotCtx.createMediaStreamSource(remoteStream);
 robotPitch=new AudioWorkletNode(robotCtx,'voice-machine-pitch');
 const dry=robotCtx.createGain();dry.gain.value=.9;
 const ring=robotCtx.createGain();ring.gain.value=.1;
 const osc=robotCtx.createOscillator();osc.frequency.value=37;
 const mod=robotCtx.createGain();mod.gain.value=.65;
 osc.connect(mod);mod.connect(ring.gain);osc.start();
 robotMetal=robotCtx.createBiquadFilter();robotMetal.type='lowpass';robotMetal.frequency.value=3900;
 robotDelay=robotCtx.createDelay(.1);robotDelay.delayTime.value=.018;
 const echoGain=robotCtx.createGain();echoGain.gain.value=.1;
 robotGain=robotCtx.createGain();robotGain.gain.value=0;
 robotSource.connect(robotPitch);
 robotPitch.connect(dry);robotPitch.connect(ring);
 dry.connect(robotMetal);ring.connect(robotMetal);
 robotMetal.connect(robotGain);
 robotMetal.connect(robotDelay);robotDelay.connect(echoGain);echoGain.connect(robotGain);
 robotGain.connect(robotCtx.destination);
 robotReady=true;
}
async function enableRobot(){
 robotOn=true;
 if(!remoteStream){robotMsg('Efecto preparado. Inicia la conversación para escucharlo.');return;}
 try{
  robotMsg('Preparando la voz grave…');
  await setupRobot();
  await robotCtx.resume();
  if(robotCtx.state!=='running')throw Error('El navegador suspendió el audio.');
  if(!robotOn)return;
  robotGain.gain.value=.85;
  if(audioEl)audioEl.muted=true;
  robotMsg('ACTIVO: −7 semitonos, metal 10 %, resonancia 10 %. Si no se oye, desmarca la casilla.');
 }catch(e){disableRobot();robotToggle.checked=false;robotMsg('No se pudo activar el efecto. Se conserva la voz normal. '+e.message)}
}

// Written organizer chat. Messages share the active Realtime conversation.
const chatPanel=document.createElement('section');
chatPanel.style.cssText='margin:18px 0;padding:16px;border:1px solid #9c5268;border-radius:12px;background:rgba(100,30,50,.13);color:inherit';
chatPanel.innerHTML=`<h3 style="margin:0 0 8px">💬 Chat privado del organizador</h3><p style="margin:0 0 12px;font-size:.9em">Envía información o instrucciones por escrito durante la conversación. No se guarda al cerrar la sesión.</p><div id="supervisorChatLog" role="log" aria-live="polite" style="max-height:220px;overflow:auto;padding:10px;border:1px solid #7775;border-radius:8px;margin-bottom:10px;font-size:.9em"><div>Conecta la voz para activar el chat.</div></div><form id="supervisorChatForm"><label for="supervisorChatText">Mensaje para EL SUPERVISOR</label><textarea id="supervisorChatText" rows="3" maxlength="3000" placeholder="Ej.: Los participantes son..." style="display:block;box-sizing:border-box;width:100%;margin:6px 0 10px;padding:10px;border-radius:8px;background:#fff;color:#111" required></textarea><label style="display:flex;gap:8px;align-items:center;margin-bottom:12px"><input type="checkbox" id="supervisorSpeakReply"> Que responda en voz alta</label><button id="supervisorChatSend" type="submit" disabled style="padding:10px 18px;cursor:pointer">Enviar mensaje</button></form><p id="supervisorChatStatus" style="font-size:.85em;margin:8px 0 0">Esperando conexión.</p>`;
voicePanel.append(chatPanel);
const chatForm=chatPanel.querySelector('#supervisorChatForm');
const chatText=chatPanel.querySelector('#supervisorChatText');
const chatSend=chatPanel.querySelector('#supervisorChatSend');
const chatSpeak=chatPanel.querySelector('#supervisorSpeakReply');
const chatStatus=chatPanel.querySelector('#supervisorChatStatus');
const chatLog=chatPanel.querySelector('#supervisorChatLog');
function chatConnected(){return supervisorChannel?.readyState==='open'}
function chatControls(){chatSend.disabled=!chatConnected();chatStatus.textContent=chatConnected()?'Chat conectado. Puedes escribir al Supervisor.':'Inicia la conversación de voz para utilizar el chat.'}
function chatLine(label,content){const p=document.createElement('p');p.style.margin='0 0 8px';const b=document.createElement('strong');b.textContent=label+': ';p.append(b,document.createTextNode(content));chatLog.append(p);chatLog.scrollTop=chatLog.scrollHeight}
chatForm.addEventListener('submit',event=>{
 event.preventDefault();const msg=chatText.value.trim();if(!msg)return;
 if(!chatConnected()){chatStatus.textContent='No hay conexión activa. Inicia la voz primero.';return}
 const wantsSpeech=chatSpeak.checked;
 try{
  // Text enters the same model conversation, without automatically requesting a response.
  supervisorChannel.send(JSON.stringify({type:'conversation.item.create',item:{type:'message',role:'user',content:[{type:'input_text',text:msg}]}}));
  if(wantsSpeech){supervisorChannel.send(JSON.stringify({type:'response.create',response:{instructions:'Responde brevemente en español al último mensaje escrito del organizador. Habla con tu personalidad de EL SUPERVISOR, sin leer instrucciones de escena.'}}))}
  chatLine('Organizador',msg);chatText.value='';
  chatStatus.textContent=wantsSpeech?'Mensaje enviado. El Supervisor responderá por voz.':'Mensaje enviado al contexto de la conversación, sin solicitar respuesta.';
 }catch(error){chatStatus.textContent='No se pudo enviar: '+error.message}
});

function status(t){document.getElementById('voiceStatus').textContent=t}
function controls(active){startBtn.disabled=active||connecting;stopBtn.disabled=!active;muteBtn.disabled=!active;muteBtn.textContent=muted?'🎤 Activar micrófono':'🔇 Silenciar micrófono'}
async function checkAdmin(){if(!sg){sgError('No hay conexión con Supabase.');return}const {data:{user},error:userError}=await sg.auth.getUser();if(userError){sgError(userError.message);return}let admin=false;if(user){const {data,error}=await sg.from('admin_users').select('user_id').eq('user_id',user.id).maybeSingle();if(error)throw error;admin=!!data}loginPanel.hidden=admin;voicePanel.hidden=!admin;if(admin){document.getElementById('account').textContent=user.email;sgError('')}else if(user){sgError('Esta cuenta no tiene permisos de administrador.');document.getElementById('loginForm').hidden=true}}
document.getElementById('loginForm').addEventListener('submit',async e=>{e.preventDefault();const {error}=await sg.auth.signInWithPassword({email:document.getElementById('email').value,password:document.getElementById('password').value});if(error)sgError(error.message);else await checkAdmin()});
document.getElementById('logout').addEventListener('click',async()=>{stop();await sg.auth.signOut();location.reload()});
function stop(){supervisorChannel=null;chatControls();clearRobot();robotToggle.checked=false;if(micStream){micStream.getTracks().forEach(t=>t.stop());micStream=null}if(pc){pc.close();pc=null}if(audioEl){audioEl.pause();audioEl.srcObject=null;audioEl.remove();audioEl=null}muted=false;connecting=false;controls(false);status('En espera')}
startBtn.addEventListener('click',async()=>{if(connecting||pc)return;connecting=true;controls(false);status('Conectando…');sgError('');try{
  // iOS Safari requires the call to originate from a user gesture.
  micStream=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true,autoGainControl:true}});
  const {data:{session}}=await sg.auth.getSession();if(!session)throw Error('Tu sesión ha caducado. Vuelve a iniciar sesión.');
  const response=await fetch(`${window.SQUID_CONFIG.supabaseUrl}/functions/v1/supervisor-session`,{method:'POST',headers:{'Authorization':`Bearer ${session.access_token}`,'apikey':window.SQUID_CONFIG.supabaseKey,'Content-Type':'application/json'},body:'{}'});
  const result=await response.json().catch(()=>({}));if(!response.ok)throw Error(result.error||`No se pudo crear la sesión (${response.status}).`);
  const ephemeral=result.client_secret?.value||result.value;if(!ephemeral)throw Error('OpenAI no devolvió una credencial temporal.');
  pc=new RTCPeerConnection();audioEl=document.createElement('audio');audioEl.autoplay=true;audioEl.playsInline=true;audioEl.style.display='none';document.body.append(audioEl);
  pc.ontrack=event=>{remoteStream=event.streams[0];audioEl.srcObject=remoteStream;audioEl.play().catch(()=>{sgError('Toca la pantalla para permitir la reproducción del audio.');});if(robotToggle.checked)enableRobot()};
  pc.onconnectionstatechange=()=>{if(pc?.connectionState==='failed'||pc?.connectionState==='disconnected'){sgError('Se perdió la conexión de voz.');stop()}};
  micStream.getTracks().forEach(track=>pc.addTrack(track,micStream));
  const channel=pc.createDataChannel('oai-events');supervisorChannel=channel;chatControls();channel.onclose=chatControls;channel.onopen=()=>{chatControls();channel.send(JSON.stringify({type:'response.create',response:{instructions:'Preséntate brevemente en español como EL SUPERVISOR y da una bienvenida teatral y sarcástica a la fiesta. No afirmes que puedes modificar el tablero todavía.'}}))};
  const offer=await pc.createOffer();await pc.setLocalDescription(offer);
  const sdp=await fetch('https://api.openai.com/v1/realtime/calls',{method:'POST',headers:{'Authorization':`Bearer ${ephemeral}`,'Content-Type':'application/sdp'},body:offer.sdp});if(!sdp.ok)throw Error('Error al establecer audio con OpenAI: '+(await sdp.text()).slice(0,250));
  await pc.setRemoteDescription({type:'answer',sdp:await sdp.text()});connecting=false;controls(true);status('🎙️ Conversación activa');
}catch(err){stop();sgError('No se pudo iniciar la voz: '+err.message)}});
muteBtn.addEventListener('click',()=>{if(!micStream)return;muted=!muted;micStream.getAudioTracks().forEach(t=>t.enabled=!muted);controls(true);status(muted?'Micrófono silenciado':'🎙️ Conversación activa')});stopBtn.addEventListener('click',stop);
chatControls();window.addEventListener('pagehide',stop);checkAdmin().catch(e=>sgError(e.message));
