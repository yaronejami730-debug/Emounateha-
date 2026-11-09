/* Jour hébraïque : le jour change à Tset Hakokhavim (tombée de la nuit, Paris), pas à minuit.
   jourHeb() -> Promise<'AAAA-MM-JJ'> : la date civile dont le jour hébraïque est en cours (celle de demain une fois la nuit tombée). null si indisponible. */
(function () {
  var p = null, at = 0;
  window.jourHeb = function () {
    if (p && Date.now() - at < 30000) return p;
    at = Date.now();
    p = fetch('/api/jour-hebraique', { cache: 'no-store' }).then(function (r) { return r.json(); }).then(function (j) { return /^\d{4}-\d{2}-\d{2}$/.test(j.jour || '') ? j.jour : null; }).catch(function () { return null; });
    return p;
  };
})();
