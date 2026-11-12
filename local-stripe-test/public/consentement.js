/* Consentement (RGPD / CNIL). Deux choses sont soumises à accord sur ce site, demandées ensemble dans un seul bandeau :
   1) le souvenir, pendant 30 jours, de l'e-mail qui a amené le visiteur (cookie em_attr) ;
   2) l'observation de l'usage du site avec Microsoft Clarity (parcours, clics, défilement ; cookies _clck, _clsk).
   Rien n'est déposé ni chargé avant un « Accepter ». Le choix est gardé 6 mois (cookie em_ok, strictement nécessaire), commun à www et à don :
   0 = refusé, 2 = accepté. L'ancienne valeur 1 (accord donné avant Clarity, pour le seul point 1) ne vaut pas accord pour Clarity : la question est reposée.
   window.emConsent : etat() → 'oui' | 'non' | '' ; mesure() → idem pour Clarity ; demander(fn) → affiche le bandeau si aucun choix, appelle fn(true/false) ; ouvrir() → rouvre le bandeau. */
(function () {
  if (window.emConsent) return;
  var DOM = /(^|\.)emounateha\.fr$/.test(location.hostname) ? '; Domain=.emounateha.fr' : '', SEC = location.protocol === 'https:' ? '; Secure' : '';
  var CLARITY = 'zc8po82kyk';
  function brut() { var m = document.cookie.match(/(?:^|; )em_ok=([012])/); return m ? m[1] : ''; }
  function etat() { var v = brut(); return v ? (v === '0' ? 'non' : 'oui') : ''; }
  function mesure() { var v = brut(); return v === '2' ? 'oui' : v === '0' ? 'non' : ''; }
  // Microsoft Clarity : chargé seulement après accord, et seulement sur le vrai site (jamais en local ni en aperçu)
  function clarity() {
    if (window.__emClarity || (!DOM && !window.__emTest)) return; window.__emClarity = true;
    (function (c, l, a, r, i, t, y) { c[a] = c[a] || function () { (c[a].q = c[a].q || []).push(arguments); }; t = l.createElement(r); t.async = 1; t.src = 'https://www.clarity.ms/tag/' + i; y = l.getElementsByTagName(r)[0]; y.parentNode.insertBefore(t, y); })(window, document, 'clarity', 'script', CLARITY);
    try { window.clarity('consentv2', { ad_Storage: 'denied', analytics_Storage: 'granted' }); } catch (e) {}
  }
  function clarityStop() {
    try { if (window.clarity) { window.clarity('consentv2', { ad_Storage: 'denied', analytics_Storage: 'denied' }); window.clarity('stop'); } } catch (e) {}
    ['_clck', '_clsk'].forEach(function (n) { document.cookie = n + '=; Max-Age=0; Path=/' + DOM; document.cookie = n + '=; Max-Age=0; Path=/'; });
  }
  function noter(ok) {
    document.cookie = 'em_ok=' + (ok ? 2 : 0) + '; Max-Age=' + 183 * 86400 + '; Path=/; SameSite=Lax' + DOM + SEC;
    if (!ok) { document.cookie = 'em_attr=; Max-Age=0; Path=/' + DOM; clarityStop(); }   // refus : on efface ce qui aurait pu être gardé avant
    else clarity();
  }
  var attente = [], ouvert = false;
  function bandeau() {
    if (ouvert) return; ouvert = true;
    var st = document.createElement('style');
    st.textContent = '#emck{position:fixed;z-index:10050;left:12px;right:12px;bottom:max(12px,env(safe-area-inset-bottom));max-width:560px;margin:0 auto;background:#fff;border:1px solid #d9e6e7;border-radius:18px;box-shadow:0 18px 50px rgba(10,40,45,.32);padding:16px 18px 14px;font:400 14px/1.5 Inter,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;color:#1b3a3f;font-variant:normal;text-transform:none;letter-spacing:0}#emck,#emck *{font-family:system-ui,-apple-system,"Segoe UI",Roboto,Arial,sans-serif !important;font-variant:normal !important;text-transform:none !important;letter-spacing:0 !important}' +
      '#emck b{display:block;font-size:15px;color:#1f6a72;margin-bottom:4px}#emck p{margin:0 0 12px}#emck a{color:#1f6a72;text-decoration:underline}' +
      '#emck .emck-b{display:flex;gap:10px}#emck button{flex:1 1 0;min-height:44px;border-radius:99px;font:600 14px/1 Inter,system-ui,sans-serif;cursor:pointer;border:1.5px solid #1f6a72;background:#fff;color:#1f6a72;padding:0 12px}' +
      '#emck button:focus-visible{outline:3px solid rgba(31,106,114,.35);outline-offset:2px}@media(max-width:360px){#emck{padding:14px}#emck .emck-b{flex-direction:column}}';
    document.head.appendChild(st);
    var d = document.createElement('div'); d.id = 'emck'; d.setAttribute('role', 'dialog'); d.setAttribute('aria-label', 'Votre accord');
    d.innerHTML = '<b>Votre accord</b><p>Pour améliorer ce site, acceptez-vous que nous observions comment il est utilisé (pages vues, clics — outil Microsoft Clarity) et retenions 30 jours l’e-mail qui vous a amené ici ? Vos saisies sont masquées. Aucune publicité, aucune revente. <a href="' + (/^don\./.test(location.hostname) ? 'https://www.emounateha.fr' : '') + '/confidentialite/">En savoir plus</a></p>' +
      '<div class="emck-b"><button type="button" data-v="0">Refuser</button><button type="button" data-v="1">Accepter</button></div>';
    d.addEventListener('click', function (e) { var b = e.target.closest('button'); if (!b) return; var ok = b.dataset.v === '1'; noter(ok); d.remove(); st.remove(); ouvert = false; var f = attente; attente = []; f.forEach(function (x) { try { x(ok); } catch (er) {} }); });
    (document.body || document.documentElement).appendChild(d);
  }
  function quandPret(f) { if (document.body) f(); else document.addEventListener('DOMContentLoaded', f); }
  window.emConsent = {
    etat: etat,
    mesure: mesure,
    demander: function (fn) { var e = etat(); if (e) { fn(e === 'oui'); return; } attente.push(fn); quandPret(bandeau); },
    ouvrir: function (fn) { if (fn) attente.push(fn); quandPret(bandeau); }
  };
  // (sur la page de don, la question n'est pas posée d'office par-dessus le bouton de paiement : l'accord donné sur le site y vaut aussi)
  // à l'arrivée : accord déjà donné → Clarity ; aucun choix (ou accord d'avant Clarity) → on pose la question, sans gêner le premier affichage
  if (mesure() === 'oui') clarity();
  else if (mesure() === '' && window.top === window && !/^don\./.test(location.hostname) && !/HeadlessChrome|bot|crawl|spider|Lighthouse/i.test(navigator.userAgent || '') || window.__emTest && mesure() === '') quandPret(function () { setTimeout(bandeau, 1500); });
})();
