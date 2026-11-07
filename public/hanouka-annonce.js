/* Annonce Hanouka sur l'accueil (jusqu'au 7 déc. 2026) : fenêtre « flyer » une fois par visite + bandeau permanent. */
(function(){
var END=new Date('2026-12-07T23:59:59+01:00').getTime(),FIRST=new Date('2026-12-04T17:00:00+01:00').getTime();
if(Date.now()>END)return;
var d=Math.ceil((FIRST-Date.now())/86400000);
var cnt=d>1?'dans <b>'+d+' jours</b>':d===1?'<b>demain soir</b>':d===0?'<b>ce soir</b>':'<b>c’est Hanouka</b>';
var LINK='/hanouka-lp/';
var css=document.createElement('style');
css.textContent=
'#hnband{display:flex;align-items:center;justify-content:center;gap:10px;flex-wrap:wrap;padding:9px 14px;background:linear-gradient(90deg,#10202b,#1b3140 50%,#10202b);color:#f3d58c;font:600 12px/1.3 Inter,system-ui,sans-serif;letter-spacing:.06em;text-align:center;text-decoration:none;position:relative;z-index:60}'+
'#hnband b{color:#fff;font-weight:700}#hnband u{text-decoration:none;border:1px solid rgba(243,213,140,.55);border-radius:99px;padding:3px 12px;color:#f3d58c}'+
'#hnband svg{width:16px;height:16px;flex:none}'+
'#hnov{position:fixed;inset:0;z-index:2000;display:flex;align-items:center;justify-content:center;padding:18px;background:rgba(8,14,20,.72);-webkit-backdrop-filter:blur(3px);backdrop-filter:blur(3px);opacity:0;transition:opacity .4s}'+
'#hnov.on{opacity:1}'+
'#hnc{position:relative;display:flex;flex-direction:column;align-items:center;gap:12px;max-height:94vh;transform:translateY(24px) scale(.95);transition:transform .55s cubic-bezier(.2,.8,.2,1)}'+
'#hnov.on #hnc{transform:none}'+
'#hnc img{display:block;height:min(78vh,calc(92vw * 3 / 2));width:auto;max-width:92vw;border-radius:18px;border:1px solid rgba(243,213,140,.6);box-shadow:0 20px 60px rgba(0,0,0,.6),0 0 0 6px rgba(243,213,140,.1)}'+
'#hnc .go{display:block;padding:13px 40px;border-radius:99px;background:linear-gradient(180deg,#f3d58c,#c9973f);color:#1b1407;font:700 13px/1 Inter,system-ui,sans-serif;letter-spacing:.08em;text-decoration:none;box-shadow:0 6px 20px rgba(201,151,63,.4)}'+
'#hnc .x{position:absolute;top:-46px;right:0;width:36px;height:36px;border-radius:50%;border:0;background:#fff;color:#222;font-size:22px;line-height:36px;cursor:pointer;z-index:2;box-shadow:0 2px 10px rgba(0,0,0,.4)}';
document.head.appendChild(css);
var flame='<svg viewBox="0 0 24 24" fill="#f3d58c" aria-hidden="true"><path d="M12 2c1 3-2 4-2 7a3 3 0 0 0 6 0c0-1.2-.5-2-1-3 3 1.5 5 4 5 7.5A8 8 0 0 1 4 15.500C4 10 9 8 12 2z"/></svg>';
/* bandeau permanent */
var b=document.createElement('a');b.id='hnband';b.href=LINK;
b.innerHTML=flame+'<span>Hanouka '+cnt+'</span><u>Offrir un colis</u>';
function mountBand(){document.body.insertBefore(b,document.body.firstChild)}
if(document.body)mountBand();else document.addEventListener('DOMContentLoaded',mountBand);
/* fenêtre « flyer » : l'affiche Hanouka en grand, une fois par visite ; le bandeau la rouvre */
var LINKDON='/don/';
function open(){
  if(document.getElementById('hnov'))return;
  var o=document.createElement('div');o.id='hnov';o.setAttribute('role','dialog');o.setAttribute('aria-modal','true');o.setAttribute('aria-label','Affiche Hanouka 5787');
  o.innerHTML='<div id="hnc"><button class="x" aria-label="Fermer" type="button">×</button><img src="/hanouka/affiche.jpg?v=2" alt="Hanouka dans 30 jours — Offrez la lumière à une famille"><a class="go" href="'+LINKDON+'">Je participe</a></div>';
  document.body.appendChild(o);requestAnimationFrame(function(){requestAnimationFrame(function(){o.classList.add('on')})});
  function close(){o.classList.remove('on');setTimeout(function(){o.remove()},400);try{sessionStorage.setItem('hnseen','1')}catch(e){}}
  o.querySelector('.x').onclick=close;o.addEventListener('click',function(e){if(e.target===o)close()});
  document.addEventListener('keydown',function k(e){if(e.key==='Escape'){close();document.removeEventListener('keydown',k)}});
}
b.addEventListener('click',function(e){e.preventDefault();open()});
try{if(sessionStorage.getItem('hnseen'))return}catch(e){}
setTimeout(open,1400);
})();
