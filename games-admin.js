// Gestión de juegos. Aislada de las funciones existentes de administración.
(()=>{
 const sg=window.sg;
 const $=id=>document.getElementById(id);
 const form=$('gameEditor'),list=$('gamesList'),notice=$('gamesNotice');
 const fields={name:'gameName',sort_order:'gameOrder',status:'gamePhase',goal:'gameGoal',rules:'gameRules',instructions:'gameInstructions',elimination:'gameElimination',prizes:'gamePrizes',duration:'gameDuration',supervisor_notes:'gameSupervisorNotes'};
 let games=[];
 const tell=(message,isError=false)=>{notice.textContent=message;notice.style.color=isError?'#ff8397':''};
 function resetForm(){form.reset();$('editGameId').value='';$('gameCancel').hidden=true;$('gameSave').textContent='Guardar juego';$('gameUnlocked').checked=false;$('gameOrder').value=games.length?Math.max(...games.map(g=>g.sort_order))+1:1;}
 function setForm(game){$('editGameId').value=game.id;$('gameUnlocked').checked=game.is_unlocked===true;for(const [key,id] of Object.entries(fields))$(id).value=game[key]??'';$('gameCancel').hidden=false;$('gameSave').textContent='Guardar cambios';form.scrollIntoView({behavior:'smooth',block:'start'});}
 function button(label,fn,klass='outline'){const b=document.createElement('button');b.type='button';b.textContent=label;b.className=klass;b.addEventListener('click',fn);return b;}
 function text(tag,content){const e=document.createElement(tag);e.textContent=content;return e;}
 function render(){list.replaceChildren();if(!games.length){list.append(text('p','Todavía no hay juegos. Añade el primero usando el formulario.'));return;}
  for(const g of games){const card=document.createElement('article');card.className='adminCard';card.style.cssText='display:block;padding:16px';card.append(text('h3',`${g.sort_order}. ${g.name} — ${g.status==='confirmed'?'Confirmado':'Provisional'} — ${g.is_unlocked?'🔓 DESBLOQUEADO':'🔒 BLOQUEADO'}`));
   for(const [label,key] of [['Objetivo','goal'],['Reglas','rules'],['Instrucciones','instructions'],['Eliminación','elimination'],['Premios','prizes'],['Duración','duration'],['Notas para el Supervisor','supervisor_notes']])if(g[key]){const p=text('p',`${label}: ${g[key]}`);p.style.whiteSpace='pre-wrap';card.append(p)}
   const actions=document.createElement('div');actions.className='adminActions';actions.style.cssText='display:flex;flex-wrap:wrap;gap:8px';
   actions.append(button(g.is_unlocked?'🔒 Bloquear':'🔓 Desbloquear',()=>toggleLock(g)),button('Editar',()=>setForm(g)),button('↑ Subir',()=>move(g,-1)),button('↓ Bajar',()=>move(g,1)),button('Eliminar',()=>remove(g),'danger outline'));card.append(actions);list.append(card);
  }
 }
 async function load(){if(!sg)return;const {data,error}=await sg.from('supervisor_games').select('*').order('sort_order',{ascending:true}).order('id',{ascending:true});if(error){tell('No se pudieron cargar los juegos: '+error.message,true);list.replaceChildren(text('p','Comprueba que ejecutaste el SQL y que tu cuenta tiene permisos de administrador.'));return;}games=data||[];render();if(!$('editGameId').value)resetForm();tell(`${games.length} juego(s) cargado(s).`);}
 async function toggleLock(g){const desired=!g.is_unlocked;const {error}=await sg.from('supervisor_games').update({is_unlocked:desired}).eq('id',g.id);if(error){tell('No se pudo cambiar el bloqueo: '+error.message,true);return;}await load();tell(desired?'Juego desbloqueado. El Supervisor actualizará su catálogo durante la conversación.':'Juego bloqueado. Si el Supervisor ya conocía sus reglas, reinicia su sesión de voz para borrar el contexto anterior.');}
 async function move(g,direction){const index=games.findIndex(x=>x.id===g.id),other=games[index+direction];if(!other)return;
  // Reorder by swapping positions with a temporary order, to avoid duplicate-position ambiguity.
  const a=g.sort_order,b=other.sort_order;const temp=Math.max(...games.map(x=>x.sort_order))+1000;
  try{for(const [id,order] of [[g.id,temp],[other.id,a],[g.id,b]]){const {error}=await sg.from('supervisor_games').update({sort_order:order}).eq('id',id);if(error)throw error;}await load();tell('Orden actualizado.');}catch(e){tell('No se pudo cambiar el orden: '+e.message,true);await load();}
 }
 async function remove(g){if(!confirm(`¿Eliminar el juego «${g.name}»? Esta acción no se puede deshacer.`))return;const {error}=await sg.from('supervisor_games').delete().eq('id',g.id);if(error){tell('No se pudo eliminar: '+error.message,true);return;}resetForm();await load();tell('Juego eliminado.');}
 form.addEventListener('submit',async e=>{e.preventDefault();const save=$('gameSave');save.disabled=true;const id=$('editGameId').value;const payload={is_unlocked:$('gameUnlocked').checked};for(const [key,element] of Object.entries(fields))payload[key]=key==='sort_order'?Number($(element).value):$(element).value.trim();if(!payload.name||!Number.isInteger(payload.sort_order)||payload.sort_order<1){tell('Escribe un nombre y un orden válido.',true);save.disabled=false;return;}
  const query=id?sg.from('supervisor_games').update(payload).eq('id',Number(id)):sg.from('supervisor_games').insert(payload);
  const {error}=await query;save.disabled=false;if(error){tell('No se pudo guardar: '+error.message,true);return;}resetForm();await load();tell(id?'Cambios guardados.':'Juego creado.');});
 $('gameCancel').addEventListener('click',resetForm);
 // Existing admin.js owns login; wait until its admin panel is visible.
 let loading=false;const observer=new MutationObserver(()=>{if(!$('adminPanel').hidden&&!loading){loading=true;observer.disconnect();load();}});observer.observe($('adminPanel'),{attributes:true,attributeFilter:['hidden']});
 if(!$('adminPanel').hidden){loading=true;observer.disconnect();load();}
})();
