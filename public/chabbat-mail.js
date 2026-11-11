/* Bloc « Recevez les horaires de Chabbat par email » : s'insère dans <div id="chabbat-mail"></div> */
(function () {
  var host = document.getElementById('chabbat-mail'); if (!host) return;
  var G = [["Israël", [["Yérouchalayim", 281184], ["Tel Aviv-Netanya", 293397], ["Haïfa", 294801], ["Ashdod", 295629], ["Netanya", 294071], ["Beer-Sheva", 295530], ["Eilat", 295277], ["Tsfat", 293100], ["Tibériade", 293322]]], ["France", [["Paris", 2988507], ["Sarcelles", 2976043], ["Créteil", 3022530], ["Boulogne-Billancourt", 3031137], ["Versailles", 2969679], ["Lyon", 2996944], ["Marseille", 2995469], ["Nice", 2990440], ["Cannes", 3028808], ["Aix-en-Provence", 3038354], ["Montpellier", 2992166], ["Toulouse", 2972315], ["Bordeaux", 3031582], ["Nantes", 2990969], ["Lille", 2998324], ["Strasbourg", 2973783], ["Metz", 2994160], ["Nancy", 2990999], ["Grenoble", 3014728]]], ["Europe", [["Genève · Suisse", 2660646], ["Zurich · Suisse", 2657896], ["Bruxelles · Belgique", 2800866], ["Anvers · Belgique", 2803138], ["Londres · Royaume-Uni", 2643743], ["Manchester · Royaume-Uni", 2643123], ["Milan · Italie", 3173435], ["Rome · Italie", 3169070], ["Madrid · Espagne", 3117735], ["Barcelone · Espagne", 3128760]]], ["Amériques", [["New York · États-Unis", 5128581], ["Miami · États-Unis", 4164138], ["Los Angeles · États-Unis", 5368361], ["Boston · États-Unis", 4930956], ["Montréal · Canada", 6077243], ["Toronto · Canada", 6167865], ["Mexico · Mexique", 3530597], ["Buenos Aires · Argentine", 3435910], ["São Paulo · Brésil", 3448439]]], ["Afrique", [["Casablanca · Maroc", 2553604], ["Tunis · Tunisie", 2464470], ["Johannesburg · Afrique du Sud", 993800]]], ["Océanie", [["Sydney · Australie", 2147714], ["Melbourne · Australie", 2158177]]]];
  var V = []; G.forEach(function (g) { V = V.concat(g[1]); });
  var cur = '2988507'; try { cur = localStorage.getItem('parcity') || cur; } catch (e) {}
  if (!V.some(function (v) { return String(v[1]) === cur; })) cur = '2988507';
  var css = document.createElement('style');
  css.textContent = '.nlsec{padding:28px 0 6px}.nlbox{max-width:680px;margin:0 auto;border-radius:22px;overflow:hidden;background:#1f6a72 url(/header.jpg) center/cover;color:#fff;box-shadow:0 18px 44px -18px rgba(11,30,43,.6),inset 0 0 0 1px rgba(228,205,138,.28);text-align:center}.nlimg{position:relative;height:150px;background:#1f6a72 url(/chabbat-mail.jpg) center 42%/cover no-repeat}.nlimg::after{content:"";position:absolute;inset:0;background:linear-gradient(180deg,rgba(20,82,92,0) 30%,rgba(20,82,92,.72) 74%,#14525c 100%)}.nlin{padding:0 18px 20px;margin-top:-34px;position:relative;z-index:1}.nlk{display:inline-block;font-size:11px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:#e4cd8a}.nlbox h3{font-family:"Bree Serif",Georgia,serif;font-weight:400;font-size:clamp(22px,5.6vw,28px);line-height:1.18;color:#fff;margin:4px 0 6px}.nlbox h3 em{font-style:normal;color:#e4cd8a}.nlbox .nlp{color:#cfe0e3;font-size:14.5px;line-height:1.45;margin:0 auto 14px;max-width:440px}.nlf{display:grid;gap:8px;grid-template-columns:1fr;max-width:480px;margin:0 auto}.nlrow{display:grid;grid-template-columns:118px 1fr;gap:8px}.nlf select,.nlf input[type=email],.nlf input[type=text]{width:100%;min-height:46px;padding:0 14px;border:1.5px solid rgba(255,255,255,.18);border-radius:12px;background:#fff;color:#14272a;font:500 16px Inter,system-ui,sans-serif;outline:0;-webkit-appearance:none;appearance:none}.nlf select{padding-right:38px;background:#fff url("data:image/svg+xml;utf8,<svg xmlns=\'http://www.w3.org/2000/svg\' width=\'14\' height=\'9\' viewBox=\'0 0 14 9\'><path d=\'M1 1l6 6 6-6\' fill=\'none\' stroke=\'%231f6a72\' stroke-width=\'2\' stroke-linecap=\'round\'/></svg>") no-repeat right 14px center}.nlf select:focus,.nlf input:focus{border-color:#e4cd8a;box-shadow:0 0 0 3px rgba(228,205,138,.3)}.nlf button{min-height:46px;border:0;border-radius:99px;font:700 15.5px Inter,system-ui,sans-serif;color:#1b2b2d;cursor:pointer;background:linear-gradient(180deg,#f0dc94 0%,#d9bb62 55%,#c4a24a 100%);box-shadow:0 8px 18px -8px rgba(0,0,0,.55),inset 0 1px 0 rgba(255,255,255,.65)}.nlf button:active{transform:scale(.98)}.nlf button[disabled]{opacity:.65}.nlmsg{min-height:0;margin:10px auto 0!important;font-size:13.5px!important;line-height:1.4!important}.nlmsg:empty{display:none}.nlmsg.ok{color:#9fe3b6!important;font-weight:600}.nlmsg.err{color:#ffb4ab!important}.nlsmall{font-size:12px!important;color:#9db4b8!important;margin:8px auto 0!important}.nlhp{position:absolute;left:-9999px;width:1px;height:1px;opacity:0}@media(min-width:560px){.nlimg{height:190px}.nlin{padding:0 32px 24px}.nlf{grid-template-columns:1fr 1fr}.nlf .full,.nlf button{grid-column:1/-1}}';
  document.head.appendChild(css);
  host.className = 'nlsec';
  var opts = G.map(function (g) { return '<optgroup label="' + g[0] + '">' + g[1].map(function (v) { return '<option value="' + v[1] + '"' + (String(v[1]) === cur ? ' selected' : '') + '>' + v[0] + '</option>'; }).join('') + '</optgroup>'; }).join('');
  host.innerHTML = '<div class="wrap"><form class="nlbox" id="nlform" novalidate><div class="nlimg" role="img" aria-label="Sefer Torah"></div><div class="nlin"><div class="nlk">Chaque semaine</div><h3>Les horaires de <em>Chabbat</em> dans votre boîte mail</h3><p class="nlp">Allumage des bougies, sortie, parachat et fêtes. Choisissez votre ville : les horaires sont adaptés.</p>' +
    '<div class="nlf"><div class="nlrow"><select name="civility" aria-label="Civilité"><option value="">Civilité</option><option value="M">Monsieur</option><option value="Mme">Madame</option></select>' +
    '<input type="text" name="firstName" placeholder="Prénom" autocomplete="given-name" aria-label="Prénom"></div>' +
    '<input type="text" name="lastName" placeholder="Nom" autocomplete="family-name" aria-label="Nom">' +
    '<select name="city" aria-label="Votre ville">' + opts + '</select>' +
    '<input type="email" name="email" placeholder="Votre adresse email" autocomplete="email" inputmode="email" aria-label="Votre email" required>' +
    '<input class="nlhp" type="text" name="website" tabindex="-1" autocomplete="off" aria-hidden="true">' +
    '<button type="submit">Je m\'inscris</button></div><p class="nlmsg" role="status" aria-live="polite"></p><p class="nlsmall">Gratuit · un email par semaine · désinscription en un clic · <a href="/confidentialite/" style="color:inherit;text-decoration:underline">confidentialité</a></p></div></form></div>';
  // bouton qui plie / déplie le formulaire (replié par défaut)
  (function () {
    var wrap = host.querySelector('.wrap'), box = host.querySelector('.nlbox');
    var st = document.createElement('style');
    st.textContent = '.nlbox[hidden]{display:none}.nltog{display:flex;align-items:center;justify-content:space-between;gap:12px;width:100%;max-width:680px;margin:0 auto;padding:12px 18px;border:1px solid rgba(196,162,74,.6);border-radius:999px;background:rgba(255,255,255,.55);-webkit-backdrop-filter:blur(8px);backdrop-filter:blur(8px);color:#14525c;font:600 15px/1.3 inherit;font-family:inherit;cursor:pointer;box-shadow:0 8px 22px -14px rgba(11,30,43,.45)}.nltog .nlic{display:inline-flex;align-items:center;gap:10px}.nltog .nlic svg{width:20px;height:20px;color:#c4a24a;flex:none}.nltog i{font-style:normal;color:#c4a24a;transition:transform .25s}.nltog.open{border-radius:20px 20px 0 0;background:rgba(255,255,255,.8)}.nltog.open i{transform:rotate(180deg)}.nltog+.nlbox{border-top-left-radius:0;border-top-right-radius:0}.nlsec{padding:0 0 22px;margin-top:-20px}';
    document.head.appendChild(st);
    var tog = document.createElement('button'); tog.type = 'button'; tog.className = 'nltog'; tog.setAttribute('aria-expanded', 'false'); tog.setAttribute('aria-controls', 'nlform');
    tog.innerHTML = '<span class="nlic"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2.5"/><path d="M3.5 7l8.5 6 8.5-6"/></svg>Recevoir les horaires de Chabbat par e-mail</span><i aria-hidden="true">▾</i>';
    box.hidden = true;
    tog.addEventListener('click', function () {
      var open = box.hidden; box.hidden = !open; tog.setAttribute('aria-expanded', String(open)); tog.classList.toggle('open', open);
      if (open) setTimeout(function () { box.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); }, 60);
    });
    wrap.insertBefore(tog, box);
  })();
  var f = document.getElementById('nlform'), msg = f.querySelector('.nlmsg'), btn = f.querySelector('button');
  f.addEventListener('submit', function (e) {
    e.preventDefault();
    var email = f.email.value.trim();
    msg.className = 'nlmsg';
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { msg.textContent = 'Vérifiez votre adresse email.'; msg.className = 'nlmsg err'; f.email.focus(); return; }
    btn.disabled = true; btn.textContent = 'Inscription…';
    try { localStorage.setItem('parcity', f.city.value); } catch (x) {}
    fetch('/api/shabbat-subscribe', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: email, city: f.city.value, civility: f.civility.value, firstName: f.firstName.value.trim(), lastName: f.lastName.value.trim(), website: f.website.value }) })
      .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, j: j }; }); })
      .then(function (x) {
        if (x.ok) { msg.textContent = x.emailEnvoye ? 'Merci ! Un premier e-mail vient de vous être envoyé (pensez à vérifier vos courriers indésirables). Ensuite : chaque jeudi soir, et un rappel le vendredi matin.' : 'Merci, vous êtes inscrit ! Vous recevrez les horaires chaque jeudi soir, avec un rappel le vendredi matin.'; msg.className = 'nlmsg ok'; f.email.value = ''; btn.textContent = 'Inscrit ✓'; }
        else { msg.textContent = (x.j && x.j.error) || 'Une erreur est survenue, réessayez.'; msg.className = 'nlmsg err'; btn.disabled = false; btn.textContent = 'Je m\'inscris'; }
      })
      .catch(function () { msg.textContent = 'Connexion impossible, réessayez.'; msg.className = 'nlmsg err'; btn.disabled = false; btn.textContent = 'Je m\'inscris'; });
  });
})();
