/* Bouton WhatsApp flottant : invisible au repos, il sort quand on fait défiler la page, puis se range complètement. */
(function(){
if(window.__wab)return;window.__wab=1;
var NUM='33669670770',TXT='Bonjour, je vous contacte depuis le site Émounatéha.';
var K='wab',st={ign:0,clk:0};
try{st=Object.assign(st,JSON.parse(localStorage.getItem(K)||'{}'))}catch(e){}
function save(){try{localStorage.setItem(K,JSON.stringify(st))}catch(e){}}
var css=document.createElement('style');
css.textContent='#wab{position:fixed;right:14px;bottom:calc(16px + env(safe-area-inset-bottom));z-index:900;display:flex;align-items:center;font-family:Cinzel,Georgia,serif;transform:translateX(160px);opacity:0;pointer-events:none;transition:transform .55s cubic-bezier(.2,.8,.2,1),opacity .35s}'+
'#wab.in{transform:none;opacity:1;pointer-events:auto}'+
'#wab a.m{display:flex;align-items:center;background:#25D366;color:#fff;text-decoration:none;border-radius:999px;height:54px;min-width:54px;box-shadow:0 6px 20px rgba(0,0,0,.28);overflow:hidden;max-width:54px;transition:max-width .55s cubic-bezier(.2,.8,.2,1),padding .55s;touch-action:pan-y;user-select:none;-webkit-user-select:none}'+
'#wab a.m svg{width:30px;height:30px;flex:none;margin:12px}'+
'#wab a.m span{white-space:nowrap;font-size:13px;font-weight:600;letter-spacing:.06em;opacity:0;transition:opacity .35s}'+
'#wab.open a.m{max-width:280px;padding-right:18px}#wab.open a.m span{opacity:1;transition-delay:.2s}'+
'#wab.drag{transition:none!important}'+
'@media(max-width:800px){#wab{right:10px}}';
document.head.appendChild(css);
var b=document.createElement('div');b.id='wab';
b.innerHTML='<a class="m" href="https://wa.me/'+NUM+'?text='+encodeURIComponent(TXT)+'" target="_blank" rel="noopener" aria-label="Contactez-nous sur WhatsApp"><svg viewBox="0 0 24 24" fill="#fff" aria-hidden="true"><path d="M12.04 2a9.9 9.9 0 0 0-8.4 15.1L2 22l5-1.6A9.9 9.9 0 1 0 12.04 2zm0 1.8a8.1 8.1 0 1 1-4.3 15l-.3-.2-2.9.9.9-2.8-.2-.3A8.1 8.1 0 0 1 12.04 3.8zm-3 3.6c-.2 0-.5.1-.7.4-.3.3-.9.9-.9 2.2s.9 2.5 1 2.7c.1.2 1.8 2.9 4.5 3.9 2.2.9 2.7.7 3.2.6.5-.1 1.6-.7 1.8-1.3.2-.6.2-1.2.2-1.3-.1-.1-.3-.2-.6-.3l-1.9-.9c-.2-.1-.4-.1-.6.1l-.8 1c-.1.2-.3.2-.5.1a6.6 6.6 0 0 1-3.3-2.9c-.2-.4.2-.4.6-1.2.1-.2 0-.3 0-.5l-.9-2c-.2-.5-.4-.5-.6-.5z"/></svg><span>Contactez-nous ici</span></a>';
document.body.appendChild(b);
var a=b.querySelector('a.m'),idle,lab,shown=false,lastHide=0,y0=window.scrollY||0,acc=0,clicked=false;
function dismissed(){try{return +sessionStorage.getItem('wabd')>Date.now()}catch(e){return false}}
function show(){
  if(shown||dismissed())return;
  if(Date.now()-lastHide<3000*(1+Math.min(st.ign,6)))return;     /* ignoré souvent => revient moins vite */
  shown=true;clicked=false;b.classList.add('in');
  if(st.clk===0&&st.ign<4){setTimeout(function(){if(shown)b.classList.add('open')},500);lab=setTimeout(function(){b.classList.remove('open')},4200)}}
function hide(){
  if(!shown)return;shown=false;clearTimeout(lab);b.classList.remove('open','in');lastHide=Date.now();
  if(!clicked){st.ign++;save()}}
var ua=0;['wheel','touchstart','touchmove','touchend','keydown','mousedown'].forEach(function(n){window.addEventListener(n,function(){ua=Date.now()},{passive:true})});
window.addEventListener('scroll',function(){
  var y=window.scrollY||0,d=Math.abs(y-y0);y0=y;
  if(Date.now()-ua>1800)return;                       /* ignore les défilements automatiques (restauration de page, ancres) */
  acc+=d;
  if(acc>160)show();
  if(shown){clearTimeout(idle);idle=setTimeout(function(){acc=0;hide()},2300)}
},{passive:true});
/* glisser le bouton vers la droite : il se range complètement (10 min) */
var px=0,dx=0,moved=0,drag=false;
a.addEventListener('pointerdown',function(e){px=e.clientX;dx=0;moved=0;drag=true;try{a.setPointerCapture(e.pointerId)}catch(_){}clearTimeout(idle)});
a.addEventListener('pointermove',function(e){if(!drag)return;dx=e.clientX-px;if(Math.abs(dx)>8){moved=1;b.classList.add('drag');b.style.transform='translateX('+Math.max(0,dx)+'px)'}});
function end(){if(!drag)return;drag=false;b.classList.remove('drag');b.style.transform='';
  if(moved&&dx>40){try{sessionStorage.setItem('wabd',String(Date.now()+600000))}catch(e){}st.ign+=2;save();hide()}
  else if(shown){idle=setTimeout(function(){acc=0;hide()},2300)}}
a.addEventListener('pointerup',end);a.addEventListener('pointercancel',end);
a.addEventListener('click',function(e){if(moved){e.preventDefault();moved=0;return}clicked=true;st.clk++;st.ign=0;save()});
})();
