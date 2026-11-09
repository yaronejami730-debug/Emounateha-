/* « Changer la langue » : entrée du menu (avant Contact), téléphone et ordinateur.
   Traduction DANS la page (le lien reste emounateha.fr) ; l'interface de Google est entièrement masquée. */
(function () {
  var LANGS = [['fr', 'Français', '🇫🇷'], ['en', 'English', '🇬🇧'], ['he', 'עברית', '🇮🇱']];
  function lireLangue() { var m = document.cookie.match(/(?:^|;\s*)googtrans=\/fr\/([a-z-]+)/i); return m ? m[1] : 'fr'; }
  function ecrireLangue(l) {
    var d = location.hostname.replace(/^www\./, ''), exp = l === 'fr' ? '; expires=Thu, 01 Jan 1970 00:00:00 GMT' : '; max-age=31536000';
    var v = l === 'fr' ? '' : '/fr/' + l;
    document.cookie = 'googtrans=' + v + '; path=/' + exp;
    document.cookie = 'googtrans=' + v + '; path=/; domain=.' + d + exp;
    document.cookie = 'googtrans=' + v + '; path=/; domain=' + location.hostname + exp;
  }
  var cur = lireLangue();
  // masque toute l'interface Google (bandeau, infobulles, surlignage) : seule la traduction reste
  var st = document.createElement('style');
  st.textContent = '.goog-te-banner-frame,.skiptranslate,#goog-gt-tt,.goog-te-balloon-frame,.goog-tooltip,.VIpgJd-ZVi9od-ORHb-OEVmcd,.VIpgJd-ZVi9od-aZ2wEe-wOHMyf,.VIpgJd-yAWNEb-L7lbkb{display:none!important;visibility:hidden!important}' +
    'body{top:0!important;position:static!important}font font,.goog-text-highlight{background:none!important;box-shadow:none!important}#gt_el{display:none}' +
    '.lang-pop{position:fixed;z-index:9999;top:72px;right:16px;width:230px;background:#fff;border-radius:16px;box-shadow:0 14px 40px rgba(10,40,45,.28);padding:12px;font-family:inherit}' +
    '.lang-pop[hidden]{display:none}.lang-pop b{display:block;font-family:"Bree Serif",serif;font-weight:400;color:#1f6a72;font-size:17px;margin:2px 6px 8px}' +
    '.lang-pop button{display:flex;width:100%;align-items:center;gap:10px;padding:11px 12px;border-radius:10px;color:#14272a;background:none;border:0;font:inherit;font-weight:600;cursor:pointer;text-align:left}' +
    '.lang-pop button:hover{background:#f3f7f7}.lang-pop button.on{background:#1f6a72;color:#fff}.lang-pop button span{font-size:20px}' +
    '.lang-short{display:none}@media(min-width:801px){.lang-long{display:none}.lang-short{display:inline}}';
  document.head.appendChild(st);
  // jamais traduits : le nom de l'association, l'hébreu, la date hébraïque, בס״ד
  function proteger() {
    document.querySelectorAll('.nbrand,.ndate b,.nbsd,[lang=he],[dir=rtl],.he,.hero h1,.brand').forEach(function (e) { e.classList.add('notranslate'); e.setAttribute('translate', 'no'); });
    var w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT), n, re = /([ÉE]mounat[ée]ha|ÉMOUNATÉHA|EMOUNATEHA|[\u0590-\u05FF][\u0590-\u05FF\u0022\u0027\u05F3\u05F4\s]*)/;
    var todo = [];
    while ((n = w.nextNode())) { if (re.test(n.nodeValue) && n.parentNode && !n.parentNode.closest('script,style,.notranslate')) todo.push(n); }
    todo.forEach(function (t) {
      var parts = t.nodeValue.split(new RegExp(re.source, 'g')), f = document.createDocumentFragment();
      parts.forEach(function (p, i) { if (!p) return; if (i % 2) { var s = document.createElement('span'); s.className = 'notranslate'; s.setAttribute('translate', 'no'); s.textContent = p; f.appendChild(s); } else f.appendChild(document.createTextNode(p)); });
      t.parentNode.replaceChild(f, t);
    });
  }
  // si une langue étrangère est choisie : traduction de la page au chargement
  if (cur !== 'fr') {
    if (cur === 'he') document.documentElement.setAttribute('lang', 'he');
    window.gtInit = function () { try { new google.translate.TranslateElement({ pageLanguage: 'fr', includedLanguages: 'en,he,fr', autoDisplay: false }, 'gt_el'); } catch (e) {} };
    var el = document.createElement('div'); el.id = 'gt_el';
    var add = function () { try { proteger(); } catch (e) {} document.body.appendChild(el); var s = document.createElement('script'); s.src = 'https://translate.google.com/translate_a/element.js?cb=gtInit'; s.async = true; document.body.appendChild(s); };
    if (document.readyState === 'complete') add(); else addEventListener('load', add);
  }
  function init() {
    var links = document.querySelector('.sec-nav .links') || document.querySelector('#navLinks');
    if (!links || links.querySelector('.lang-btn')) return;
    var contact = [].slice.call(links.querySelectorAll('a')).filter(function (a) { return /contact/i.test(a.textContent); })[0];
    var a = document.createElement('a');
    a.href = '#'; a.className = 'lang-btn notranslate'; a.setAttribute('translate', 'no');
    a.innerHTML = '<span aria-hidden="true">🌐</span> <span class="lang-long">Changer la langue</span><span class="lang-short">Langue</span>';
    links.insertBefore(a, contact || null);
    var box = document.createElement('div');
    box.className = 'lang-pop notranslate'; box.setAttribute('translate', 'no'); box.hidden = true; box.setAttribute('role', 'dialog'); box.setAttribute('aria-label', 'Changer la langue');
    box.innerHTML = '<b>Changer la langue</b>' + LANGS.map(function (l) {
      return '<button type="button" data-l="' + l[0] + '"' + (l[0] === cur ? ' class="on"' : '') + (l[0] === 'he' ? ' dir="rtl"' : '') + '><span>' + l[2] + '</span>' + l[1] + '</button>';
    }).join('');
    document.body.appendChild(box);
    box.addEventListener('click', function (e) { var b = e.target.closest('button'); if (!b) return; var l = b.dataset.l; if (l === cur) { box.hidden = true; return; } ecrireLangue(l); location.reload(); });
    a.addEventListener('click', function (e) { e.preventDefault(); e.stopPropagation(); box.hidden = !box.hidden; });
    document.addEventListener('click', function (e) { if (!box.hidden && !box.contains(e.target) && e.target !== a) box.hidden = true; });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') box.hidden = true; });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
