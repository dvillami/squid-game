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

// Organizer's private notebook. Stored locally in this browser and reloaded into each voice session.
const NOTES_KEY='squid_supervisor_private_notes_v1';
let privateNotes=[];
try{const saved=JSON.parse(localStorage.getItem(NOTES_KEY)||'[]');if(Array.isArray(saved))privateNotes=saved.filter(x=>typeof x==='string').slice(-100)}catch{}
const chatPanel=document.createElement('section');
chatPanel.style.cssText='margin:18px 0;padding:16px;border:1px solid #9c5268;border-radius:12px;background:rgba(100,30,50,.13);color:inherit';
chatPanel.innerHTML=`<h3 style="margin:0 0 8px">📝 Libreta privada del organizador</h3><p style="margin:0 0 12px;font-size:.9em">Escribe datos sobre los participantes o los juegos. EL SUPERVISOR no responderá al recibirlos; podrá usarlos después para bromear cuando venga al caso. Las notas se guardan solo en este navegador, no en Supabase.</p><div id="supervisorChatLog" role="log" aria-live="polite" style="max-height:220px;overflow:auto;padding:10px;border:1px solid #7775;border-radius:8px;margin-bottom:10px;font-size:.9em"></div><form id="supervisorChatForm"><label for="supervisorChatText">Nueva nota privada</label><textarea id="supervisorChatText" rows="3" maxlength="3000" placeholder="Ej.: Carlos siempre llega tarde. Bromea sobre ello si Carlos participa, sin ser cruel." style="display:block;box-sizing:border-box;width:100%;margin:6px 0 10px;padding:10px;border-radius:8px;background:#fff;color:#111" required></textarea><button id="supervisorChatSend" type="submit" style="padding:10px 18px;cursor:pointer">Guardar nota</button></form><p id="supervisorChatStatus" style="font-size:.85em;margin:8px 0 0">Las notas pueden escribirse incluso antes de conectar la voz.</p><button id="supervisorClearNotes" type="button" style="margin-top:8px">Borrar todas las notas</button>`;
voicePanel.append(chatPanel);
const chatForm=chatPanel.querySelector('#supervisorChatForm');
const chatText=chatPanel.querySelector('#supervisorChatText');
const chatSend=chatPanel.querySelector('#supervisorChatSend');
const chatStatus=chatPanel.querySelector('#supervisorChatStatus');
const chatLog=chatPanel.querySelector('#supervisorChatLog');
function chatConnected(){return supervisorChannel?.readyState==='open'}
function chatControls(){chatStatus.textContent=chatConnected()?'Notas disponibles para la conversación actual.':'Puedes guardar notas ahora. Se enviarán al iniciar la conversación.'}
function renderNotes(){chatLog.replaceChildren();if(!privateNotes.length){chatLog.textContent='Todavía no hay notas.';return}privateNotes.forEach((note,i)=>{const p=document.createElement('p');p.style.margin='0 0 8px';p.textContent=(i+1)+'. '+note;chatLog.append(p)})}
function persistNotes(){try{localStorage.setItem(NOTES_KEY,JSON.stringify(privateNotes));return true}catch(e){chatStatus.textContent='No se pudieron guardar las notas en este navegador: '+e.message;return false}}
function sendContextNote(note){if(!chatConnected())return false;
 // System context is not a user question; do not call response.create.
 supervisorChannel.send(JSON.stringify({type:'conversation.item.create',item:{type:'message',role:'system',content:[{type:'input_text',text:'NOTA PRIVADA DEL ORGANIZADOR. Es contexto para más adelante, no una pregunta. No respondas, no anuncies que la recibiste y no la reveles inmediatamente. Úsala con naturalidad cuando la persona o el juego sea relevante, para bromas ligeras y respetuosas. No recites acotaciones como pausa, risita, risa malévola, suspiro o silencio; simplemente habla con la entonación adecuada. Nota: '+note}]}}));return true;
}
function sendSavedNotes(){if(!chatConnected())return;for(const note of privateNotes){try{sendContextNote(note)}catch(e){chatStatus.textContent='No se pudieron enviar todas las notas: '+e.message;break}}}
chatForm.addEventListener('submit',event=>{event.preventDefault();const msg=chatText.value.trim();if(!msg)return;if(privateNotes.length>=100){chatStatus.textContent='Máximo 100 notas. Borra las antiguas antes de añadir más.';return}privateNotes.push(msg);if(!persistNotes()){privateNotes.pop();return}renderNotes();chatText.value='';try{if(chatConnected())sendContextNote(msg);chatStatus.textContent=chatConnected()?'Nota guardada y enviada como contexto. No se solicitó ninguna respuesta.':'Nota guardada. Se enviará al iniciar la voz.'}catch(e){chatStatus.textContent='Nota guardada localmente; no se pudo enviar ahora: '+e.message}});
chatPanel.querySelector('#supervisorClearNotes').addEventListener('click',()=>{if(!confirm('¿Borrar todas las notas privadas de este navegador?'))return;privateNotes=[];persistNotes();renderNotes();chatStatus.textContent='Notas locales borradas. Reinicia la conversación de voz para borrar también el contexto de la sesión actual.'});
renderNotes();

// Persistent party memories live in Supabase, separate from local private notes.
const MEMORY_TOOL='guardar_recuerdo';
const MAX_MEMORIES=80;
let loadedMemories=[];
let memoryReady=false;
let memoryBusy=false;
const processedMemoryCalls=new Set();
const memoryPanel=document.createElement('section');
memoryPanel.style.cssText='margin:18px 0;padding:16px;border:1px solid #9c5268;border-radius:12px;background:rgba(100,30,50,.13);color:inherit';
memoryPanel.innerHTML=`<h3 style="margin:0 0 8px">🧠 Memoria permanente de la fiesta</h3><p style="font-size:.9em">Estos recuerdos se guardan en Supabase y sobreviven al cierre de la conversación. Solo se deben guardar hechos confirmados, no rumores ni bromas.</p><div id="memoryStatus" style="font-size:.9em;margin:8px 0">Cargando…</div><div id="memoryLog" style="max-height:200px;overflow:auto;font-size:.9em"></div><form id="memoryForm" style="margin-top:12px"><label for="memoryText">Añadir un acontecimiento confirmado</label><textarea id="memoryText" rows="2" maxlength="2000" required style="display:block;width:100%;box-sizing:border-box;margin:8px 0;padding:8px;border-radius:6px" placeholder="Ej.: En el juego 2, Carlos ganó la ronda final."></textarea><button type="submit">Guardar recuerdo</button></form>`;
voicePanel.append(memoryPanel);
const memoryStatus=memoryPanel.querySelector('#memoryStatus');
const memoryLog=memoryPanel.querySelector('#memoryLog');
function renderMemories(){memoryLog.replaceChildren();if(!loadedMemories.length){memoryLog.textContent='Todavía no hay recuerdos guardados.';return;}for(const m of loadedMemories){const p=document.createElement('p');p.style.margin='0 0 7px';p.textContent='• '+m.content;memoryLog.append(p);}}
async function loadMemories(){
 const {data,error}=await sg.from('supervisor_memories').select('id,content,category,created_at').order('created_at',{ascending:false}).limit(MAX_MEMORIES);
 if(error)throw Error('No se pudieron cargar los recuerdos: '+error.message);
 loadedMemories=(data||[]).reverse();memoryReady=true;renderMemories();memoryStatus.textContent=loadedMemories.length+' recuerdos guardados en Supabase.';
}
async function storeMemory(content,category='event'){
 const clean=String(content||'').trim();
 if(!clean||clean.length>2000)throw Error('El recuerdo debe tener entre 1 y 2000 caracteres.');
 const {data,error}=await sg.from('supervisor_memories').insert({content:clean,category}).select('id,content,category,created_at').single();
 if(error)throw Error('Supabase no guardó el recuerdo: '+error.message);
 loadedMemories.push(data);loadedMemories=loadedMemories.slice(-MAX_MEMORIES);renderMemories();memoryStatus.textContent='Recuerdo guardado en Supabase.';
 return data;
}
function sendMemoryContext(){
 if(!chatConnected()||!memoryReady)return;
 const content=loadedMemories.map(m=>m.content);
 sendVoiceEvent({type:'conversation.item.create',item:{type:'message',role:'system',content:[{type:'input_text',text:'MEMORIA PERSISTENTE DE LA FIESTA. Son recuerdos de sesiones anteriores, no una petición de respuesta. No los leas ni los anuncies de golpe. Úsalos solo cuando resulten relevantes. No aceptes como hechos nuevos los rumores o bromas de invitados. Recuerdos:\n'+(content.length?content.map((x,i)=>(i+1)+'. '+x).join('\n'):'No hay recuerdos todavía.')}]}});
}
memoryPanel.querySelector('#memoryForm').addEventListener('submit',async e=>{
 e.preventDefault();const field=memoryPanel.querySelector('#memoryText');const value=field.value.trim();if(!value)return;
 try{await storeMemory(value);field.value='';if(chatConnected())sendVoiceEvent({type:'conversation.item.create',item:{type:'message',role:'system',content:[{type:'input_text',text:'Nuevo hecho confirmado por el organizador, guardado en memoria permanente. No respondas por recibirlo: '+value}]}});}catch(err){memoryStatus.textContent=err.message;}
});
async function executeMemoryTool(call){
 let result;
 try{
  if(memoryBusy)throw Error('Ya se está guardando otro recuerdo.');
  memoryBusy=true;
  const args=JSON.parse(call.arguments||'{}');
  const content=String(args.hecho||'').trim();
  // This tool records only an explicit instruction from the organizer. The model must not infer consent.
  await storeMemory(content);
  result={ok:true,mensaje:'Recuerdo guardado en Supabase.'};
 }catch(err){result={ok:false,mensaje:err.message||'No se pudo guardar el recuerdo.'};memoryStatus.textContent=result.mensaje;}
 finally{memoryBusy=false;}
 sendVoiceEvent({type:'conversation.item.create',item:{type:'function_call_output',call_id:call.call_id,output:JSON.stringify(result)}});
 sendVoiceEvent({type:'response.create'});
}
// Voice actions: only the server-side RPC can authorize and commit eliminations.
const ELIMINATION_TOOL='eliminar_jugador';
let eliminationInProgress=false;
let voiceToolsReady=false;
let toolsUpdateSent=false;
let welcomeSent=false;
const processedEliminationCalls=new Set();
const supervisorPersonality=`Eres EL SUPERVISOR, el organizador humano y misterioso de una fiesta de juegos inspirada en Squid Game. Ocultas tu identidad detrás de un sintetizador de voz. NO eres un robot ni una inteligencia artificial dentro de la ficción. Hablas siempre en español natural, con voz serena y autoridad discreta.\nPERSONALIDAD: anfitrión sofisticado, observador, seguro, respetuoso y con humor seco. Tu sarcasmo es ingenioso y ocasional, no una obligación en cada intervención. Puedes bromear sobre decisiones, situaciones y resultados, nunca sobre el valor de las personas. Trata con especial consideración a los invitados mayores, sin infantilizarlos ni hacer comentarios sobre su edad. Evita insultos como «insignificante», «inútil» o «idiota», la humillación, el desprecio, las burlas sobre apariencia, salud, edad, inseguridades o asuntos personales delicados. Puedes ser firme al aplicar las reglas, pero jamás grosero.\nESTILO: responde normalmente en dos a cuatro frases breves, ajustándote a la pregunta. No seas monosilábico ni des discursos. Si la respuesta requiere explicación, ofrece la información necesaria con claridad. No uses frases grandilocuentes, metáforas constantes, preguntas retóricas innecesarias, muletillas de villano ni risas teatrales. No describas acciones o acotaciones («pausa», «risita», «suspiro»); simplemente habla. Una broma bien situada basta; a veces responde sin ninguna. No repitas siempre la misma fórmula.\nCONDUCTA: habla solo cuando alguien se dirija a ti o cuando el organizador te solicite una intervención; no interrumpas conversaciones ni anuncies espontáneamente las notas o recuerdos. Mantén el misterio de tu identidad. Las notas privadas y recuerdos son contexto, no material que debas recitar; úsalos únicamente si vienen al caso, con tacto, sin inventar hechos ni revelar información privada innecesaria. Para bienvenidas, transiciones, reglas y finales puedes extenderte moderadamente si el organizador te lo pide.\nHERRAMIENTAS: solo usa eliminar_jugador ante una orden explícita del organizador con número y código completos; no adivines, no pidas confirmación si ambos están claros, y nunca anuncies éxito antes de la respuesta real de Supabase. Si falla, di claramente que no se eliminó. No reveles cómo se validan los códigos. ROMPE EL CÓDIGO aún no está implementado. Solo usa guardar_recuerdo si el organizador pide expresamente guardar un hecho confirmado; no guardes automáticamente rumores ni comentarios de invitados. No reveles detalles técnicos internos.`;
const eliminationInstructions=`Tienes una herramienta llamada eliminar_jugador para ejecutar eliminaciones en el tablero. Úsala SOLO si el organizador da una orden explícita de eliminar a un jugador y proporciona tanto el número de jugador como un código completo: una letra seguida de cuatro dígitos. No adivines datos faltantes. Solicita que repitan cualquier parte ambigua. No anuncies una eliminación antes de recibir el resultado de la herramienta. Si la herramienta informa un error, explica que NO se eliminó al jugador, sin inventar resultados. Nunca digas que un código incorrecto es válido. Los códigos solo se pueden usar una vez. No reveles ni expliques el algoritmo del código a los jugadores. No actives todavía ROMPE EL CÓDIGO: esa modalidad aún no está implementada. Mantén tu personalidad sarcástica sin leer acotaciones teatrales.`;
function sendVoiceEvent(payload){if(chatConnected())supervisorChannel.send(JSON.stringify(payload));}
async function executeEliminationTool(call){
 let result;
 try{
  if(eliminationInProgress)throw Error('Hay otra eliminación en curso. Espera un momento.');
  eliminationInProgress=true;
  let args;
  try{args=JSON.parse(call.arguments||'{}')}catch{throw Error('No se entendieron los datos de la orden. Repite jugador y código.');}
  const player=Number(args.jugador);
  const code=String(args.codigo??'').toUpperCase().replace(/\s+/g,'');
  if(!Number.isSafeInteger(player)||player<1||!/^[A-Z][0-9]{4}$/.test(code))throw Error('Indica un número de jugador válido y un código de una letra seguida de cuatro cifras.');
  const {data:{user},error:userError}=await sg.auth.getUser();
  if(userError||!user)throw Error('La sesión del organizador ha caducado.');
  const {data,error}=await sg.rpc('supervisor_eliminate',{p_player_id:player,p_code:code});
  if(error)throw Error(error.message||'Supabase rechazó la eliminación.');
  result={ok:true,jugador:player,mensaje:data||'Eliminación confirmada por Supabase.'};
  status('✅ Jugador '+player+' eliminado en Supabase');
 }catch(err){result={ok:false,mensaje:err instanceof Error?err.message:'Error desconocido'};sgError('Eliminación NO realizada: '+result.mensaje);}
 finally{eliminationInProgress=false;}
 try{
  sendVoiceEvent({type:'conversation.item.create',item:{type:'function_call_output',call_id:call.call_id,output:JSON.stringify(result)}});
  sendVoiceEvent({type:'response.create'});
 }catch(err){sgError('No se pudo comunicar el resultado al Supervisor: '+err.message);}
}
function handleVoiceEvent(event){
 let message;
 try{message=JSON.parse(event.data)}catch{return;}
 if(message.type==='session.created' && !toolsUpdateSent){
  toolsUpdateSent=true;
  console.info('Supervisor: sesión creada; configurando herramientas.');
  configureVoiceTools();
 }
 if(message.type==='session.updated'){
  const names=(message.session?.tools||[]).map(t=>t.name);
  voiceToolsReady=names.includes(ELIMINATION_TOOL);
  console.info('Supervisor: herramientas activas:',names);
  if(!voiceToolsReady){sgError('OpenAI no confirmó la herramienta eliminar_jugador. Revisa la consola.');return;}
  sgError('');
  if(!welcomeSent){
   welcomeSent=true;
    sendSavedNotes();
    sendMemoryContext();
    // Wait until someone addresses the Supervisor; do not give an unsolicited welcome.
  }
 }
 if(message.type==='response.output_item.done'&&message.item?.type==='function_call'&&message.item.name===ELIMINATION_TOOL){
  const call=message.item;
  if(call.call_id&&!processedEliminationCalls.has(call.call_id)){
   processedEliminationCalls.add(call.call_id);
   console.info('Supervisor: llamada de eliminación recibida',call.call_id);
   executeEliminationTool(call);
  }
 }
 if(message.type==='response.output_item.done'&&message.item?.type==='function_call'&&message.item.name===MEMORY_TOOL){
  const call=message.item;
  if(call.call_id&&!processedMemoryCalls.has(call.call_id)){processedMemoryCalls.add(call.call_id);executeMemoryTool(call);}
 }
 if(message.type==='error'){
  console.error('Supervisor Realtime:',JSON.stringify(message.error,null,2));
  sgError('Error de OpenAI Realtime: '+(message.error?.message||'Consulta la consola.'));
 }
}
function configureVoiceTools(){
 // Apply the updated character personality for this voice session.
 sendVoiceEvent({type:'session.update',session:{type: 'realtime',instructions:supervisorPersonality,
  tools:[{type:'function',name:ELIMINATION_TOOL,description:'Cuando el organizador ordene eliminar a un jugador y diga un código de una letra y cuatro dígitos, LLAMA a esta función. No vuelvas a pedir confirmación si ya tienes ambos datos. La función consulta Supabase y devuelve el resultado real.',parameters:{type:'object',properties:{jugador:{type:'integer',description:'ID numérico del jugador.'},codigo:{type:'string',description:'Código de una letra seguida de cuatro dígitos, por ejemplo T2233.'}},required:['jugador','codigo'],additionalProperties:false}},{type:'function',name:MEMORY_TOOL,description:'Guarda un recuerdo permanente SOLO cuando el organizador lo pide explícitamente, por ejemplo: Supervisor, recuerda que Carlos ganó el juego 2. No guardes rumores, conversaciones privadas, comentarios de invitados ni deducciones.',parameters:{type:'object',properties:{hecho:{type:'string',description:'Hecho breve confirmado por el organizador (máximo 2000 caracteres).'}},required:['hecho'],additionalProperties:false}}],
  tool_choice:'auto'
 }});
}
function status(t){document.getElementById('voiceStatus').textContent=t}
function controls(active){startBtn.disabled=active||connecting;stopBtn.disabled=!active;muteBtn.disabled=!active;muteBtn.textContent=muted?'🎤 Activar micrófono':'🔇 Silenciar micrófono'}
async function checkAdmin(){if(!sg){sgError('No hay conexión con Supabase.');return}const {data:{user},error:userError}=await sg.auth.getUser();if(userError){sgError(userError.message);return}let admin=false;if(user){const {data,error}=await sg.from('admin_users').select('user_id').eq('user_id',user.id).maybeSingle();if(error)throw error;admin=!!data}loginPanel.hidden=admin;voicePanel.hidden=!admin;if(admin){document.getElementById('account').textContent=user.email;sgError('')}else if(user){sgError('Esta cuenta no tiene permisos de administrador.');document.getElementById('loginForm').hidden=true}}
document.getElementById('loginForm').addEventListener('submit',async e=>{e.preventDefault();const {error}=await sg.auth.signInWithPassword({email:document.getElementById('email').value,password:document.getElementById('password').value});if(error)sgError(error.message);else await checkAdmin()});
document.getElementById('logout').addEventListener('click',async()=>{stop();await sg.auth.signOut();location.reload()});
function stop(){toolsUpdateSent=false;welcomeSent=false;voiceToolsReady=false;processedEliminationCalls.clear();processedMemoryCalls.clear();supervisorChannel=null;chatControls();clearRobot();robotToggle.checked=false;if(micStream){micStream.getTracks().forEach(t=>t.stop());micStream=null}if(pc){pc.close();pc=null}if(audioEl){audioEl.pause();audioEl.srcObject=null;audioEl.remove();audioEl=null}muted=false;connecting=false;controls(false);status('En espera')}
startBtn.addEventListener('click',async()=>{if(connecting||pc)return;connecting=true;controls(false);status('Conectando…');sgError('');try{
  await loadMemories();
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
  const channel=pc.createDataChannel('oai-events');supervisorChannel=channel;chatControls();channel.onclose=chatControls;channel.onmessage=handleVoiceEvent;channel.onopen=()=>{chatControls();console.info('Supervisor: canal abierto; esperando confirmación de sesión.');};
  const offer=await pc.createOffer();await pc.setLocalDescription(offer);
  const sdp=await fetch('https://api.openai.com/v1/realtime/calls',{method:'POST',headers:{'Authorization':`Bearer ${ephemeral}`,'Content-Type':'application/sdp'},body:offer.sdp});if(!sdp.ok)throw Error('Error al establecer audio con OpenAI: '+(await sdp.text()).slice(0,250));
  await pc.setRemoteDescription({type:'answer',sdp:await sdp.text()});connecting=false;controls(true);status('🎙️ Conversación activa');
}catch(err){stop();sgError('No se pudo iniciar la voz: '+err.message)}});
muteBtn.addEventListener('click',()=>{if(!micStream)return;muted=!muted;micStream.getAudioTracks().forEach(t=>t.enabled=!muted);controls(true);status(muted?'Micrófono silenciado':'🎙️ Conversación activa')});stopBtn.addEventListener('click',stop);
chatControls();window.addEventListener('pagehide',stop);checkAdmin().then(async()=>{if(!voicePanel.hidden)await loadMemories();}).catch(e=>{memoryStatus.textContent=e.message;sgError(e.message)});
