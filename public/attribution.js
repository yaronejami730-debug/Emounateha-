/* Provenance des visiteurs venus d'un e-mail de campagne : ?utm_campaign=…&utm_content=…&sid=…
   gardée 30 jours dans un cookie partagé avec don.emounateha.fr, pour savoir quel e-mail a déclenché un don (même fait plus tard). */
(function () {
  try {
    var q = new URLSearchParams(location.search), clean = function (v, n) { return String(v || '').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, n); };
    var a = { c: clean(q.get('utm_campaign'), 60), t: clean(q.get('utm_content'), 60), s: clean(q.get('sid'), 60), src: clean(q.get('utm_source'), 30), med: clean(q.get('utm_medium'), 30) };
    if (!a.c && !a.s) return;
    var dom = /(^|\.)emounateha\.fr$/.test(location.hostname) ? '; Domain=.emounateha.fr' : '';
    document.cookie = 'em_attr=' + encodeURIComponent(JSON.stringify(a)) + '; Max-Age=' + 30 * 86400 + '; Path=/; SameSite=Lax' + dom + (location.protocol === 'https:' ? '; Secure' : '');
  } catch (e) {}
})();
