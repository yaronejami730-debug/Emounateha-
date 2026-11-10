const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
let S = null; // state
let tplId = null, tplDraft = null;

async function api(method, url, body) {
  const r = await fetch('/api' + url, { method, headers: { 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  if (r.status === 401) { location.href = '/login'; throw new Error('Connexion requise'); }
  const j = await r.json();
  if (!r.ok) throw new Error(j.error || 'Erreur');
  return j;
}
function toast(msg, err) {
  const t = $('#toast'); t.textContent = msg; t.className = 'toast show' + (err ? ' err' : '');
  clearTimeout(toast.t); toast.t = setTimeout(() => t.className = 'toast', 2600);
}
async function load() {
  const route = (location.hash.replace(/^#\/?/, '') || '');
  const need = n => route === n; // on ne charge que ce que la page affiche
  const cached = (() => { try { return JSON.parse(sessionStorage.hol || 'null'); } catch { return null; } })();
  const [st, dif, usr, amb, bes, hol] = await Promise.all([
    api('GET', '/state'),
    need('diffusion') ? api('GET', '/diffusion').catch(() => []) : Promise.resolve(S?.diffusion || []),
    need('users') ? api('GET', '/users').catch(() => []) : Promise.resolve(S?.users || []),
    need('ambassadeurs') ? api('GET', '/ambassadors').catch(e => ({ list: [], erreur: e.message })) : Promise.resolve(S?.ambassadors || {}),
    need('besoins') ? api('GET', '/besoins').catch(e => ({ list: [], erreur: e.message })) : Promise.resolve(S?.besoins || {}),
    load.hol || cached ? Promise.resolve(load.hol || cached) : api('GET', '/holidays?all=1').catch(() => [])
  ]);
  S = st; S.diffusion = dif; S.users = usr; S.ambassadors = amb; S.besoins = bes;
  load.hol = hol; try { if (hol && hol.length) sessionStorage.hol = JSON.stringify(hol); } catch {}
  S.holidaysAll = load.hol || []; S.holidays = S.holidaysAll.slice(0, 8);
  const { sent, limit } = S.today;
  $('#quota').innerHTML = `Envois aujourd'hui<br><b>${sent}</b> / ${limit}<div class="bar"><i style="width:${Math.min(100, sent / limit * 100)}%"></i></div>`;
}
const fmt = d => new Date(d).toLocaleString('fr-FR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
const statusPill = s => ({ active: '<span class="pill ok">Actif</span>', unsubscribed: '<span class="pill warn">Désinscrit</span>', bounced: '<span class="pill bad">Rebond</span>', converted: '<span class="pill blue">Donateur</span>' }[s] || s);
const campPill = s => ({ scheduled: '<span class="pill blue">Programmée</span>', draft: '<span class="pill">Brouillon</span>', running: '<span class="pill ok">● En cours</span>', paused: '<span class="pill warn">En pause</span>', done: '<span class="pill blue">Terminée</span>' }[s]);

function modal(html) {
  const m = $('#modal'); m.innerHTML = `<div class="box">${html}</div>`; m.classList.remove('hidden');
  m.onclick = e => { if (e.target === m) closeModal(); };
}
const closeModal = () => $('#modal').classList.add('hidden');


const FETES = [
  { k: 'annee', n: "Toute l'année", he: '', re: null, title: "Aidez-nous à les aider", subject: '{{prenom}}, une famille a besoin de vous', pre: "Chaque jour, des familles comptent sur nous.", body: "Bonjour {{prenom}},\n\nChaque jour de l'année, Émounatéha accompagne des familles dans le besoin et des personnes sans-abri : repas, vêtements, logement, soutien moral et financier, et accompagnement vers la réinsertion sociale.\n\nAccueillons Mashia'h avec des actes de bonté et de bienveillance. Votre don, même modeste, change une vie.", btn: 'Faire un don' },
  { k: 'rosh', n: 'Roch Hachana', he: 'ראש השנה', re: /^(Erev )?Roch Hachanah(?! LaBehemot)/i, title: 'Chana Tova : une année de bonté', subject: '{{prenom}}, Chana Tova ! Commençons l\'année par un don', pre: 'Une nouvelle année, de nouvelles lumières à allumer.', body: "Chana Tova {{prenom}},\n\nÀ l'aube de cette nouvelle année, nous pensons aux familles qui ont du mal à la commencer sereinement.\n\nGrâce à vous, Émounatéha peut leur offrir repas de fête, vêtements et soutien. Que cette année soit douce pour vous et pour ceux que vous aidez.", btn: 'Faire un don pour la nouvelle année' },
  { k: 'kippour', n: 'Yom Kippour', he: 'יום כיפור', re: /Kippour|Kippur/i, title: 'La Tsédaka, un acte qui rapproche', subject: '{{prenom}}, avant Yom Kippour : un geste de Tsédaka', pre: 'Téchouva, Téfila et Tsédaka.', body: "Bonjour {{prenom}},\n\nÀ l'approche de Yom Kippour, la Tsédaka tient une place essentielle.\n\nVotre don permet à Émounatéha de soutenir des familles nécessiteuses et des personnes sans-abri, tout au long de l'année. Que votre générosité vous soit comptée.", btn: 'Faire un don' },
  { k: 'souccot', n: 'Souccot', he: 'סוכות', re: /Soukkot|Souccot/i, title: 'Une fête de joie, ouverte à tous', subject: '{{prenom}}, Souccot : que personne ne reste seul', pre: 'Accueillir, partager, réjouir.', body: "Bonjour {{prenom}},\n\nSouccot est la fête de la joie et de l'hospitalité. Pourtant, des familles n'ont pas de quoi la célébrer.\n\nAvec votre aide, Émounatéha leur apporte de quoi partager un repas de fête et se sentir entourées.", btn: 'Faire un don' },
  { k: 'simhat', n: 'Simhat Torah', he: 'שמחת תורה', re: /Simh|Chemini|Shmini/i, title: 'Danser, se réjouir, partager', subject: '{{prenom}}, Simhat Torah : partageons la joie', pre: 'Que la joie soit pour tous.', body: "Bonjour {{prenom}},\n\nÀ Simhat Torah, on danse et on se réjouit. Faisons en sorte que cette joie atteigne aussi ceux qui traversent une période difficile.\n\nVotre soutien permet à Émounatéha d'être présente pour eux, toute l'année.", btn: 'Faire un don' },
  { k: 'hanouka', n: 'Hanoukah', he: 'חנוכה', re: /Hano|Chanou|Hanuk/i, title: 'Allumons ensemble la lumière de Hanouka', subject: '{{prenom}}, allumez une lumière avec Émounatéha', pre: 'Ensemble, rendons Hanouka lumineux pour les familles dans le besoin.', body: "Bonjour {{prenom}},\n\nÀ l'approche de Hanouka, la fête des lumières, pensons à toutes les familles qui n'ont pas de quoi allumer la joie dans leur foyer.\n\nGrâce à vous, Émounatéha aide chaque semaine des familles dans le besoin et des personnes sans-abri : repas, soutien, et accompagnement vers la réinsertion sociale.\n\nChaque don, même modeste, allume une lumière de plus.", btn: 'Faire un don' },
  { k: 'tubichvat', n: 'Tou BiChvat', he: 'ט״ו בשבט', re: /Tu B.?Shvat|Tou B.?Chvat|BiChvat|B'Shvat/i, title: 'Planter aujourd\'hui, récolter demain', subject: '{{prenom}}, Tou BiChvat : semons le bien', pre: 'Chaque geste est une graine.', body: "Bonjour {{prenom}},\n\nTou BiChvat, le nouvel an des arbres, nous rappelle que chaque graine compte.\n\nVotre don est une graine pour Émounatéha : il aide des familles et des personnes sans-abri à reprendre pied et à se reconstruire.", btn: 'Faire un don' },
  { k: 'pourim', n: 'Pourim', he: 'פורים', re: /^(Erev )?Pourim(?! Katan)|^Purim(?! Katan)/i, title: 'Matanot LaEvyonim : des cadeaux aux plus démunis', subject: '{{prenom}}, Pourim : Matanot LaEvyonim', pre: 'Une mitsva de Pourim : donner aux nécessiteux.', body: "Bonjour {{prenom}},\n\nÀ Pourim, la mitsva des Matanot LaEvyonim nous invite à donner aux nécessiteux.\n\nAvec Émounatéha, votre don parvient à des familles dans le besoin et à des personnes sans-abri. Joyeux Pourim !", btn: 'Faire un don' },
  { k: 'pessah', n: 'Pessah', he: 'פסח', re: /Pessah|Pesach/i, title: 'Que tout affamé vienne et mange', subject: '{{prenom}}, Pessah : que personne ne reste sans repas', pre: 'Kol dikhfin yétei véyékhol.', body: "Bonjour {{prenom}},\n\n« Que tout affamé vienne et mange. » À l'approche de Pessah, des familles ont besoin d'aide pour préparer la fête.\n\nGrâce à vous, Émounatéha peut leur offrir de quoi célébrer dignement.", btn: 'Faire un don' },
  { k: 'lag', n: 'Lag BaOmer', he: 'ל״ג בעומר', re: /Lag/i, title: 'L\'amour du prochain, en actes', subject: '{{prenom}}, Lag BaOmer : unité et entraide', pre: 'Rassemblons-nous autour de ceux qui en ont besoin.', body: "Bonjour {{prenom}},\n\nLag BaOmer est un jour d'unité et d'amour du prochain.\n\nVotre don aide Émounatéha à soutenir des familles et des personnes sans-abri, concrètement.", btn: 'Faire un don' },
  { k: 'chavouot', n: 'Chavouot', he: 'שבועות', re: /Chavou|Shavu/i, title: 'Recevoir et donner', subject: '{{prenom}}, Chavouot : un geste de générosité', pre: 'La générosité se transmet.', body: "Bonjour {{prenom}},\n\nÀ Chavouot, nous célébrons le don de la Torah. Prolongeons ce don par un acte de bonté.\n\nVotre soutien permet à Émounatéha d'accompagner des familles dans le besoin.", btn: 'Faire un don' },
  { k: 'tichabav', n: "Tich'a BeAv", he: 'תשעה באב', re: /Tich|Tisha/i, title: 'Réparer par la solidarité', subject: '{{prenom}}, unissons-nous par la solidarité', pre: "L'entraide est une réponse.", body: "Bonjour {{prenom}},\n\nEn ce jour de recueillement, nous rappelons que la solidarité et l'entraide sont une manière de construire.\n\nÉmounatéha continue d'aider des familles dans le besoin et des personnes sans-abri. Votre soutien compte.", btn: 'Faire un don' },
  { k: 'kislev10', g: 'hassid', n: 'Youd Kislev', he: 'י׳ כסלו', re: /^Youd Kislev/i, title: 'Une journée de lumière et de reconnaissance', subject: '{{prenom}}, Youd Kislev (י׳ כסלו) : un geste de gratitude', pre: "Remercier, c'est déjà donner.", body: 'Bonjour {{prenom}},\n\nYoud Kislev (י׳ כסלו) est un jour de reconnaissance et de joie dans la tradition hassidique.\n\nProlongeons cette joie par un acte concret : votre don aide Émounatéha à soutenir des familles dans le besoin et des personnes sans-abri.', btn: 'Faire un don' },
  { k: 'kislev19', g: 'hassid', n: 'Youd-Tet Kislev', he: 'י״ט כסלו', re: /^Youd-Tet Kislev/i, title: 'Youd-Tet Kislev (י״ט כסלו) : que la lumière se diffuse', subject: '{{prenom}}, Youd-Tet Kislev (י״ט כסלו) : diffusons la lumière', pre: 'La fête de la libération, une lumière qui se partage.', body: "Bonjour {{prenom}},\n\nYoud-Tet Kislev (י״ט כסלו), Roch Hachana de la Hassidout, est un jour où l'on pense à faire rayonner la lumière autour de soi.\n\nÀ travers Émounatéha, votre don apporte soutien et dignité à des familles et à des personnes sans-abri. Mazal tov et Chag sameach !", btn: 'Faire un don' },
  { k: 'tevet5', g: 'hassid', n: 'Hé Tevet', he: 'ה׳ טבת', re: /^H. Tevet/i, title: 'Hé Tevet (ה׳ טבת) : le pouvoir du livre et de la bonté', subject: '{{prenom}}, Hé Tevet (ה׳ טבת) : un acte de bonté', pre: 'Un jour pour agir.', body: "Bonjour {{prenom}},\n\nÀ l'occasion de Hé Tevet (ה׳ טבת), joignons à l'étude un acte de bonté.\n\nVotre soutien permet à Émounatéha d'aider concrètement des familles dans le besoin.", btn: 'Faire un don' },
  { k: 'tevet24', g: 'hassid', n: 'Kaf-Dalet Tevet', he: 'כ״ד טבת', re: /^Kaf-Dalet Tevet/i, title: 'Kaf-Dalet Tevet (כ״ד טבת) : transmettre par les actes', subject: '{{prenom}}, Kaf-Dalet Tevet (כ״ד טבת) : un don en mémoire', pre: 'Transmettre la bonté.', body: "Bonjour {{prenom}},\n\nÀ l'occasion de Kaf-Dalet Tevet (כ״ד טבת), jour de la hilloula du Baal HaTanya, honorons sa mémoire par un acte de bienfaisance.\n\nAvec Émounatéha, votre don parvient à des familles et à des personnes sans-abri.", btn: 'Faire un don' },
  { k: 'chevat10', g: 'hassid', n: 'Youd Chevat', he: 'י׳ שבט', re: /^Youd Chevat/i, title: "Youd Chevat (י׳ שבט) : prolonger l'élan par l'action", subject: '{{prenom}}, Youd Chevat (י׳ שבט) : un geste concret', pre: 'Agir, ici et maintenant.', body: "Bonjour {{prenom}},\n\nYoud Chevat (י׳ שבט) est un jour qui rappelle l'engagement au service des autres.\n\nProlongeons cet élan : votre don permet à Émounatéha de continuer à soutenir des familles dans le besoin.", btn: 'Faire un don' },
  { k: 'nissan11', g: 'hassid', n: 'Youd-Aleph Nissan', he: 'י״א ניסן', re: /^Youd-Aleph Nissan/i, title: 'Youd-Aleph Nissan (י״א ניסן) : un jour pour faire le bien', subject: '{{prenom}}, Youd-Aleph Nissan (י״א ניסן) : un acte de bonté', pre: 'Un jour de joie, un jour pour donner.', body: "Bonjour {{prenom}},\n\nÀ l'occasion de Youd-Aleph Nissan (י״א ניסן), ajoutons un acte de bonté et de bienveillance.\n\nAccueillons Mashia'h avec des actes de bonté : votre don aide Émounatéha à venir en aide aux familles nécessiteuses.", btn: 'Faire un don' },
  { k: 'tamouz3', g: 'hassid', n: 'Guimel Tamouz', he: 'ג׳ תמוז', re: /^Guimel Tamouz/i, title: 'Guimel Tamouz (ג׳ תמוז) : poursuivre par les actes', subject: '{{prenom}}, Guimel Tamouz (ג׳ תמוז) : un don qui fait vivre le bien', pre: 'Prolonger la mission par les actes.', body: "Bonjour {{prenom}},\n\nÀ l'occasion de Guimel Tamouz (ג׳ תמוז), une façon de prolonger la mission est d'agir concrètement pour les autres.\n\nGrâce à votre don, Émounatéha accompagne des familles et des personnes sans-abri vers la réinsertion sociale.", btn: 'Faire un don' },
  { k: 'tamouz12', g: 'hassid', n: 'Youd-Beth / Youd-Guimel Tamouz', he: 'י״ב–י״ג תמוז', re: /^Youd-Beth/i, title: 'Youd-Beth / Youd-Guimel Tamouz (י״ב–י״ג תמוז) : la liberté de faire le bien', subject: '{{prenom}}, Youd-Beth / Youd-Guimel Tamouz (י״ב–י״ג תמוז) : un geste de liberté', pre: 'Libérer, soutenir, accompagner.', body: 'Bonjour {{prenom}},\n\nYoud-Beth / Youd-Guimel Tamouz (י״ב–י״ג תמוז) rappelle la force de la persévérance.\n\nAvec Émounatéha, votre don contribue à redonner à des familles et à des personnes sans-abri les moyens de se relever.', btn: 'Faire un don' },
  { k: 'elloul18', g: 'hassid', n: 'Chaï Elloul', he: 'י״ח אלול', re: /^Cha. Elloul/i, title: "Chaï Elloul (י״ח אלול) : l'amour du prochain en actes", subject: '{{prenom}}, Chaï Elloul (י״ח אלול) : un don avant la nouvelle année', pre: 'Se préparer à la nouvelle année par le bien.', body: "Bonjour {{prenom}},\n\nChaï Elloul (י״ח אלול), à l'approche de la nouvelle année, est un moment pour se tourner vers les autres.\n\nVotre don à Émounatéha aide des familles dans le besoin à aborder la nouvelle année dans la dignité.", btn: 'Faire un don' },
];
// prochain envoi : heure de Paris, plage horaire, quota du jour
function nextWave(){
  const st=S.settings||{}, from=+st.hourFrom||8, to=+st.hourTo||21, pm=+st.perMinute||5;
  const p=Object.fromEntries(new Intl.DateTimeFormat('fr-FR',{timeZone:'Europe/Paris',hour:'numeric',minute:'numeric',hour12:false}).formatToParts(new Date()).map(x=>[x.type,x.value]));
  const h=+p.hour%24, mi=+p.minute, nowMin=h*60+mi;
  const left=Math.max(0,(S.today.limit||300)-(S.today.sent||0));
  const paused=S.today.pausedUntil && new Date(S.today.pausedUntil)>new Date();
  const q=S.today.queue||0;
  let wait, label;
  if(q===0){ return {txt:'File vide : rien à envoyer'}; }
  if(!paused && left>0 && h>=from && h<to){ wait=0; label='maintenant'; }
  else if(h<from && !paused && left>0){ wait=from*60-nowMin; label='dans '+fmtWait(wait); }
  else { wait=(24*60-nowMin)+from*60; label='demain à '+String(from).padStart(2,'0')+' h'; }
  const n=Math.min(pm,left,q);
  return {txt:`Prochain envoi : ${label} · ${n} mail(s) à la première minute (${pm} par minute, ${q} en attente)`};
}
function fmtWait(min){ const hh=Math.floor(min/60), mm=min%60; return hh? hh+' h '+String(mm).padStart(2,'0')+' min' : mm+' min'; }
const feteNext = f => { const h = f.re && (S.holidaysAll || []).find(x => f.re.test(x.title)); return h ? new Date(h.date).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' }) : ''; };
const feteDays = f => { const h = f.re && (S.holidaysAll || []).find(x => f.re.test(x.title)); if (!h) return null; return Math.round((new Date(h.date) - new Date(new Date().toDateString())) / 86400000); };
const FETES_SORTED = () => { const key = f => (f.k === 'annee' ? -1 : feteDays(f) ?? 99999); const cls = f => f.g === 'hassid' ? 1 : 0; return [...FETES].sort((x, y) => cls(x) - cls(y) || key(x) - key(y)); };
const feteOfTitle = t => FETES.find(f => f.re && f.re.test(t));
async function openFete(k) {
  let t = S.templates.find(x => x.holiday === k);
  if (!t) {
    const f = FETES.find(x => x.k === k);
    t = await api('POST', '/templates', { holiday: k, name: f.n + ' — appel aux dons', subject: f.subject, preheader: f.pre, title: f.title, body: f.body, buttonText: f.btn, buttonUrl: S.settings.donateUrl || 'https://don.emounateha.fr/', color: '#1f6a72', accent: '#c4a24a' });
    toast('Template « ' + f.n + ' » créé');
  }
  tplId = t.id; tplDraft = null; await render();
}

// ---------- Views ----------
const views = {
  trafic: () => `<div class="head"><div><h1>Trafic du site</h1><p class="sub">Visiteurs uniques, page par page, et qui est sur le site en ce moment</p></div>
      <div class="cf-seg" id="tfSeg">${[[1, "Aujourd'hui"], [7, '7 jours'], [30, '30 jours'], [90, '90 jours']].map(([n, l]) => `<button type="button" data-j="${n}" class="${TF.jours === n ? 'on' : ''}" onclick="traficJours(${n})">${l}</button>`).join('')}</div></div>
    <div id="tfBody"><div class="card">Chargement…</div></div>`,
  cerfa: () => `<div class="head"><div><h1>Reçus fiscaux (CERFA)</h1><p class="sub">Reçus faits automatiquement par don.emounateha.fr, et reçus manuels (virement, chèque, espèces)</p></div>
      <button class="btn pri" onclick="cerfaForm()">＋ Nouveau reçu manuel</button></div>
    <div id="cerfaNew"></div>
    <div class="card"><div class="row" style="align-items:center"><b class="grow">Tous les reçus</b>
      <select id="cfFiltre" onchange="cerfaList()" style="width:auto"><option value="">Tous</option><option value="en ligne">En ligne</option><option value="manuel">Manuels</option></select>
      <input id="cfQ" placeholder="Rechercher un nom, un n°…" oninput="cerfaList()" style="width:220px">
      <button class="btn" id="cfTests" onclick="cerfaSupprTests()" style="display:none" title="Retire uniquement les reçus numérotés TEST-… (aucun don réel)">Supprimer les reçus de test</button></div>
      <div id="cerfaTab" style="margin-top:10px">Chargement…</div></div>`,
  '': () => {
    const running = S.campaigns.filter(c => c.status === 'running').length;
    const totalSent = S.campaigns.reduce((a, c) => a + c.stats.sent, 0);
    const active = S.contacts.filter(c => c.status === 'active').length;
    const pct = Math.min(100, S.today.sent / S.today.limit * 100);
    const q = S.today.queue, left = Math.max(0, S.today.limit - S.today.sent), days = q > left ? 1 + Math.ceil((q - left) / S.today.limit) : (q ? 1 : 0);
    const queueTxt = q ? `${q} mail(s) en attente · fin estimée ${days <= 1 ? "aujourd'hui" : 'dans ' + days + ' jours'}` : 'File vide';
    const nextTxt = nextWave().txt;
    return `
    <div class="head"><div><h1>Tableau de bord</h1><p class="sub">Vue d'ensemble de vos relances</p></div>
      <button class="btn pri" onclick="runTick()">Envoyer maintenant le prochain lot</button></div>
    <div class="grid g4">
      <div class="card stat"><small>Contacts actifs</small><b>${active}</b><em>${S.contacts.length} au total</em></div>
      <div class="card stat"><small>Envoyés aujourd'hui${S.today.pausedUntil && new Date(S.today.pausedUntil) > new Date() ? ' · <b style="display:inline;font-size:12px;color:var(--warn)">limite atteinte, reprise demain</b>' : ''}</small><b>${S.today.sent}<span style="font-size:16px;color:var(--mut)"> / ${S.today.limit}</span></b><div class="pbar"><i style="width:${pct}%"></i></div></div>
      <div class="card stat"><small>Campagnes en cours</small><b>${running}</b><em>${queueTxt}</em><em style="display:block;margin-top:6px;color:var(--teal);font-weight:600">${nextTxt}</em></div>
      <div class="card stat"><small>Emails envoyés (total)</small><b>${totalSent}</b><em>${S.settings.hasKey ? 'Brevo connecté' : '⚠ Mode simulation (pas de clé Brevo)'}</em></div>
    </div>
    <div class="card" style="margin-top:16px">
      <b>Prochaines fêtes</b> <span class="hint">(Hebcal) — programmez vos campagnes à l'avance</span>
      <div class="grid g4" style="margin-top:12px">${S.holidays.slice(0, 4).map(h => { const d = Math.ceil((new Date(h.date) - new Date(new Date().toDateString())) / 86400000); return `<div class="card" style="padding:16px;background:#f8fbfb;box-shadow:none"><div style="font-family:'Bree Serif',serif;font-size:18px;color:var(--navy)">${esc(h.title)}</div><div class="hint" style="margin:2px 0 8px">${esc(h.hebrew)} · ${new Date(h.date).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })} · dans ${d} j</div><button class="btn sm" onclick="campFromHoliday('${h.date}','${esc(h.title).replace(/'/g, '')}')">+ Campagne</button></div>`; }).join('') || '<div class="hint">Calendrier indisponible.</div>'}</div>
    </div>`;
  },

  contacts: () => {
    const q = (views._q || '').toLowerCase();
    const list = S.contacts.filter(c => !q || (c.email + c.firstName + c.lastName + (c.tags || []).join(' ')).toLowerCase().includes(q));
    return `
    <div class="head"><div><h1>Contacts</h1><p class="sub">${S.contacts.length} contacts</p></div>
      <div class="row"><input id="q" placeholder="Rechercher…" value="${esc(views._q || '')}" style="width:220px" oninput="views._q=this.value;renderKeepFocus()">
      <button class="btn" onclick="importModal()">Importer</button><button class="btn pri" onclick="contactModal()">+ Contact</button></div></div>
    <div class="card" style="padding:0">${list.length ? `<table><thead><tr><th>Nom</th><th>Email</th><th>Tags</th><th>Statut</th><th></th></tr></thead><tbody>${list.map(c => `
      <tr><td><b>${esc(c.firstName)} ${esc(c.lastName)}</b></td><td>${esc(c.email)}</td>
      <td>${(c.tags || []).map(t => `<span class="tag">${esc(t)}</span>`).join('')}</td><td>${statusPill(c.status)}</td>
      <td class="row r"><button class="btn sm" onclick="contactModal('${c.id}')">Modifier</button><button class="btn sm bad" onclick="del('contacts','${c.id}')">✕</button></td></tr>`).join('')}</tbody></table>`
      : `<div class="empty"><big>☺</big>Aucun contact. Importez une liste (prénom, nom, email) ou ajoutez-en un.</div>`}</div>`;
  },

  historique: () => `<div class="head"><div><h1>Historique</h1><p class="sub">Les 200 derniers envois, avec leur campagne (lecture seule)</p></div><button class="btn" onclick="render(true)">↻ Actualiser</button></div>
    <div id="hist"><div class="card empty">Chargement…</div></div>`,
  campaigns: () => `
    <div class="head"><div><h1>Campagnes</h1><p class="sub">Séquences de mails envoyées au fil de l'eau (max ${S.today.limit}/jour) · <b style="color:${S.settings.hasKey ? 'var(--ok)' : 'var(--warn)'}">${S.settings.hasKey ? '● Brevo connecté' : '⚠ Mode simulation (Brevo non connecté)'}</b></p></div>
      <button class="btn pri" onclick="campModal()">+ Nouvelle campagne</button></div>
    ${S.campaigns.length ? `<div class="cp-list">${S.campaigns.map(c => {
      const st = c.stats || {}, p = c.plan, sent = st.sent || 0, steps = (c.steps || []).length, aud = Math.max(st.audience || 0, sent), pct = aud ? Math.min(100, Math.round(sent * 100 / aud)) : 0;
      const jour = d => new Date(d).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
      const quand = c.startDate || c.endDate ? (c.startDate ? 'du ' + jour(c.startDate) : '') + (c.endDate ? ' au ' + jour(c.endDate) : ' sans date de fin') : 'envoi immédiat';
      const actif = c.status === 'running' || c.status === 'scheduled';
      const k = (l, v, cls) => `<div class="cp-k${cls ? ' ' + cls : ''}"><b>${v}</b><small>${l}</small></div>`;
      return `<article class="card cp">
        <header class="cp-top"><div class="cp-id"><h3>${esc(c.name)}</h3>${campPill(c.status)}</div>
          <div class="cp-act">${actif ? `<button class="btn sm" onclick="campAct('${c.id}','pause')">Mettre en pause</button>` : c.status !== 'done' ? `<button class="btn sm pri" onclick="campAct('${c.id}','start')">Démarrer</button>` : ''}
            <button class="btn sm" onclick="location.hash='#/campaigns/${c.id}'">Programmation</button><button class="btn sm" onclick="campDetail('${c.id}')">Statistiques</button><button class="btn sm" onclick="campModal('${c.id}')">Modifier</button><button class="btn sm bad" aria-label="Supprimer la campagne" onclick="del('campaigns','${c.id}')">✕</button></div></header>
        <p class="cp-meta">${steps > 1 ? '1 mail + ' + (steps - 1) + ' relance' + (steps > 2 ? 's' : '') : '1 mail'} · ${quand}${st.pending ? ' · ' + st.pending + ' contact' + (st.pending > 1 ? 's' : '') + ' en cours' : ''}</p>
        <div class="cp-prog"><div class="cp-bar"><i style="width:${pct}%"></i></div><span><b>${sent.toLocaleString('fr-FR')}</b> envoyé${sent > 1 ? 's' : ''}${aud ? ' sur ' + aud.toLocaleString('fr-FR') + ' · ' + pct + ' %' : ''}</span></div>
        <div class="cp-ks">${k("Aujourd'hui", p ? p.sentToday + ' / ' + p.dayQuota : '—')}${k('Reste à envoyer', p ? p.remaining : (c.status === 'done' ? 0 : '—'))}${k('Mails par heure', p ? p.perHour : '—')}${k('Erreurs', st.errors || 0, st.errors ? 'bad' : '')}</div>
        ${p ? `<p class="cp-next"><span>Prochain envoi</span> ${esc(String(p.nextLabel))} · <b>${p.nextCount}</b> mail${p.nextCount > 1 ? 's' : ''}</p>` : ''}
        ${st.excluded ? `<p class="cp-warn">${st.excluded} contact${st.excluded > 1 ? 's' : ''} exclu${st.excluded > 1 ? 's' : ''} : ce mail leur a déjà été envoyé dans une autre campagne.</p>` : ''}
      </article>`;
    }).join('')}</div>` : `<div class="card empty"><big>➤</big>Aucune campagne pour l'instant. Cliquez sur « + Nouvelle campagne ».</div>`}
    <div id="attr"></div>`,

  templates: () => {
    if (!tplDraft) { const t = S.templates.find(x => x.id === tplId) || S.templates[0]; if (t) { tplId = t.id; tplDraft = { ...t }; } }
    const t = tplDraft, open = fetesOpen(), sorted = FETES_SORTED();
    const cur = t && FETES.find(f => f.k === t.holiday);
    const dayTxt = f => { const d = feteDays(f); return d === null ? '' : `<span class="jx ${d <= 14 ? 'soon' : d <= 45 ? 'mid' : ''}">${d <= 0 ? "Aujourd'hui" : 'J-' + d}</span>`; };
    const card = f => { const has = S.templates.some(x => x.holiday === f.k); return `<a href="#" class="fcard ${t && t.holiday === f.k ? 'on' : ''}" onclick="openFete('${f.k}');return false"><div class="fl"><b>${f.n}</b><span>${dayTxt(f)}<span class="st" style="color:${has ? (f.k === 'hanouka' ? 'var(--ok)' : '#b0902f') : 'var(--mut)'}">${has ? (f.k === 'hanouka' ? '✓ prêt' : '✎ exemple') : '+ créer'}</span></span></div><small>${feteNext(f) || ''}${f.he ? ` · <bdi>${f.he}</bdi>` : ''}</small></a>`; };
    const others = S.templates.filter(x => !FETES.some(f => f.k === x.holiday));
    const chips = sorted.filter(f => feteDays(f) !== null).slice(0, 4).map(f => `<a href="#" class="chip" onclick="openFete('${f.k}');return false">${f.n} ${dayTxt(f)}</a>`).join('');
    return `
    <div class="head"><div><h1>Templates</h1><p class="sub">Variables : <code>{{prenom}}</code> <code>{{nom}}</code> <code>{{email}}</code></p></div>
      <button class="btn pri" onclick="newTpl()">+ Nouveau template</button></div>

    <div class="card" style="margin:0 0 14px;padding:14px 16px;border-left:4px solid var(--gold,#c4a24a);background:#fffbef">
      <b>ℹ️ À savoir :</b> les templates de fêtes (Roch Hachana, Pessah, Pourim…) sont des <b>modèles d'exemple</b> : changez le titre, le texte et le bouton pour qu'ils correspondent à votre message avant de les utiliser dans une campagne.
      Seul <b>Hanoukah</b> est finalisé (même esprit que la page <code>/hanouka-lp/</code>).
      <br><span class="hint" style="margin:0">Pour aller vite : choisissez une fête dans « Fêtes et calendrier », ou cliquez sur « + Nouveau template » pour partir d'une page vierge.
      Le mail hebdomadaire des horaires de Chabbat est automatique : il n'a pas besoin de template.</span>
    </div>

    <div class="card fetes">
      <button class="fetes-head" onclick="toggleFetes()"><span>📅 Fêtes et calendrier</span><span class="hint" style="margin:0">${cur ? 'Template ouvert : <b>' + cur.n + '</b>' : 'Choisir une fête pour créer son template'}</span><span class="chev">${open ? '▾ Replier' : '▸ Déplier'}</span></button>
      ${open ? `<div class="fetes-grid"><div class="gt">Fêtes</div>${sorted.filter(f => f.g !== 'hassid').map(card).join('')}<div class="gt">Fêtes hassidiques</div>${sorted.filter(f => f.g === 'hassid').map(card).join('')}${others.length ? '<div class="gt">Autres modèles</div>' + others.map(x => `<a href="#" class="fcard ${x.id === tplId ? 'on' : ''}" onclick="selTpl('${x.id}');return false"><div class="fl"><b>${esc(x.name)}</b></div></a>`).join('') : ''}</div>` : `<div class="chips">${chips}<span class="hint" style="margin:0">prochaines fêtes</span></div>`}
    </div>

    ${t ? `<div class="tpl-main">
      <div class="card" id="tform">
        <div class="row" style="margin-bottom:6px"><b style="font-size:16px">Écrire le mail</b><span class="grow"></span>
          <select id="tsel" onchange="selTpl(this.value)" style="width:auto;max-width:260px;font-size:13px;padding:6px 10px">${S.templates.map(x => `<option value="${x.id}" ${x.id === tplId ? 'selected' : ''}>${esc(x.name)}</option>`).join('')}</select></div>
        <label>Nom interne</label><input data-f="name" value="${esc(t.name)}">
        <label>Fête associée</label><select data-f="holiday"><option value="">— aucune —</option>${FETES.map(f => `<option value="${f.k}" ${t.holiday === f.k ? 'selected' : ''}>${f.n}</option>`).join('')}</select>
        <div class="sec">Ce que le destinataire voit dans sa boîte</div>
        <label>Objet du mail</label><input data-f="subject" value="${esc(t.subject)}">
        <label>Pré-header (texte d'aperçu)</label><input data-f="preheader" value="${esc(t.preheader)}">
        <div class="sec">Contenu</div>
        <label>Titre</label><input data-f="title" value="${esc(t.title)}">
        <label>Message</label><textarea data-f="body" rows="10">${esc(t.body)}</textarea>
        <div class="hint">Ligne vide = nouveau paragraphe.</div>
        <div class="sec">Bouton</div>
        <div class="row"><div class="grow"><label>Texte</label><input data-f="buttonText" value="${esc(t.buttonText)}"></div><div class="grow"><label>Lien</label><input data-f="buttonUrl" value="${esc(t.buttonUrl)}" placeholder="https://…"></div></div>
        <div class="sec">Couleurs</div>
        <div class="row"><div class="grow"><label>Principale</label><input class="color" type="color" data-f="color" value="${t.color || '#1f6a72'}"></div>
        <div class="grow"><label>Bouton</label><input class="color" type="color" data-f="accent" value="${t.accent || '#c4a24a'}"></div></div>
        <div class="row" style="margin-top:22px"><button class="btn pri" onclick="saveTpl()">Enregistrer</button>
          <button class="btn" onclick="testModal()">Envoyer un test</button><span class="grow"></span><button class="btn bad" onclick="del('templates','${t.id}')">Supprimer</button></div>
      </div>
      <div class="preview-phone">
        <div class="row" style="margin-bottom:10px"><b>📱 Aperçu téléphone</b><span class="grow"></span>
          <select id="pvc" onchange="pvContact=this.value;refreshPreview()" style="width:auto;max-width:190px;padding:6px 10px;font-size:13px"><option value="">Avec un exemple</option>${S.contacts.slice(0, 80).map(c => `<option value="${c.id}" ${pvContact === c.id ? 'selected' : ''}>${esc((c.firstName + ' ' + c.lastName).trim() || c.email)}</option>`).join('')}</select></div>
        <div class="dev phone"><div class="chrome"><div class="scr" id="pvscr"><iframe id="pv"></iframe></div></div></div>
      </div>
    </div>
    <div class="card" style="margin-top:18px">
      <div class="row" style="margin-bottom:12px"><b>🖥 Aperçu ordinateur</b><span class="hint" style="margin:0">tel que le destinataire le reçoit</span><span class="grow"></span><button class="btn sm" onclick="pvFull()">⤢ Plein écran</button></div>
      <div class="dev desktop"><div class="chrome"><div class="bar"><i></i><i></i><i></i><span>Boîte de réception</span></div>
        <div class="mailhead"><img src="/logo.png?v=2" alt=""><div><b>${esc(S.settings.senderName || S.settings.orgName)}</b> <span>&lt;${esc(S.settings.senderEmail || 'contact@emounateha.fr')}&gt;</span><div id="pvsubj" class="subj"></div></div></div>
        <div class="scr" id="pvdscr"><iframe id="pvd"></iframe></div></div></div>
    </div>` : '<div class="card empty">Créez un template.</div>'}`;
  },

  diffusion: () => {
    const today = new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Paris' });
    return `
    <div class="head"><div><h1>Diffusion de la Torah</h1><p class="sub">Une image JPEG par jour, affichée sur le site dans le carrousel « Nos actions ».</p></div></div>
    <div class="card">
      <b>Ajouter la diffusion du jour</b>
      <div class="row" style="margin-top:12px;align-items:flex-end;flex-wrap:wrap">
        <div class="grow" style="min-width:240px"><label style="margin-top:0">Image (JPEG) — facultative si lien YouTube</label><input id="df_file" type="file" accept="image/jpeg,image/png"></div>
        <div><label style="margin-top:0">Date de publication</label><input id="df_day" type="date" value="${today}"></div>
        <div class="grow" style="min-width:200px"><label style="margin-top:0">Titre (facultatif)</label><input id="df_name" placeholder="Machia'h Now — Lundi"></div>
        <div class="grow" style="min-width:260px"><label style="margin-top:0">Lien YouTube (facultatif)</label><input id="df_yt" placeholder="https://youtube.com/watch?v=…"></div>
        <button class="btn pri" onclick="addDiffusion()">Publier</button>
      </div>
      <div class="hint">Seule la diffusion du jour s'affiche sur l'accueil (bouton « Voir plus » vers les archives). Cliquez sur un jour pour y ajouter le lien vidéo. Une image programmée à une date future apparaîtra ce jour-là.</div>
    </div>
    <div class="grid g4" style="margin-top:16px">${(S.diffusion || []).map(d => `<div class="card" style="padding:12px;cursor:pointer" onclick="editDiffusion('${d.id}')" title="Cliquer pour ajouter ou changer le lien vidéo">${d.has_image===false?`<div style="height:220px;border-radius:10px;background:#111 url(https://i.ytimg.com/vi/${(String(d.youtube||'').match(/(?:v=|youtu\.be\/|shorts\/|embed\/)([A-Za-z0-9_-]{11})/)||[])[1]||''}/hqdefault.jpg) center/auto 100%"></div>`:`<img src="/diffusion/${d.id}.jpg" style="width:100%;height:220px;object-fit:cover;object-position:top;border-radius:10px;display:block">`}<div class="row" style="margin-top:10px"><div class="grow"><b>${new Date(d.day).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}</b><div class="hint" style="margin:0">${esc(d.name || '')} ${d.youtube ? '▶ YouTube ' : ''}${d.day > today ? '· <span class="pill blue">programmée</span>' : ''}</div></div><button class="btn sm bad" onclick="event.stopPropagation();delDiffusion('${d.id}')">✕</button></div></div>`).join('') || '<div class="card empty" style="grid-column:1/-1"><big>☀</big>Aucune diffusion. Ajoutez la première image.</div>'}</div>`;
  },

  besoins: () => {
    const B = S.besoins || {}, list = B.list || [];
    const eur = c => ((c || 0) / 100).toLocaleString('fr-FR', { maximumFractionDigits: 2 }) + ' €';
    const tot = list.reduce((t, x) => t + (x.total || 0), 0), nd = list.reduce((t, x) => t + (x.dons || 0), 0), ouverts = list.filter(x => x.actif).length;
    const lien = x => 'https://don.emounateha.fr/besoin/' + x.slug;
    return `<div class="head"><div><h1>Besoins</h1><p class="sub">Mini-cagnottes : un besoin précis, une personne, un lien. Chaque don fait par ce lien est compté ici et marqué dans Stripe.</p></div>
      <div class="row"><button class="btn pri" onclick="besoinModal()">+ Nouveau besoin</button></div></div>
    ${B.erreur ? `<div class="card" style="border-color:#f3c9c9;color:#9b1c1c;margin-bottom:16px">${esc(B.erreur)}</div>` : ''}
    <div class="grid g4" style="margin-bottom:16px">
      <div class="card stat"><small>Besoins ouverts</small><b>${ouverts}</b></div>
      <div class="card stat"><small>Besoins au total</small><b>${list.length}</b></div>
      <div class="card stat"><small>Dons reçus</small><b>${nd}</b></div>
      <div class="card stat"><small>Total collecté</small><b>${eur(tot)}</b></div>
    </div>
    ${list.length ? `<div class="bs-list">${list.map(x => { const pct = x.objectif ? Math.min(100, Math.round((x.total || 0) * 100 / x.objectif)) : 0;
      return `<div class="card bs-it${x.actif ? '' : ' off'}">
        <div class="bs-top"><div><b class="bs-t">${esc(x.titre)}</b><div class="hint" style="margin:2px 0 0">${x.beneficiaire ? 'Pour : <b>' + esc(x.beneficiaire) + '</b> · ' : ''}créé le ${fmt(x.created_at)}</div></div>
          <span class="pill ${x.actif ? 'ok' : ''}">${x.actif ? 'Ouvert' : 'Clôturé'}</span></div>
        ${x.description ? `<p class="bs-d">${esc(x.description)}</p>` : ''}
        <div class="bs-amt"><strong>${eur(x.total)}</strong><span>${x.objectif ? 'collectés sur ' + eur(x.objectif) + ' (' + pct + ' %)' : 'collectés · pas d\'objectif'} · ${x.dons || 0} don${x.dons > 1 ? 's' : ''}${x.dernier ? ' · dernier le ' + new Date(x.dernier).toLocaleDateString('fr-FR') : ''}</span></div>
        ${x.objectif ? `<div class="bs-bar"><i style="width:${pct}%"></i></div>` : ''}
        <div class="bs-link"><a href="${lien(x)}" target="_blank" rel="noopener">don.emounateha.fr/besoin/${esc(x.slug)}</a></div>
        <div class="row bs-act"><button class="btn sm pri" onclick="navigator.clipboard.writeText('${lien(x)}');toast('Lien copié')">Copier le lien</button>
          <button class="btn sm" onclick="besoinModal('${x.id}')">Modifier</button>
          ${x.dons ? `<button class="btn sm" onclick="besoinDons('${x.id}')">Voir les dons</button>` : ''}
          <button class="btn sm" onclick="besoinActif('${x.id}',${x.actif ? 'false' : 'true'})">${x.actif ? 'Clôturer' : 'Rouvrir'}</button>
          ${x.dons ? '' : `<button class="btn sm bad" onclick="besoinDel('${x.id}')">Supprimer</button>`}</div>
      </div>`; }).join('')}</div>` : '<div class="card empty"><big>♥</big>Aucun besoin pour l\'instant. Créez-en un : un retard de loyer, une armoire, des repas…</div>'}`;
  },

  ambassadeurs: () => {
    const ST = { new: 'Nouveau', contacted: 'Contacté', active: 'Actif', inactive: 'Inactif' };
    const A = S.ambassadors || {}, list = A.list || [];
    const eur = c => ((c || 0) / 100).toLocaleString('fr-FR', { maximumFractionDigits: 2 }) + ' €';
    const tot = list.reduce((t, x) => t + (x.total || 0), 0), nd = list.reduce((t, x) => t + (x.dons || 0), 0), actifs = list.filter(x => x.dons > 0).length;
    const rows = [...list].sort((a, b) => (b.total || 0) - (a.total || 0) || String(b.created_at).localeCompare(String(a.created_at)));
    return `<div class="head"><div><h1>Ambassadeurs</h1><p class="sub">Inscriptions sur <a href="https://ambassadeur.emounateha.fr/" target="_blank">ambassadeur.emounateha.fr</a>. Chaque ambassadeur a son lien ; les dons faits par ce lien lui sont attribués (30 jours).</p></div></div>
    ${A.erreur ? `<div class="card" style="border-color:#f3c9c9;color:#9b1c1c">${esc(A.erreur)}</div>` : ''}
    <div class="grid g4" style="margin-bottom:16px">
      <div class="card stat"><small>Ambassadeurs</small><b>${list.length}</b></div>
      <div class="card stat"><small>Ayant rapporté un don</small><b>${actifs}</b></div>
      <div class="card stat"><small>Dons via les liens</small><b>${nd}</b></div>
      <div class="card stat"><small>Total rapporté</small><b>${eur(tot)}</b></div>
    </div>
    <div class="card" style="padding:0">${rows.length ? `<table><thead><tr><th>Ambassadeur</th><th>Lien</th><th>Contact</th><th>Ville</th><th>Dons</th><th>Rapporté</th><th>Statut</th><th></th></tr></thead><tbody>${rows.map(x => `<tr><td><b>${esc(x.first_name)} ${esc(x.last_name)}</b><div class="hint" style="margin:0">inscrit le ${fmt(x.created_at)}</div></td><td>${x.slug ? `<a href="https://ambassadeur.emounateha.fr/${esc(x.slug)}" target="_blank">/${esc(x.slug)}</a> <button class="btn sm" onclick="navigator.clipboard.writeText('https://ambassadeur.emounateha.fr/${esc(x.slug)}');toast('Lien copié')">Copier</button>` : '—'}</td><td>${esc(x.email)}${x.phone ? '<br><a href="https://wa.me/' + esc(x.phone.replace(/\D/g, '').replace(/^0/, '33')) + '" target="_blank">' + esc(x.phone) + '</a>' : ''}</td><td>${esc(x.cp || '')} ${esc(x.city)}</td><td><b>${x.dons || 0}</b>${x.dernier ? '<div class="hint" style="margin:0">dernier : ' + new Date(x.dernier).toLocaleDateString('fr-FR') + '</div>' : ''}</td><td><b>${eur(x.total)}</b></td><td><select onchange="ambStatus('${x.id}',this.value)" style="width:auto;padding:6px 8px;font-size:12px">${Object.keys(ST).map(k => `<option value="${k}" ${x.status === k ? 'selected' : ''}>${ST[k]}</option>`).join('')}</select></td><td><button class="btn sm bad" onclick="ambDel('${x.id}')">✕</button></td></tr>`).join('')}</tbody></table>` : '<div class="empty"><big>✦</big>Aucun ambassadeur pour l\'instant.</div>'}</div>`;
  },

  users: () => `
    <div class="head"><div><h1>Utilisateurs</h1><p class="sub">Les super administrateurs du CRM. Chacun crée son propre mot de passe via un lien reçu par email.</p></div></div>
    <div class="card"><b>Inviter un administrateur</b>
      <div class="row" style="margin-top:12px;align-items:flex-end;flex-wrap:wrap"><div class="grow" style="min-width:260px"><label style="margin-top:0">Email</label><input id="u_email" type="email" placeholder="prenom@exemple.com"></div><button class="btn pri" onclick="inviteUser()">Envoyer l'invitation</button></div>
      <div class="hint">Le lien est valable 7 jours. Un nouvel envoi remplace l'ancien lien.</div></div>
    <div class="card" style="margin-top:16px;padding:0">${(S.users || []).length ? `<table><thead><tr><th>Email</th><th>Rôle</th><th>Statut</th><th></th></tr></thead><tbody>${S.users.map(u => `<tr><td><b>${esc(u.email)}</b></td><td>Super admin</td><td>${u.pending ? '<span class="pill warn">Invitation envoyée</span>' : '<span class="pill ok">Actif</span>'}</td><td class="row r"><button class="btn sm" onclick="inviteUser('${esc(u.email)}')">${u.pending ? 'Renvoyer' : 'Réinitialiser'}</button><button class="btn sm bad" onclick="delUser('${u.id}')">✕</button></td></tr>`).join('')}</tbody></table>` : '<div class="empty"><big>☺</big>Aucun utilisateur.</div>'}</div>`,

  settings: () => {
    const s = S.settings;
    return `<div class="head"><div><h1>Réglages</h1><p class="sub">Connexion Brevo, expéditeur et identité des mails</p></div></div>
    <div class="grid g2">
      <div class="card"><b>Brevo</b>
        <label>Clé API ${s.hasKey ? `<span class="pill ok">connectée ${s.keyHint}</span>` : '<span class="pill warn">non définie — mode simulation</span>'}</label>
        <input id="s_key" type="password" placeholder="xkeysib-…" autocomplete="off">
        <div class="hint">Brevo → SMTP &amp; API → Clés API. Stockée en local dans data/db.json.</div>
        <label>Nom expéditeur</label><input id="s_senderName" value="${esc(s.senderName)}">
        <label>Email expéditeur (validé dans Brevo)</label><input id="s_senderEmail" value="${esc(s.senderEmail)}" placeholder="contact@emounateha.org">
        <div class="row"><div class="grow"><label>Limite / jour</label><input id="s_dailyLimit" type="number" value="${s.dailyLimit}"></div>
        <div class="grow"><label>Mails / minute</label><input id="s_perMinute" type="number" value="${s.perMinute}"></div></div>
        <div class="row"><div class="grow"><label>Envoi dès (h)</label><input id="s_hourFrom" type="number" value="${s.hourFrom}"></div>
        <div class="grow"><label>Jusqu'à (h)</label><input id="s_hourTo" type="number" value="${s.hourTo}"></div></div>
      </div>
      <div class="card"><b>Identité des mails</b>
        <label>Nom de l'association</label><input id="s_orgName" value="${esc(s.orgName)}">
        <label>URL du logo (publique https, ou /logo.png en local)</label><input id="s_logoUrl" value="${esc(s.logoUrl)}" placeholder="https://…/logo.png?v=2">
        <div class="hint">Les logos doivent être hébergés en ligne pour s'afficher dans Gmail/Outlook. Sans logo : le nom s'affiche en texte.</div>
        <div class="row"><div class="grow"><label>Téléphone / WhatsApp</label><input id="s_phone" value="${esc(s.phone)}"></div><div class="grow"><label>Compte réseaux</label><input id="s_social" value="${esc(s.social)}"></div></div>
        <label>Lien de don (par défaut)</label><input id="s_donateUrl" value="${esc(s.donateUrl)}">
        <label>Délai minimum entre 2 mails au même contact (heures)</label><input id="s_minGapHours" type="number" value="${s.minGapHours}">
        <label>Adresse (pied de mail)</label><input id="s_address" value="${esc(s.address)}">
        <label>URL publique du CRM (lien de désinscription)</label><input id="s_publicUrl" value="${esc(s.publicUrl)}" placeholder="https://crm.emounateha.org">
        <div class="hint">En local, le lien de désinscription ne marche que sur ce Mac. Mettez une URL publique une fois hébergé.</div>
        <div class="row" style="margin-top:22px"><button class="btn pri" onclick="saveSettings()">Enregistrer</button>
        ${s.hasKey ? `<button class="btn bad" onclick="clearKey()">Retirer la clé</button>` : ''}</div>
      </div>
    </div>
    <div class="card" style="margin-top:16px;border-color:#f1c6c6"><b style="color:#9b1c1c">Remettre à zéro</b>
      <div class="hint">Suppression définitive, sans retour possible. Les modèles de mails, les réglages, les reçus CERFA, la diffusion et les ambassadeurs ne sont pas touchés.</div>
      <label style="display:flex;gap:8px;align-items:center;font-weight:500"><input type="checkbox" id="rz_contacts" checked style="width:auto"> Tous les contacts (${S.contacts.length})</label>
      <label style="display:flex;gap:8px;align-items:center;font-weight:500"><input type="checkbox" id="rz_sends" checked style="width:auto"> Tout l'historique des envois</label>
      <label style="display:flex;gap:8px;align-items:center;font-weight:500"><input type="checkbox" id="rz_campaigns" style="width:auto"> Toutes les campagnes (${S.campaigns.length})</label>
      <label>Tapez SUPPRIMER pour confirmer</label><input id="rz_conf" placeholder="SUPPRIMER" autocomplete="off">
      <div class="row" style="margin-top:14px"><button class="btn bad" onclick="resetAll()">Tout supprimer</button></div>
    </div>`;
  }
};
async function resetAll() {
  const b = { contacts: $('#rz_contacts').checked, sends: $('#rz_sends').checked, campaigns: $('#rz_campaigns').checked, confirm: $('#rz_conf').value.trim().toUpperCase() };
  if (b.confirm !== 'SUPPRIMER') return toast('Tapez SUPPRIMER pour confirmer', true);
  try { const j = await api('POST', '/reset', b); toast('Supprimé : ' + Object.entries(j.n).map(([k, v]) => v + ' ' + ({ contacts: 'contact(s)', sends: 'envoi(s)', campaigns: 'campagne(s)' }[k])).join(', ')); await render(); }
  catch (e) { toast(e.message, true); }
}

// ---------- Actions ----------
async function runTick() {
  try { const r = await api('POST', '/tick'); toast(r.skipped ? 'Rien : ' + r.skipped : `${r.sent} mail(s) envoyé(s)${r.errors ? ', ' + r.errors + ' erreur(s)' : ''}`, r.errors > 0); await render(); }
  catch (e) { toast(e.message, true); }
}
async function del(coll, id) {
  if (!confirm('Supprimer ?')) return;
  await api('DELETE', `/${coll}/${id}`);
  if (coll === 'templates') { tplDraft = null; tplId = null; }
  await render();
}
async function campAct(id, a) { await api('POST', `/campaigns/${id}/${a}`); toast(a === 'start' ? 'Campagne démarrée' : 'Campagne en pause'); await render(); }

function contactModal(id) {
  const c = S.contacts.find(x => x.id === id) || { status: 'active', tags: [] };
  modal(`<h2>${id ? 'Modifier' : 'Nouveau'} contact</h2>
    <div class="row"><div class="grow"><label>Prénom</label><input id="c_fn" value="${esc(c.firstName)}"></div><div class="grow"><label>Nom</label><input id="c_ln" value="${esc(c.lastName)}"></div></div>
    <label>Email</label><input id="c_em" value="${esc(c.email)}">
    <label>Tags (séparés par des virgules)</label><input id="c_tg" value="${esc((c.tags || []).join(', '))}" placeholder="hanouka, donateurs">
    <label>Statut</label><select id="c_st">${['active', 'unsubscribed', 'bounced', 'converted'].map(s => `<option value="${s}" ${c.status === s ? 'selected' : ''}>${{ active: 'Actif', unsubscribed: 'Désinscrit', bounced: 'Rebond', converted: 'Donateur (stop séquence)' }[s]}</option>`).join('')}</select>
    <div class="row r" style="margin-top:22px"><button class="btn" onclick="closeModal()">Annuler</button><button class="btn pri" onclick="saveContact('${id || ''}')">Enregistrer</button></div>`);
}
async function saveContact(id) {
  const body = { firstName: $('#c_fn').value.trim(), lastName: $('#c_ln').value.trim(), email: $('#c_em').value.trim(), status: $('#c_st').value, tags: $('#c_tg').value.split(',').map(t => t.trim()).filter(Boolean) };
  try { await api(id ? 'PUT' : 'POST', '/contacts' + (id ? '/' + id : ''), body); closeModal(); await render(); } catch (e) { toast(e.message, true); }
}
function importModal() {
  modal(`<h2>Importer des contacts</h2><p class="hint">Collez une ligne par contact : <code>Prénom;Nom;email</code> (ou juste l'email). Séparateurs , ; ou tabulation. Un export Excel/Sheets copié-collé marche aussi.</p>
    <label>Fichier CSV</label><input type="file" accept=".csv,.txt,.tsv" onchange="readFile(this,'i_csv')">
    <label>Ou coller la liste</label><textarea id="i_csv" rows="9" placeholder="David;Cohen;david@mail.com&#10;sarah@mail.com"></textarea>
    <label>Tag à appliquer</label><input id="i_tg" placeholder="hanouka">
    <div class="row r" style="margin-top:22px"><button class="btn" onclick="closeModal()">Annuler</button><button class="btn pri" onclick="doImport()">Importer</button></div>`);
}
function readFile(inp, target) {
  const f = inp.files[0]; if (!f) return;
  const r = new FileReader(); r.onload = () => { $('#' + target).value = r.result; toast(f.name + ' chargé'); }; r.readAsText(f);
}
async function doImport() {
  const r = await api('POST', '/contacts/import', { csv: $('#i_csv').value, tags: $('#i_tg').value });
  closeModal(); toast(`${r.added} nouveau(x), ${r.existing} déjà connu(s), ${r.skipped} ignoré(s)`); await render();
}

// ---- Besoins (mini-cagnottes)
const besoinOf = id => ((S.besoins || {}).list || []).find(x => x.id === id);
const bsSlug = t => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40).replace(/-+$/, '');
function besoinModal(id) {
  const b = besoinOf(id) || { titre: '', beneficiaire: '', description: '', objectif: null, slug: '', actif: true };
  modal(`<h2>${id ? 'Modifier le' : 'Nouveau'} besoin</h2>
    <label>Le besoin</label><input id="b_titre" maxlength="70" value="${esc(b.titre)}" placeholder="ex. Loyer en retard, Une armoire, Repas de Chabbat" ${id ? '' : 'oninput="bsLien()"'}>
    <label>Pour qui <span class="opt">visible seulement ici, dans le CRM</span></label><input id="b_ben" maxlength="120" value="${esc(b.beneficiaire)}" placeholder="Prénom et nom de la personne ou de la famille">
    <label>Objectif en euros <span class="opt">facultatif</span></label><input id="b_obj" inputmode="decimal" value="${b.objectif ? String(b.objectif / 100).replace('.', ',') : ''}" placeholder="ex. 850">
    <label>Texte affiché sur la page de don <span class="opt">facultatif</span></label><textarea id="b_desc" rows="3" maxlength="600" placeholder="Quelques mots pour expliquer le besoin aux donateurs.">${esc(b.description)}</textarea>
    <label>Adresse du lien</label>
    ${id ? `<div class="bs-url"><span>don.emounateha.fr/besoin/</span><b>${esc(b.slug)}</b></div><div class="hint">L'adresse ne change plus une fois créée : les liens déjà partagés continuent de marcher.</div>`
      : `<div class="bs-url"><span>don.emounateha.fr/besoin/</span><input id="b_slug" maxlength="40" placeholder="loyer-en-retard" oninput="this.dataset.main='1';this.value=bsSlug(this.value)||this.value.toLowerCase().replace(/[^a-z0-9-]/g,'')"></div><div class="hint">Remplie toute seule à partir du besoin. Vous pouvez mettre autre chose (un prénom, un mot). Tout ce qui est dans l'adresse est public.</div>`}
    <div class="row r" style="margin-top:22px"><button class="btn" onclick="closeModal()">Annuler</button><button class="btn pri" id="b_go" onclick="besoinSave('${id || ''}')">${id ? 'Enregistrer' : 'Créer le besoin'}</button></div>`);
}
function bsLien() { const s = $('#b_slug'); if (s && !s.dataset.main) s.value = bsSlug($('#b_titre').value); }
async function besoinSave(id) {
  const body = { titre: $('#b_titre').value.trim(), beneficiaire: $('#b_ben').value.trim(), description: $('#b_desc').value.trim(), objectif: $('#b_obj').value.trim() };
  if (!body.titre) return toast('Indiquez le besoin', true);
  if (body.objectif && !(Number(body.objectif.replace(',', '.')) >= 1)) return toast("L'objectif doit être un montant en euros", true);
  if (id) body.actif = besoinOf(id).actif; else body.slug = $('#b_slug').value.trim();
  const go = $('#b_go'); go.disabled = true;
  try { const r = await api(id ? 'PUT' : 'POST', '/besoins' + (id ? '/' + id : ''), body); closeModal(); await load(); await render();
    if (!id && r.lien) { try { await navigator.clipboard.writeText(r.lien); toast('Besoin créé · lien copié'); } catch { toast('Besoin créé'); } } else toast('Besoin enregistré'); }
  catch (e) { go.disabled = false; toast(e.message, true); }
}
async function besoinActif(id, actif) { const b = besoinOf(id); if (!b) return; if (!actif && !confirm('Clôturer « ' + b.titre + ' » ? La page de don n\'acceptera plus de dons pour ce besoin.')) return;
  try { await api('PUT', '/besoins/' + id, { titre: b.titre, beneficiaire: b.beneficiaire, description: b.description, objectif: b.objectif ? b.objectif / 100 : '', actif }); await load(); await render(); toast(actif ? 'Besoin rouvert' : 'Besoin clôturé'); } catch (e) { toast(e.message, true); } }
async function besoinDel(id) { const b = besoinOf(id); if (!b || !confirm('Supprimer « ' + b.titre + ' » ? Son lien ne marchera plus.')) return; try { await api('DELETE', '/besoins/' + id); await load(); await render(); toast('Besoin supprimé'); } catch (e) { toast(e.message, true); } }
function besoinDons(id) { const b = besoinOf(id); if (!b) return; const eur = c => ((c || 0) / 100).toLocaleString('fr-FR', { maximumFractionDigits: 2 }) + ' €';
  modal(`<h2>Dons pour « ${esc(b.titre)} »</h2><p class="hint">${b.dons} don${b.dons > 1 ? 's' : ''} · ${eur(b.total)} au total</p>
    <table style="width:100%;font-size:14px"><thead><tr><th align="left">Date</th><th align="left">Donateur</th><th align="left">Reçu</th><th align="right">Montant</th></tr></thead><tbody>${[...b.liste].sort((x, y) => String(y.dateDon).localeCompare(String(x.dateDon))).map(d => `<tr><td>${new Date(d.dateDon).toLocaleDateString('fr-FR')}</td><td>${esc(d.nom || '')}</td><td>${esc(d.numero || '')}</td><td align="right"><b>${eur(d.montant)}</b></td></tr>`).join('')}</tbody></table>
    <div class="row r" style="margin-top:22px"><button class="btn pri" onclick="closeModal()">Fermer</button></div>`); }

let campSteps = [];
function campFromHoliday(date, title) {
  const d = new Date(date); d.setDate(d.getDate() - 7);
  const f = feteOfTitle(title), tp = f && S.templates.find(x => x.holiday === f.k) || S.templates[0];
  campModal(null, { name: title, startDate: d.toISOString().slice(0, 10), audienceTag: '', steps: [{ templateId: tp?.id, delayDays: 0 }] });
}
function holPick() {
  const h = $('#k_hol').value, off = +$('#k_off').value || 0; if (!h) return;
  const d = new Date(h); d.setDate(d.getDate() - off); $('#k_start').value = d.toISOString().slice(0, 10);
}
function campModal(id, preset) {
  const c = S.campaigns.find(x => x.id === id) || preset && { ...preset } || { name: '', audienceTag: '', steps: [{ templateId: S.templates[0]?.id, delayDays: 0 }] };
  campSteps = JSON.parse(JSON.stringify(c.steps));
  window.__camp = { tag: c.audienceTag || '', btn: c.buttonUrl || '' };   // conservés tels quels (plus de champ dans le formulaire)
  const periode = !!(c.startDate || c.endDate);
  modal(`<h2>${id ? 'Modifier la' : 'Nouvelle'} campagne</h2>
    <label>Nom <span class="opt">facultatif</span></label><input id="k_name" value="${esc(c.name)}" placeholder="ex. Hanouka 2026">
    <label>Contacts (CSV)</label>
    <input type="file" accept=".csv,.txt,.tsv" onchange="readFile(this,'k_csv')">
    <textarea id="k_csv" rows="3" placeholder="…ou collez : Prénom;Nom;email (l'en-tête est reconnu)" style="min-height:70px;margin-top:6px"></textarea>
    <div class="hint">Un email déjà connu n'est jamais dupliqué ni contacté deux fois.</div>
    <label>Mail à envoyer</label><div id="k_steps"></div>
    <button class="btn sm" onclick="addStep()">+ Ajouter une relance</button>
    <div class="hint">La relance part X jours après le mail précédent. Un contact désinscrit ou devenu donateur ne la reçoit pas.</div>
    <label>Quand envoyer ?</label>
    <div class="kwhen">
      <label class="kopt"><input type="radio" name="k_when" value="now" ${periode ? '' : 'checked'} onchange="campWhen()"><span><b>Tout de suite</b><small>Les mails partent dès l'enregistrement.</small></span></label>
      <label class="kopt"><input type="radio" name="k_when" value="per" ${periode ? 'checked' : ''} onchange="campWhen()"><span><b>Sur une période</b><small>Les mails sont répartis entre deux dates.</small></span></label>
    </div>
    <div id="k_per" ${periode ? '' : 'hidden'}>
      <div class="row" style="margin-top:10px"><div class="grow"><div class="hint" style="margin:0 0 4px">Du</div><input id="k_start" type="date" value="${esc(c.startDate || '')}"></div>
        <div class="grow"><div class="hint" style="margin:0 0 4px">Au</div><input id="k_end" type="date" value="${esc(c.endDate || '')}"></div></div>
      <div class="row" style="margin-top:8px"><span class="hint">Début aidé par une fête :</span>
        <select id="k_hol" onchange="holPick()" class="grow"><option value="">— X jours avant une fête —</option>${S.holidays.map(h => `<option value="${h.date}">${esc(h.title)} (${h.date})</option>`).join('')}</select>
        <input id="k_off" type="number" min="0" value="7" style="width:64px" oninput="holPick()"><span class="hint">j avant</span></div>
    </div>
    <div class="hint" id="k_whint"></div>
    <div class="row r" style="margin-top:22px"><button class="btn" onclick="closeModal()">Annuler</button><button class="btn pri" id="k_go" onclick="saveCamp('${id || ''}')"></button></div>`);
  drawSteps(); campWhen();
}
function campWhen() {
  const per = document.querySelector('input[name=k_when]:checked').value === 'per';
  $('#k_per').hidden = !per;
  $('#k_go').textContent = per ? 'Programmer la campagne' : 'Envoyer maintenant';
  $('#k_whint').textContent = per ? `Répartition automatique sur la période (max ${S.today.limit}/jour). Après la date de fin, la campagne s'arrête.`
    : `Envoi réel via Brevo, dans la limite de ${S.today.limit} mails par jour et des heures d'envoi réglées.`;
}
function drawSteps() {
  $('#k_steps').innerHTML = campSteps.map((s, i) => `<div class="seq"><span class="n">${i + 1}</span>
    <select onchange="campSteps[${i}].templateId=this.value" class="grow" aria-label="${i ? 'Template de la relance' : 'Template du mail'}">${S.templates.map(t => `<option value="${t.id}" ${t.id === s.templateId ? 'selected' : ''}>${esc(t.name)}</option>`).join('')}</select>
    ${i === 0 ? '<span class="hint" style="white-space:nowrap">1er mail</span>' : `<span class="hint" style="white-space:nowrap">relance après</span><input type="number" min="1" style="width:64px" value="${s.delayDays}" onchange="campSteps[${i}].delayDays=+this.value"><span class="hint">j</span>`}
    ${i > 0 ? `<button class="btn sm bad" aria-label="Retirer cette relance" onclick="campSteps.splice(${i},1);drawSteps()">✕</button>` : ''}</div>`).join('');
}
function addStep() { campSteps.push({ templateId: S.templates[0]?.id, delayDays: 3 }); drawSteps(); }
async function saveCamp(id) {
  const per = document.querySelector('input[name=k_when]:checked').value === 'per';
  const start = per ? $('#k_start').value || '' : '', end = per ? $('#k_end').value || '' : '';
  if (per && !end) return toast('Indiquez la date de fin de la période', true);
  if (per && start && end < start) return toast('La date de fin est avant la date de début', true);
  const tpl = S.templates.find(t => t.id === campSteps[0]?.templateId);
  if (!tpl) return toast('Choisissez le mail à envoyer', true);
  // nom facultatif : à défaut, le nom du template et la date du jour
  const name = $('#k_name').value.trim() || `${tpl.name} — ${new Date().toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' })}`;
  const csv = $('#k_csv').value.trim();
  const tag = window.__camp.tag || name.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const body = { name, audienceTag: tag, steps: campSteps, startDate: start, endDate: end, buttonUrl: window.__camp.btn };
  const go = $('#k_go'); go.disabled = true;
  try {
    if (csv) { const r = await api('POST', '/contacts/import', { csv, tags: tag }); toast(`${r.added} nouveau(x), ${r.existing} déjà connu(s), ${r.skipped} ignoré(s)`); }
    const saved = await api(id ? 'PUT' : 'POST', '/campaigns' + (id ? '/' + id : ''), body);
    if (!['running', 'done'].includes(saved.status)) { await api('POST', `/campaigns/${saved.id}/start`); toast(per ? 'Campagne programmée' : 'Campagne lancée'); }
    closeModal(); await render();
  } catch (e) { go.disabled = false; toast(e.message, true); }
}

// Templates
function selTpl(id) { tplId = id; tplDraft = null; render(); }
async function newTpl() {
  const t = await api('POST', '/templates', { name: 'Nouveau template', subject: 'Objet', preheader: '', title: 'Titre', body: 'Bonjour {{prenom}},\n\n…', buttonText: 'En savoir plus', buttonUrl: 'https://', color: '#1f6a72', accent: '#c4a24a' });
  tplId = t.id; tplDraft = null; await render();
}
async function saveTpl() {
  await api('PUT', '/templates/' + tplId, tplDraft); toast('Template enregistré'); await load(); await render(true);
}
const fetesOpen = () => { try { return localStorage.fetesOpen === '1'; } catch { return false; } };
function toggleFetes() { try { localStorage.fetesOpen = fetesOpen() ? '0' : '1'; } catch {} render(true); }
function applyPv() {
  const scr = $('#pvdscr'), f = $('#pvd'); if (!scr || !f) return;
  const W = 1280, avail = scr.clientWidth || 900, k = Math.min(1, avail / W), target = Math.round(avail * 9 / 16);
  scr.style.height = target + 'px';
  f.style.cssText = `width:${W}px;height:${Math.round(target / k)}px;transform:scale(${k});transform-origin:0 0`;
}
window.addEventListener('resize', () => applyPv());
function pvFull() {
  const m = $('#modal'); m.innerHTML = `<div class="box" style="width:min(1180px,96vw);padding:0;overflow:hidden"><div class="bar" style="display:flex;align-items:center;gap:6px;padding:12px 16px;background:#dfe6e8"><i style="width:12px;height:12px;border-radius:50%;background:#e26a5e"></i><i style="width:12px;height:12px;border-radius:50%;background:#e8b94d"></i><i style="width:12px;height:12px;border-radius:50%;background:#6cc070"></i><b style="margin-left:12px;font-size:14px">${$('#pvsubj') ? $('#pvsubj').innerHTML : ''}</b><button class="btn sm" style="margin-left:auto" onclick="closeModal()">Fermer</button></div><iframe id="pvbig" style="width:100%;height:82vh;border:0;background:#fff;display:block"></iframe></div>`;
  m.classList.remove('hidden'); m.onclick = e => { if (e.target === m) closeModal(); };
  $('#pvbig').srcdoc = window.__pvHtml || '';
}
let pvContact = '';
let pvTimer;
function refreshPreview() {
  clearTimeout(pvTimer);
  pvTimer = setTimeout(async () => {
    if (!tplDraft || !$('#pv')) return;
    const { html, subject, preheader } = await api('POST', '/render', { template: tplDraft, contactId: pvContact || undefined });
    window.__pvHtml = html;
    for (const id of ['#pv', '#pvd']) { const f = $(id); if (f) f.srcdoc = html; }
    const sj = $('#pvsubj'); if (sj) sj.innerHTML = esc(subject) + (preheader ? ` <span style="font-weight:400;color:var(--mut)">— ${esc(preheader)}</span>` : '');
  }, 250);
}
function testModal() {
  modal(`<h2>Envoyer un test</h2><p class="hint">${S.settings.hasKey ? 'Envoi réel via Brevo.' : 'Pas de clé Brevo : envoi simulé.'}</p>
    <label>Email destinataire</label><input id="t_to" value="${esc(localStorage.testTo || '')}" placeholder="vous@mail.com">
    <div class="row r" style="margin-top:22px"><button class="btn" onclick="closeModal()">Annuler</button><button class="btn pri" onclick="doTest()">Envoyer</button></div>`);
}
async function doTest() {
  const to = $('#t_to').value.trim(); localStorage.testTo = to;
  try { const r = await api('POST', '/test-send', { template: tplDraft, to }); closeModal(); toast(r.simulated ? 'Test simulé (pas de clé Brevo)' : 'Test envoyé ✓'); }
  catch (e) { toast(e.message, true); }
}

async function saveSettings() {
  const g = k => $('#s_' + k).value;
  const body = {}; ['senderName', 'senderEmail', 'dailyLimit', 'perMinute', 'hourFrom', 'hourTo', 'orgName', 'logoUrl', 'address', 'publicUrl', 'phone', 'social', 'donateUrl', 'minGapHours'].forEach(k => body[k] = g(k));
  if (g('key')) body.brevoApiKey = g('key');
  await api('POST', '/settings', body); toast('Réglages enregistrés'); await render();
}
async function clearKey() { await api('POST', '/settings', { clearKey: true }); await render(); }

function resizeImage(file, maxW = 1400) {
  return new Promise((ok, ko) => {
    const url = URL.createObjectURL(file), img = new Image();
    img.onload = () => { const k = Math.min(1, maxW / img.width), cv = document.createElement('canvas'); cv.width = Math.round(img.width * k); cv.height = Math.round(img.height * k);
      const g = cv.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, cv.width, cv.height); g.drawImage(img, 0, 0, cv.width, cv.height); URL.revokeObjectURL(url); ok(cv.toDataURL('image/jpeg', 0.88)); };
    img.onerror = () => ko(new Error('Image illisible')); img.src = url;
  });
}
async function addDiffusion() {
  const f = $('#df_file').files[0]; if (!f && !$('#df_yt').value.trim()) return toast('Choisissez une image ou un lien YouTube', true);
  try { const data = f ? await resizeImage(f) : ''; await api('POST', '/diffusion', { data, day: $('#df_day').value, name: $('#df_name').value, youtube: $('#df_yt').value.trim() }); toast('Diffusion publiée ✓'); await render(); }
  catch (e) { toast(e.message, true); }
}
async function ytSync() { try { const r = await api('POST', '/youtube-sync'); toast(r.added ? r.added + ' nouvelle(s) vidéo(s) ajoutée(s)' : 'Aucune nouvelle vidéo (' + r.checked + ' vérifiées)'); await render(); } catch (e) { toast(e.message, true); } }
function editDiffusion(id) {
  const d = (S.diffusion || []).find(x => x.id === id); if (!d) return;
  const dt = new Date(d.day + 'T12:00:00').toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  modal(`<h2 style="margin-top:0">Diffusion du ${esc(dt)}</h2>
    <label>Lien de la vidéo YouTube</label>
    <input id="de_yt" value="${esc(d.youtube || '')}" placeholder="https://youtube.com/watch?v=…" autofocus>
    <div class="hint">Dès l'enregistrement, la vidéo apparaît sur le site pour ce jour, sans recharger la page. Laissez vide pour retirer la vidéo.</div>
    <div class="row" style="margin-top:16px;justify-content:flex-end"><button class="btn" onclick="closeModal()">Annuler</button><button class="btn pri" onclick="saveDiffusionYt('${id}')">Enregistrer</button></div>`);
}
async function saveDiffusionYt(id) {
  try { await api('PATCH', '/diffusion/' + id, { youtube: $('#de_yt').value.trim() }); closeModal(); toast('Vidéo enregistrée ✓ — visible sur le site'); await render(); }
  catch (e) { toast(e.message || 'Lien invalide'); }
}
async function delDiffusion(id) { if (!confirm('Supprimer cette diffusion ?')) return; await api('DELETE', '/diffusion/' + id); await render(); }

async function inviteUser(email) {
  email = typeof email === 'string' ? email : $('#u_email').value.trim();
  if (!email) return toast('Entrez un email', true);
  try { await api('POST', '/users/invite', { email }); toast('Invitation envoyée à ' + email); await render(); } catch (e) { toast(e.message, true); }
}
async function delUser(id) { if (!confirm('Supprimer cet utilisateur ?')) return; try { await api('DELETE', '/users/' + id); await render(); } catch (e) { toast(e.message, true); } }

async function ambStatus(id, status) { try { await api('PUT', '/ambassadors/' + id, { status }); toast('Statut mis à jour'); } catch (e) { toast(e.message, true); } }
async function ambDel(id) { if (!confirm('Supprimer cette candidature ?')) return; await api('DELETE', '/ambassadors/' + id); await render(); }

// ---------- Router ----------
function bindTpl() {
  const form = $('#tform'); if (!form) return;
  form.querySelectorAll('[data-f]').forEach(el => el.addEventListener('input', () => { tplDraft[el.dataset.f] = el.value; refreshPreview(); }));
  applyPv(); requestAnimationFrame(applyPv); refreshPreview();
}
async function render(skipLoad) {
  if (!skipLoad) await load();
  const route = (location.hash.replace(/^#\/?/, '') || '');
  stopSchedule(); if (typeof smsStop === 'function') smsStop(); traficStop();
  const schedId = (/^campaigns\/([^/]+)$/.exec(route) || [])[1];
  document.querySelectorAll('#nav a').forEach(a => a.classList.toggle('on', a.dataset.r === (schedId ? 'campaigns' : route)));
  if (schedId) { $('#main').innerHTML = schedShell(schedId); startSchedule(schedId); return; }
  $('#main').innerHTML = (views[route] || views[''])();
  if (route === 'templates') bindTpl();
  if (route === 'historique') loadHistorique();
  if (route === 'campaigns') loadAttribution();
  if (route === 'sms') smsInit();
  if (route === 'cerfa') cerfaInit();
  if (route === 'trafic') traficInit();
}
function renderKeepFocus() {
  const pos = $('#q')?.selectionStart; render(true).then(() => { const q = $('#q'); if (q) { q.focus(); q.setSelectionRange(pos, pos); } });
}
window.addEventListener('hashchange', () => { tplDraft = null; render(); });
render();
// ---------- Mise à jour en direct (sans recharger la page) ----------
// Toutes les 8 s : on relit les données ; si quelque chose a changé ET que l'utilisateur n'est pas en train d'écrire,
// on redessine seulement le contenu. Jamais pendant une saisie, une fenêtre ouverte, un formulaire de reçu ou une fiche campagne (qui a son propre direct).
let liveSig = '', liveBusy = false;
const userBusy = () => { const a = document.activeElement; return !!(a && a.closest('#main') && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName)) || !$('#modal').classList.contains('hidden') || !!document.querySelector('#cerfaNew form, #cerfaNew input'); };
async function liveTick() {
  if (document.hidden || liveBusy) return; const route = (location.hash.replace(/^#\/?/, '') || '');
  if (/^(templates|settings|sms|trafic)/.test(route) || /^campaigns\//.test(route)) return;
  liveBusy = true;
  try {
    if (route === 'cerfa') {
      const l = await api('GET', '/cerfa'); const sig = JSON.stringify((l.recus || []).map(r => [r.numero, r.montant, r.ref]));
      if (sig !== liveSig) { liveSig = sig; CF.recus = l.recus || []; if (l.modes) CF.modes = l.modes; if (!userBusy()) { cerfaList(); const bt = $('#cfTests'); if (bt) bt.style.display = CF.recus.some(r => /^TEST-/i.test(r.numero || '')) ? '' : 'none'; } }
    } else {
      const st = await api('GET', '/state'); const sig = JSON.stringify([st.contacts && st.contacts.length, st.campaigns, (st.sends || []).length, st.quota, st.ambassadeurs]);
      if (sig !== liveSig) { liveSig = sig; if (!userBusy()) await render(); }
    }
  } catch (e) {} finally { liveBusy = false; }
}
setInterval(liveTick, 8000);
window.addEventListener('hashchange', () => { liveSig = ''; });

// fiche statistiques d'une campagne
function campDetail(id){
  const c=S.campaigns.find(x=>x.id===id); if(!c) return;
  const st=c.stats||{}, p=c.plan, steps=c.steps||[];
  const cell=(l,v,col)=>`<div class="card" style="padding:12px 14px;text-align:center"><small style="display:block;color:var(--mut);font-size:12px">${l}</small><b style="font-size:22px;color:${col||'inherit'}">${v}</b></div>`;
  const grid=`<div class="grid g4" style="gap:10px;margin:12px 0">
    ${cell('Audience',st.audience||0)}${cell('Déjà envoyés',st.sent||0,'var(--ok)')}${cell('Aujourd\'hui',p?p.sentToday+' / '+p.dayQuota:'—')}${cell('Restant à envoyer',p?p.remaining:(st.pending||0))}
    ${cell('En séquence',st.pending||0)}${cell('Exclus (autre campagne)',st.excluded||0,st.excluded?'var(--warn)':'inherit')}${cell('Erreurs',st.errors||0,st.errors?'var(--bad)':'inherit')}${cell('Mails / heure',p?p.perHour:'—')}</div>`;
  const next=p?`<div class="card" style="padding:12px 14px;margin-bottom:12px"><b>Prochaine rafale</b> : ${p.nextLabel} · <b>${p.nextCount}</b> mail(s)<br><small class="hint">Quota du jour ${p.dayQuota} · ${p.dayLeft} restant aujourd'hui · moyenne ≈ ${p.perHour} mails/heure programmés</small></div>`:'';
  const perStep=steps.length?`<table style="width:100%;font-size:14px;margin-bottom:12px"><tr><th align="left">Mail</th><th align="right">Envois</th><th align="right">Délai</th></tr>${steps.map((x,i)=>`<tr><td>${i?'Relance '+i:'Premier envoi'}</td><td align="right"><b>${(st.steps||[])[i]||0}</b></td><td align="right">${i?'+'+(x.delayDays||0)+' j':'immédiat'}</td></tr>`).join('')}</table>`:'';
  const days=(st.daily||[]).length?`<h3 style="margin:12px 0 6px">Envois par jour</h3><table style="width:100%;font-size:14px">${st.daily.map(d=>`<tr><td>${new Date(d.day+'T12:00:00').toLocaleDateString('fr-FR',{weekday:'short',day:'numeric',month:'short'})}</td><td align="right"><b>${d.n}</b></td></tr>`).join('')}</table>`:'<p class="hint">Aucun envoi pour le moment.</p>';
  const period=`<p class="hint">Période : ${c.startDate?new Date(c.startDate).toLocaleDateString('fr-FR'):'—'} → ${c.endDate?new Date(c.endDate).toLocaleDateString('fr-FR'):'sans fin'} · statut : ${esc(c.status)}</p>`;
  modal(`<h2>${esc(c.name)}</h2>${period}${grid}${next}${perStep}${days}<div class="row" style="margin-top:14px"><button class="btn" onclick="closeModal()">Fermer</button></div>`);
}

// historique : chargé après affichage de la page
(function(){ const oldRender = window.render; })();
// Dons par e-mail : quel e-mail a déclenché des dons (la provenance est enregistrée avec le paiement dans Stripe).
// En direct : les chiffres sont gardés en mémoire et mis à jour sur place, sans « Chargement… » ni clignotement quand la page se redessine.
const AT = { data: null, sig: '', vus: null, timer: null, busy: false };
const atEur = c => ((c || 0) / 100).toLocaleString('fr-FR', { minimumFractionDigits: 0, maximumFractionDigits: 2 }) + ' €';
function attrDraw(neufs) {
  const el = document.getElementById('attr'); if (!el) return; const a = AT.data;
  if (!a) { el.innerHTML = '<section class="at"><div class="at-head"><div><h2>Dons par e-mail</h2><p class="hint">Chargement…</p></div></div></section>'; return; }
  const t = a.total;
  const tuile = (l, v, s) => `<div class="at-kpi"><small>${l}</small><b>${v}</b>${s ? `<em>${s}</em>` : ''}</div>`;
  const dons = a.dons.slice(0, 30).map(d => `<li class="${neufs && neufs.has(d.numero) ? 'neuf' : ''}">
      <span class="at-d">${new Date(d.date).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}</span>
      <span class="at-p"><b>${esc(d.nom || '—')}</b><small>${esc(d.modele)} · ${esc(d.campagne)}</small></span>
      <span class="at-m">${atEur(d.montant)}${d.mensuel ? `<small>${d.suite ? 'prélèvement mensuel' : 'par mois'}</small>` : ''}</span></li>`).join('');
  el.innerHTML = `<section class="at">
    <div class="at-head"><div><h2>Dons par e-mail</h2><p class="hint">Les dons faits après un clic dans un de vos e-mails, pendant 30 jours.</p></div><span class="at-live" title="Mis à jour automatiquement"><i></i>En direct</span></div>
    ${a.erreur ? `<div class="at-warn">${esc(a.erreur)}</div>` : ''}
    <div class="at-kpis at-2">${tuile('Dons venus d\'un e-mail', t.dons)}${tuile('Montant collecté', atEur(t.montant), t.prelevements ? '+ ' + atEur(t.montantPrelev) + ' de prélèvements mensuels suivants' : '')}</div>
    <div class="card at-card"><h3>Derniers dons</h3>${dons ? `<ul class="at-list">${dons}</ul>` : '<p class="hint">Aucun don rattaché à un e-mail pour l\'instant. Ils apparaîtront ici dès qu\'un donateur paiera après avoir cliqué sur un lien.</p>'}</div></section>`;
}
async function attrPull() {
  if (AT.busy || document.hidden || !document.getElementById('attr')) return; AT.busy = true;
  try { const a = await api('GET', '/attribution'), sig = JSON.stringify(a);
    if (sig !== AT.sig) { const nums = new Set(a.dons.map(d => d.numero)), neufs = AT.vus ? new Set([...nums].filter(n => !AT.vus.has(n))) : null; AT.data = a; AT.sig = sig; AT.vus = nums; attrDraw(neufs); } }
  catch (e) { if (!AT.data) { const el = document.getElementById('attr'); if (el) el.innerHTML = '<section class="at"><div class="at-head"><div><h2>Dons par e-mail</h2><p class="hint">Indisponible : ' + esc(e.message) + '</p></div></div></section>'; } }
  finally { AT.busy = false; }
}
function loadAttribution() {   // appelé à chaque dessin de la page Campagnes : on réaffiche tout de suite ce qu'on connaît, puis on met à jour en arrière-plan
  attrDraw(); attrPull();
  if (!AT.timer) AT.timer = setInterval(() => { if (document.getElementById('attr')) attrPull(); else { clearInterval(AT.timer); AT.timer = null; } }, 10000);
}
async function loadHistorique(){
  const el=document.getElementById('hist'); if(!el) return;
  try{ const h=await api('GET','/historique');
    const envs=(h.envois||[]).map(x=>`<tr><td>${new Date(x.at).toLocaleString('fr-FR')}</td><td>${esc(x.email)}</td><td>${esc(x.campagne)}</td><td>${x.status==='error'?'<span style="color:var(--bad)" title="'+esc(x.erreur)+'">erreur</span>':x.status==='simulated'?'simulé':'envoyé'}</td></tr>`).join('');
    el.innerHTML=`<h3 style="margin:14px 0 6px">Envois (200 derniers)</h3>${envs?`<table style="width:100%;font-size:14px"><tr><th align="left">Date</th><th align="left">Email</th><th align="left">Campagne</th><th align="left">Statut</th></tr>${envs}</table>`:'<div class="card empty">Aucun envoi.</div>'}`;
  }catch(e){ el.innerHTML='<div class="card empty">Historique indisponible.</div>'; }
}


// ---------- Programmation d'une campagne, en direct ----------
let sch = null; // { id, timer, data, prev:Set, filter, q, showOld }
function stopSchedule() { if (sch && sch.timer) clearInterval(sch.timer); sch = null; }
function schedShell(id) {
  return `<div class="head"><div><a href="#/campaigns" style="font-size:13px;color:var(--mut)">← Campagnes</a><h1 id="sch_t">Programmation</h1><p class="sub" id="sch_sub">Chargement…</p></div>
    <div><span id="sch_live" class="pill ok">● En direct</span></div></div>
    <div id="sch_sum"></div>
    <div class="row" style="margin:12px 0;gap:8px;flex-wrap:wrap">
      <button class="btn sm pri" data-sf="all" onclick="schedFilter('all')">Tous</button>
      <button class="btn sm" data-sf="sent" onclick="schedFilter('sent')">✓ Envoyés</button>
      <button class="btn sm" data-sf="planned" onclick="schedFilter('planned')">⏰ Prévus</button>
      <button class="btn sm" data-sf="error" onclick="schedFilter('error')">⚠ Erreurs</button>
      <input id="sch_q" placeholder="Rechercher un nom ou un email…" style="max-width:260px;margin-left:auto" oninput="sch.q=this.value.toLowerCase();schedDraw()">
    </div>
    <div class="card" style="padding:0"><table style="width:100%;font-size:14px" id="sch_tab"><thead><tr><th align="left" style="padding:10px 14px">Statut</th><th align="left">Heure</th><th align="left">Contact</th><th align="left">Étape</th></tr></thead><tbody id="sch_body"><tr><td colspan="4" class="empty" style="padding:24px">Chargement…</td></tr></tbody></table></div>
    <div id="sch_more" class="hint" style="margin:10px 0"></div>
    <style>.sr-sent td{background:#f2fbf6}.sr-err td{background:#fff3f3}.sr-now td{background:#fff9e6;font-weight:600;text-align:center;color:#8a6d1f}.sr-day td{background:#eef6f6;font-weight:600;padding:6px 14px;color:#164c52}
    @keyframes schflash{from{background:#b8f0cf}to{background:#f2fbf6}}.sr-flash td{animation:schflash 2.4s ease-out}
    #sch_tab td{padding:8px 14px;border-top:1px solid var(--line)}#sch_tab th{background:#f6f8fa;font-size:12px;color:var(--mut)}</style>`;
}
function startSchedule(id) {
  sch = { id, data: null, prev: null, filter: 'all', q: '', showOld: false, timer: null };
  const pull = async () => {
    if (!sch || sch.id !== id || document.hidden) return;
    try {
      const d = await api('GET', `/campaigns/${id}/schedule`);
      if (!sch || sch.id !== id) return;
      sch.data = d; sch.err = false; schedDraw();
    } catch (e) { if (sch) { sch.err = true; const l = $('#sch_live'); if (l) { l.className = 'pill warn'; l.textContent = '⚠ Connexion perdue…'; } } }
  };
  pull(); sch.timer = setInterval(pull, 3000);
}
function schedFilter(f) { if (!sch) return; sch.filter = f; schedDraw(); }
const schHM = iso => new Date(iso).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
const schHMS = iso => new Date(iso).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
const schDay = iso => new Date(iso).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
function schedDraw() {
  const d = sch && sch.data; if (!d || !$('#sch_body')) return;
  const sentOk = d.sent.filter(x => x.status !== 'error').length, errs = d.sent.filter(x => x.status === 'error').length;
  const total = sentOk + d.totalPlanned, pct = total ? Math.round(sentOk / total * 100) : 0;
  $('#sch_t').textContent = d.name;
  const first = d.planned.find(x => x.at);
  const pillMap = { running: 'En cours', scheduled: 'Programmée', paused: 'En pause', draft: 'Brouillon', done: 'Terminée' };
  $('#sch_sub').innerHTML = `${pillMap[d.status] || d.status} · plage d'envoi ${d.window[0]} h → ${d.window[1]} h · actualisé à ${schHMS(new Date().toISOString())}`;
  const live = $('#sch_live'); live.className = d.status === 'running' ? 'pill ok' : 'pill'; live.textContent = d.status === 'running' ? '● En direct' : '⏸ ' + (pillMap[d.status] || d.status);
  $('#sch_sum').innerHTML = `<div class="card" style="padding:14px 18px"><div style="display:flex;gap:26px;flex-wrap:wrap;align-items:center">
    <div><b style="font-size:26px;color:var(--ok)">${sentOk}</b><br><small class="hint">envoyés</small></div>
    <div><b style="font-size:26px">${d.totalPlanned}</b><br><small class="hint">à envoyer</small></div>
    <div><b style="font-size:26px;color:${errs ? 'var(--bad)' : 'inherit'}">${errs}</b><br><small class="hint">erreurs</small></div>
    <div style="flex:1;min-width:200px"><div style="height:10px;border-radius:99px;background:#e6ecef;overflow:hidden"><i style="display:block;height:100%;width:${pct}%;background:var(--ok);transition:width .6s"></i></div>
      <small class="hint">${pct} % terminé${first ? ' · prochain envoi prévu à <b>' + schHM(first.at) + '</b> (' + schDay(first.at) + ')' : (d.totalPlanned && d.status !== 'running' ? ' · démarrez la campagne pour lancer la programmation' : '')}</small></div></div></div>`;
  document.querySelectorAll('[data-sf]').forEach(b => b.classList.toggle('pri', b.dataset.sf === sch.filter));
  // lignes : envoyés (chronologique) puis prévus (chronologique)
  const keyOf = (e, st) => e + '|' + st;
  const q = sch.q;
  const match = x => !q || (x.email + ' ' + x.name).toLowerCase().includes(q);
  const f = sch.filter;
  let sent = d.sent.filter(x => (f === 'all' || f === 'sent' && x.status !== 'error' || f === 'error' && x.status === 'error') && match(x));
  let plan = (f === 'all' || f === 'planned') ? d.planned.filter(match) : [];
  const OLD = 25, PLAN = 500;
  const hiddenOld = sch.showOld ? 0 : Math.max(0, sent.length - OLD);
  if (hiddenOld) sent = sent.slice(-OLD);
  const planCut = Math.max(0, plan.length - PLAN); plan = plan.slice(0, PLAN);
  const sentKeys = new Set(d.sent.filter(x => x.status !== 'error').map(x => keyOf(x.email, x.step)));
  const justSent = sch.prev ? new Set([...sentKeys].filter(k => !sch.prev.has(k))) : new Set();
  const stepCell = n => { const si = (d.stepsInfo || [])[n - 1] || {}; const tip = [si.tpl && 'Template : ' + si.tpl, si.subject && 'Objet : ' + si.subject, si.title && 'Titre : ' + si.title, si.body].filter(Boolean).join('\n'); return `<span title="${esc(tip)}" style="cursor:help;border-bottom:1px dotted var(--mut)">${esc(si.label || 'Envoi ' + n)}</span> <button class="btn sm" style="padding:1px 7px;font-size:12px" title="Voir le mail" onclick="schedTpl(${n - 1})">👁</button>`; };
  const nameCell = x => `<b>${esc(x.name || x.email)}</b>${x.name ? '<br><small class="hint">' + esc(x.email) + '</small>' : ''}`;
  let html = '', lastDay = '';
  const dayRow = iso => { const dd = schDay(iso); if (dd !== lastDay) { lastDay = dd; html += `<tr class="sr-day"><td colspan="4">${dd.charAt(0).toUpperCase() + dd.slice(1)}</td></tr>`; } };
  for (const x of sent) {
    dayRow(x.at);
    const bad = x.status === 'error';
    html += `<tr class="${bad ? 'sr-err' : 'sr-sent'} ${justSent.has(keyOf(x.email, x.step)) ? 'sr-flash' : ''}"><td>${bad ? '<span class="pill bad">⚠ Erreur</span>' : '<span class="pill ok">✓ Envoyé</span>'}</td><td>${schHMS(x.at)}</td><td>${nameCell(x)}${bad ? '<br><small style="color:var(--bad)">' + esc(x.error) + '</small>' : ''}</td><td>${stepCell(x.step)}</td></tr>`;
  }
  if (f === 'all' || f === 'planned') html += `<tr class="sr-now"><td colspan="4">▼ Maintenant · ${plan.length || d.totalPlanned ? d.totalPlanned + ' mail(s) à venir' : 'rien à venir'}</td></tr>`;
  lastDay = '';
  for (const x of plan) {
    if (x.at) dayRow(x.at);
    html += `<tr><td><span class="pill blue">⏰ Programmé</span></td><td>${x.at ? '<b>' + schHM(x.at) + '</b>' : '<span class="hint">' + (x.late ? 'hors période' : d.status === 'paused' ? 'campagne en pause' : 'non planifié') + '</span>'}</td><td>${nameCell(x)}</td><td>${stepCell(x.step)}</td></tr>`;
  }
  if (!sent.length && !plan.length) html = `<tr><td colspan="4" class="empty" style="padding:24px">Aucun mail à afficher.</td></tr>`;
  $('#sch_body').innerHTML = html;
  $('#sch_more').innerHTML = (hiddenOld ? `<a href="#" onclick="sch.showOld=true;schedDraw();return false">Afficher les ${hiddenOld} envois précédents</a> · ` : '') + (planCut ? `${planCut} mail(s) prévus plus tard non affichés (affinez avec la recherche)` : '') + (d.truncated ? ' · liste tronquée à 5000' : '');
  sch.prev = sentKeys;
}

async function schedTpl(i) {
  const d = sch && sch.data; const si = d && d.stepsInfo && d.stepsInfo[i]; if (!si) return;
  const t = S.templates.find(x => x.id === si.templateId);
  let html = '<p class="hint">Template introuvable.</p>';
  if (t) { try { const r = await api('POST', '/render', { template: t }); html = `<p class="hint" style="margin:0 0 8px">Objet : <b>${esc(r.subject)}</b></p><iframe style="width:100%;height:520px;border:1px solid var(--line);border-radius:10px;background:#fff" srcdoc="${esc(r.html)}"></iframe>`; } catch (e) { html = '<p class="hint">Aperçu indisponible.</p>'; } }
  modal(`<h2>${esc(si.label)} — ${esc(si.tpl)}</h2>${html}<div class="row" style="margin-top:14px"><button class="btn" onclick="closeModal()">Fermer</button></div>`);
}

// ================= SMS (Brevo) =================
const SMS_GSM = new Set([...'@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !"#¤%&\'()*+,-./0123456789:;<=>?¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà']);
const SMS_EXT = new Set([...'^{}\\[~]|€']);
function smsInfo(text) { // 1 SMS = 160 car. (alphabet GSM) ou 70 si un caractère spécial (ê, î, ’, emoji…) ; message vide = 0 SMS
  const t = String(text); let n = 0, uni = false;
  for (const ch of t) { if (SMS_GSM.has(ch)) n++; else if (SMS_EXT.has(ch)) n += 2; else uni = true; }
  if (uni) n = t.length;   // en Unicode chaque caractère compte 1 (un émoji compte 2)
  const max = uni ? 70 : 160, per = uni ? 67 : 153;   // au-delà d'un SMS, chaque morceau en porte un peu moins (153 / 67) à cause de l'en-tête de découpage
  return { len: n, unicode: uni, max, per, segments: !n ? 0 : n <= max ? 1 : Math.ceil(n / per) };
}
// Le SMS réellement envoyé dépend du prénom / nom de chaque personne ({{prenom}}) : on compte sur le PIRE cas de la liste (prénom le plus long),
// pour que « 160 » soit une garantie pour tous les destinataires. Sans liste, on suppose un prénom de 8 lettres.
function smsWorst() {
  const base = sms.msg, good = sms.rows.filter(r => r.ok);
  const vars = /\{\{\s*(prenom|nom)\s*\}\}/i.test(base);
  const texts = vars ? (good.length ? good.map(r => smsFill(base, r)) : [smsFill(base, { firstName: 'Mohammed', lastName: 'Dupont' })]) : [smsFill(base, {})];
  let worst = null; for (const t of texts) { const i = smsInfo(t); if (!worst || i.len > worst.info.len || (i.unicode && !worst.info.unicode)) worst = { text: t, info: i }; }
  return { ...worst, vars, listed: good.length };
}
function smsPhone(p) {
  let s = String(p || '').trim().replace(/[\s.\-()]/g, '');
  const intl = /^(\+|00)/.test(s);
  s = s.replace(/^(\+|00)/, '');
  if (!/^\d+$/.test(s)) return '';
  if (!intl && /^0\d{9}$/.test(s)) return '33' + s.slice(1);
  if (/^33\d{9}$/.test(s)) return s;
  return intl && s.length >= 8 && s.length <= 15 ? s : '';
}
const smsFill = (t, r) => {   // remplace {{prenom}} / {{nom}} ; le texte est envoyé tel quel (même espace avant « ! » ou « ? »), sauf si une variable est vide : alors on nettoie « Bonjour , »
  let vide = false; const rep = v => { const x = (v || '').trim(); if (!x) vide = true; return x; };
  let o = String(t).replace(/\{\{\s*prenom\s*\}\}/gi, () => rep(r.firstName)).replace(/\{\{\s*nom\s*\}\}/gi, () => rep(r.lastName));
  if (vide) o = o.replace(/[ \t]{2,}/g, ' ').replace(/\s+([,.!?])/g, '$1');
  return o.trim();
};
function smsNoUnicode(t) { // remplace ’ « » … œ et retire les accents que l'alphabet SMS ne connaît pas (ê→e, ô→o…)
  const map = { '’': "'", '‘': "'", '“': '"', '”': '"', '«': '"', '»': '"', '–': '-', '—': '-', '…': '...', 'œ': 'oe', 'Œ': 'OE', ' ': ' ', ' ': ' ' };
  return [...t].map(ch => { if (SMS_GSM.has(ch) || SMS_EXT.has(ch)) return ch; if (map[ch] !== undefined) return map[ch]; const b = ch.normalize('NFD').replace(/[̀-ͯ]/g, ''); return SMS_GSM.has(b) ? b : ch; }).join('');
}

const sms = { rows: [], msg: '', sender: 'Emounateha', credits: null, perSms: 4.5, err: '', timer: null, busy: false, result: null, tag: '' };
function smsParse(text) { // CSV/collage : Prénom;Nom;Téléphone (avec ou sans ligne d'en-tête)
  const lines = String(text || '').replace(/^﻿/, '').split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  const split = l => l.split(/[;,\t]/).map(x => x.trim().replace(/^"|"$/g, ''));
  let cols = { fn: -1, ln: -1, ph: -1 };
  if (lines.length && !/\d{8}/.test(lines[0].replace(/[\s.\-]/g, ''))) {
    split(lines.shift()).forEach((h, i) => { h = h.toLowerCase(); if (/t[ée]l|phone|mobile|portable|gsm|num/.test(h)) cols.ph = i; else if (/pr[ée]nom|first/.test(h)) cols.fn = i; else if (/^nom|last|famil/.test(h)) cols.ln = i; });
  }
  const seen = new Set();
  return lines.map(l => {
    const c = split(l);
    const raw = cols.ph >= 0 ? c[cols.ph] : c.find(x => smsPhone(x)) || '';
    const phone = smsPhone(raw);
    const rest = c.filter(x => x !== raw);
    const firstName = cols.fn >= 0 ? c[cols.fn] || '' : rest[0] || '';
    const lastName = cols.ln >= 0 ? c[cols.ln] || '' : rest[1] || '';
    const dup = phone && seen.has(phone); if (phone) seen.add(phone);
    return { firstName, lastName, raw, phone, ok: !!phone && !dup, why: !phone ? 'numéro invalide' : dup ? 'doublon' : '' };
  });
}
function smsSetRows(rows) { sms.rows = rows; sms.result = null; smsDraw(); }
function smsLoadCsv() { smsSetRows(smsParse($('#sms_csv').value)); }
function smsFromContacts() {
  const tag = ($('#sms_tag').value || '').trim().toLowerCase(); sms.tag = tag;
  const list = (S.contacts || []).filter(c => c.phone && c.status === 'active' && (!tag || (c.tags || []).some(t => t.toLowerCase() === tag)));
  smsSetRows(smsParse(list.map(c => [c.firstName, c.lastName, c.phone].join(';')).join('\n')));
}
function smsStats() {
  const msg = sms.msg;
  const good = sms.rows.filter(r => r.ok);
  good.forEach(r => { r.text = smsFill(msg, r); r.info = smsInfo(r.text); r.over = r.info.segments !== 1; });
  const sendable = msg.trim() ? good.filter(r => !r.over) : [];
  return { good, sendable, over: good.length - sendable.length, bad: sms.rows.length - good.length };
}
function smsDraw() {
  const box = $('#sms_body'); if (!box) return;
  const st = smsStats();
  const W = smsWorst(), info = W.info;
  const sample = (st.good[0] && st.good[0].text) || sms.msg;
  const cost = st.sendable.length * sms.perSms;
  const after = sms.credits == null ? null : sms.credits - cost;
  const reste = info.max - info.len;
  // Quels caractères imposent le mode Unicode (70 par SMS au lieu de 160) ? On les nomme, et on montre le résultat une fois corrigés.
  let why = '';
  if (info.unicode) {
    const bad = [...new Set([...W.text].filter(ch => !SMS_GSM.has(ch) && !SMS_EXT.has(ch)))], fixed = smsInfo(smsNoUnicode(W.text)), still = fixed.unicode;
    why = `<div style="margin-top:6px;padding:9px 11px;border-radius:10px;background:#fff4d6;border:1px solid #ecd9a0;font-size:13px;line-height:1.5"><b>Pourquoi ${info.segments > 1 ? info.segments + ' SMS' : 'seulement 70 caractères'} ?</b> Votre message contient ${bad.map(c => '<b>« ' + esc(c) + ' »</b>').join(', ')} : ${bad.length > 1 ? 'ces caractères ne font' : 'ce caractère ne fait'} pas partie de l’alphabet SMS standard. L’envoi passe alors en mode « Unicode » : un SMS ne peut contenir que <b>70 caractères</b> (au lieu de 160).<br>`
      + (still ? 'Certains caractères (émoji…) ne peuvent pas être remplacés automatiquement : retirez-les à la main.' : `<button type="button" class="btn sm pri" style="margin-top:6px" onclick="smsClean()">Corriger automatiquement</button> <span style="color:#33555b">→ après correction : <b>${fixed.len} / ${fixed.max}</b> · ${fixed.segments} SMS</span>`) + '</div>';
  }
  $('#sms_count').innerHTML = info.segments === 0 ? '<b>0 / 160</b> caractères <span style="color:var(--mut)">· saisissez votre message</span>'
    : info.segments === 1 ? `<b>${info.len} / ${info.max}</b> caractères · 1 SMS · <span style="color:${reste < 10 ? '#b26a00' : 'var(--mut)'}">il reste ${reste}</span>`
    : `<b style="color:#b3261e">${info.len} caractères</b> · <b style="color:#b3261e">${info.segments} SMS</b> <span style="color:#b3261e">· maximum ${info.max} pour 1 SMS : retirez ${info.len - info.max} caractère${info.len - info.max > 1 ? 's' : ''}</span>`;
  $('#sms_count').innerHTML += why;
  if (W.vars && info.segments) $('#sms_count').innerHTML += `<div style="font-size:12px;color:var(--mut);margin-top:2px">{{prenom}} / {{nom}} comptés sur le plus long de ${W.listed ? 'la liste (' + W.listed + ' personne' + (W.listed > 1 ? 's' : '') + ')' : 'prénom supposé de 8 lettres (chargez la liste pour un calcul exact)'}</div>`;
  $('#sms_hint').innerHTML = info.unicode ? 'Un caractère spécial (accent comme ê/î/ô/â, apostrophe ’, « », émoji) fait tomber la limite de 160 à 70. <a href="#" onclick="smsClean();return false">Remplacer automatiquement</a>' : 'Alphabet SMS standard : 160 caractères par SMS. Autorisés : é è ù à É ä ö ü ñ. Non autorisés (passent en Unicode, 70 max) : ê â î ô û ç ë ï œ, apostrophe courbe ’, « », émojis.';
  $('#sms_prev').textContent = sample || 'Votre message apparaîtra ici.';
  $('#sms_sum').innerHTML = sms.rows.length
    ? `<b>${st.good.length}</b> numéro(s) valide(s)${st.bad ? ` · <span style="color:#b3261e">${st.bad} ignoré(s) (invalide ou doublon)</span>` : ''}${st.over ? ` · <span style="color:#b3261e">${st.over} message(s) dépassent un SMS</span>` : ''}`
    : '<span style="color:var(--mut)">Aucun destinataire chargé.</span>';
  $('#sms_cost').innerHTML = `<b>${st.sendable.length}</b> SMS × ${String(sms.perSms).replace('.', ',')} crédits = <b>${String(Math.round(cost * 10) / 10).replace('.', ',')}</b> crédits${after != null ? ` · il restera <b style="color:${after < 0 ? '#b3261e' : 'inherit'}">${String(Math.round(after * 10) / 10).replace('.', ',')}</b>` : ''}`;
  const b = $('#sms_go'); if (b) { b.disabled = sms.busy || !st.sendable.length || (after != null && after < 0); b.textContent = `Envoyer à ${st.sendable.length} personne${st.sendable.length > 1 ? 's' : ''}`; }
  const t = $('#sms_tbtn'); if (t) t.disabled = sms.busy;
  const list = sms.rows.slice(0, 60).map(r => `<tr${r.ok && !r.over ? '' : ' style="opacity:.55"'}><td>${esc(r.firstName)} ${esc(r.lastName)}</td><td>${esc(r.phone ? '+' + r.phone : r.raw)}</td><td>${r.ok ? (r.over ? '<span class="pill bad">trop long</span>' : '<span class="pill ok">OK</span>') : `<span class="pill bad">${esc(r.why)}</span>`}</td></tr>`).join('');
  $('#sms_list').innerHTML = sms.rows.length ? `<table><thead><tr><th>Nom</th><th>Numéro</th><th></th></tr></thead><tbody>${list}</tbody></table>${sms.rows.length > 60 ? `<p class="hint" style="padding:8px 14px">… et ${sms.rows.length - 60} autres</p>` : ''}` : '';
  const r = sms.result;
  $('#sms_res').innerHTML = r ? `<div class="card" style="margin-top:14px"><h3 style="margin:0 0 6px">${r.done ? 'Envoi terminé' : 'Envoi en cours…'}</h3><div class="bar" style="margin:6px 0"><i style="width:${Math.round(r.total ? r.pos / r.total * 100 : 0)}%"></i></div><p>${r.sent} envoyé(s) · ${r.failed.length} échec(s) · ${String(Math.round(r.used * 10) / 10).replace('.', ',')} crédits utilisés</p>${r.failed.length ? `<details><summary>Voir les échecs</summary><ul>${r.failed.slice(0, 50).map(f => `<li>${esc(f.phone)} — ${esc(f.error)}</li>`).join('')}</ul></details>` : ''}${r.deliv ? `<p style="margin:8px 0 0;padding:9px 11px;border-radius:10px;font-weight:600;background:${r.deliv.state === 'delivered' ? '#e3f4e8' : r.deliv.state === 'failed' ? '#fde8e6' : '#fff4d6'};color:${r.deliv.state === 'delivered' ? '#1b6b3a' : r.deliv.state === 'failed' ? '#b3261e' : '#7a5f14'}">${esc(r.deliv.text)}${r.deliv.state === 'failed' ? '<br><small style="font-weight:400">Brevo a bien envoyé le SMS : c’est l’opérateur du destinataire qui l’a refusé. Essayez un autre numéro, ou un message sans lien (emounateha.fr) pour comparer.</small>' : ''}</p>` : ''}</div>` : '';
}
// Brevo « accepte » un SMS tout de suite ; c'est ensuite l'opérateur qui le livre (ou le refuse). On suit donc l'état réel pendant ~90 s.
async function smsWatch(phones, since) {
  const r0 = sms.result; if (!r0) return; r0.deliv = { state: 'pending', text: 'Envoyé à Brevo, en attente de l’opérateur…' }; smsDraw();
  for (let k = 0; k < 15; k++) {
    await new Promise(res => setTimeout(res, 6000));
    if (sms.result !== r0) return;
    try {
      const j = await api('GET', '/sms/status?phones=' + phones.join(',') + '&since=' + since), ms = j.messages || [];
      if (!ms.length) continue;
      const bad = ms.filter(x => x.state === 'failed'), ok = ms.filter(x => x.state === 'delivered');
      if (bad.length) { r0.deliv = { state: 'failed', text: '✖ Non livré par l’opérateur : ' + (bad[0].reason || bad[0].event) + ' (' + bad[0].event + ')' }; smsDraw(); return; }
      if (ok.length === ms.length) { r0.deliv = { state: 'delivered', text: '✔ Livré sur le téléphone' }; smsDraw(); return; }
    } catch (e) { /* on réessaie */ }
  }
  r0.deliv = { state: 'pending', text: 'Toujours en attente chez l’opérateur (peut arriver avec du retard). Vérifiez dans Brevo → SMS → Statistiques.' }; smsDraw();
}
function smsClean() { const t = $('#sms_msg'); t.value = smsNoUnicode(t.value); sms.msg = t.value; smsDraw(); }
function smsCredDraw() {
  const el = $('#sms_cr'); if (!el) return;
  el.innerHTML = sms.err ? `<span class="pill bad" title="${esc(sms.err)}">Crédits indisponibles</span>` : sms.credits == null ? '<span class="pill">Crédits SMS…</span>' : `<span class="pill ok" style="font-size:14px">● ${Math.floor(sms.credits).toLocaleString('fr-FR')} crédits SMS</span><div style="font-size:11px;color:var(--mut);margin-top:3px">≈ ${Math.floor(sms.credits / sms.perSms).toLocaleString('fr-FR')} SMS · mis à jour ${new Date().toLocaleTimeString('fr-FR')}</div>`;
  if (sms.err) { const e = $('#sms_err'); if (e) e.textContent = sms.err; }
}
async function smsCredits() {
  try { const r = await api('GET', '/sms/credits'); sms.credits = r.credits; sms.perSms = r.perSms || sms.perSms; sms.err = ''; }
  catch (e) { sms.err = e.message; }
  smsCredDraw(); smsDraw();
}
function smsStop() { if (sms.timer) clearInterval(sms.timer); sms.timer = null; }
function smsInit() {
  smsStop(); smsCredDraw(); smsDraw(); smsCredits();
  sms.timer = setInterval(() => { if (!document.hidden && !sms.busy) smsCredits(); }, 15000);
}
async function smsSend(test) {
  const st = smsStats();
  let rows;
  if (test) {
    if (!sms.msg.trim()) return toast('Écrivez d\'abord votre message (étape 2)', true);
    const p = smsPhone($('#sms_test').value); if (!p) return toast('Numéro de test invalide : chiffres uniquement, ex. 06 12 34 56 78', true);
    rows = [{ phone: p, firstName: (sms.rows[0] && sms.rows[0].firstName) || 'Test', lastName: '' }];
    const i = smsInfo(smsFill(sms.msg, rows[0])); if (i.segments !== 1) return toast('Message trop long pour 1 SMS', true);
    if (!confirm(`Envoyer ce SMS de test à +${p} ?\n(≈ ${sms.perSms} crédits)`)) return;
  } else {
    rows = st.sendable.map(r => ({ phone: r.phone, firstName: r.firstName, lastName: r.lastName }));
    if (!rows.length) return;
    const tot = Math.round(rows.length * sms.perSms * 10) / 10;
    if (!confirm(`Envoyer ce SMS à ${rows.length} personne(s) ?\n\n« ${st.sendable[0].text} »\n\nCoût estimé : ${tot} crédits.\nL'envoi est définitif.`)) return;
  }
  sms.busy = true; sms.result = { total: rows.length, pos: 0, sent: 0, failed: [], used: 0, done: false }; smsDraw();
  try {
    for (let i = 0; i < rows.length; i += 25) {
      const r = await api('POST', '/sms/send', { message: sms.msg, sender: sms.sender, recipients: rows.slice(i, i + 25), type: test ? 'transactional' : 'marketing' });
      sms.result.sent += r.sent; sms.result.used += r.used || 0; sms.result.failed.push(...r.failed); sms.result.pos = Math.min(rows.length, i + 25);
      if (r.remaining != null) sms.credits = r.remaining;
      if (r.perSms) sms.perSms = r.perSms;
      smsCredDraw(); smsDraw();
      if (r.failed.some(f => !f.phone)) break; // Brevo a stoppé l'envoi (crédits…)
    }
  } catch (e) { sms.result.failed.push({ phone: '', error: e.message }); toast(e.message, true); }
  sms.result.done = true; sms.busy = false; smsDraw(); smsCredits();
  if (!sms.result.failed.length) toast(`${sms.result.sent} SMS envoyé(s)`);
  if (test && sms.result.sent) smsWatch(rows.map(x => x.phone), Date.now() - 20000);   // suivre la livraison réelle chez l'opérateur
}
views.sms = () => `
  <div class="head"><div><h1>Campagne SMS</h1><p class="sub">Envoyez un SMS à une liste importée (CSV) ou à vos contacts, via Brevo</p></div><div id="sms_cr" style="text-align:right"></div></div>
  <p id="sms_err" class="hint" style="color:#b3261e"></p>
  <div id="sms_body">
  <div class="card"><h3 style="margin-top:0">1. Destinataires</h3>
    <p class="hint">Une ligne par personne : <code>Prénom;Nom;Téléphone</code> (ou seulement le numéro). Les 06/07… sont convertis en +33 ; les doublons sont retirés.</p>
    <label>Fichier CSV</label><input type="file" accept=".csv,.txt,.tsv" onchange="readFile(this,'sms_csv');setTimeout(smsLoadCsv,300)">
    <label>Ou coller la liste</label><textarea id="sms_csv" rows="5" placeholder="David;Cohen;06 12 34 56 78&#10;07 83 25 91 57" oninput="smsLoadCsv()"></textarea>
    <div class="row" style="margin-top:10px;gap:8px;align-items:center"><span class="hint" style="margin:0">ou</span><input id="sms_tag" placeholder="tag (facultatif)" value="${esc(sms.tag)}" style="width:160px"><button class="btn" onclick="smsFromContacts()">Utiliser mes contacts avec téléphone</button></div>
    <p id="sms_sum" style="margin:12px 0 0"></p>
    <div id="sms_list" style="margin-top:8px;max-height:260px;overflow:auto"></div>
  </div>
  <div class="card" style="margin-top:14px"><h3 style="margin-top:0">2. Message</h3>
    <textarea id="sms_msg" rows="4" placeholder="Bonjour {{prenom}}, Émounatéha vous souhaite…" oninput="sms.msg=this.value;smsDraw()">${esc(sms.msg)}</textarea>
    <div class="row" style="justify-content:space-between;margin-top:6px"><span id="sms_count"></span><span><button class="btn sm" onclick="const t=$('#sms_msg');t.value+='{{prenom}}';sms.msg=t.value;smsDraw()">+ {{prenom}}</button></span></div>
    <p id="sms_hint" class="hint"></p>
    <label>Expéditeur (11 caractères max, sans espace)</label><input id="sms_sender" maxlength="11" value="${esc(sms.sender)}" style="width:180px" oninput="sms.sender=this.value">
    <label>Aperçu</label><div id="sms_prev" style="background:#f1f3f4;border-radius:14px;padding:12px 14px;max-width:360px;white-space:pre-wrap"></div>
    <p class="hint" style="margin-top:12px">Rappel légal : envoi de 8 h à 22 h (heure de Paris), uniquement à des personnes qui ont accepté d'être contactées. Pensez à une mention de désinscription.</p>
  </div>
  <div class="card" style="margin-top:14px"><h3 style="margin-top:0">3. Envoi</h3>
    <p id="sms_cost"></p>
    <div class="row" style="gap:8px;align-items:center;flex-wrap:wrap"><button id="sms_go" class="btn pri" onclick="smsSend(false)" disabled>Envoyer</button>
      <span style="color:var(--mut);margin:0 6px">ou un test :</span><input id="sms_test" placeholder="06 12 34 56 78" style="width:160px"><button id="sms_tbtn" class="btn" onclick="smsSend(true)">Envoyer un test</button></div>
    <div id="sms_res"></div>
  </div></div>`;


// ================= CERFA : liste + reçus manuels =================
let CF = { recus: [], modes: ['Virement bancaire', 'Chèque', 'Espèces'], affs: [] };
const eurC = c => (c / 100).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
async function cerfaSupprTests() {
  const tests = CF.recus.filter(r => /^TEST-/i.test(r.numero || ''));
  if (!tests.length) return toast('Aucun reçu de test');
  if (!confirm('Supprimer définitivement ' + tests.length + ' reçu(s) de test (' + tests.map(r => r.numero).join(', ') + ') ? Les dons réels ne sont jamais touchés.')) return;
  try { const r = await api('POST', '/cerfa/supprimer', {}); toast((r.supprimes || []).length + ' reçu(s) de test supprimé(s)'); await cerfaInit(); }
  catch (e) { toast('Suppression impossible : ' + e.message, true); }
}
async function cerfaInit() {
  try { const [l, c] = await Promise.all([api('GET', '/cerfa'), api('GET', '/cerfa/config').catch(() => ({ affectations: [] }))]); CF.recus = l.recus || []; if (l.modes) CF.modes = l.modes; CF.affs = (c.affectations || []).map(a => a.label); }
  catch (e) { $('#cerfaTab').innerHTML = '<p class="hint">Impossible de lire les reçus : ' + esc(e.message) + '</p>'; return; }
  { const bt = $('#cfTests'); if (bt) bt.style.display = CF.recus.some(r => /^TEST-/i.test(r.numero || '')) ? '' : 'none'; }
  cerfaList();
}
function cerfaList() {
  const f = ($('#cfFiltre') || {}).value || '', q = (($('#cfQ') || {}).value || '').toLowerCase();
  const l = CF.recus.filter(r => (!f || r.source === f) && (!q || (r.nom + ' ' + r.numero + ' ' + (r.email || '')).toLowerCase().includes(q)));
  const tot = l.reduce((t, r) => t + (r.montant || 0), 0);
  $('#cerfaTab').innerHTML = !l.length ? '<p class="hint">Aucun reçu pour le moment.</p>' : `<div class="hint" style="margin-bottom:8px">${l.length} reçu(s) · total ${eurC(tot)}</div>
    <div style="overflow-x:auto"><table class="tbl"><thead><tr><th>N°</th><th>Date</th><th>Donateur</th><th>Montant</th><th>Mode</th><th>Origine</th><th>E-mail</th><th></th></tr></thead><tbody>
    ${l.map(r => `<tr><td><b>${esc(r.numero)}</b></td><td>${esc(new Date(r.dateDon).toLocaleDateString('fr-FR'))}</td><td>${esc(r.nom)}<div class="hint">${esc(r.type === 'entreprise' ? 'Professionnel' : 'Particulier')}${r.email ? ' · ' + esc(r.email) : ''}${r.tel ? ' · ' + esc(r.tel) : ''}</div></td>
      <td>${eurC(r.montant)}</td><td>${esc(String(r.mode || '').split(' — ')[0])}</td><td><span class="pill ${r.source === 'manuel' ? 'warn' : 'ok'}">${esc(r.source)}</span></td><td>${r.emailEnvoye ? '✓ envoyé' : '—'}</td>
      <td><a class="btn" href="/api/cerfa/pdf?f=${encodeURIComponent(r.file)}" target="_blank" rel="noopener">PDF</a></td></tr>`).join('')}</tbody></table></div>`;
}
function cerfaForm() {
  cfT = 'particulier';
  const today = new Date().toISOString().slice(0, 10);
  $('#cerfaNew').innerHTML = `<div class="card" style="margin-bottom:16px"><div class="row" style="align-items:center"><b class="grow">Nouveau reçu manuel</b><button class="btn" onclick="$('#cerfaNew').innerHTML=''">Fermer</button></div>
    <div class="cf-seg" role="group" aria-label="Type de donateur"><button type="button" class="on" data-t="particulier" onclick="cfType('particulier')">👤 Particulier</button><button type="button" data-t="entreprise" onclick="cfType('entreprise')">🏢 Professionnel</button></div>
    <div id="cfPro" style="display:none"><label>Numéro SIRET (ou SIREN) — tout se remplit tout seul</label><input id="cf_siret" inputmode="numeric" placeholder="14 chiffres" oninput="cfSiret()"><div class="hint" id="cfSiretMsg"></div>
      <div class="row"><div class="grow"><label>Raison sociale</label><input id="cf_rs"></div><div class="grow"><label>SIREN</label><input id="cf_siren" inputmode="numeric"></div></div></div>
    <div class="row" id="cfPart"><div class="grow"><label>Prénom</label><input id="cf_prenom"></div><div class="grow"><label>Nom</label><input id="cf_nom"></div></div>
    <div class="row"><div class="grow"><label>E-mail</label><input id="cf_email" type="email"></div><div class="grow"><label>Téléphone</label><input id="cf_tel" inputmode="tel"></div></div>
    <label>Adresse</label><input id="cf_adr">
    <div class="row"><div class="grow"><label>Code postal</label><input id="cf_cp" inputmode="numeric" maxlength="5"></div><div class="grow"><label>Ville</label><input id="cf_ville"></div></div>
    <div class="row"><div class="grow"><label>Montant (€)</label><input id="cf_montant" inputmode="decimal" placeholder="ex. 180"></div><div class="grow"><label>Date du don</label><input id="cf_date" type="date" value="${today}" max="${today}"></div>
      <div class="grow"><label>Mode de versement</label><select id="cf_mode">${CF.modes.map(m => `<option>${esc(m)}</option>`).join('')}</select></div></div>
    <label style="display:flex;gap:8px;align-items:center;margin-top:12px"><input id="cf_env" type="checkbox" checked style="width:auto"> Envoyer le reçu par e-mail au donateur</label>
    <div class="row" style="margin-top:12px"><span class="grow hint" id="cfMsg"></span><button class="btn pri" id="cfGo" onclick="cerfaCreate()">Générer le reçu (PDF)</button></div></div>`;
  $('#cerfaNew').scrollIntoView({ behavior: 'smooth' });
}
let cfT = 'particulier';
function cfType(t) { cfT = t; const pro = t === 'entreprise'; document.querySelectorAll('.cf-seg button').forEach(b => b.classList.toggle('on', b.dataset.t === t)); $('#cfPro').style.display = pro ? '' : 'none'; $('#cfPart').style.display = pro ? 'none' : ''; }
let cfSeq = 0;
async function cfSiret() {
  const q = $('#cf_siret').value.replace(/\s/g, ''), m = $('#cfSiretMsg'), n = ++cfSeq; m.textContent = '';
  if (!/^(\d{9}|\d{14})$/.test(q)) return;
  m.textContent = 'Recherche…';
  try { const j = await api('GET', '/cerfa/siret?q=' + q); if (n !== cfSeq) return; $('#cf_rs').value = j.nom || ''; $('#cf_siren').value = j.siren || ''; if (j.adresse) $('#cf_adr').value = j.adresse; if (j.cp) $('#cf_cp').value = j.cp; if (j.ville) $('#cf_ville').value = j.ville; m.textContent = '✓ ' + (j.nom || '') + ' — vérifiez et modifiez si besoin.'; }
  catch (e) { if (n === cfSeq) m.textContent = e.message + ' — remplissez à la main.'; }
}
async function cerfaCreate() {
  const pro = cfT === 'entreprise', v = id => ($('#' + id).value || '').trim();
  const b = { type: pro ? 'entreprise' : 'particulier', prenom: v('cf_prenom'), nom: v('cf_nom'), raisonSociale: v('cf_rs'), siren: v('cf_siren'), email: v('cf_email'), tel: v('cf_tel'), adresse: v('cf_adr'), cp: v('cf_cp'), ville: v('cf_ville'), montant: v('cf_montant'), dateDon: v('cf_date'), mode: v('cf_mode'), envoyerEmail: $('#cf_env').checked };
  $('#cfGo').disabled = true; $('#cfMsg').textContent = 'Fabrication du reçu… (quelques secondes)';
  try {
    const r = await api('POST', '/cerfa', b);
    toast('Reçu ' + r.numero + ' créé' + (r.email && r.email.sent ? ' et envoyé par e-mail' : ''));
    window.open('/api/cerfa/pdf?f=' + encodeURIComponent(r.file), '_blank');
    $('#cerfaNew').innerHTML = ''; await cerfaInit();
  } catch (e) { $('#cfMsg').textContent = e.message; toast(e.message, true); }
  finally { const g = $('#cfGo'); if (g) g.disabled = false; }
}


// ---------- Trafic : visiteurs uniques par jour et par page, et visiteurs en direct ----------
// Données réelles, mesurées par /vu.js sur chaque page (sans cookie). Rafraîchi tout seul toutes les 15 s.
var TF = { jours: 30, timer: null, data: null };
function traficStop() { if (TF.timer) clearInterval(TF.timer); TF.timer = null; }
function traficJours(n) { TF.jours = n; document.querySelectorAll('#tfSeg button').forEach(b => b.classList.toggle('on', +b.dataset.j === n)); traficLoad(); }
function traficInit() { traficStop(); traficLoad(); TF.timer = setInterval(() => { if (!document.hidden) traficLoad(true); }, 15000); }
async function traficLoad(silencieux) {
  try { TF.data = await api('GET', '/trafic?jours=' + TF.jours); traficDraw(); }
  catch (e) { if (!silencieux && $('#tfBody')) $('#tfBody').innerHTML = `<div class="card">Impossible de charger le trafic : ${esc(e.message)}</div>`; }
}
const tfNb = n => Number(n || 0).toLocaleString('fr-FR');
const tfPage = r => (r.site === 'www.emounateha.fr' ? '' : r.site.replace('.emounateha.fr', '') + ' · ') + (r.path === '/' ? (r.site === 'don.emounateha.fr' ? 'Page de don' : 'Accueil') : r.path);
const tfLien = r => 'https://' + r.site + r.path;
const tfJour = (d, long) => new Date(d + 'T12:00:00').toLocaleDateString('fr-FR', long ? { weekday: 'long', day: 'numeric', month: 'long' } : { day: 'numeric', month: 'short' });
function traficDraw() {
  const el = $('#tfBody'), d = TF.data; if (!el || !d) return;
  const max = Math.max(1, ...d.serie.map(x => x.u)), haut = [max, Math.round(max / 2)];
  const pas = Math.ceil(d.serie.length / 8);
  const barres = d.serie.map((x, i) => `<div class="tf-col" data-i="${i}" tabindex="0" aria-label="${esc(tfJour(x.day, true))} : ${x.u} visiteurs uniques, ${x.v} pages vues"><i style="height:${x.u ? Math.max(2, x.u / max * 100) : 0}%"></i></div>`).join('');
  const axe = d.serie.map((x, i) => `<span>${(i % pas === 0 && d.serie.length - 1 - i >= pas / 2) || i === d.serie.length - 1 ? esc(tfJour(x.day)) : ''}</span>`).join('');
  const rang = (rows, total, lab) => rows.length ? rows.map(r => `<div class="tf-rk"><div class="l"><span>${lab(r)}</span><b>${tfNb(r.u)}</b></div><div class="tf-rb"><i style="width:${Math.max(2, r.u / Math.max(1, total) * 100)}%"></i></div></div>`).join('') : '<div class="hint">Pas encore de données sur cette période.</div>';
  const totSrc = d.sources.reduce((t, r) => t + r.u, 0), totApp = d.appareils.reduce((t, r) => t + r.u, 0);
  const periodeTxt = d.jours === 1 ? "aujourd'hui" : 'sur ' + d.jours + ' jours';
  el.innerHTML = `
    <div class="grid g4">
      <div class="card stat"><small><span class="tf-dot${d.enDirect ? ' on' : ''}"></span>En ce moment sur le site</small><b>${tfNb(d.enDirect)}</b><em>${d.enDirect > 1 ? 'personnes connectées' : d.enDirect === 1 ? 'personne connectée' : 'personne pour l\'instant'}</em></div>
      <div class="card stat"><small>Visiteurs uniques aujourd'hui</small><b>${tfNb(d.aujourdhui.u)}</b><em>${tfNb(d.aujourdhui.v)} pages vues</em></div>
      <div class="card stat"><small>Visiteurs uniques hier</small><b>${tfNb(d.hier.u)}</b><em>${tfNb(d.hier.v)} pages vues</em></div>
      <div class="card stat"><small>Visites ${periodeTxt}</small><b>${tfNb(d.periode.u)}</b><em>${tfNb(d.periode.v)} pages vues · ${d.jours > 1 ? Math.round(d.periode.u / d.jours) + ' visiteurs par jour en moyenne' : 'visiteurs uniques'}</em></div>
    </div>
    <div class="card" style="margin-top:16px"><div class="row" style="align-items:center"><b class="grow">En direct : qui est sur quelle page</b><span class="hint" style="margin:0">mis à jour à ${new Date(d.maj).toLocaleTimeString('fr-FR')}</span></div>
      ${d.live.length ? `<div class="tf-live">${d.live.map(r => `<a href="${esc(tfLien(r))}" target="_blank" rel="noopener"><span class="tf-dot on"></span><span class="p">${esc(tfPage(r))}</span><b>${r.n}</b></a>`).join('')}</div>` : '<div class="hint" style="margin-top:10px">Personne sur le site en ce moment.</div>'}</div>
    <div class="card" style="margin-top:16px"><b>Visiteurs uniques par jour</b><div class="hint" style="margin-top:2px">${d.serie.length} derniers jours · survolez une barre pour le détail</div>
      <div class="tf-chart"><div class="tf-y"><span>${tfNb(haut[0])}</span><span>${tfNb(haut[1])}</span><span>0</span></div><div class="tf-plot"><div class="tf-bars">${barres}</div><div class="tf-x">${axe}</div><div class="tf-tip" id="tfTip" hidden></div></div></div></div>
    <div class="grid g2" style="margin-top:16px">
      <div class="card" style="padding:0;overflow:hidden"><div style="padding:18px 22px 10px"><b>Pages les plus visitées</b><div class="hint" style="margin-top:2px">${periodeTxt} · visiteurs uniques par jour</div></div>
        ${d.pages.length ? `<div style="overflow-x:auto"><table><thead><tr><th>Page</th><th style="text-align:right">Visiteurs uniques</th><th style="text-align:right">Pages vues</th></tr></thead><tbody>${d.pages.map(r => `<tr><td><a href="${esc(tfLien(r))}" target="_blank" rel="noopener" style="color:var(--brand);font-weight:600;word-break:break-word">${esc(tfPage(r))}</a></td><td style="text-align:right;font-variant-numeric:tabular-nums"><b>${tfNb(r.u)}</b></td><td style="text-align:right;font-variant-numeric:tabular-nums;color:var(--mut)">${tfNb(r.v)}</td></tr>`).join('')}</tbody></table></div>` : '<div class="hint" style="padding:0 22px 20px">Pas encore de visite enregistrée sur cette période.</div>'}</div>
      <div class="card"><b>D'où viennent les visiteurs</b><div class="hint" style="margin:2px 0 12px">${periodeTxt}</div>${rang(d.sources, totSrc, r => esc(r.ref || 'Accès direct (lien tapé, WhatsApp, e-mail…)'))}
        <b style="display:block;margin-top:22px">Appareils</b><div class="hint" style="margin:2px 0 12px">${periodeTxt}</div>${rang(d.appareils, totApp, r => esc(r.device || 'Inconnu'))}</div>
    </div>
    <div class="hint" style="margin-top:14px">Mesure faite par le site lui-même, sans cookie : un visiteur est compté une seule fois par jour, quel que soit le nombre de pages qu'il ouvre. Les robots (Google, aperçus WhatsApp…) ne sont pas comptés. Ni l'adresse IP ni le nom des visiteurs ne sont enregistrés.</div>`;
  const tip = $('#tfTip'), plot = el.querySelector('.tf-plot');
  el.querySelectorAll('.tf-col').forEach(c => {
    const show = () => { const x = d.serie[+c.dataset.i]; tip.innerHTML = `<b>${esc(tfJour(x.day, true))}</b><span>${tfNb(x.u)} visiteur${x.u > 1 ? 's' : ''} unique${x.u > 1 ? 's' : ''}</span><span>${tfNb(x.v)} page${x.v > 1 ? 's' : ''} vue${x.v > 1 ? 's' : ''}</span>`; tip.hidden = false;
      const r = c.getBoundingClientRect(), p = plot.getBoundingClientRect(); tip.style.left = Math.min(Math.max(r.left - p.left + r.width / 2, 80), p.width - 80) + 'px'; };
    c.onmouseenter = show; c.onfocus = show; c.onmouseleave = c.onblur = () => { tip.hidden = true; };
  });
}
