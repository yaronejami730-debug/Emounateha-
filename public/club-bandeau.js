/* Bandeau du Club 'Haï sur toutes les pages du site : sous le bandeau de fête s'il y en a un, au-dessus de la barre de date. Mène à la page du club (don mensuel). */
(function(){
var LOCAL=/^(localhost|127\.0\.0\.1|192\.168\.)/.test(location.hostname);
var LINK=LOCAL?'http://'+location.hostname+':3100/campagne/club':'https://clubhai.emounateha.fr/';
var css=document.createElement('style');
css.textContent=
'#clband{display:flex;align-items:center;justify-content:center;gap:12px;flex-wrap:nowrap;padding:7px 14px;background:#123f45;color:#fff;font:600 13px/1.2 Inter,system-ui,sans-serif;text-align:center;text-decoration:none;position:sticky;top:0;z-index:119;box-shadow:0 2px 10px rgba(10,40,45,.18);border-top:1px solid rgba(228,205,138,.35)}'+
'#clband .h{font:900 21px/1 EmouHe,"Frank Ruhl Libre","Times New Roman",serif;color:#e4cd8a;flex:none}'+
'#clband .t{font:700 13px/1 Cinzel,Georgia,serif;letter-spacing:.1em;color:#e4cd8a;text-transform:uppercase;white-space:nowrap}'+
'#clband .c{font:500 13px/1 Inter,system-ui,sans-serif;color:#fff;white-space:nowrap}#clband .c b{color:#e4cd8a;font-weight:700}'+
'#clband u{text-decoration:none;white-space:nowrap;border-radius:99px;padding:6px 14px;background:transparent;border:1.5px solid #e4cd8a;color:#e4cd8a;font:700 12px/1 Inter,system-ui,sans-serif}'+
'#clband u{animation:clgo 1.5s ease-in-out infinite;will-change:transform}#clband u::after{content:" \\2192"}'+
'@keyframes clgo{0%,100%{transform:translateX(-3px) scale(1)}50%{transform:translateX(4px) scale(1.07);background:#e4cd8a;color:#123f45}}'+
'@media(prefers-reduced-motion:reduce){#clband u{animation:none}}'+
'@media(max-width:420px){#clband{gap:8px;padding:6px 10px}#clband .h{font-size:19px}#clband .t{font-size:11.5px;letter-spacing:.07em}#clband .c{font-size:12px}#clband u{padding:5px 11px;font-size:11.5px}}'+
'@media(max-width:340px){#clband{gap:6px;padding:6px 8px}#clband .t{font-size:10.5px;letter-spacing:.04em}#clband .c{font-size:11px}#clband u{padding:5px 9px;font-size:10.5px}}';
document.head.appendChild(css);
var b=document.createElement('a');b.id='clband';b.href=LINK;
b.innerHTML='<span class="h" lang="he" dir="rtl">יח</span><span class="t">Club ’Haï</span><span class="c"><b>18 €</b> par mois</span><u>Rejoindre</u>';
function fit(){var h=document.getElementById('hnband'),n=document.querySelector('.sec-nav'),hh=h?h.offsetHeight:0;b.style.top=hh+'px';if(n&&n.style)n.style.top=(hh+b.offsetHeight)+'px'}
window.clFit=fit;
/* le bouton central de la ronde des raccourcis (accueil) mène aussi au club : même lien, y compris en aperçu local */
function centre(){var c=document.querySelector('.orbc[data-club]');if(c)c.href=LINK}
if(document.body)centre();document.addEventListener('DOMContentLoaded',centre);
function mount(){var h=document.getElementById('hnband');if(h&&h.parentNode)h.parentNode.insertBefore(b,h.nextSibling);else document.body.insertBefore(b,document.body.firstChild);
  fit();addEventListener('resize',function(){setTimeout(fit,0)});setTimeout(fit,450);setTimeout(fit,1600)}
if(document.body)mount();else document.addEventListener('DOMContentLoaded',mount);
})();
