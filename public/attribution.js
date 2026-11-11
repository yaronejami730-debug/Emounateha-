/* Provenance des visiteurs venus d'un e-mail de campagne : ?utm_campaign=…&utm_content=…&sid=…
   Avec l'accord du visiteur (voir consentement.js), gardée 30 jours dans un cookie partagé avec don.emounateha.fr, pour savoir quel e-mail a déclenché un don.
   Sans accord : aucun cookie. Seul le nom de la campagne suit les liens vers la page de don pendant la visite (aucun identifiant de personne, rien d'écrit sur l'appareil). */
(function () {
  try {
    var q = new URLSearchParams(location.search), clean = function (v, n) { return String(v || '').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, n); };
    var a = { c: clean(q.get('utm_campaign'), 60), t: clean(q.get('utm_content'), 60), s: clean(q.get('sid'), 60), src: clean(q.get('utm_source'), 30), med: clean(q.get('utm_medium'), 30) };
    if (!a.c && !a.s) return;
    var dom = /(^|\.)emounateha\.fr$/.test(location.hostname) ? '; Domain=.emounateha.fr' : '';
    var garder = function () { document.cookie = 'em_attr=' + encodeURIComponent(JSON.stringify(a)) + '; Max-Age=' + 30 * 86400 + '; Path=/; SameSite=Lax' + dom + (location.protocol === 'https:' ? '; Secure' : ''); };
    var suivre = function (complet) {   // les liens vers la page de don emportent la provenance, le temps de la visite
      var faire = function () { [].forEach.call(document.querySelectorAll('a[href*="don.emounateha.fr"]'), function (l) { try { var u = new URL(l.href); if (u.searchParams.get('utm_campaign')) return; if (a.c) u.searchParams.set('utm_campaign', a.c); if (a.t) u.searchParams.set('utm_content', a.t); if (a.src) u.searchParams.set('utm_source', a.src); if (a.med) u.searchParams.set('utm_medium', a.med); if (complet && a.s) u.searchParams.set('sid', a.s); l.href = u.toString(); } catch (e) {} }); };
      if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', faire); else faire();
    };
    if (!window.emConsent) { suivre(false); return; }
    window.emConsent.demander(function (ok) { if (ok) { garder(); suivre(true); } else suivre(false); });
  } catch (e) {}
})();
