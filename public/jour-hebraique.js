/* Jour hébraïque : le jour change à Tset Hakokhavim (tombée de la nuit, dans la ville de référence du visiteur), pas à minuit.
   jourHeb() -> Promise<'AAAA-MM-JJ'> : la date civile dont le jour hébraïque est en cours (celle de demain une fois la nuit tombée). null si indisponible. */
(function () {
  var p = null, at = 0, pg = null;
  window.jourHebQS = function () { var g = ''; try { g = localStorage.getItem('parcity') || ''; } catch (e) {} return /^\d+$/.test(g) ? '?geo=' + g : ''; };   // ?geo=… : ville de référence du visiteur
  window.jourHeb = function () {
    var g = ''; try { g = localStorage.getItem('parcity') || ''; } catch (e) {}   // ville de référence du visiteur, mémorisée après sa localisation (Paris par défaut)
    if (p && pg === g && Date.now() - at < 30000) return p;
    at = Date.now(); pg = g;
    p = fetch('/api/jour-hebraique' + (/^\d+$/.test(g) ? '?geo=' + g : ''), { cache: 'no-store' }).then(function (r) { return r.json(); }).then(function (j) { return /^\d{4}-\d{2}-\d{2}$/.test(j.jour || '') ? j.jour : null; }).catch(function () { return null; });
    return p;
  };
})();
