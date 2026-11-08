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
    st.textContent = '#rchband{display:flex;align-items:center;justify-content:center;gap:10px;flex-wrap:wrap;padding:9px 14px;background:linear-gradient(90deg,#e9d28a,#f6e7b0 50%,#e9d28a);color:#5a430e;font:600 14px/1.3 Inter,system-ui,sans-serif;text-align:center;border-bottom:1px solid rgba(196,162,74,.6)}#rchband b{font-family:"Bree Serif",serif;font-weight:400;font-size:17px}#rchband small{font-size:12.5px;font-weight:600;opacity:.85}#rchband svg{width:18px;height:18px;flex:none}';
    document.head.appendChild(st);
    var b = document.createElement('div'); b.id = 'rchband'; b.setAttribute('role', 'note');
    b.innerHTML = '<svg viewBox="0 0 24 24" fill="#c4a24a" aria-hidden="true"><path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a.6.6 0 0 0-.8-.7A9.5 9.5 0 1 0 20.7 15.3a.6.6 0 0 0-.7-.8z"/></svg>' +
      '<b>Roch ’Hodech ' + r.m + '</b><small>' + (r.two ? (r.d === 1 ? '1er jour' : '2e jour') + ' · ' : '') + 'Chodech tov !</small>';
    document.body.insertBefore(b, document.body.firstChild);
  }
  window.__rochHodech = { info: info, show: show };
  fetch('/calendrier-hebraique.json').then(function (r) { return r.json(); }).then(function (cal) {
    var r = info(cal, ymd(new Date())); if (r) show(r);
  }).catch(function () {});
})();
