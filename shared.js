(function(){
  const config=window.SQUID_CONFIG||{};
  const configured= /^https:\/\/.+\.supabase\.co\/?$/.test(config.supabaseUrl||'') && !!config.supabaseKey && !String(config.supabaseKey).startsWith('PEGA_');
  window.sgConfigured=configured;
  window.sg= configured && window.supabase ? window.supabase.createClient(config.supabaseUrl,config.supabaseKey,{auth:{persistSession:true,autoRefreshToken:true}}):null;
  window.sgError=(message)=>{const el=document.getElementById('message');if(el)el.textContent=message;};
  window.sgPhoto=(url)=>url && /^https:\/\//.test(url) ? url : null;
  window.sgElement=(tag,cls,text)=>{const el=document.createElement(tag);if(cls)el.className=cls;if(text!==undefined)el.textContent=text;return el;};
})();
