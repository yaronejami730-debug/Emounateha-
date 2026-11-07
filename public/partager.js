/* Bouton « Partager » (Comment nous aider) : feuille de partage du téléphone, sinon copie du lien. */
(function(){
function go(){
  var b=document.getElementById('sharebtn');if(!b)return;
  var data={title:'Émounatéha',text:'Émounatéha, association d’aide aux familles dans le besoin. Découvrez-la et aidez-nous à les aider.',url:'https://www.emounateha.fr'};
  function toast(m){var t=document.createElement('div');t.textContent=m;t.setAttribute('role','status');t.style.cssText='position:fixed;left:50%;bottom:90px;transform:translateX(-50%);z-index:3000;background:#16393e;color:#fff;padding:11px 18px;border-radius:99px;font:600 14px Inter,system-ui,sans-serif;box-shadow:0 8px 24px rgba(0,0,0,.3);opacity:0;transition:opacity .25s';document.body.appendChild(t);requestAnimationFrame(function(){t.style.opacity='1'});setTimeout(function(){t.style.opacity='0';setTimeout(function(){t.remove()},300)},2200)}
  b.addEventListener('click',function(){
    if(navigator.share){navigator.share(data).catch(function(){});return}
    var u=data.url;
    if(navigator.clipboard&&navigator.clipboard.writeText){navigator.clipboard.writeText(u).then(function(){toast('Lien copié : collez-le où vous voulez')},function(){window.open('https://wa.me/?text='+encodeURIComponent(data.text+' '+u),'_blank','noopener')})}
    else window.open('https://wa.me/?text='+encodeURIComponent(data.text+' '+u),'_blank','noopener');
  });
}
if(document.readyState!=='loading')go();else document.addEventListener('DOMContentLoaded',go);
})();
