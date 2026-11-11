/* Annonce Hanouka sur l'accueil (jusqu'au 7 déc. 2026) : fenêtre « flyer » une fois par visite + bandeau permanent. */
(function(){
var END=new Date('2026-12-07T23:59:59+01:00').getTime(),FIRST=new Date('2026-12-04T17:00:00+01:00').getTime();
if(Date.now()>END)return;
/* nombre de jours de calendrier (heure de Paris) jusqu'au 4 décembre : le même calcul que la page des colis et la page de don */
var AUJ=new Date().toLocaleDateString('sv-SE',{timeZone:'Europe/Paris'}),d=Math.round((Date.parse('2026-12-04T12:00:00Z')-Date.parse(AUJ+'T12:00:00Z'))/86400000);if(d<=0&&Date.now()>FIRST)d=-1;
var cnt=d>1?'dans <b>'+d+' jours</b>':d===1?'<b>demain soir</b>':d===0?'<b>ce soir</b>':'<b>c’est Hanouka</b>';
var HANOUKA_DON='https://don.emounateha.fr/?aff=hanouka'; /* don Hanouka : don.emounateha.fr, Hanouka choisi d'office */
var LINK=HANOUKA_DON;
var css=document.createElement('style');
css.textContent=
'#hnband{display:flex;align-items:center;justify-content:center;gap:12px;flex-wrap:nowrap;padding:8px 14px;background:#1f6a72 url(/header.jpg) center/cover;color:#fff;font:600 13px/1.2 Inter,system-ui,sans-serif;text-align:center;text-decoration:none;position:sticky;top:0;z-index:120;box-shadow:0 2px 10px rgba(10,40,45,.18);overflow:hidden}'+
'#hnband::after{content:"";position:absolute;top:0;bottom:0;width:60px;left:-80px;background:linear-gradient(100deg,transparent,rgba(255,255,255,.28),transparent);transform:skewX(-18deg);animation:hnsh 5.5s ease-in-out infinite;pointer-events:none}'+
'@keyframes hnsh{0%,70%{left:-80px}100%{left:110%}}'+
'#hnband .t{font:700 13px/1 Cinzel,Georgia,serif;letter-spacing:.1em;color:#e4cd8a;text-transform:uppercase;white-space:nowrap}'+
'#hnband .c{font:500 13px/1 Inter,system-ui,sans-serif;color:#fff;white-space:nowrap}#hnband .c b{color:#e4cd8a;font-weight:700}'+
'#hnband .m{width:24px;height:24px;flex:none;object-fit:contain}'+
'#hnband u{text-decoration:none;white-space:nowrap;border-radius:99px;padding:6px 14px;background:#c4a24a;border:1.5px solid #c4a24a;color:#1b2b2d;font:700 12px/1 Inter,system-ui,sans-serif;box-shadow:0 4px 14px rgba(0,0,0,.25)}'+
'@media(max-width:340px){#hnband{gap:6px!important;padding:6px 8px!important;flex-wrap:wrap;justify-content:center}#hnband .t{font-size:10.5px!important;letter-spacing:.04em!important}#hnband .c{font-size:11px!important}#hnband u{padding:5px 9px!important;font-size:10.5px!important}}'+
'@media(max-width:420px){#hnband{gap:8px;padding:7px 10px}#hnband .t{font-size:11.5px;letter-spacing:.07em}#hnband .c{font-size:12px}#hnband u{padding:6px 11px;font-size:11.5px}#hnband .m{width:22px;height:22px}}'+
'#hnov{position:fixed;inset:0;z-index:2000;display:flex;align-items:center;justify-content:center;padding:18px;background:rgba(8,14,20,.72);-webkit-backdrop-filter:blur(3px);backdrop-filter:blur(3px);opacity:0;transition:opacity .4s}'+
'#hnov.on{opacity:1}'+
'#hnc{position:relative;display:flex;flex-direction:column;align-items:center;gap:12px;max-height:94vh;transform:translateY(24px) scale(.95);transition:transform .55s cubic-bezier(.2,.8,.2,1)}'+
'#hnov.on #hnc{transform:none}'+
'#hnc .fw{position:relative;line-height:0}'+
'#hnc .st{position:absolute;left:82.55%;top:83.1%;transform:translate(-50%,-50%) rotate(-12.7deg);white-space:nowrap;font:800 12px/1 Inter,system-ui,sans-serif;letter-spacing:-.01em;color:#7a1c16;text-shadow:0 1px 0 rgba(255,225,170,.5)}'+
'#hnc img{display:block;height:min(78vh,calc(92vw * 3 / 2));width:auto;max-width:92vw;border-radius:18px;border:1px solid rgba(243,213,140,.6);box-shadow:0 20px 60px rgba(0,0,0,.6),0 0 0 6px rgba(243,213,140,.1)}'+
'#hnc .go{display:block;padding:13px 40px;border-radius:99px;background:linear-gradient(180deg,#f3d58c,#c9973f);color:#1b1407;font:700 13px/1 Inter,system-ui,sans-serif;letter-spacing:.08em;text-decoration:none;box-shadow:0 6px 20px rgba(201,151,63,.4)}'+
'#hnc .x{position:absolute;top:-48px;right:0;width:38px;height:38px;padding:0;border:0;outline:0;border-radius:50%;background:rgba(255,255,255,.16);-webkit-backdrop-filter:blur(8px);backdrop-filter:blur(8px);color:#fff;cursor:pointer;z-index:2;display:grid;place-items:center;transition:background .2s,transform .2s;-webkit-tap-highlight-color:transparent}#hnc .x svg{width:16px;height:16px;display:block}#hnc .x:hover{background:rgba(255,255,255,.3)}#hnc .x:active{transform:scale(.92)}';
document.head.appendChild(css);
var flame='<img class="m" src="/hanouka/hanoukia.png?v=1" alt="" width="22" height="22">';
/* bandeau permanent */
var b=document.createElement('a');b.id='hnband';b.href=LINK;
b.innerHTML=flame+'<span class="t">Hanouka</span><span class="c">'+cnt+'</span><u>Offrir un colis</u>';
function mountBand(){document.body.insertBefore(b,document.body.firstChild);
  /* bandeau toujours visible : la barre de menu se cale juste en dessous */
  function fit(){var n=document.querySelector('.sec-nav');if(n&&n.style)n.style.top=b.offsetHeight+'px'}
  fit();addEventListener('resize',fit);setTimeout(fit,400);setTimeout(fit,1500)}
if(document.body)mountBand();else document.addEventListener('DOMContentLoaded',mountBand);
/* fenêtre « flyer » : l'affiche Hanouka en grand, une fois par visite ; le bandeau la rouvre */
var LINKDON=HANOUKA_DON;
var stamp=d>1?'DANS '+d+' JOURS':d===1?'DEMAIN SOIR':d===0?'CE SOIR':'C’EST HANOUKA';
function open(){
  if(document.getElementById('hnov')||document.getElementById('erov'))return;
  var o=document.createElement('div');o.id='hnov';o.setAttribute('role','dialog');o.setAttribute('aria-modal','true');o.setAttribute('aria-label','Affiche Hanouka 5787');
  o.innerHTML='<div id="hnc"><button class="x" aria-label="Fermer" type="button"><svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M3 3l10 10M13 3L3 13"/></svg></button><div class="fw"><img src="/hanouka/affiche.jpg?v=19" alt="Hanouka — Offrez la lumière à une famille"><span class="st" aria-hidden="true">'+stamp+'</span></div><a class="go" href="'+LINKDON+'" target="_blank" rel="noopener">Je participe</a></div>';
  document.body.appendChild(o);requestAnimationFrame(function(){requestAnimationFrame(function(){o.classList.add('on')})});
  function close(){o.classList.remove('on');setTimeout(function(){o.remove()},400)}
  var im=o.querySelector('img'),st=o.querySelector('.st');function fit(){st.style.fontSize=(im.clientWidth*0.0325)+'px'}if(im.complete)fit();im.addEventListener('load',fit);window.addEventListener('resize',fit);
  o.querySelector('.x').onclick=close;o.addEventListener('click',function(e){if(e.target===o)close()});
  document.addEventListener('keydown',function k(e){if(e.key==='Escape'){close();document.removeEventListener('keydown',k)}});
}
window.hnOpen=open;
b.addEventListener('click',function(e){e.preventDefault();open()});
/* banderole Hanouka sous la citation du Rabbi */
function mountBanner(){
  var r=document.querySelector('.hero .quote');if(!r||document.getElementById('hnbanner'))return;
  var st=document.createElement('style');
  st.textContent='#hnbanner{display:block;order:9;width:min(100%,760px);margin:18px auto 0;border-radius:22px;overflow:hidden;box-shadow:0 10px 28px rgba(8,20,28,.35),0 0 0 1px rgba(243,213,140,.35);position:relative;z-index:2;-webkit-tap-highlight-color:transparent;transition:transform .2s}#hnbanner:active{transform:scale(.985)}html body .hero #hnbanner img{display:block;width:100%;height:auto;margin:0;filter:none;animation:none;max-width:none}@media(max-width:800px){#hnbanner{width:calc(100% - 4px);margin-top:16px;border-radius:18px}}';
  document.head.appendChild(st);
  var a=document.createElement('a');a.id='hnbanner';a.href=HANOUKA_DON;a.target='_blank';a.rel='noopener';a.setAttribute('aria-label','Hanouka 5787 : offrez la lumière à une famille. Un colis alimentaire pour la fête, 130 euros');
  a.innerHTML='<img src="/hanouka/banderole.jpg?v=6" alt="Hanouka 5787 — Offrez la lumière à une famille. Un colis alimentaire pour la fête. Pour 130 € · Émounatéha × AlloDons" width="1046" height="262" loading="eager">';
  a.addEventListener('click',function(e){if(window.hnOpen){e.preventDefault();window.hnOpen()}});
  r.parentNode.insertBefore(a,r.nextSibling)}
if(document.readyState!=='loading')mountBanner();else document.addEventListener('DOMContentLoaded',mountBanner);
/* ouverture automatique : UNE seule fois, au bout de ~20 s ; une fois ouverte (ou fermée par la croix) on ne la relance plus jamais */
try{if(localStorage.getItem('hnseen'))return}catch(e){}
setTimeout(function(){
  try{if(localStorage.getItem('hnseen'))return}catch(e){}
  if(document.hidden||document.getElementById('erov')||document.getElementById('hnov'))return;
  try{localStorage.setItem('hnseen','1')}catch(e){}
  open();
},20000);
})();
