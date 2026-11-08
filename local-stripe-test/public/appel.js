/* Bouton d'appel dans la barre du haut : un téléphone qui bouge, juste à gauche du בס״ד. Appel téléphonique normal (pas WhatsApp). */
(function () {
  var nav = document.querySelector('.sec-nav'), bsd = nav && nav.querySelector('.nbsd');
  if (!nav || !bsd) return;
  var st = document.createElement('style');
  st.textContent =
    '.sec-nav .ncall{position:absolute;z-index:3;display:block!important;box-sizing:border-box!important;padding:0!important;margin:0!important;line-height:0!important;width:36px;height:36px;border-radius:50%;background:linear-gradient(180deg,#e0c56e,#c4a24a);color:#1b2b2d;box-shadow:0 3px 10px rgba(0,0,0,.28);text-decoration:none;-webkit-tap-highlight-color:transparent;transition:transform .2s}' +
    '.sec-nav .ncall:active{transform:scale(.92)}' +
    '.sec-nav .ncall svg{position:absolute;left:50%;top:50%;width:19px;height:19px;margin:-9.5px 0 0 -9.5px;display:block;transform-origin:50% 50%;animation:ncRing 3.2s ease-in-out infinite}' +
    '@keyframes ncRing{0%,58%,100%{transform:rotate(0)}6%{transform:rotate(-16deg)}12%{transform:rotate(14deg)}18%{transform:rotate(-14deg)}24%{transform:rotate(12deg)}30%{transform:rotate(-8deg)}36%{transform:rotate(6deg)}42%{transform:rotate(0)}}' +
    '@media(max-width:800px){.sec-nav .ncall{width:34px;height:34px}.sec-nav .ncall svg{width:18px;height:18px;margin:-9px 0 0 -9px}}' +
    '.sec-nav .links a.ncall-menu{display:none}' +
    '@media(max-width:800px){.sec-nav .links a.ncall-menu{display:flex!important;align-items:center;justify-content:center;gap:10px;box-sizing:border-box;margin:10px 16px 6px!important;padding:13px 18px!important;border-radius:99px!important;background:linear-gradient(180deg,#e0c56e,#c4a24a)!important;color:#1b2b2d!important;font-weight:700!important;font-size:16px!important;text-decoration:none;box-shadow:0 4px 14px rgba(0,0,0,.25);border:0!important}' +
    '.sec-nav .links a.ncall-menu svg{width:20px;height:20px;flex:none;transform-origin:50% 50%;animation:ncRing 3.2s ease-in-out infinite}}' +
    '@media(prefers-reduced-motion:reduce){.sec-nav .ncall svg,.sec-nav .links a.ncall-menu svg{animation:none}}';
  document.head.appendChild(st);
  var a = document.createElement('a');
  a.className = 'ncall';
  a.href = 'tel:+33669670770';
  a.setAttribute('aria-label', 'Appeler Émounatéha');
  a.title = 'Appeler';
  a.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M6.62 10.79a15.05 15.05 0 0 0 6.59 6.59l2.2-2.2a1 1 0 0 1 1.02-.24c1.12.37 2.33.57 3.57.57a1 1 0 0 1 1 1V20a1 1 0 0 1-1 1C10.61 21 3 13.39 3 4a1 1 0 0 1 1-1h3.5a1 1 0 0 1 1 1c0 1.25.2 2.45.57 3.57a1 1 0 0 1-.25 1.02l-2.2 2.2z"/></svg>';
  nav.appendChild(a);
  var links = nav.querySelector('.links');
  if (links && !links.querySelector('.ncall-menu')) {
    var m = document.createElement('a');
    m.className = 'ncall-menu'; m.href = 'tel:+33669670770'; m.setAttribute('aria-label', 'Appeler Émounatéha');
    m.innerHTML = a.querySelector('svg').outerHTML + '<span>Appeler · 06 69 67 07 70</span>';
    links.appendChild(m);   // « Contact » est le dernier lien : le bouton vient juste dessous
  }
  if (getComputedStyle(nav).position === 'static') nav.style.position = 'relative';
  var burger = nav.querySelector('.burger'), dateEl = nav.querySelector('.ndate');
  function textRect(el) { var r = document.createRange(); r.selectNodeContents(el); return r.getBoundingClientRect(); }
  function place() {
    var n = nav.getBoundingClientRect(), b = bsd.getBoundingClientRect();
    if (!b.width || !b.height || getComputedStyle(bsd).display === 'none') { a.style.display = 'none'; return; }
    a.style.display = '';
    var t = textRect(bsd), textLeft = t.width ? t.left : b.left;          // bord gauche réel du texte בס״ד
    var w = a.offsetWidth, h = a.offsetHeight, left = textLeft - w - 10;    // ordinateur : juste à gauche du בס״ד
    var dr = dateEl && textRect(dateEl);
    if (innerWidth <= 800 && dr && dr.width > 20) {                         // téléphone : au milieu entre la date et le בס״ד (seulement quand la date est affichée)
      var mid = (dr.right + textLeft) / 2 - w / 2;
      left = Math.max(dr.right + 8, Math.min(mid, textLeft - w - 8));
    }
    var ref = burger && burger.offsetParent ? burger.getBoundingClientRect() : b;  // même axe horizontal que le menu / le בס״ד
    a.style.left = Math.round(left - n.left) + 'px';
    a.style.top = Math.round(ref.top + ref.height / 2 - n.top - h / 2) + 'px';
  }
  place();
  addEventListener('resize', place);
  addEventListener('load', place);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(place);
  if (window.ResizeObserver) { var ro = new ResizeObserver(place); ro.observe(nav); ro.observe(bsd); if (dateEl) ro.observe(dateEl); }
  if (dateEl && window.MutationObserver) new MutationObserver(place).observe(dateEl, { childList: true, subtree: true, characterData: true });
  if (window.MutationObserver) new MutationObserver(place).observe(nav, { attributes: true, attributeFilter: ['class'] });
  setTimeout(place, 400); setTimeout(place, 1500);
})();
