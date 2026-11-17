/* ב״ה en haut à droite des pages qui n'ont pas déjà la barre du site (mentions légales, CGV, confidentialité, Sidour, simulateur, ambassadeur). Petit, doré, police hébraïque du nom. */
(function(){
function visible(){var w=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT),n;while(n=w.nextNode()){if(/ב[״"]ה/.test(n.nodeValue)){var e=n.parentElement,b=e.getBoundingClientRect(),c=getComputedStyle(e);if(b.width>0&&b.height>0&&c.display!=='none'&&c.visibility!=='hidden'&&b.top+scrollY<160&&b.right>innerWidth*.5)return true}}return false}
var css=document.createElement('style');
css.textContent='.bsd-haut{position:absolute;z-index:60;right:14px;top:12px;font-family:"EmouHe","Frank Ruhl Libre","David Libre","Times New Roman",serif;font-weight:900;font-size:20px;line-height:1;background:linear-gradient(180deg,#f6e3a0,#e8d078 55%,#c4a24a);-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent;color:transparent;filter:drop-shadow(0 1px 2px rgba(0,0,0,.35));pointer-events:none;white-space:nowrap}@media(min-width:900px){.bsd-haut{right:28px;font-size:24px}}';
document.head.appendChild(css);
function pose(){if(document.querySelector('.bsd-haut')||visible())return;var s=document.createElement('span');s.className='bsd-haut';s.lang='he';s.dir='rtl';s.setAttribute('aria-hidden','true');s.textContent='ב״ה';document.body.appendChild(s);place(s)}
function chevauche(s){var r=s.getBoundingClientRect(),l=document.querySelectorAll('a,button,select,input,img,h1,h2');for(var i=0;i<l.length;i++){if(l[i]===s||s.contains(l[i]))continue;var b=l[i].getBoundingClientRect();if(b.width>0&&b.height>0&&b.left<r.right&&b.right>r.left&&b.top<r.bottom&&b.bottom>r.top)return true}return false}
function place(s){var t=12,a=document.getElementById('hnband'),c=document.getElementById('clband');[a,c].forEach(function(x){if(x&&getComputedStyle(x).display!=='none')t+=x.offsetHeight});s.style.top=t+'px';if(t===12&&!s.dataset.deg&&chevauche(s)){s.dataset.deg='1';document.body.style.marginTop=(parseFloat(getComputedStyle(document.body).marginTop)||0)+28+'px';s.style.top='5px'}}
function go(){pose();var s=document.querySelector('.bsd-haut');if(s){place(s);setTimeout(function(){place(s)},800);addEventListener('resize',function(){place(s)})}}
if(document.readyState==='complete')setTimeout(go,300);else addEventListener('load',function(){setTimeout(go,300)});
})();
