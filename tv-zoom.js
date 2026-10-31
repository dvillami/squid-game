/* Ajuste local del tablero para navegadores de TV sin zoom nativo. */
(function(){
  'use strict';
  var stage=document.getElementById('tvBoardStage');
  var value=document.getElementById('tvZoomValue');
  if(!stage||!value)return;
  var scale=1, mode='manual';
  try {var saved=JSON.parse(localStorage.getItem('squid-tv-zoom')||'null');if(saved&&saved.mode==='manual'&&typeof saved.scale==='number'&&isFinite(saved.scale)){scale=Math.max(.5,Math.min(1.5,saved.scale));}else if(saved&&saved.mode==='fit')mode='fit';}catch(e){}
  function remember(){try{localStorage.setItem('squid-tv-zoom',JSON.stringify({mode:mode,scale:scale}));}catch(e){}}
  function apply(){
    // Centrar el rectángulo escalado, no su esquina superior izquierda.
    // transform-origin evita que el escalado desplace el punto de referencia.
    stage.style.transformOrigin='top left';
    var stageWidth=stage.scrollWidth;
    var stageHeight=stage.scrollHeight;
    var scaledWidth=stageWidth*scale;
    var scaledHeight=stageHeight*scale;
    var x=Math.max(0,(window.innerWidth-scaledWidth)/2);
    var y=Math.max(0,(window.innerHeight-scaledHeight)/2);
    stage.style.transform='translate('+Math.round(x)+'px,'+Math.round(y)+'px) scale('+scale+')';
    // Evitar que el contenido reducido cree un desplazamiento vertical extra.
    document.body.style.minHeight=Math.max(window.innerHeight,Math.ceil(y+scaledHeight))+'px';
    value.textContent=Math.round(scale*100)+'%';
    remember();
  }
  function fit(){
    mode='fit';
    // Medir dimensiones sin aplicar zoom, incluyendo las tarjetas cargadas.
    stage.style.transform='none';
    var width=stage.scrollWidth,height=stage.scrollHeight;
    var availableW=Math.max(1,window.innerWidth-4),availableH=Math.max(1,window.innerHeight-8);
    scale=Math.max(.5,Math.min(1.5,Math.min(availableW/Math.max(width,1),availableH/Math.max(height,1))));
    apply();
  }
  function change(delta){mode='manual';scale=Math.round(Math.max(.5,Math.min(1.5,scale+delta))*100)/100;apply();}
  document.getElementById('tvZoomOut').addEventListener('click',function(){change(-.1)});
  document.getElementById('tvZoomIn').addEventListener('click',function(){change(.1)});
  document.getElementById('tvZoomFit').addEventListener('click',fit);
  window.addEventListener('resize',function(){if(mode==='fit')fit();else apply();});
  // Al cargarse fotos y participantes, recalcular el ajuste automático.
  if(typeof MutationObserver!=='undefined'){
    var pending=false;
    new MutationObserver(function(){if(mode!=='fit'||pending)return;pending=true;requestAnimationFrame(function(){pending=false;fit();});}).observe(document.getElementById('players'),{childList:true});
  }
  window.addEventListener('load',function(){if(mode==='fit')fit();else apply();});
  if(mode==='fit')fit();else apply();
})();
