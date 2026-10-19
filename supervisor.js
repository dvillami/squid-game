// Voice MVP. No secret OpenAI key is ever placed in this browser code.
const {sg,sgError}=window;
const loginPanel=document.getElementById('loginPanel'),voicePanel=document.getElementById('voicePanel');
const startBtn=document.getElementById('startVoice'),stopBtn=document.getElementById('stopVoice'),muteBtn=document.getElementById('muteVoice');
let pc=null,micStream=null,audioEl=null,muted=false,connecting=false;
function status(t){document.getElementById('voiceStatus').textContent=t}
function controls(active){startBtn.disabled=active||connecting;stopBtn.disabled=!active;muteBtn.disabled=!active;muteBtn.textContent=muted?'🎤 Activar micrófono':'🔇 Silenciar micrófono'}
async function checkAdmin(){if(!sg){sgError('No hay conexión con Supabase.');return}const {data:{user},error:userError}=await sg.auth.getUser();if(userError){sgError(userError.message);return}let admin=false;if(user){const {data,error}=await sg.from('admin_users').select('user_id').eq('user_id',user.id).maybeSingle();if(error)throw error;admin=!!data}loginPanel.hidden=admin;voicePanel.hidden=!admin;if(admin){document.getElementById('account').textContent=user.email;sgError('')}else if(user){sgError('Esta cuenta no tiene permisos de administrador.');document.getElementById('loginForm').hidden=true}}
document.getElementById('loginForm').addEventListener('submit',async e=>{e.preventDefault();const {error}=await sg.auth.signInWithPassword({email:document.getElementById('email').value,password:document.getElementById('password').value});if(error)sgError(error.message);else await checkAdmin()});
document.getElementById('logout').addEventListener('click',async()=>{stop();await sg.auth.signOut();location.reload()});
function stop(){if(micStream){micStream.getTracks().forEach(t=>t.stop());micStream=null}if(pc){pc.close();pc=null}if(audioEl){audioEl.pause();audioEl.srcObject=null;audioEl.remove();audioEl=null}muted=false;connecting=false;controls(false);status('En espera')}
startBtn.addEventListener('click',async()=>{if(connecting||pc)return;connecting=true;controls(false);status('Conectando…');sgError('');try{
  // iOS Safari requires the call to originate from a user gesture.
  micStream=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true,autoGainControl:true}});
  const {data:{session}}=await sg.auth.getSession();if(!session)throw Error('Tu sesión ha caducado. Vuelve a iniciar sesión.');
  const response=await fetch(`${window.SQUID_CONFIG.supabaseUrl}/functions/v1/supervisor-session`,{method:'POST',headers:{'Authorization':`Bearer ${session.access_token}`,'apikey':window.SQUID_CONFIG.supabaseKey,'Content-Type':'application/json'},body:'{}'});
  const result=await response.json().catch(()=>({}));if(!response.ok)throw Error(result.error||`No se pudo crear la sesión (${response.status}).`);
  const ephemeral=result.client_secret?.value||result.value;if(!ephemeral)throw Error('OpenAI no devolvió una credencial temporal.');
  pc=new RTCPeerConnection();audioEl=document.createElement('audio');audioEl.autoplay=true;audioEl.playsInline=true;audioEl.style.display='none';document.body.append(audioEl);
  pc.ontrack=event=>{audioEl.srcObject=event.streams[0];audioEl.play().catch(()=>{sgError('Toca la pantalla para permitir la reproducción del audio.');})};
  pc.onconnectionstatechange=()=>{if(pc?.connectionState==='failed'||pc?.connectionState==='disconnected'){sgError('Se perdió la conexión de voz.');stop()}};
  micStream.getTracks().forEach(track=>pc.addTrack(track,micStream));
  const channel=pc.createDataChannel('oai-events');channel.onopen=()=>{channel.send(JSON.stringify({type:'response.create',response:{instructions:'Preséntate brevemente en español como EL SUPERVISOR y da una bienvenida teatral y sarcástica a la fiesta. No afirmes que puedes modificar el tablero todavía.'}}))};
  const offer=await pc.createOffer();await pc.setLocalDescription(offer);
  const sdp=await fetch('https://api.openai.com/v1/realtime/calls',{method:'POST',headers:{'Authorization':`Bearer ${ephemeral}`,'Content-Type':'application/sdp'},body:offer.sdp});if(!sdp.ok)throw Error('Error al establecer audio con OpenAI: '+(await sdp.text()).slice(0,250));
  await pc.setRemoteDescription({type:'answer',sdp:await sdp.text()});connecting=false;controls(true);status('🎙️ Conversación activa');
}catch(err){stop();sgError('No se pudo iniciar la voz: '+err.message)}});
muteBtn.addEventListener('click',()=>{if(!micStream)return;muted=!muted;micStream.getAudioTracks().forEach(t=>t.enabled=!muted);controls(true);status(muted?'Micrófono silenciado':'🎙️ Conversación activa')});stopBtn.addEventListener('click',stop);
window.addEventListener('pagehide',stop);checkAdmin().catch(e=>sgError(e.message));
