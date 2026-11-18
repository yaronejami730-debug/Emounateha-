/* Bouton « Partager » des pages d'action et des colis : feuille de partage du téléphone (WhatsApp, SMS, e-mail…), sinon copie du lien.
   L'adresse envoyée est celle de la page (ou du colis) : son aperçu WhatsApp porte le bon titre et la bonne image. */
(function(){
var ICO='<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 15V4m0 0L8 8m4-4 4 4"/><path d="M5 12v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6"/></svg>';
var css=document.createElement('style');
css.textContent='.pgshare{position:relative;z-index:4;display:inline-flex;align-items:center;gap:7px;margin-top:12px;min-height:34px;padding:6px 15px;border-radius:99px;border:1.5px solid rgba(240,217,138,.8);background:rgba(9,36,40,.38);-webkit-backdrop-filter:blur(6px);backdrop-filter:blur(6px);color:#f6e3a4;font:700 12.5px/1 Inter,system-ui,sans-serif;letter-spacing:.02em;cursor:pointer}.pgshare:hover{background:rgba(240,217,138,.18)}.pgshare:active{transform:scale(.96)}'+
'.pgrow{position:relative;z-index:4;display:flex;align-items:center;justify-content:center;gap:8px;margin-top:14px;flex-wrap:nowrap}.pgrow .pgshare{margin-top:0;flex:0 0 auto}'+
'.pgor{display:inline-flex;align-items:center;justify-content:center;min-height:36px;padding:7px 15px;border-radius:99px;background:linear-gradient(180deg,#f3e08f 0%,#e8d078 40%,#d0a848 100%);border:1.5px solid #e8d078;color:#1b2b2d!important;font:700 12px/1.15 Cinzel,Georgia,serif!important;letter-spacing:.05em;text-transform:uppercase;text-decoration:none!important;text-align:center;white-space:nowrap;box-shadow:0 3px 10px rgba(0,0,0,.25)}.pgor:hover{background:linear-gradient(180deg,#fbeba8 0%,#f0dc8a 42%,#dcb856 100%)}.pgor:active{transform:scale(.96)}'+
'@media(max-width:430px){.pgrow{gap:5px}.pgor{font-size:10.4px!important;padding:7px 9px;letter-spacing:.02em}.pgrow .pgshare{padding:6px 10px;font-size:11.5px;gap:5px}}@media(max-width:375px){.pgor{font-size:9.8px!important;padding:7px 7px}}@media(max-width:350px){.pgrow{gap:4px}.pgor{font-size:9.2px!important;padding:7px 6px;letter-spacing:0}.pgrow .pgshare{padding:6px 8px;font-size:10.5px}.pgrow .pgshare svg{width:12px;height:12px}}'+
'.colpart{display:inline-flex;align-items:center;gap:7px;margin:10px 0 0 10px;min-height:38px;padding:8px 16px;border-radius:99px;border:1.5px solid #cfe0e1;background:#fff;color:#1f6a72;font:700 13px/1 Inter,system-ui,sans-serif;cursor:pointer;vertical-align:middle}.colpart:hover{border-color:#1f6a72}.colpart:active{transform:scale(.96)}@media(max-width:520px){.colpart{margin-left:0;display:flex;width:max-content}}'+
'.pgtoast{position:fixed;left:50%;bottom:90px;transform:translateX(-50%);z-index:3000;background:#16393e;color:#fff;padding:11px 18px;border-radius:99px;font:600 14px Inter,system-ui,sans-serif;box-shadow:0 8px 24px rgba(0,0,0,.3);white-space:nowrap}';
document.head.appendChild(css);
function toast(m){var t=document.createElement('div');t.className='pgtoast';t.setAttribute('role','status');t.textContent=m;document.body.appendChild(t);setTimeout(function(){t.remove()},2600)}
function part(d){
  if(navigator.share){navigator.share(d).catch(function(){});return}
  var wa=function(){window.open('https://wa.me/?text='+encodeURIComponent((d.text?d.text+' ':'')+d.url),'_blank','noopener')};
  if(navigator.clipboard&&navigator.clipboard.writeText)navigator.clipboard.writeText(d.url).then(function(){toast('Lien copié : collez-le où vous voulez')},wa);else wa();
}
window.emPartage=part;
function meta(p){var m=document.querySelector('meta[property="'+p+'"]');return m?m.getAttribute('content'):''}
function go(){
  var h=document.querySelector('.pagehead .wrap');
  if(h&&!h.querySelector('.pgshare')){
    var c=document.querySelector('link[rel=canonical]'),url=(c&&c.href)||location.href.split('#')[0].split('?')[0],h1=h.querySelector('h1'),nom=h1?h1.textContent.trim():document.title;
    var b=document.createElement('button');b.type='button';b.className='pgshare';b.setAttribute('aria-label','Partager cette page');b.innerHTML=ICO+'<span>Partager</span>';
    b.addEventListener('click',function(){part({title:meta('og:title')||nom+' — Émounatéha',text:nom+' — Émounatéha',url:url})});
    var w=document.createElement('div');w.className='pgrow';w.appendChild(b);h.appendChild(w);
    var m=location.pathname.match(/^\/(soutien-moral-et-financier|un-toit-sur-la-tete|vetements-et-soins|reinsertion-sociale)\//);
    if(m){   // pages d'action : « Offrir un colis » à gauche de « Partager », « Faire un don » à droite
      var ret='?retour='+encodeURIComponent(location.href.split('#')[0]),lien=function(t,u){var a=document.createElement('a');a.className='pgor';a.href=u;a.textContent=t;return a};
      w.insertBefore(lien('Offrir un colis','https://don.emounateha.fr/colis-de-chabbat/'+ret),b);
      w.appendChild(lien('\u2665 Faire un don','https://don.emounateha.fr/'+m[1]+'/'+ret));
    }
  }
  document.addEventListener('click',function(e){var t=e.target.closest&&e.target.closest('[data-partage]');if(!t)return;e.preventDefault();part({title:t.getAttribute('data-titre')+' — Émounatéha',text:t.getAttribute('data-texte')||t.getAttribute('data-titre'),url:t.getAttribute('data-partage')})});
}
if(document.readyState!=='loading')go();else document.addEventListener('DOMContentLoaded',go);
})();
