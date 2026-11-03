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
  const [st, dif, usr, hol] = await Promise.all([
    api('GET', '/state'),
    need('diffusion') ? api('GET', '/diffusion').catch(() => []) : Promise.resolve(S?.diffusion || []),
    need('users') ? api('GET', '/users').catch(() => []) : Promise.resolve(S?.users || []),
    load.hol || cached ? Promise.resolve(load.hol || cached) : api('GET', '/holidays?all=1').catch(() => [])
  ]);
  S = st; S.diffusion = dif; S.users = usr;
  load.hol = hol; try { if (hol && hol.length) sessionStorage.hol = JSON.stringify(hol); } catch {}
  S.holidaysAll = load.hol || []; S.holidays = S.holidaysAll.slice(0, 8);
  const { sent, limit } = S.today;
  $('#quota').innerHTML = `Envois aujourd'hui<br><b>${sent}</b> / ${limit}<div class="bar"><i style="width:${Math.min(100, sent / limit * 100)}%"></i></div>`;
}
const fmt = d => new Date(d).toLocaleString('fr-FR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
const statusPill = s => ({ active: '<span class="pill ok">Actif</span>', unsubscribed: '<span class="pill warn">Désinscrit</span>', bounced: '<span class="pill bad">Rebond</span>', converted: '<span class="pill blue">Donateur</span>' }[s] || s);
const campPill = s => ({ scheduled: '<span class="pill blue">⏰ Programmée</span>', draft: '<span class="pill">Brouillon</span>', running: '<span class="pill ok">● En cours</span>', paused: '<span class="pill warn">En pause</span>', done: '<span class="pill blue">Terminée</span>' }[s]);

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
const feteNext = f => { const h = f.re && (S.holidaysAll || []).find(x => f.re.test(x.title)); return h ? new Date(h.date).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' }) : ''; };
const feteDays = f => { const h = f.re && (S.holidaysAll || []).find(x => f.re.test(x.title)); if (!h) return null; return Math.round((new Date(h.date) - new Date(new Date().toDateString())) / 86400000); };
const FETES_SORTED = () => { const key = f => (f.k === 'annee' ? -1 : feteDays(f) ?? 99999); const cls = f => f.g === 'hassid' ? 1 : 0; return [...FETES].sort((x, y) => cls(x) - cls(y) || key(x) - key(y)); };
const feteOfTitle = t => FETES.find(f => f.re && f.re.test(t));
async function openFete(k) {
  let t = S.templates.find(x => x.holiday === k);
  if (!t) {
    const f = FETES.find(x => x.k === k);
    t = await api('POST', '/templates', { holiday: k, name: f.n + ' — appel aux dons', subject: f.subject, preheader: f.pre, title: f.title, body: f.body, buttonText: f.btn, buttonUrl: S.settings.donateUrl || 'https://www.allodons.fr/emounateha', color: '#1f6a72', accent: '#c4a24a' });
    toast('Template « ' + f.n + ' » créé');
  }
  tplId = t.id; tplDraft = null; await render();
}

// ---------- Views ----------
const views = {
  '': () => {
    const running = S.campaigns.filter(c => c.status === 'running').length;
    const totalSent = S.campaigns.reduce((a, c) => a + c.stats.sent, 0);
    const active = S.contacts.filter(c => c.status === 'active').length;
    const pct = Math.min(100, S.today.sent / S.today.limit * 100);
    const q = S.today.queue, left = Math.max(0, S.today.limit - S.today.sent), days = q > left ? 1 + Math.ceil((q - left) / S.today.limit) : (q ? 1 : 0);
    const queueTxt = q ? `${q} mail(s) en attente · fin estimée ${days <= 1 ? "aujourd'hui" : 'dans ' + days + ' jours'}` : 'File vide';
    return `
    <div class="head"><div><h1>Tableau de bord</h1><p class="sub">Vue d'ensemble de vos relances</p></div>
      <button class="btn pri" onclick="runTick()">Envoyer maintenant le prochain lot</button></div>
    <div class="grid g4">
      <div class="card stat"><small>Contacts actifs</small><b>${active}</b><em>${S.contacts.length} au total</em></div>
      <div class="card stat"><small>Envoyés aujourd'hui${S.today.pausedUntil && new Date(S.today.pausedUntil) > new Date() ? ' · <b style="display:inline;font-size:12px;color:var(--warn)">limite atteinte, reprise demain</b>' : ''}</small><b>${S.today.sent}<span style="font-size:16px;color:var(--mut)"> / ${S.today.limit}</span></b><div class="pbar"><i style="width:${pct}%"></i></div></div>
      <div class="card stat"><small>Campagnes en cours</small><b>${running}</b><em>${queueTxt}</em></div>
      <div class="card stat"><small>Emails envoyés (total)</small><b>${totalSent}</b><em>${S.settings.hasKey ? 'Brevo connecté' : '⚠ Mode simulation (pas de clé Brevo)'}</em></div>
    </div>
    <div class="card" style="margin-top:16px">
      <b>Prochaines fêtes</b> <span class="hint">(Hebcal) — programmez vos campagnes à l'avance</span>
      <div class="grid g4" style="margin-top:12px">${S.holidays.slice(0, 4).map(h => { const d = Math.ceil((new Date(h.date) - new Date(new Date().toDateString())) / 86400000); return `<div class="card" style="padding:16px;background:#f8fbfb;box-shadow:none"><div style="font-family:'Bree Serif',serif;font-size:18px;color:var(--navy)">${esc(h.title)}</div><div class="hint" style="margin:2px 0 8px">${esc(h.hebrew)} · ${new Date(h.date).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })} · dans ${d} j</div><button class="btn sm" onclick="campFromHoliday('${h.date}','${esc(h.title).replace(/'/g, '')}')">+ Campagne</button></div>`; }).join('') || '<div class="hint">Calendrier indisponible.</div>'}</div>
    </div>
    <div class="card" style="margin-top:16px;padding:0">
      <div style="padding:18px 20px 6px"><b>Activité récente</b></div>
      ${S.sends.length ? `<table><thead><tr><th>Date</th><th>Destinataire</th><th>Campagne</th><th>Étape</th><th>Statut</th></tr></thead><tbody>${S.sends.slice(0, 15).map(x => {
        const c = S.campaigns.find(c => c.id === x.campaignId);
        return `<tr><td>${fmt(x.at)}</td><td>${esc(x.email)}</td><td>${esc(c?.name || '—')}</td><td>#${x.stepIndex + 1}</td>
          <td>${x.status === 'error' ? `<span class="pill bad" title="${esc(x.error)}">Erreur</span>` : x.status === 'simulated' ? '<span class="pill">Simulé</span>' : '<span class="pill ok">Envoyé</span>'}</td></tr>`;
      }).join('')}</tbody></table>` : `<div class="empty"><big>📭</big>Aucun envoi pour l'instant.<br>Ajoutez des contacts, créez une campagne puis démarrez-la.</div>`}
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

  campaigns: () => `
    <div class="head"><div><h1>Campagnes</h1><p class="sub">Séquences de mails envoyées au fil de l'eau (max ${S.today.limit}/jour)</p></div>
      <button class="btn pri" onclick="campModal()">+ Nouvelle campagne</button></div>
    ${S.campaigns.length ? S.campaigns.map(c => {
      const total = (c.stats.sent + 0), steps = c.steps.length;
      return `<div class="card camp" style="margin-bottom:12px">
        <div class="grow"><b style="font-size:16px">${esc(c.name)}</b> ${campPill(c.status)}
          <div class="hint">${steps} étape${steps > 1 ? 's' : ''}${c.startDate ? ' · démarre le ' + new Date(c.startDate).toLocaleDateString('fr-FR') : ''} · Audience : ${c.audienceTag ? '#' + esc(c.audienceTag) : 'tous les contacts actifs'} · ${c.stats.pending} contact(s) en cours de séquence</div></div>
        <div class="stat"><b style="font-size:22px">${total}</b><em>envoyés</em></div>
        <div class="stat"><b style="font-size:22px;color:${c.stats.errors ? 'var(--bad)' : 'inherit'}">${c.stats.errors}</b><em>erreurs</em></div>
        <div class="row">
          ${c.status === 'running' || c.status === 'scheduled' ? `<button class="btn" onclick="campAct('${c.id}','pause')">⏸ Pause</button>` : c.status !== 'done' ? `<button class="btn pri" onclick="campAct('${c.id}','start')">▶ Démarrer</button>` : ''}
          <button class="btn" onclick="campModal('${c.id}')">Modifier</button><button class="btn bad" onclick="del('campaigns','${c.id}')">✕</button></div></div>`;
    }).join('') : `<div class="card empty"><big>➤</big>Aucune campagne. Créez « Hanouka » avec une séquence de relances.</div>`}`,

  templates: () => {
    if (!tplDraft) { const t = S.templates.find(x => x.id === tplId) || S.templates[0]; if (t) { tplId = t.id; tplDraft = { ...t }; } }
    const t = tplDraft, open = fetesOpen(), sorted = FETES_SORTED();
    const cur = t && FETES.find(f => f.k === t.holiday);
    const dayTxt = f => { const d = feteDays(f); return d === null ? '' : `<span class="jx ${d <= 14 ? 'soon' : d <= 45 ? 'mid' : ''}">${d <= 0 ? "Aujourd'hui" : 'J-' + d}</span>`; };
    const card = f => { const has = S.templates.some(x => x.holiday === f.k); return `<a href="#" class="fcard ${t && t.holiday === f.k ? 'on' : ''}" onclick="openFete('${f.k}');return false"><div class="fl"><b>${f.n}</b><span>${dayTxt(f)}<span class="st" style="color:${has ? 'var(--ok)' : 'var(--mut)'}">${has ? '✓ prêt' : '+ créer'}</span></span></div><small>${feteNext(f) || ''}${f.he ? ` · <bdi>${f.he}</bdi>` : ''}</small></a>`; };
    const others = S.templates.filter(x => !FETES.some(f => f.k === x.holiday));
    const chips = sorted.filter(f => feteDays(f) !== null).slice(0, 4).map(f => `<a href="#" class="chip" onclick="openFete('${f.k}');return false">${f.n} ${dayTxt(f)}</a>`).join('');
    return `
    <div class="head"><div><h1>Templates</h1><p class="sub">Variables : <code>{{prenom}}</code> <code>{{nom}}</code> <code>{{email}}</code></p></div>
      <button class="btn pri" onclick="newTpl()">+ Nouveau template</button></div>

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
        <div class="mailhead"><img src="/logo.png" alt=""><div><b>${esc(S.settings.senderName || S.settings.orgName)}</b> <span>&lt;${esc(S.settings.senderEmail || 'contact@emounateha.fr')}&gt;</span><div id="pvsubj" class="subj"></div></div></div>
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
        <label>URL du logo (publique https, ou /logo.png en local)</label><input id="s_logoUrl" value="${esc(s.logoUrl)}" placeholder="https://…/logo.png">
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
    </div>`;
  }
};

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
  modal(`<h2>${id ? 'Modifier' : 'Nouvelle'} campagne</h2>
    <label>Nom</label><input id="k_name" value="${esc(c.name)}" placeholder="Hanouka 2026">
    <label>Nom de l'audience</label><input id="k_tag" value="${esc(c.audienceTag)}" placeholder="auto : nom de la campagne">
    <label>Contacts de la campagne (CSV)</label>
    <input type="file" accept=".csv,.txt,.tsv" onchange="readFile(this,'k_csv')">
    <textarea id="k_csv" rows="3" placeholder="…ou collez : Prénom;Nom;email (l'en-tête est reconnu)" style="min-height:70px;margin-top:6px"></textarea>
    <div class="hint">Les contacts importés reçoivent le tag de l'audience. Un email déjà connu n'est jamais dupliqué ni renvoyé deux fois.</div>
    <label>Période de diffusion</label>
    <div class="row"><div class="grow"><div class="hint" style="margin:0 0 4px">Du</div><input id="k_start" type="date" value="${esc(c.startDate || '')}"></div>
      <div class="grow"><div class="hint" style="margin:0 0 4px">Au</div><input id="k_end" type="date" value="${esc(c.endDate || '')}"></div></div>
    <div class="row" style="margin-top:8px"><span class="hint">Début aidé par une fête :</span>
      <select id="k_hol" onchange="holPick()" class="grow"><option value="">— ou X jours avant une fête —</option>${S.holidays.map(h => `<option value="${h.date}">${esc(h.title)} (${h.date})</option>`).join('')}</select>
      <input id="k_off" type="number" min="0" value="7" style="width:64px" oninput="holPick()"><span class="hint">j avant</span></div>
    <div class="hint">Les mails sont répartis automatiquement sur la période (max ${S.today.limit}/jour). Après la date de fin, la campagne s'arrête.</div>
    <label>Template à envoyer</label><div id="k_steps"></div>
    <button class="btn sm" onclick="addStep()">+ Ajouter une relance (autre template, quelques jours plus tard)</button>
    <label class="row" style="margin-top:16px;text-transform:none;letter-spacing:0;font-size:14px;color:var(--ink)"><input id="k_auto" type="checkbox" checked style="width:auto"> Lancer automatiquement à la date de début (envois réels via Brevo)</label>
    <div class="hint">Un contact passe à l'étape suivante X jours après la précédente. Désinscrit / Donateur = séquence stoppée.</div>
    <div class="row r" style="margin-top:22px"><button class="btn" onclick="closeModal()">Annuler</button><button class="btn pri" onclick="saveCamp('${id || ''}')">Enregistrer</button></div>`);
  drawSteps();
}
function drawSteps() {
  $('#k_steps').innerHTML = campSteps.map((s, i) => `<div class="seq"><span class="n">${i + 1}</span>
    <select onchange="campSteps[${i}].templateId=this.value" class="grow">${S.templates.map(t => `<option value="${t.id}" ${t.id === s.templateId ? 'selected' : ''}>${esc(t.name)}</option>`).join('')}</select>
    ${i === 0 ? '<span class="hint" style="white-space:nowrap">immédiat</span>' : `<span class="hint">+</span><input type="number" min="0" style="width:70px" value="${s.delayDays}" onchange="campSteps[${i}].delayDays=+this.value"><span class="hint">j</span>`}
    ${campSteps.length > 1 ? `<button class="btn sm bad" onclick="campSteps.splice(${i},1);drawSteps()">✕</button>` : ''}</div>`).join('');
}
function addStep() { campSteps.push({ templateId: S.templates[0]?.id, delayDays: 3 }); drawSteps(); }
async function saveCamp(id) {
  const name = $('#k_name').value.trim() || 'Sans titre';
  let tag = $('#k_tag').value.trim(); const csv = $('#k_csv').value.trim();
  if (!tag) tag = name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const body = { name, audienceTag: tag, steps: campSteps, startDate: $('#k_start').value || '', endDate: $('#k_end').value || '' };
  if (csv) { const r = await api('POST', '/contacts/import', { csv, tags: tag }); toast(`${r.added} nouveau(x), ${r.existing} déjà connu(s), ${r.skipped} ignoré(s)`); }
  const saved = await api(id ? 'PUT' : 'POST', '/campaigns' + (id ? '/' + id : ''), body);
  if ($('#k_auto').checked && !['running', 'done'].includes(saved.status)) { await api('POST', `/campaigns/${saved.id}/start`); toast('Campagne programmée'); }
  closeModal(); await render();
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

// ---------- Router ----------
function bindTpl() {
  const form = $('#tform'); if (!form) return;
  form.querySelectorAll('[data-f]').forEach(el => el.addEventListener('input', () => { tplDraft[el.dataset.f] = el.value; refreshPreview(); }));
  applyPv(); requestAnimationFrame(applyPv); refreshPreview();
}
async function render(skipLoad) {
  if (!skipLoad) await load();
  const route = (location.hash.replace(/^#\/?/, '') || '');
  document.querySelectorAll('#nav a').forEach(a => a.classList.toggle('on', a.dataset.r === route));
  $('#main').innerHTML = (views[route] || views[''])();
  if (route === 'templates') bindTpl();
}
function renderKeepFocus() {
  const pos = $('#q')?.selectionStart; render(true).then(() => { const q = $('#q'); if (q) { q.focus(); q.setSelectionRange(pos, pos); } });
}
window.addEventListener('hashchange', () => { tplDraft = null; render(); });
render();
setInterval(() => { if (!document.hidden && $('#modal').classList.contains('hidden') && !location.hash.includes('templates') && !location.hash.includes('settings')) render(); }, 30000);
