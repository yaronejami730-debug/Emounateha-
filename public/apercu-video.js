/* Aperçu au survol, comme YouTube : la souris sur une vidéo verticale la lance (sans le son) ; elle s'arrête au bout de 15 secondes ou quand la souris part. Ordinateur seulement. */
(function(){
if(!window.matchMedia||!matchMedia('(hover:hover) and (pointer:fine)').matches)return;
var st=document.createElement('style');
st.textContent='.apv{position:absolute;top:0;left:50%;height:100%;width:177.78%;max-width:none;transform:translateX(-50%);border:0;pointer-events:none;background:#000;opacity:0;transition:opacity .35s;z-index:1}.apv.on{opacity:1}.apv-on::after{opacity:0!important;transition:opacity .2s}.th.v,.yt.ytplay,.cv{position:relative;overflow:hidden}.yt .apv{left:0;width:100%;height:100%;transform:none}';
document.head.appendChild(st);
var cur=null,tm=null,stop=null;
function idOf(el){var i=el.querySelector('img');var m=i&&i.src.match(/\/vi\/([A-Za-z0-9_-]{11})\//);return m?m[1]:null}
function end(){clearTimeout(tm);clearTimeout(stop);if(cur){var f=cur.f,b=cur.b;b.classList.remove('apv-on');f.classList.remove('on');setTimeout(function(){f.remove()},350);cur=null}}
document.addEventListener('mouseover',function(e){
  var b=e.target.closest&&e.target.closest('.th.v,.yt.ytplay,.cv');if(!b||(cur&&cur.b===b))return;
  end();var id=idOf(b);if(!id)return;
  tm=setTimeout(function(){
    var f=document.createElement('iframe');f.className='apv';f.setAttribute('aria-hidden','true');f.setAttribute('tabindex','-1');f.allow='autoplay';
    f.src='https://www.youtube-nocookie.com/embed/'+id+'?autoplay=1&mute=1&controls=0&playsinline=1&rel=0&modestbranding=1&disablekb=1&iv_load_policy=3&fs=0&start=0&end=15';
    f.onload=function(){setTimeout(function(){f.classList.add('on')},600)};
    b.appendChild(f);b.classList.add('apv-on');cur={b:b,f:f};
    stop=setTimeout(end,15000);
  },400);
},true);
document.addEventListener('mouseout',function(e){var b=e.target.closest&&e.target.closest('.th.v,.yt.ytplay,.cv');if(!b)return;if(e.relatedTarget&&b.contains(e.relatedTarget))return;if(cur&&cur.b===b||tm)end()},true);
})();
