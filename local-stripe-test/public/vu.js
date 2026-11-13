/* Mesure d'audience du site (onglet « Trafic » du CRM). Aucun cookie, aucune donnée personnelle :
   le serveur ne garde ni l'adresse IP ni le navigateur, seulement un identifiant anonyme qui change chaque jour. */
(function () {
  try {
    var h = location.hostname; if (!/(^|\.)emounateha\.fr$/.test(h) || navigator.webdriver) return;
    if (/[?&]embed=1/.test(location.search) && window.self !== window.top) return;   // petite fenêtre de don : la page qui la contient est déjà comptée
    if (/^\/(crm|backoffice|login)/.test(location.pathname)) return;
    var U = '/api/vu';   // toujours le site de la page elle-même ; la page de don relaie ensuite au site principal
    var envoi = function (battement) {
      try {
        var d = JSON.stringify({ p: location.pathname, s: h, r: battement ? '' : (document.referrer || ''), h: battement ? 1 : 0 });
        if (window.fetch) fetch(U, { method: 'POST', headers: { 'content-type': 'text/plain' }, body: d, keepalive: true, credentials: 'omit' }).catch(function () {});
        else if (navigator.sendBeacon) navigator.sendBeacon(U, new Blob([d], { type: 'text/plain' }));
      } catch (e) {}
    };
    envoi(false);
    setInterval(function () { if (document.visibilityState === 'visible') envoi(true); }, 60000);   // « en direct » : signe de vie toutes les 60 s tant que la page est affichée
    document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'visible') envoi(true); });
  } catch (e) {}
})();
