/* Vidéos verticales « façon TikTok » (téléphone seulement) : on touche une vidéo, elle s'ouvre en plein écran ; on fait défiler vers le haut / le bas pour passer aux autres vidéos. Les documents ne sont pas concernés. */
(function(){
var phone=/[?&]phone=1/.test(location.search)||(window.matchMedia&&matchMedia('(max-width:800px), (pointer:coarse)').matches);
if(!phone)return;
['https://www.youtube-nocookie.com','https://i.ytimg.com','https://www.youtube.com','https://www.allodons.fr'].forEach(function(u){var l=document.createElement('link');l.rel='preconnect';l.href=u;l.crossOrigin='';document.head.appendChild(l)});
var LIST=null,open=false,ov=null,sound=false,cur=-1;
var mois=['janvier','février','mars','avril','mai','juin','juillet','août','septembre','octobre','novembre','décembre'],jours=['Dimanche','Lundi','Mardi','Mercredi','Jeudi','Vendredi','Samedi'];
function idOf(u){var m=String(u||'').match(/(?:v=|youtu\.be\/|shorts\/|embed\/)([A-Za-z0-9_-]{11})/);return m?m[1]:null}
function fdate(d){var x=new Date(d+'T12:00:00');return jours[x.getDay()]+' '+x.getDate()+' '+mois[x.getMonth()]+' '+x.getFullYear()}
function load(){
  if(LIST)return Promise.resolve(LIST);
  return Promise.all([fetch('/diffusion-archives.json').then(function(r){return r.json()}).catch(function(){return{months:[]}}),fetch('/diffusion.json',{cache:'no-store'}).then(function(r){return r.json()}).catch(function(){return[]})]).then(function(a){
    var out=[],seen={};
    function add(x){var id=idOf(x.youtube);if(!id||seen[id])return;seen[id]=1;out.push({id:id,day:x.day,name:x.name})}
    (a[1]||[]).forEach(add);(a[0].months||[]).forEach(function(m){(m.items||[]).forEach(add)});
    out.sort(function(p,q){return String(q.day).localeCompare(String(p.day))});
    LIST=out;return out});
}
var css=document.createElement('style');
css.textContent='#tt{position:fixed;inset:0;z-index:3000;background:#000;opacity:0;transition:opacity .25s}#tt.on{opacity:1}'+
'#tt .ttl{position:absolute;inset:0;overflow-y:scroll;scroll-snap-type:y mandatory;-webkit-overflow-scrolling:touch;overscroll-behavior:contain}'+
'#tt .tts{position:relative;height:100vh;height:100dvh;scroll-snap-align:start;scroll-snap-stop:always;overflow:hidden;background:#000}'+
'#tt .ttp{position:absolute;inset:0;background-size:contain;background-position:center;background-repeat:no-repeat}'+
'#tt iframe{position:absolute;left:0;top:50%;transform:translateY(-50%);width:100%;height:min(100dvh,177.78vw);border:0;background:#000;pointer-events:none;opacity:0;transition:opacity .3s}#tt iframe.ok{opacity:1}'+
'#tt .ttx{position:fixed;top:calc(12px + env(safe-area-inset-top));right:12px;z-index:5;width:40px;height:40px;border-radius:50%;border:0;background:rgba(255,255,255,.18);-webkit-backdrop-filter:blur(8px);backdrop-filter:blur(8px);color:#fff;display:grid;place-items:center;padding:0}'+
'#tt .ttx svg{width:16px;height:16px}'+
'#tt .ttb{position:absolute;left:0;right:0;bottom:0;z-index:4;padding:60px 16px calc(18px + env(safe-area-inset-bottom));background:linear-gradient(to top,rgba(0,0,0,.75),rgba(0,0,0,0));display:flex;align-items:flex-end;justify-content:space-between;gap:12px;pointer-events:none}'+
'#tt .ttc{color:#fff;font:600 14px/1.3 Inter,system-ui,sans-serif;text-shadow:0 1px 6px rgba(0,0,0,.6)}#tt .ttc small{display:block;font-weight:400;opacity:.85;font-size:12px;margin-top:2px}'+
'#tt .ttd{pointer-events:auto;flex:none;border:0;text-decoration:none;padding:11px 18px;border-radius:99px;background:#c4a24a;color:#1b2b2d;font:700 13px/1 Inter,system-ui,sans-serif;box-shadow:0 4px 14px rgba(0,0,0,.35)}'+
'#tt .tts-snd{position:absolute;top:calc(14px + env(safe-area-inset-top));left:12px;z-index:5;pointer-events:auto;border:0;border-radius:99px;padding:9px 14px;background:rgba(255,255,255,.2);-webkit-backdrop-filter:blur(8px);backdrop-filter:blur(8px);color:#fff;font:600 12px Inter,system-ui,sans-serif;display:none}'+
'#tt .tts-n{position:fixed;right:14px;top:50%;transform:translateY(-50%);z-index:5;color:rgba(255,255,255,.6);font:600 11px Inter,system-ui,sans-serif;writing-mode:vertical-rl;pointer-events:none}'+
'#tt .ttsh{position:fixed;left:0;right:0;bottom:0;z-index:8;height:84vh;height:84dvh;background:#fff;border-radius:22px 22px 0 0;box-shadow:0 -12px 40px rgba(0,0,0,.45);transform:translateY(105%);transition:transform .38s cubic-bezier(.2,.8,.2,1);display:flex;flex-direction:column;overflow:hidden}#tt .ttsh.on{transform:none}'+
'#tt .ttsh .hd{flex:none;display:flex;align-items:center;gap:10px;padding:10px 14px 10px 18px;border-bottom:1px solid #e3ecec;background:linear-gradient(180deg,#fffdf6,#fff)}'+
'#tt .ttsh .hd b{font:700 15px Cinzel,Georgia,serif;letter-spacing:.06em;color:#1f6a72;flex:1}#tt .ttsh .hd span{font:500 11px Inter,system-ui,sans-serif;color:#7d8f92}'+
'#tt .ttsh .hd button{flex:none;width:34px;height:34px;border-radius:50%;border:0;background:#eef3f3;color:#1f6a72;font-size:18px;line-height:34px;padding:0}'+
'#tt .ttsh .bd{flex:1;overflow:auto;-webkit-overflow-scrolling:touch;overscroll-behavior:contain}#tt .ttsh iframe{display:block;width:100%;border:0;min-height:560px;background:#fff;position:static;transform:none;height:auto;pointer-events:auto;opacity:1}'+
'#tt.sheet .ttl{overflow:hidden}'+
'html.tt-lock,html.tt-lock body{overflow:hidden!important}';
document.head.appendChild(css);
function post(f,fn,args){try{f.contentWindow.postMessage(JSON.stringify({event:'command',func:fn,args:args||''}),'*')}catch(e){}}
function listen(f){try{f.contentWindow.postMessage(JSON.stringify({event:'listening',id:1,channel:'widget'}),'*')}catch(e){}}
function mount(s,i,active){
  var f=s.querySelector('iframe');
  if(f){return f}
  var it=LIST[i];f=document.createElement('iframe');
  f.allow='autoplay; encrypted-media';f.setAttribute('playsinline','');f.dataset.act=active?'1':'0';
  f.src='https://www.youtube-nocookie.com/embed/'+it.id+'?autoplay=1&mute='+(sound&&active?0:1)+'&playsinline=1&controls=0&rel=0&modestbranding=1&disablekb=1&fs=0&iv_load_policy=3&loop=1&playlist='+it.id+'&enablejsapi=1';
  f.onload=function(){
    listen(f);setTimeout(function(){listen(f)},400);
    if(f.dataset.act!=='1'){setTimeout(function(){post(f,'pauseVideo');post(f,'seekTo',[0,true])},1200)}
    setTimeout(function(){f.classList.add('ok')},active?500:0);
  };
  s.insertBefore(f,s.querySelector('.ttb'));
  return f;
}
function activate(i){
  var slides=[].slice.call(ov.querySelectorAll('.tts'));
  slides.forEach(function(s,k){
    if(Math.abs(k-i)>1){unmount(s);return}
    var f=mount(s,k,k===i);
    if(k===i){
      f.dataset.act='1';f.classList.add('ok');
      post(f,'seekTo',[0,true]);post(f,'playVideo');if(sound)post(f,'unMute');
      setTimeout(function(){post(f,'playVideo');if(sound)post(f,'unMute')},500);
      s._p=0;
    }else{f.dataset.act='0';post(f,'pauseVideo')}
  });
  var b=document.getElementById('ttsnd');if(b)b.style.display=sound?'none':'block';
}
function unmount(s){var f=s.querySelector('iframe');if(f)f.remove()}
function close(){
  if(!open)return;open=false;document.documentElement.classList.remove('tt-lock');
  ov.classList.remove('on');setTimeout(function(){ov&&ov.remove();ov=null},250);
  try{if(history.state&&history.state.tt)history.back()}catch(e){}
}
function show(id){
  if(open)return;
  load().then(function(L){
    if(!L.length)return;
    var start=Math.max(0,L.findIndex(function(x){return x.id===id}));open=true;
    document.documentElement.classList.add('tt-lock');
    ov=document.createElement('div');ov.id='tt';ov.setAttribute('role','dialog');ov.setAttribute('aria-modal','true');ov.setAttribute('aria-label','Vidéos');
    var h='<button class="ttx" type="button" aria-label="Fermer"><svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M3 3l10 10M13 3L3 13"/></svg></button><button class="tts-snd" id="ttsnd" type="button">🔊 Activer le son</button><div class="ttl">';
    L.forEach(function(x,i){
      h+='<div class="tts" data-i="'+i+'"><div class="ttp" style="background-image:url(https://i.ytimg.com/vi/'+x.id+'/maxresdefault.jpg)"></div><div class="ttb"><div class="ttc">'+fdate(x.day)+'<small>'+(x.name?x.name:'Vidéo de Tanya du jour')+'</small></div><button class="ttd" type="button">♥ Faire un don</button></div></div>';
    });
    h+='</div><div class="ttsh" id="ttsh" role="dialog" aria-label="Faire un don"><div class="hd"><b>Faire un don</b><span>Paiement sécurisé</span><button type="button" id="ttshx" aria-label="Fermer">✕</button></div><div class="bd" id="ttshbd"></div></div>';
    ov.innerHTML=h;document.body.appendChild(ov);
    var list=ov.querySelector('.ttl'),slides=[].slice.call(ov.querySelectorAll('.tts'));
    list.scrollTop=start*list.clientHeight;
    requestAnimationFrame(function(){ov.classList.add('on')});
    var io=new IntersectionObserver(function(es){es.forEach(function(e){if(e.isIntersecting&&e.intersectionRatio>.6){var i=+e.target.dataset.i;if(i!==cur){cur=i;activate(i)}}})},{root:list,threshold:[.6]});
    slides.forEach(function(s){io.observe(s)});cur=-1;
    var sh=ov.querySelector('#ttsh');
    function donOpen(){ov.classList.add('sheet');sh.classList.add('on');
      if(!sh._l){sh._l=1;var f=document.createElement('iframe');f.src='https://www.allodons.fr/embed/emounateha';f.title='Faire un don';f.allow='payment *';f.style.height='620px';ov.querySelector('#ttshbd').appendChild(f);
        window.addEventListener('message',function(e){if(e.origin!=='https://www.allodons.fr')return;var d=e.data||{};if(d.type==='allodons:embed-height')f.style.height=d.height+'px';if(d.type==='allodons:payment-result'&&d.status==='succeeded'){var t=ov.querySelector('#ttsh .hd b');if(t)t.textContent='Merci de tout cœur 🙏';var sp=ov.querySelector('#ttsh .hd span');if(sp)sp.textContent='Votre don a bien été reçu'}})}}
    function donClose(){sh.classList.remove('on');ov.classList.remove('sheet')}
    ov.addEventListener('click',function(e){var b=e.target.closest&&e.target.closest('.ttd');if(b){e.stopPropagation();donOpen()}},true);
    ov.querySelector('#ttshx').onclick=donClose;
    ov.querySelector('.ttx').onclick=close;
    ov.querySelector('#ttsnd').onclick=function(e){e.stopPropagation();sound=true;this.style.display='none';var cs=ov.querySelectorAll('.tts')[cur];var x=cs&&cs.querySelector('iframe');if(x){post(x,'unMute');post(x,'playVideo')}};
    /* un toucher sur la vidéo : pause / lecture */
    list.addEventListener('click',function(e){if(e.target.closest('a,button'))return;var s=e.target.closest('.tts'),f=s&&s.querySelector('iframe');if(!f)return;if(s._p){post(f,'playVideo');s._p=0}else{post(f,'pauseVideo');s._p=1}});
    try{history.pushState({tt:1},'')}catch(e){}
  });
}
window.addEventListener('popstate',function(){if(open){open=false;document.documentElement.classList.remove('tt-lock');if(ov){ov.remove();ov=null}}});
/* branchements : cartes vidéo de la bibliothèque, grand aperçu, vidéo du jour de l'accueil */
document.addEventListener('click',function(e){
  var c=e.target.closest&&e.target.closest('.it .th.v, .it:has(.th.v), button.ytplay[data-yt], .yt.ytplay');if(!c)return;
  var card=c.closest('.it')||c;var img=card.querySelector('img');
  var tm=img&&img.src.match(/\/vi\/([A-Za-z0-9_-]{11})\//);var id=(card.dataset&&card.dataset.yt)||(c.dataset&&c.dataset.yt)||(tm&&tm[1])||null;
  if(!id)return;
  e.preventDefault();e.stopPropagation();e.stopImmediatePropagation();show(id);
},true);
window.ttOpen=show;
/* aperçu : ?feed=1 ouvre directement le défilement vidéo (ou ?feed=ID_YOUTUBE) */
var fm=location.search.match(/[?&]feed=([A-Za-z0-9_-]*)/);if(fm)setTimeout(function(){show(fm[1].length===11?fm[1]:null)},1500);
})();
