/* Accueil : l'emplacement de la banderole Hanouka (#hnbanner) alterne avec les actualités (hassidout.org, via /api/news).
   Emplacement de diffusion : toutes les 90 secondes, l'actualité suivante (même format que la banderole) ; toutes les actualités y passent,
   et la banderole de fête (Hanouka) n'apparaît qu'une fois par tour complet, 90 secondes.
   Le changement se fait tout seul, sans recharger la page. Un appui ouvre la page de toutes les actualités (/news/).
   Sans banderole Hanouka (hors saison), seules les actualités tournent. Sans actualités, rien ne change. */
(function () {
  var PAS = 90 * 1000, liste = [], el = null, monte = false;
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function slugDe(l) { try { return new URL(l).pathname.replace(/^\/+|\/+$/g, '').split('/').pop(); } catch (e) { return ''; } }
  function rub(s) { s = String(s || '').toLowerCase(); return s.charAt(0).toUpperCase() + s.slice(1); }
  function css() {
    var st = document.createElement('style');
    st.textContent =
      '#nwbanner{display:flex;order:9;width:min(100%,760px);aspect-ratio:1046/300;margin:18px auto 0;border-radius:22px;overflow:hidden;position:relative;z-index:2;text-decoration:none;color:#fff;background:linear-gradient(120deg,rgba(14,62,68,.25),rgba(10,46,52,.55)),url(/header.jpg) left center/cover #1f6a72;box-shadow:0 12px 30px rgba(8,20,28,.4),0 0 0 1.5px rgba(240,217,138,.7);-webkit-tap-highlight-color:transparent;transition:transform .2s;text-align:left}' +
      '#nwbanner[hidden]{display:none}#nwbanner:active{transform:scale(.985)}' +
      '#nwbanner .nwt{position:relative;z-index:2;flex:0 0 57%;display:flex;flex-direction:column;justify-content:center;gap:5px;padding:12px 18px 12px 22px;min-width:0;overflow:hidden;background:transparent;text-shadow:0 1px 6px rgba(8,30,34,.35)}' +
      '#nwbanner .nwk{font:800 15px/1.3 Inter,system-ui,sans-serif!important;letter-spacing:.14em!important;text-transform:uppercase;color:#f0d98a;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}' +
      '#nwbanner .nwh{font-family:Georgia,"Times New Roman",serif!important;font-variant:normal!important;text-transform:none!important;letter-spacing:0!important;font-weight:400;font-size:clamp(17px,3vw,25px);line-height:1.2;color:#fff;display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:2;overflow:hidden}' +
      '#nwbanner .nwl{font:700 13px/1 Inter,system-ui,sans-serif!important;letter-spacing:0!important;text-transform:none!important;color:#f0d98a}' +
      '#nwbanner .nwi{position:absolute;right:0;top:0;bottom:0;width:43%;background:#1f6a72 url(/header.jpg) center/cover}' +
      '#nwbanner .nwi img{width:100%;height:100%;object-fit:cover;display:block}' +
      '#nwbanner .nwi::before{content:"";position:absolute;inset:0;z-index:1;background:linear-gradient(90deg,rgba(22,82,89,.95) 0%,rgba(22,82,89,.45) 18%,rgba(22,82,89,0) 40%)}#nwbanner .nwi img{position:relative}' +
      '#nwbanner,#hnbanner{animation:nwIn .5s ease}@keyframes nwIn{from{opacity:0}to{opacity:1}}' +
      '@media(max-width:800px){#nwbanner{width:calc(100% - 4px);margin-top:16px;border-radius:18px}}' +
      '@media(max-width:420px){#nwbanner{aspect-ratio:1046/380}#nwbanner .nwt{padding:9px 10px 9px 14px;gap:5px;flex-basis:62%}#nwbanner .nwi{width:38%}#nwbanner .nwk{font-size:12.5px!important;letter-spacing:.12em!important}#nwbanner .nwh{font-size:16px;line-height:1.2;-webkit-line-clamp:3}#nwbanner .nwl{font-size:11.5px!important}}' +
      '@media(prefers-reduced-motion:reduce){#nwbanner,#hnbanner{animation:none}}';
    document.head.appendChild(st);
  }
  function monter() {
    if (monte) return true;
    var ref = document.getElementById('hnbanner') || document.querySelector('.hero .quote');
    if (!ref) return false;
    css();
    el = document.createElement('a'); el.id = 'nwbanner'; el.hidden = true;
    ref.parentNode.insertBefore(el, ref.nextSibling);
    monte = true; return true;
  }
  function tour() {
    if (!liste.length || !monter()) return;
    // Une seule file de diffusion : chaque élément reste 4 minutes. La banderole de fête (Hanouka…) n'est qu'un passage dans la file ;
    // le reste du temps, ce sont les actualités, l'une après l'autre.
    var hn = document.getElementById('hnbanner'), slot = Math.floor(Date.now() / PAS), n = liste.length + (hn ? 1 : 0), i = slot % n, a;
    if (hn && i === n - 1) { if (!el.hidden) { el.hidden = true; hn.style.display = ''; } return; }
    a = liste[i];
    var href = '/news/', cle = slugDe(a.lien);
    if (el.hidden || el.getAttribute('data-a') !== cle) {
      el.href = href; el.setAttribute('data-a', cle); el.setAttribute('aria-label', 'Actualité : ' + a.titre);
      el.innerHTML = '<span class="nwi">' + (a.image ? '<img src="' + esc(a.image) + '" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.remove()">' : '') + '</span>' +
        '<span class="nwt"><span class="nwk">ACTUALITÉS</span><span class="nwh">' + esc(a.titre) + '</span><span class="nwl">' + 'Toutes les actualités →</span></span>';
    }
    if (hn) hn.style.display = 'none';
    el.hidden = false;
  }
  function charger() {
    fetch('/api/news', { headers: { accept: 'application/json' } }).then(function (r) { return r.ok ? r.json() : null; }).then(function (d) {
      if (!d || !d.items || !d.items.length) return; liste = d.items; tour();
    }).catch(function () {});
  }
  function go() {
    charger();
    setInterval(tour, 30000);                       // bascule à l'heure, sans recharger
    setInterval(charger, 30 * 60 * 1000);           // nouvelles actualités toutes les 30 min
    document.addEventListener('visibilitychange', function () { if (!document.hidden) tour(); });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { setTimeout(go, 50); }); else setTimeout(go, 50);
})();
