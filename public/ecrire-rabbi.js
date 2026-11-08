/* « Écrire au Rabbi » : bouton sous la Parole du Rabbi -> fenêtre avec un formulaire ; la lettre est envoyée par email (Brevo) à Ohel. */
(function(){
function mount(){
  var w=document.querySelector('.parole .wrap');if(!w||document.getElementById('ecrirerabbi'))return;
  var st=document.createElement('style');
  st.textContent='.ecr-wrap{text-align:center;margin:16px 0 4px}#ecrirerabbi{display:inline-flex;align-items:center;gap:10px;padding:13px 26px;border-radius:99px;border:0;background:linear-gradient(180deg,#e4cd8a,#c4a24a);color:#16393e;font:700 15px/1 Inter,system-ui,sans-serif;cursor:pointer;box-shadow:0 6px 18px rgba(196,162,74,.4)}#ecrirerabbi svg{width:20px;height:20px;flex:none}#ecrirerabbi:active{transform:scale(.97)}'+
  '#erov{position:fixed;inset:0;z-index:2100;display:flex;align-items:flex-end;justify-content:center;background:rgba(8,20,26,.62);-webkit-backdrop-filter:blur(3px);backdrop-filter:blur(3px);opacity:0;transition:opacity .3s}#erov.on{opacity:1}'+
  '#erc{width:min(100%,640px);max-height:94vh;background:#fffdf8;border-radius:24px 24px 0 0;display:flex;flex-direction:column;overflow:hidden;transform:translateY(40px);transition:transform .4s cubic-bezier(.2,.8,.2,1);box-shadow:0 -10px 40px rgba(0,0,0,.35);border-top:2px solid #c4a24a}#erov.on #erc{transform:none}'+
  '#erc .hd{position:relative;padding:22px 20px 22px;color:#fff;background:linear-gradient(rgba(22,76,82,.94),rgba(31,106,114,.9)),url(/header.jpg) center/cover #1f6a72;overflow:hidden;min-height:210px;display:flex;flex-direction:column;justify-content:center}'+
  '#erc .hd::before{content:"";position:absolute;right:0;top:0;bottom:0;width:auto;aspect-ratio:900/1067;background:url(/rebbe.jpg?v=1) center/100% 100% no-repeat;-webkit-mask-image:radial-gradient(ellipse 66% 68% at 50% 50%,#000 62%,rgba(0,0,0,.55) 82%,transparent 100%);mask-image:radial-gradient(ellipse 66% 68% at 50% 50%,#000 62%,rgba(0,0,0,.55) 82%,transparent 100%)}'+
  '#erc .hd>*{position:relative}#erc .hd h3{margin:0;font:700 16px/1.25 Cinzel,Georgia,serif;letter-spacing:.06em;color:#e4cd8a;text-align:left;max-width:52%}#erc .hd p{margin:8px 0 0;font:400 13px/1.5 Inter,system-ui,sans-serif;color:#eef7f7;text-align:left;max-width:48%}'+
  '#erc .x{position:absolute;top:12px;right:12px;z-index:3;width:38px;height:38px;padding:0;border:0;outline:0;border-radius:50%;background:rgba(255,255,255,.14);-webkit-backdrop-filter:blur(8px) saturate(140%);backdrop-filter:blur(8px) saturate(140%);color:#fff;cursor:pointer;display:grid;place-items:center;transition:background .2s,transform .2s;-webkit-tap-highlight-color:transparent}'+
  '#erc .x svg{width:16px;height:16px;display:block}#erc .x:hover{background:rgba(255,255,255,.28)}#erc .x:active{transform:scale(.92)}#erc .x:focus-visible{box-shadow:0 0 0 2px rgba(228,205,138,.9)}'+
  '#erc form{padding:16px 18px 20px;overflow:auto;-webkit-overflow-scrolling:touch}#erc .g{display:grid;grid-template-columns:1fr;gap:12px}@media(min-width:560px){#erc .g.two{grid-template-columns:1fr 1fr}}'+
  '#erc label{display:block;font:600 12.5px/1.2 Inter,system-ui,sans-serif;color:#24505a;margin-bottom:5px;letter-spacing:.02em}#erc label i{color:#b2923a;font-style:normal}'+
  '#erc input[type=text],#erc input[type=email],#erc input[type=tel],#erc textarea{width:100%;box-sizing:border-box;padding:12px 13px;border:1.5px solid #e3d9bd;border-radius:12px;background:#fff;font:400 16px/1.3 Inter,system-ui,sans-serif;color:#16393e;outline:none;transition:border-color .2s,box-shadow .2s}'+
  '#erc input:focus,#erc textarea:focus{border-color:#c4a24a;box-shadow:0 0 0 3px rgba(196,162,74,.2)}#erc textarea{min-height:130px;resize:vertical}'+
  '#erc .conf{margin:10px 2px 0;font:400 11.5px/1.4 Inter,system-ui,sans-serif;color:#5b7377;text-align:center}#erc .conf svg{vertical-align:-2px;color:#9a7a22}#erc .all{margin:0 0 8px;font:600 12px/1.3 Inter,system-ui,sans-serif;color:#9a7a22}#erc .hint{font:400 12px/1.4 Inter,system-ui,sans-serif;color:#6b7f82;margin-top:4px}'+
  '#erc .ck{display:flex;gap:10px;align-items:flex-start;margin:14px 0 4px;font:400 13px/1.4 Inter,system-ui,sans-serif;color:#33555b}#erc .ck input{margin-top:3px;width:18px;height:18px;accent-color:#c4a24a;flex:none}'+
  '#erc .send{display:block;width:100%;margin-top:14px;padding:15px;border:0;border-radius:99px;background:linear-gradient(180deg,#e4cd8a,#c4a24a);color:#16393e;font:700 15px/1 Inter,system-ui,sans-serif;letter-spacing:.03em;cursor:pointer;box-shadow:0 6px 18px rgba(196,162,74,.4)}#erc .send[disabled]{opacity:.6}'+
  '#erc .err{display:none;margin-top:10px;padding:10px 12px;border-radius:10px;background:#fdecea;color:#8a2a22;font:500 13px/1.4 Inter,system-ui,sans-serif}'+
  '#erc .ok{display:none;padding:34px 24px 38px;text-align:center}#erc .ok .ic{width:64px;height:64px;margin:0 auto 12px;border-radius:50%;background:linear-gradient(180deg,#e4cd8a,#c4a24a);display:grid;place-items:center}#erc .ok h4{margin:0 0 8px;font:700 19px/1.2 Cinzel,Georgia,serif;color:#1f6a72;letter-spacing:.05em}#erc .ok p{margin:0 0 16px;font:400 15px/1.5 Inter,system-ui,sans-serif;color:#33555b}'+
  '#erc .hp{position:absolute;left:-9999px;opacity:0;height:0;overflow:hidden}'+
  '#erc .g{display:grid;gap:10px}#erc .two{display:grid;grid-template-columns:1fr 1fr;gap:10px;align-items:end}'+
  '@media(max-width:600px){#erc{max-height:100dvh;border-radius:20px 20px 0 0}#erc .hd{min-height:96px;padding:14px 16px;justify-content:center}#erc .hd h3{font-size:16px;max-width:56%}#erc .hd::before{right:54px}#erc .hd p{display:none}#erc .x{top:8px;right:8px;width:34px;height:34px}#erc form{padding:12px 14px calc(14px + env(safe-area-inset-bottom))}#erc label{font-size:11.5px;margin-bottom:3px}#erc input[type=text],#erc input[type=email]{padding:10px 12px;font-size:16px}#erc textarea{min-height:50px;padding:10px 12px;font-size:16px}#erc .g{gap:8px}#erc input[type=tel]{padding:10px 12px;font-size:16px;width:100%;box-sizing:border-box;border:1.5px solid #e3d9bd;border-radius:12px;background:#fff}#erc .ck{margin:10px 0 2px;font-size:12px}#erc .send{margin-top:10px;padding:13px}}'+
  '@media(min-width:801px){#erov{align-items:center}#erc{border-radius:24px}}';
  document.head.appendChild(st);
  /* surbrillance : halo doré qui respire + éclat de lumière qui traverse le bouton */
  var gl=document.createElement('style');
  gl.textContent='#ecrirerabbi{position:relative;overflow:hidden;isolation:isolate;animation:erGlow 2.6s ease-in-out infinite}'+
  '#ecrirerabbi::after{content:"";position:absolute;top:-10%;bottom:-10%;left:-60%;width:38%;background:linear-gradient(105deg,rgba(255,255,255,0),rgba(255,255,255,.8),rgba(255,255,255,0));transform:skewX(-18deg);animation:erShine 4.2s ease-in-out infinite;pointer-events:none}'+
  '@keyframes erGlow{0%,100%{box-shadow:0 6px 18px rgba(196,162,74,.4),0 0 0 0 rgba(228,205,138,.5)}50%{box-shadow:0 6px 22px rgba(196,162,74,.55),0 0 24px 7px rgba(228,205,138,.8)}}'+
  '@keyframes erShine{0%,55%{left:-60%}85%,100%{left:130%}}'+
  '@media(prefers-reduced-motion:reduce){#ecrirerabbi{animation:none;box-shadow:0 6px 22px rgba(196,162,74,.55),0 0 22px 5px rgba(228,205,138,.7)}#ecrirerabbi::after{display:none}}';
  document.head.appendChild(gl);
  var d=document.createElement('div');d.className='ecr-wrap';
  d.innerHTML='<button id="ecrirerabbi" type="button"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 6h16v12H4z"/><path d="M4 7l8 6 8-6"/></svg>Écrire une lettre au Rabbi</button>';
  w.appendChild(d);d.firstChild.addEventListener('click',open);
  if(location.hash==='#ecrire-rabbi')setTimeout(open,600);
  if(location.hash&&location.hash!=='#ecrire-rabbi')setTimeout(function(){try{var p=document.querySelector(location.hash);if(p)p.scrollIntoView()}catch(e){}},900);
}
function open(){
  if(document.getElementById('erov'))return;
  var o=document.createElement('div');o.id='erov';o.setAttribute('role','dialog');o.setAttribute('aria-modal','true');o.setAttribute('aria-label','Écrire une lettre au Rabbi');
  o.innerHTML='<div id="erc"><div class="hd"><button class="x" type="button" aria-label="Fermer"><svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M3 3l10 10M13 3L3 13"/></svg></button><h3>Écrire une lettre au Rabbi</h3><p>Confiez votre demande par écrit&nbsp;: nous la transmettons au Ohel.</p></div>'+
  '<form novalidate><p class="all">Tous les champs sont obligatoires.</p><div class="g">'+
  '<div class="f1"><label for="er-n">Nom et prénom <i>*</i></label><input id="er-n" name="name" type="text" autocomplete="name" required></div>'+
  '<div class="two"><div><label for="er-h">Votre prénom hébraïque <i>*</i></label><input id="er-h" name="heb" type="text" required></div>'+
  '<div><label for="er-m">Prénom hébraïque de votre mère <i>*</i></label><input id="er-m" name="mother" type="text" required></div></div>'+
  '<div class="f1"><label for="er-e">Email <i>*</i></label><input id="er-e" name="email" type="email" autocomplete="email" inputmode="email" required></div>'+
  '<div class="two"><div><label for="er-c">Ville <i>*</i></label><input id="er-c" name="city" type="text" autocomplete="address-level2" required></div>'+
  '<div><label for="er-p">Téléphone <i>*</i></label><input id="er-p" name="phone" type="tel" autocomplete="tel" inputmode="tel" placeholder="+33…" required></div></div>'+
  '<div class="f1"><label for="er-t">Votre lettre <i>*</i></label><textarea id="er-t" name="message" rows="3" required placeholder="Écrivez ici votre demande…"></textarea></div></div>'+
  '<div class="hp" aria-hidden="true"><label>Site web<input name="website" type="text" tabindex="-1" autocomplete="off"></label></div>'+
  '<label class="ck"><input type="checkbox" name="consent"><span>J’autorise l’envoi de ma lettre au Ohel. Elle ne sera jamais conservée par Émounatéha.</span></label>'+
  '<div class="err" role="alert"></div><button class="send" type="submit">Envoyer ma lettre</button>'+
  '<p class="conf"><svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg> Lettre strictement confidentielle : elle n’est jamais enregistrée dans notre base de données et nous n’avons jamais accès à son contenu. Elle ne regarde que vous et le Ohel.</p></form>'+
  '<div class="ok"><div class="ic"><svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="#16393e" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.500"/></svg></div><h4>Lettre envoyée</h4><p>Votre lettre a bien été envoyée au Ohel. Un récapitulatif vient d’être envoyé à votre adresse email.</p><button class="send" type="button" id="er-close">Fermer</button></div></div>';
  document.body.appendChild(o);document.documentElement.style.overflow='hidden';
  requestAnimationFrame(function(){requestAnimationFrame(function(){o.classList.add('on')})});
  function close(){o.classList.remove('on');document.documentElement.style.overflow='';setTimeout(function(){o.remove()},350)}
  o.querySelector('.x').onclick=close;o.addEventListener('click',function(e){if(e.target===o)close()});
  document.addEventListener('keydown',function k(e){if(e.key==='Escape'){close();document.removeEventListener('keydown',k)}});
  var f=o.querySelector('form'),err=o.querySelector('.err'),btn=f.querySelector('.send');
  function fail(m){err.textContent=m;err.style.display='block'}
  f.addEventListener('submit',function(e){
    e.preventDefault();err.style.display='none';
    var g=function(n){return (f.elements[n].value||'').trim()};
    if(!g('name')||!g('heb')||!g('mother')||!g('city')||g('phone').replace(/\D/g,'').length<6||g('message').length<5)return fail('Tous les champs sont obligatoires : merci de les remplir.');
    if(!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(g('email')))return fail('Votre adresse email semble invalide.');
    if(!f.elements.consent.checked)return fail('Merci de cocher l’autorisation d’envoi.');
    btn.disabled=true;btn.textContent='Envoi en cours…';
    fetch('/api/rabbi-letter',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({name:g('name'),heb:g('heb'),mother:g('mother'),city:g('city'),email:g('email'),phone:g('phone'),message:g('message'),website:g('website'),consent:true})})
    .then(function(r){return r.json().catch(function(){return{}}).then(function(j){return{ok:r.ok,j:j}})})
    .then(function(x){if(x.ok){f.style.display='none';o.querySelector('.hd p').textContent='Merci pour votre confiance.';o.querySelector('.ok').style.display='block';o.querySelector('#er-close').onclick=close}else{btn.disabled=false;btn.textContent='Envoyer ma lettre';fail(x.j.error||'L’envoi a échoué. Réessayez.')}})
    .catch(function(){btn.disabled=false;btn.textContent='Envoyer ma lettre';fail('Connexion impossible. Réessayez dans un instant.')});
  });
}
if(document.readyState!=='loading')mount();else document.addEventListener('DOMContentLoaded',mount);
})();
/* Bouton « Recevoir les horaires par e-mail » : sous la carte des horaires de Chabbat quand elle s'affiche (jeudi soir → fin du Chabbat), sinon sous « Écrire au Rabbi » */
(function(){
function place(){
  var w=document.querySelector('.parmailwrap'),c=document.getElementById('paracha'),p=document.querySelector('.parole');
  if(!w||!c||!p)return;
  if(!c.hidden){if(w.previousElementSibling!==c)c.parentNode.insertBefore(w,c.nextSibling)}
  else{if(w.previousElementSibling!==p)p.parentNode.insertBefore(w,p.nextSibling)}
  /* banderole Hanouka : dans l'en-tête en temps normal, sous le bouton e-mail pendant les horaires de Chabbat */
  var b=document.getElementById('hnbanner'),q=document.querySelector('.hero .quote');
  var phone=window.matchMedia&&matchMedia('(max-width:800px)').matches;
  if(b&&q){
    if(!c.hidden&&!phone){if(b.previousElementSibling!==w){w.parentNode.insertBefore(b,w.nextSibling);b.classList.add('hnmoved')}}
    else if(b.classList.contains('hnmoved')||(phone&&b.previousElementSibling!==q)){q.parentNode.insertBefore(b,q.nextSibling);b.classList.remove('hnmoved')}
  }
}
function go(){addEventListener('resize',place);place();setTimeout(place,700);setTimeout(place,2000);var c=document.getElementById('paracha');if(c)new MutationObserver(place).observe(c,{attributes:true,attributeFilter:['hidden']})}
if(document.readyState!=='loading')go();else document.addEventListener('DOMContentLoaded',go);
})();
