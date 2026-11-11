/* Bandeau « Roch 'Hodech » : affiché en haut des pages uniquement les jours de début de mois hébraïque
   (1er jour, et 2e jour quand le mois précédent a 30 jours). Source : /calendrier-hebraique.json */
(function () {
  function ymd(d) { return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
  function shift(s, n) { var d = new Date(s + 'T12:00:00'); d.setDate(d.getDate() + n); return ymd(d); }
  function info(cal, day) {
    var e = cal[day]; if (!e) return null;
    var hd = e[2], mon = e[3];
    if (hd === 30) { var nx = cal[shift(day, 1)]; return nx && nx[2] === 1 ? { m: nx[3], d: 1, two: true } : null; } // 30 du mois : 1er jour de Roch 'Hodech
    if (hd === 1 && mon !== 'Tichri') { var pv = cal[shift(day, -1)], two = !!(pv && pv[2] === 30); return { m: mon, d: two ? 2 : 1, two: two }; } // Tichri = Roch Hachana, pas Roch 'Hodech
    return null;
  }
  function show(r) {
    if (document.getElementById('rchband')) return;
    var st = document.createElement('style');
    st.textContent = '#rchband{display:flex;align-items:center;justify-content:center;gap:10px;flex-wrap:wrap;padding:9px 14px;background:linear-gradient(90deg,#e9d28a,#f6e7b0 50%,#e9d28a);color:#5a430e;font:600 14px/1.3 Inter,system-ui,sans-serif;text-align:center;border-bottom:1px solid rgba(196,162,74,.6)}#rchband b{font-family:"Bree Serif",serif;font-weight:700;font-size:17px}#rchband small{font-size:12.5px;font-weight:700;opacity:.85}#rchband svg{width:18px;height:18px;flex:none}';
    document.head.appendChild(st);
    var b = document.createElement('div'); b.id = 'rchband'; b.setAttribute('role', 'note');
    b.innerHTML = '<svg viewBox="0 0 24 24" fill="#c4a24a" aria-hidden="true"><path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a.6.6 0 0 0-.8-.7A9.5 9.5 0 1 0 20.7 15.3a.6.6 0 0 0-.7-.8z"/></svg>' +
      '<b>Roch ’Hodech ' + r.m + '</b><small>' + (r.two ? (r.d === 1 ? '1er jour' : '2e jour') + ' · ' : '') + '’Hodech Tov !</small>';
    document.body.insertBefore(b, document.body.firstChild);
  }
  window.__rochHodech = { info: info, show: show };
  // Le jour hébraïque commence à Tset Hakokhavim (tombée de la nuit), pas à minuit : le bandeau apparaît dès ce moment-là, la veille au soir,
  // et disparaît à Tset Hakokhavim du 2e jour (ou du 1er jour quand Roch 'Hodech ne dure qu'un jour). Le jour en cours vient de /api/jour-hebraique
  // (horaire exact de la ville du visiteur) ; si l'horaire est indisponible, on retombe sur la date civile.
  var API = (/(^|\.)emounateha\.fr$/.test(location.hostname) && !/^www\./.test(location.hostname) ? 'https://www.emounateha.fr' : '') + '/api/jour-hebraique';
  function jourHebraique() {
    var g = ''; try { g = localStorage.getItem('parcity') || ''; } catch (e) {}
    return fetch(API + (/^\d+$/.test(g) ? '?geo=' + g : ''), { cache: 'no-store' }).then(function (r) { return r.json(); }).then(function (j) { return /^\d{4}-\d{2}-\d{2}$/.test(j.jour || '') ? j.jour : null; }).catch(function () { return null; });
  }
  function maj(cal) {
    jourHebraique().then(function (J) {
      var r = info(cal, J || ymd(new Date())), b = document.getElementById('rchband');
      if (b) b.remove();
      if (r) show(r);
    });
  }
  fetch('/calendrier-hebraique.json').then(function (r) { return r.json(); }).then(function (cal) {
    maj(cal); setInterval(function () { maj(cal); }, 60000);   // la page reste ouverte au moment de Tset Hakokhavim : le bandeau apparaît / disparaît tout seul
  }).catch(function () {});
})();
