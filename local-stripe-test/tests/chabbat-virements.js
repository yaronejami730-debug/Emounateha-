// Heure d'envoi de l'e-mail / SMS « virement en cours » selon Chabbat : essais sur des horaires inventés (aucun appel réseau).
const C = require('../chabbat.js'); let pass = 0, fail = 0; const ok = (c, m, x) => { c ? pass++ : fail++; console.log(c ? '  ok  ' : '  ECHEC', m, c ? '' : JSON.stringify(x === undefined ? null : x).slice(0, 300)); };
const T = iso => Date.parse(iso);
// Hiver : vendredi 20 nov 2026, allumage 16:52, sortie samedi 21 nov 17:55 (heure de Paris = +01:00)
const hiver = [{ type: 'allumage', t: T('2026-11-20T16:52:00+01:00') }, { type: 'sortie', t: T('2026-11-21T17:55:00+01:00') }];
// Été : vendredi 19 juin 2026, allumage 21:30, sortie samedi 22:45 (heure de Paris = +02:00)
const ete = [{ type: 'allumage', t: T('2026-06-19T21:30:00+02:00') }, { type: 'sortie', t: T('2026-06-20T22:45:00+02:00') }];
const a = (iso, ev) => C.autorise(T(iso), ev);

ok(a('2026-11-19T18:59:00+01:00', hiver) === false && a('2026-11-19T19:00:00+01:00', hiver) === true, 'jeudi : à partir de 19 h');
ok(a('2026-11-20T02:00:00+01:00', hiver) === false, 'vendredi à 2 h du matin : rien');
ok(a('2026-11-20T13:51:00+01:00', hiver) === false && a('2026-11-20T13:52:00+01:00', hiver) === true, 'vendredi d\'hiver : à partir de 3 h avant l\'allumage (13 h 52), pas 19 h');
ok(a('2026-11-20T16:51:00+01:00', hiver) === true && a('2026-11-20T16:52:00+01:00', hiver) === false, 'vendredi : plus rien dès l\'allumage');
ok(a('2026-11-20T19:00:00+01:00', hiver) === false && a('2026-11-21T10:00:00+01:00', hiver) === false, 'vendredi soir et samedi : rien pendant Chabbat');
ok(a('2026-11-21T17:55:00+01:00', hiver) === false && a('2026-11-21T19:54:00+01:00', hiver) === false && a('2026-11-21T19:55:00+01:00', hiver) === true, 'samedi soir : à partir de 2 h après la sortie (19 h 55)');
ok(a('2026-11-22T10:00:00+01:00', hiver) === false && a('2026-11-22T19:00:00+01:00', hiver) === true, 'dimanche : retour à la règle de 19 h');
ok(a('2026-06-19T18:29:00+02:00', ete) === false && a('2026-06-19T18:30:00+02:00', ete) === true, 'vendredi d\'été : 3 h avant l\'allumage = 18 h 30, pas 19 h');
ok(a('2026-06-19T21:29:00+02:00', ete) === true && a('2026-06-19T21:30:00+02:00', ete) === false, 'vendredi d\'été : stop à l\'allumage (21 h 30)');
ok(a('2026-06-20T23:59:00+02:00', ete) === false && a('2026-06-21T00:44:00+02:00', ete) === false && a('2026-06-21T00:45:00+02:00', ete) === false, 'été : la reprise tombe après minuit, le dimanche on attend 19 h');
ok(a('2026-06-21T19:00:00+02:00', ete) === true, 'dimanche d\'été à 19 h : l\'envoi part');
// Hebcal en panne
ok(C.autorise(T('2026-11-20T15:00:00+01:00'), null) === false && C.autorise(T('2026-11-21T22:00:00+01:00'), null) === false, 'Hebcal en panne : vendredi et samedi, aucun envoi');
ok(C.autorise(T('2026-11-19T20:00:00+01:00'), null) === true && C.autorise(T('2026-11-19T10:00:00+01:00'), null) === false, 'Hebcal en panne : jeudi, règle de 19 h');
// fête (Yom Tov) en semaine : même règle qu\'un Chabbat
const fete = [{ type: 'allumage', t: T('2026-09-22T18:55:00+02:00') }, { type: 'sortie', t: T('2026-09-23T19:50:00+02:00') }];
ok(a('2026-09-22T15:54:00+02:00', fete) === false && a('2026-09-22T15:55:00+02:00', fete) === true && a('2026-09-23T12:00:00+02:00', fete) === false, 'veille de fête un mardi : 3 h avant l\'allumage, rien pendant la fête');
// jour d'arrivée du virement (option « tot ») : plus d'heure minimale, mais jamais pendant Chabbat
ok(C.autorise(T('2026-11-19T03:00:00+01:00'), hiver, { tot: true }) === false && C.autorise(T('2026-11-19T06:59:00+01:00'), hiver, { tot: true }) === false && C.autorise(T('2026-11-19T07:00:00+01:00'), hiver, { tot: true }) === true, 'jour d\'arrivée ordinaire : rien la nuit, à partir de 7 h');
ok(C.autorise(T('2026-11-20T02:00:00+01:00'), hiver, { tot: true }) === false && C.autorise(T('2026-11-20T09:00:00+01:00'), hiver, { tot: true }) === true && C.autorise(T('2026-11-20T16:52:00+01:00'), hiver, { tot: true }) === false, 'vendredi : pas à 2 h, oui à 9 h (sans attendre 13 h 52), plus rien dès l\'allumage');
ok(C.autorise(T('2026-11-21T11:00:00+01:00'), hiver, { tot: true }) === false && C.autorise(T('2026-11-21T19:55:00+01:00'), hiver, { tot: true }) === true, 'pendant Chabbat : jamais ; après la sortie + 2 h : oui');
ok(C.autorise(T('2026-11-19T08:00:00+01:00'), null, { tot: true }) === true && C.autorise(T('2026-11-20T09:00:00+01:00'), null, { tot: true }) === false, 'Hebcal en panne : jeudi oui, vendredi non, même le jour d\'arrivée');
(async () => {   // lecture des horaires : faux Hebcal, mise en cache, panne
  let appels = 0, rep = { items: [{ category: 'candles', date: '2026-11-20T16:52:00+01:00' }, { category: 'havdalah', date: '2026-11-21T17:55:00+01:00' }, { category: 'parashat', date: '2026-11-21' }] };
  const faux = async url => { appels++; if (rep === 'panne') throw new Error('réseau'); return { ok: true, json: async () => rep, url }; };
  let ev = await C.evenements(T('2026-11-19T12:00:00+01:00'), faux);
  ok(ev.length === 2 && ev[0].type === 'allumage' && ev[1].type === 'sortie', 'horaires Hebcal lus : allumage et sortie (le reste est ignoré)', ev);
  await C.evenements(T('2026-11-19T15:00:00+01:00'), faux); ok(appels === 1, 'un seul appel à Hebcal par jour (cache)');
  rep = 'panne'; ev = await C.evenements(T('2026-12-01T12:00:00+01:00'), faux); ok(ev === null, 'Hebcal injoignable : horaires absents (donc prudence vendredi/samedi)');
  console.log(pass + ' ok, ' + fail + ' échec'); process.exit(fail ? 1 : 0);
})();
