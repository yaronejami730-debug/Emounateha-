/* Accueil : l'emplacement de la banderole Hanouka (#hnbanner) alterne avec les actualités (hassidout.org, via /api/news).
   Emplacement de diffusion : toutes les 90 secondes, l'actualité suivante (même format que la banderole) ; toutes les actualités y passent,
   toutes les deux actualités, la banderole de fête (Hanouka) revient, 90 secondes aussi.
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
      /* exactement le même cadre que la banderole Hanouka (#hnbanner, image 1046×262) ; textes proportionnels à la largeur (unités cqw) : tient sur tous les téléphones */
      '#nwbanner{display:flex;order:9;width:min(100%,760px);aspect-ratio:1046/262;margin:18px auto 0;border-radius:22px;overflow:hidden;position:relative;z-index:2;container-type:inline-size;text-decoration:none;color:#fff;background:linear-gradient(120deg,rgba(14,62,68,.25),rgba(10,46,52,.55)),url(/header.jpg) left center/cover #1f6a72;box-shadow:0 10px 28px rgba(8,20,28,.35),0 0 0 1px rgba(243,213,140,.35);-webkit-tap-highlight-color:transparent;transition:transform .2s;text-align:left}' +
      '#nwbanner[hidden]{display:none}#nwbanner:active{transform:scale(.985)}' +
      '#nwbanner .nwt{position:relative;z-index:2;flex:0 0 60%;display:flex;flex-direction:column;justify-content:center;gap:clamp(2px,.9cqw,7px);padding:2.4cqw 2.4cqw 2.4cqw 3.6cqw;min-width:0;overflow:hidden;background:transparent;text-shadow:0 1px 6px rgba(8,30,34,.35)}' +
      '#nwbanner .nwk{font:800 clamp(8.5px,2.9cqw,15px)/1.3 Inter,system-ui,sans-serif!important;letter-spacing:.12em!important;text-transform:uppercase;color:#f0d98a;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}' +
      '#nwbanner .nwh{font-family:Georgia,"Times New Roman",serif!important;font-variant:normal!important;text-transform:none!important;letter-spacing:0!important;font-weight:400;font-size:clamp(11px,3.75cqw,26px);line-height:1.18;color:#fff;display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:2;overflow:hidden}' +
      '#nwbanner .nwl{font:700 clamp(8.5px,2.75cqw,13px)/1.2 Inter,system-ui,sans-serif!important;letter-spacing:0!important;text-transform:none!important;color:#f0d98a;white-space:nowrap}' +
      '#nwbanner .nwi{position:absolute;right:0;top:0;bottom:0;width:40%;background:#1f6a72 url(/header.jpg) center/cover}' +
      '#nwbanner .nwi img{width:100%;height:100%;object-fit:cover;display:block}' +
      '#nwbanner .nwi::before{content:"";position:absolute;inset:0;z-index:1;background:linear-gradient(90deg,rgba(22,82,89,.95) 0%,rgba(22,82,89,.45) 18%,rgba(22,82,89,0) 40%)}#nwbanner .nwi img{position:relative}' +
      '#nwbanner,#hnbanner{animation:nwIn .5s ease}@keyframes nwIn{from{opacity:0}to{opacity:1}}' +
      '@media(max-width:800px){#nwbanner{width:calc(100% - 4px);margin-top:16px;border-radius:18px}}' +
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
    // Une seule file de diffusion, 90 s par élément : actualité, actualité, banderole Hanouka, actualité, actualité, Hanouka…
    // (sans banderole de fête : les actualités l'une après l'autre). Même calcul pour tous : chacun voit la même chose au même moment.
    var hn = document.getElementById('hnbanner'), slot = Math.floor(Date.now() / PAS), a;
    // toujours au même emplacement que la banderole Hanouka (elle n'est pas au même endroit sur ordinateur et sur téléphone) : la page ne saute pas
    if (hn && el.previousElementSibling !== hn) hn.parentNode.insertBefore(el, hn.nextSibling);
    if (hn) {
      var pos = slot % 3;
      if (pos === 2) { if (!el.hidden) { el.hidden = true; hn.style.display = ''; } return; }
      a = liste[(Math.floor(slot / 3) * 2 + pos) % liste.length];
    } else a = liste[slot % liste.length];
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
    setInterval(tour, 5000);                       // bascule à l'heure, sans recharger
    setInterval(charger, 30 * 60 * 1000);           // nouvelles actualités toutes les 30 min
    document.addEventListener('visibilitychange', function () { if (!document.hidden) tour(); });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { setTimeout(go, 50); }); else setTimeout(go, 50);
})();
