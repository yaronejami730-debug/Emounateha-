/* « Changer la langue » : entrée du menu (avant Contact), téléphone et ordinateur.
   Traduction de la page par Google Traduction (aucune clé, aucun script tiers chargé sur le site). */
(function () {
  var LANGS = [['fr', 'Français', '🇫🇷'], ['en', 'English', '🇬🇧'], ['he', 'עברית', '🇮🇱']];
  var proxy = /\.translate\.goog$/.test(location.hostname);
  var cur = proxy ? (new URLSearchParams(location.search).get('_x_tr_tl') || 'fr') : 'fr';
  function lien(l) {
    var p = location.pathname + location.hash;
    if (l === 'fr') return 'https://www.emounateha.fr' + p;
    return 'https://www-emounateha-fr.translate.goog' + location.pathname + '?_x_tr_sl=fr&_x_tr_tl=' + l + '&_x_tr_hl=' + l + location.hash;
  }
  function init() {
    var links = document.querySelector('.sec-nav .links') || document.querySelector('#navLinks');
    if (!links || links.querySelector('.lang-btn')) return;
    var contact = [].slice.call(links.querySelectorAll('a')).filter(function (a) { return /contact/i.test(a.textContent); })[0];
    var a = document.createElement('a');
    a.href = '#'; a.className = 'lang-btn';
    a.innerHTML = '<span aria-hidden="true">🌐</span> <span class="lang-long">Changer la langue</span><span class="lang-short">Langue</span>';
    links.insertBefore(a, contact || null);
    var box = document.createElement('div');
    box.className = 'lang-pop'; box.hidden = true; box.setAttribute('role', 'dialog'); box.setAttribute('aria-label', 'Changer la langue');
    box.innerHTML = '<b>Changer la langue</b>' + LANGS.map(function (l) {
      return '<a href="' + lien(l[0]) + '"' + (l[0] === cur ? ' class="on"' : '') + (l[0] === 'he' ? ' dir="rtl"' : '') + '><span>' + l[2] + '</span>' + l[1] + '</a>';
    }).join('') + '<small>Traduction automatique</small>';
    document.body.appendChild(box);
    a.addEventListener('click', function (e) { e.preventDefault(); e.stopPropagation(); box.hidden = !box.hidden; });
    document.addEventListener('click', function (e) { if (!box.hidden && !box.contains(e.target)) box.hidden = true; });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') box.hidden = true; });
    var st = document.createElement('style');
    st.textContent = '.lang-pop{position:fixed;z-index:9999;top:72px;right:16px;width:230px;background:#fff;border-radius:16px;box-shadow:0 14px 40px rgba(10,40,45,.28);padding:12px;font-family:inherit}' +
      '.lang-pop[hidden]{display:none}.lang-pop b{display:block;font-family:"Bree Serif",serif;font-weight:400;color:#1f6a72;font-size:17px;margin:2px 6px 8px}' +
      '.lang-pop a{display:flex!important;align-items:center;gap:10px;padding:11px 12px!important;border-radius:10px;color:#14272a!important;text-decoration:none;font-weight:600;text-shadow:none!important;border:0!important}' +
      '.lang-pop a:hover{background:#f3f7f7}.lang-pop a.on{background:#1f6a72;color:#fff!important}.lang-pop a span{font-size:20px}' +
      '.lang-pop small{display:block;margin:8px 6px 0;color:#7a8b8e;font-size:11.5px}' +
      '.lang-short{display:none}@media(min-width:801px){.lang-long{display:none}.lang-short{display:inline}}';
    document.head.appendChild(st);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
