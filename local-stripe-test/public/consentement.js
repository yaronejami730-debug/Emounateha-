/* Consentement (RGPD / CNIL) : le seul traceur soumis à accord sur ce site est le souvenir, pendant 30 jours, de l'e-mail qui a amené le visiteur
   (cookie em_attr). Rien n'est déposé avant un « Accepter ». Le choix est gardé 6 mois (cookie em_ok, strictement nécessaire), commun à www et à don.
   window.emConsent : etat() → 'oui' | 'non' | '' ; demander(fn) → affiche le bandeau si aucun choix, appelle fn(true/false) ; ouvrir() → rouvre le bandeau. */
(function () {
  if (window.emConsent) return;
  var DOM = /(^|\.)emounateha\.fr$/.test(location.hostname) ? '; Domain=.emounateha.fr' : '', SEC = location.protocol === 'https:' ? '; Secure' : '';
  function etat() { var m = document.cookie.match(/(?:^|; )em_ok=([01])/); return m ? (m[1] === '1' ? 'oui' : 'non') : ''; }
  function noter(ok) {
    document.cookie = 'em_ok=' + (ok ? 1 : 0) + '; Max-Age=' + 183 * 86400 + '; Path=/; SameSite=Lax' + DOM + SEC;
    if (!ok) document.cookie = 'em_attr=; Max-Age=0; Path=/' + DOM;   // refus : on efface ce qui aurait pu être gardé avant
  }
  var attente = [], ouvert = false;
  function bandeau() {
    if (ouvert) return; ouvert = true;
    var st = document.createElement('style');
    st.textContent = '#emck{position:fixed;z-index:10050;left:12px;right:12px;bottom:max(12px,env(safe-area-inset-bottom));max-width:560px;margin:0 auto;background:#fff;border:1px solid #d9e6e7;border-radius:18px;box-shadow:0 18px 50px rgba(10,40,45,.32);padding:16px 18px 14px;font:400 14px/1.5 Inter,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;color:#1b3a3f}' +
      '#emck b{display:block;font-size:15px;color:#1f6a72;margin-bottom:4px}#emck p{margin:0 0 12px}#emck a{color:#1f6a72;text-decoration:underline}' +
      '#emck .emck-b{display:flex;gap:10px}#emck button{flex:1 1 0;min-height:44px;border-radius:99px;font:600 14px/1 Inter,system-ui,sans-serif;cursor:pointer;border:1.5px solid #1f6a72;background:#fff;color:#1f6a72;padding:0 12px}' +
      '#emck button:focus-visible{outline:3px solid rgba(31,106,114,.35);outline-offset:2px}@media(max-width:360px){#emck{padding:14px}#emck .emck-b{flex-direction:column}}';
    document.head.appendChild(st);
    var d = document.createElement('div'); d.id = 'emck'; d.setAttribute('role', 'dialog'); d.setAttribute('aria-label', 'Votre accord');
    d.innerHTML = '<b>Votre accord</b><p>Vous arrivez depuis l’un de nos e-mails. Acceptez-vous que ce site retienne pendant 30 jours quel e-mail vous a amené ici, pour que nous sachions si nos messages sont utiles ? Aucune publicité, aucune revente. <a href="' + (/^don\./.test(location.hostname) ? 'https://www.emounateha.fr' : '') + '/confidentialite/">En savoir plus</a></p>' +
      '<div class="emck-b"><button type="button" data-v="0">Refuser</button><button type="button" data-v="1">Accepter</button></div>';
    d.addEventListener('click', function (e) { var b = e.target.closest('button'); if (!b) return; var ok = b.dataset.v === '1'; noter(ok); d.remove(); st.remove(); ouvert = false; var f = attente; attente = []; f.forEach(function (x) { try { x(ok); } catch (er) {} }); });
    (document.body || document.documentElement).appendChild(d);
  }
  function quandPret(f) { if (document.body) f(); else document.addEventListener('DOMContentLoaded', f); }
  window.emConsent = {
    etat: etat,
    demander: function (fn) { var e = etat(); if (e) { fn(e === 'oui'); return; } attente.push(fn); quandPret(bandeau); },
    ouvrir: function (fn) { if (fn) attente.push(fn); quandPret(bandeau); }
  };
})();
