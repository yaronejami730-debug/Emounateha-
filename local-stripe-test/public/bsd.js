/* ב״ה en haut à droite des pages qui n'ont pas déjà la barre du site (mentions légales, CGV, confidentialité, Sidour, simulateur, ambassadeur). Petit, doré, police hébraïque du nom. */
(function(){
function visible(){var w=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT),n;while(n=w.nextNode()){if(/ב[״"]ה/.test(n.nodeValue)){var e=n.parentElement,b=e.getBoundingClientRect(),c=getComputedStyle(e);if(b.width>0&&b.height>0&&c.display!=='none'&&c.visibility!=='hidden'&&b.top+scrollY<160&&b.right>innerWidth*.5)return true}}return false}
var css=document.createElement('style');
css.textContent='.bsd-haut{position:absolute;z-index:60;right:14px;top:12px;font-family:"EmouFr","EmouHe","Frank Ruhl Libre","David Libre",Inter,system-ui,sans-serif;font-weight:900;font-size:17px;line-height:1;background:linear-gradient(180deg,#fff1b0 0%,#f0d57c 45%,#d2ab49 100%);-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent;color:transparent;filter:drop-shadow(0 1px 3px rgba(0,0,0,.32));pointer-events:none;white-space:nowrap}.bsd-haut.sombre{background-image:linear-gradient(180deg,#e2c477 0%,#b58c36 45%,#7d5c16 100%);filter:none}@media(min-width:801px){.bsd-haut{right:22px;font-size:18px}}';
document.head.appendChild(css);
function pose(){if(document.querySelector('.bsd-haut')||visible())return;var s=document.createElement('span');s.className='bsd-haut';s.lang='he';s.dir='rtl';s.setAttribute('aria-hidden','true');s.textContent='ב״ה';document.body.appendChild(s);place(s)}
function chevauche(s){var r=s.getBoundingClientRect(),l=document.querySelectorAll('a,button,select,input,img,h1,h2');for(var i=0;i<l.length;i++){if(l[i]===s||s.contains(l[i]))continue;var b=l[i].getBoundingClientRect();if(!(b.width>0&&b.height>0&&b.left<r.right&&b.right>r.left&&b.top<r.bottom&&b.bottom>r.top))continue;
  /* ne compte que ce qui est réellement affiché à cet endroit (pas un bouton caché derrière un panneau) */
  var x=(Math.max(b.left,r.left)+Math.min(b.right,r.right))/2,y=(Math.max(b.top,r.top)+Math.min(b.bottom,r.bottom))/2,p=document.elementsFromPoint?document.elementsFromPoint(x,y):[l[i]],h=null;for(var k=0;k<p.length;k++){if(p[k]!==s){h=p[k];break}}
  if(h&&(h===l[i]||l[i].contains(h)))return true}return false}
function place(s){var t=0,a=document.getElementById('hnband'),c=document.getElementById('clband');[a,c].forEach(function(x){if(x&&getComputedStyle(x).display!=='none')t+=x.offsetHeight});
  if(s.dataset.deg){return}
  s.style.top=(t+12)+'px';if(!chevauche(s))return;
  if(t>=24){s.style.top=Math.max(2,Math.round(t-17-(t-17)/2))+'px';if(!chevauche(s))return}   /* dans le bandeau du haut, s'il est libre à droite */
  s.dataset.deg='1';document.body.style.marginTop=(parseFloat(getComputedStyle(document.body).marginTop)||0)+28+'px';s.style.top=(t+5-(getComputedStyle(document.body).position!=='static'?28:0))+'px'}
function clair(s){var r=s.getBoundingClientRect(),l=document.elementsFromPoint?document.elementsFromPoint(r.left+r.width/2,r.top+r.height/2):[];for(var i=0;i<l.length;i++){if(l[i]===s)continue;var c=getComputedStyle(l[i]);if(c.backgroundImage&&c.backgroundImage!=='none'&&!/gradient\(rgba?\(255, 255, 255/.test(c.backgroundImage)&&/url\(/.test(c.backgroundImage)&&!/bg\.png/.test(c.backgroundImage))return false;var m=/rgba?\((\d+), (\d+), (\d+)(?:, ([\d.]+))?\)/.exec(c.backgroundColor);if(m&&(m[4]===undefined||+m[4]>.5))return (.299*m[1]+.587*m[2]+.114*m[3])>170}return true}
function teinte(s){s.classList.toggle('sombre',clair(s))}
function go(){pose();var haut=function(){if(!location.hash&&scrollY>0&&scrollY<150)scrollTo(0,0)};haut();setTimeout(haut,500);var s=document.querySelector('.bsd-haut');if(s){place(s);teinte(s);setTimeout(function(){teinte(s)},900);
  /* la page de don se cale d'elle-même quelques pixels plus bas au chargement : on revient tout en haut pour que ב״ה soit visible en entier */
setTimeout(function(){place(s)},800);addEventListener('resize',function(){place(s)})}}
if(document.readyState==='complete')setTimeout(go,300);else addEventListener('load',function(){setTimeout(go,300)});
})();
