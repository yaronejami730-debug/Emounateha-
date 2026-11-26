/**
 * Google Sheet « Virements Émounatéha » : tenu à jour automatiquement par le serveur des dons, à chaque virement Stripe → banque.
 * Projet Apps Script « Virements Émounatéha → Sheet » (compte emounateha770), déployé en Application Web.
 *
 * Mise en place (déjà faite le 23 nov 2026) : Propriétés du script → SECRET ; Déployer → Application Web (Moi / Tout le monde).
 * Après une modification de ce fichier : Enregistrer, puis Déployer → Gérer les déploiements → crayon → Version : Nouvelle version → Déployer
 * (l'URL ne change pas).
 *
 * Onglets :
 *  - « Virements »    (écrit par le site) : une ligne par virement, avec son STATUT (En cours de virement / Arrivé en banque / Refusé…), mis à jour par le site ;
 *  - « Paiements »    (écrit par le site) : une ligne par paiement (type de don ou cagnotte, donateur, e-mail, ID Stripe, n° de reçu, montants, statut du virement,
 *                     moyen de paiement, ponctuel ou mensuel avec n° d'échéance, particulier ou entreprise) ;
 *  - « Détail par type » (écrit par le site) : par virement, une ligne par type de don et par cagnotte (le résumé du PDF) ;
 *  - « Cagnottes »    : par cagnotte, net dû, en cours de virement, arrivé en banque, reversé, date, reste, historique, STATUT (K) ;
 *                     la trésorière choisit en L « Tout reversé / La moitié / Autre montant » : reversé, date, reste et historique se remplissent seuls
 *                     (déclencheur quandModifie, installé une fois par la fonction installer()) ;
 *  - « Répartition »  : par cagnotte, comment se partage l'argent : net après frais Stripe → 5 % prestataire, 5 % association, 90 % la personne ; reversé, reste.
 * Règle (26 nov 2026, pour les dons faits à partir de sa mise en ligne) : besoins = 5 % prestataire + 5 % association + 90 % la personne, sur le net après frais Stripe ;
 * dons d'avant : 7 % prestataire, le reste à la personne ; autres dons = 7 % prestataire.
 * Après la mise à jour du 26 nov 2026 : lancer UNE fois installerRepartition() (Exécuter) — ne touche pas aux reversements déjà notés.
 * Un même virement n'est jamais écrit deux fois (repéré par sa référence Stripe po_…).
 */

// Sheet de l'association « Virements Émounatéha » : utilisé si le script n'est pas rattaché au Sheet lui-même.
const SHEET_ID = '1_4U4WtC2x2FjRoQu2-TsSkVDipUtKsc26u_LpMc0qpc';

const ONGLETS = {
  Virements: ['Date du virement', 'Référence Stripe', 'Paiements', 'Brut', 'Frais Stripe', 'Virement reçu en banque', 'Frais du prestataire', 'Net pour l\'association', 'dont dons généraux', 'dont à reverser aux besoins (90 %)', 'Écart à vérifier', 'Écrit le', 'Statut du virement', 'Statut mis à jour le'],
  Paiements: ['Date du virement', 'Référence du virement', 'Catégorie', 'Type de don / cagnotte', 'Nature', 'Date du paiement', 'Prénom', 'Nom', 'E-mail', 'ID de paiement Stripe', 'N° de reçu', 'Brut', 'Frais Stripe', 'Frais du prestataire (7 % ; besoins 5 %)', 'Net', 'Statut du virement', 'Moyen de paiement', 'Fréquence', 'Particulier / entreprise', 'Part association (besoins 5 %)', 'À reverser à la personne (besoins 90 %)'],
  'Détail par type': ['Date du virement', 'Référence du virement', 'Catégorie', 'Type de don / cagnotte', 'Paiements', 'Brut', 'Frais Stripe', 'Frais du prestataire', 'Net', 'Statut du virement'],
  Cagnottes: ['Cagnotte', 'Paiements', 'Brut', 'Dû à la personne', 'dont en cours de virement', 'dont arrivé en banque', 'Reversé (total)', 'Date du dernier reversement', 'Reste à reverser', 'Historique des reversements', 'Statut', 'Reversement (à choisir)'],
  'Répartition': ['Cagnotte', 'Paiements', 'Collecté (brut)', 'Frais Stripe', 'Net après frais Stripe', 'Prestataire (5 % ; dons d\'avant le 26/11 : 7 %)', 'Association (5 %)', 'Personne (90 % ; avant : net − 7 %)', 'Déjà reversé', 'Reste à reverser']
};
const CHOIX = ['Tout reversé', 'La moitié', 'Autre montant'];   // colonne L de « Cagnottes »
const STATUT_VIR = { pending: 'En cours de virement', in_transit: 'En cours de virement', paid: 'Arrivé en banque', failed: 'Refusé par la banque', canceled: 'Annulé' };

function doPost(e) {
  const verrou = LockService.getScriptLock();
  verrou.waitLock(30000);
  try {
    const d = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    const secret = PropertiesService.getScriptProperties().getProperty('SECRET');
    if (!secret || d.secret !== secret) return repondre({ ok: false, error: 'secret invalide' });
    if (d.action === 'repartition') return repondre({ ok: true, resultat: installerRepartition() });
    if (d.action === 'installer') return repondre({ ok: true, resultat: installer() });   // mise au format de « Cagnottes » + déclencheur (une fois)
    const v = d.virement || {}, P = Array.isArray(d.paiements) ? d.paiements : [];
    if (!/^po_[A-Za-z0-9]+$/.test(String(v.id || ''))) return repondre({ ok: false, error: 'virement sans référence' });
    const ss = SpreadsheetApp.getActiveSpreadsheet() || SpreadsheetApp.openById(SHEET_ID);
    const wv = onglet(ss, 'Virements'), wp = onglet(ss, 'Paiements'), wc = onglet(ss, 'Cagnottes');
    const statut = STATUT_VIR[v.statut] || (v.statut ? String(v.statut) : 'En cours de virement');
    const ligneVir = wv.getLastRow() > 1 ? wv.getRange(2, 2, wv.getLastRow() - 1, 1).getValues().findIndex(r => r[0] === v.id) : -1;
    // mise à jour du statut d'un virement déjà écrit (et de ses paiements)
    if (d.action === 'statut') {
      if (ligneVir < 0) return repondre({ ok: false, error: 'virement inconnu' });
      wv.getRange(ligneVir + 2, 13, 1, 2).setValues([[statut, new Date()]]);
      if (wp.getLastRow() > 1) { const refs = wp.getRange(2, 2, wp.getLastRow() - 1, 1).getValues(); refs.forEach((r, i) => { if (r[0] === v.id) wp.getRange(i + 2, 16).setValue(statut); }); }
      const wt = ss.getSheetByName('Détail par type'); if (wt && wt.getLastRow() > 1) { const refs = wt.getRange(2, 2, wt.getLastRow() - 1, 1).getValues(); refs.forEach((r, i) => { if (r[0] === v.id) wt.getRange(i + 2, 10).setValue(statut); }); }
      return repondre({ ok: true, statut });
    }
    if (ligneVir >= 0) return repondre({ ok: true, deja: true });
    const e2 = c => Math.round(Number(c) || 0) / 100, S = (L, k) => L.reduce((a, x) => a + (Number(x[k]) || 0), 0), txt = s => String(s == null ? '' : s).replace(/^[=+\-@]/, "'$&");
    const gen = P.filter(p => p.categorie === 'general'), bes = P.filter(p => p.categorie === 'besoin'), CAT = { general: 'Dons généraux', besoin: 'Besoin (cagnotte)', autre: 'Autre mouvement Stripe' };
    wv.appendRow([v.date, v.id, P.filter(p => p.nature === 'Don').length, e2(S(P, 'brut')), -e2(S(P, 'frais')), e2(v.montant), -e2(S(P, 'com')), e2(v.montant) - e2(S(P, 'com')), e2(S(gen, 'net')), e2(S(bes, 'reverser')), e2(v.ecart), new Date(), statut, new Date()]);
    if (P.length) wp.getRange(wp.getLastRow() + 1, 1, P.length, ONGLETS.Paiements.length).setValues(P.map(p => [v.date, v.id, CAT[p.categorie] || txt(p.categorie), txt(p.type), txt(p.nature === 'Autre' ? 'Mouvement Stripe' : p.nature), p.date, txt(p.prenom), txt(p.nom), txt(p.email), txt(p.id), txt(p.recu), e2(p.brut), -e2(p.frais), -e2(p.com), e2(p.net), statut, txt(p.moyen), txt(p.frequence), txt(p.donateurType), -e2(p.asso), e2(p.reverser)]));
    // « Détail par type » : le résumé du PDF (une ligne par type de don et par cagnotte de ce virement)
    const wt = onglet(ss, 'Détail par type'), G = {};
    P.forEach(p => { const k = p.categorie + '|' + p.type; const g = G[k] || (G[k] = { cat: CAT[p.categorie] || p.categorie, type: p.type, n: 0, brut: 0, frais: 0, com: 0, net: 0 }); if (p.nature === 'Don') g.n++; ['brut', 'frais', 'com', 'net'].forEach(x => g[x] += Number(p[x]) || 0); });
    const ordre = { 'Dons généraux': 0, 'Besoin (cagnotte)': 1 }, T = Object.values(G).sort((a, b) => (ordre[a.cat] ?? 2) - (ordre[b.cat] ?? 2) || b.brut - a.brut);
    if (T.length) wt.getRange(wt.getLastRow() + 1, 1, T.length, ONGLETS['Détail par type'].length).setValues(T.map(g => [v.date, v.id, g.cat, txt(g.type), g.n, e2(g.brut), -e2(g.frais), -e2(g.com), e2(g.net), statut]));
    // nouvelles cagnottes : une ligne chacune, avec ses formules (tout se recalcule tout seul : paiements, statut des virements, reversements)
    const connues = wc.getLastRow() > 1 ? wc.getRange(2, 1, wc.getLastRow() - 1, 1).getValues().map(r => r[0]) : [];
    [...new Set(bes.map(p => txt(p.type)))].filter(n => n && connues.indexOf(n) < 0).forEach(n => { const r = wc.getLastRow() + 1; wc.getRange(r, 1).setValue(n); formulesCagnotte(ss, wc, r); });
    choix(wc);
    const wr = onglet(ss, 'Répartition'), dansRep = wr.getLastRow() > 1 ? wr.getRange(2, 1, wr.getLastRow() - 1, 1).getValues().map(r => r[0]) : [];
    [...new Set(bes.map(p => txt(p.type)))].filter(n => n && dansRep.indexOf(n) < 0).forEach(n => { const r = wr.getLastRow() + 1; wr.getRange(r, 1).setValue(n); formulesRepartition(ss, wr, r); });
    mettreEnForme(wr, [3, 4, 5, 6, 7, 8, 9, 10]);
    mettreEnForme(wv, [4, 5, 6, 7, 8, 9, 10, 11]); mettreEnForme(wp, [12, 13, 14, 15, 20, 21]); mettreEnForme(wc, [3, 4, 5, 6, 7, 9]); mettreEnForme(onglet(ss, 'Détail par type'), [6, 7, 8, 9]);
    return repondre({ ok: true, lignes: P.length });
  } catch (err) {
    return repondre({ ok: false, error: String(err && err.message || err) });
  } finally { verrou.releaseLock(); }
}

function onglet(ss, nom) {
  let w = ss.getSheetByName(nom);
  if (!w) {
    w = ss.insertSheet(nom);
    w.getRange(1, 1, 1, ONGLETS[nom].length).setValues([ONGLETS[nom]]).setFontWeight('bold').setFontColor('#ffffff').setBackground('#1f6a72').setWrap(true);
    w.setFrozenRows(1);
    if (nom === 'Cagnottes') {   // statut en couleur
      const st = w.getRange('K2:K1000');
      w.setConditionalFormatRules([['Soldé', '#d9ead3'], ['Reversé en partie', '#fff2cc'], ['À reverser', '#f4cccc'], ['En attente de Stripe', '#e3f1f0']].map(([t, c]) => SpreadsheetApp.newConditionalFormatRule().whenTextEqualTo(t).setBackground(c).setRanges([st]).build()));
      w.getRange(1, 12).setBackground('#a8842a');   // la seule colonne à remplir
      w.getRange('H2:H1000').setNumberFormat('dd/mm/yyyy hh:mm');
    }
  }
  return w;
}

// Séparateur des formules selon la langue du Sheet : « ; » là où la virgule sert aux décimales (français, etc.). Les virgules entre guillemets ne bougent pas.
function local(ss, f) {
  const l = String(ss.getSpreadsheetLocale() || 'en_US');
  if (!/^(fr|de|es|it|pt|nl|ru|pl|tr|sv|da|fi|nb|no|cs|ro|hu|el|uk|id|vi)/i.test(l)) return f;
  return f.split('"').map((morceau, i) => i % 2 ? morceau : morceau.replace(/,/g, ';')).join('"');
}

// Colonne L de « Cagnottes » : menu « Tout reversé / La moitié / Autre montant »
function choix(wc) {
  wc.getRange(2, 12, 999, 1).setDataValidation(SpreadsheetApp.newDataValidation().requireValueInList(CHOIX, true).setAllowInvalid(false).build());
}

// Formules d'une ligne de « Cagnottes » (G = reversé et H = date sont remplis par quandModifie, pas par formule)
function formulesCagnotte(ss, wc, r) {
  const c = 'A' + r, pay = (col, extra) => `SUMIFS(Paiements!${col}:${col},Paiements!$C:$C,"Besoin (cagnotte)",Paiements!$D:$D,${c}${extra || ''})`;
  wc.getRange(r, 2, 1, 5).setFormulas([[
    `=COUNTIFS(Paiements!$C:$C,"Besoin (cagnotte)",Paiements!$D:$D,${c},Paiements!$E:$E,"Don")`,
    '=' + pay('L'), '=' + pay('U'),
    '=' + pay('U', ',Paiements!$P:$P,"En cours de virement"'),
    '=' + pay('U', ',Paiements!$P:$P,"Arrivé en banque"')].map(f => local(ss, f))]);
  if (wc.getRange(r, 7).getValue() === '') wc.getRange(r, 7).setValue(0);
  wc.getRange(r, 9).setFormula(local(ss, `=ROUND(D${r}-G${r},2)`));
  wc.getRange(r, 11).setFormula(local(ss, `=IF(D${r}=0,"Aucun don",IF(I${r}<=0,"Soldé",IF(G${r}>0,"Reversé en partie",IF(F${r}=0,"En attente de Stripe","À reverser"))))`));
}

// Formules d'une ligne de « Répartition » (tout vient de « Paiements » ; le déjà reversé vient de « Cagnottes », colonne G)
function formulesRepartition(ss, w, r) {
  const c = '$A' + r, pay = col => `SUMIFS(Paiements!${col}:${col},Paiements!$C:$C,"Besoin (cagnotte)",Paiements!$D:$D,${c})`;
  w.getRange(r, 2, 1, 9).setFormulas([[
    `=COUNTIFS(Paiements!$C:$C,"Besoin (cagnotte)",Paiements!$D:$D,${c},Paiements!$E:$E,"Don")`,
    '=' + pay('L'), '=' + pay('M'), `=C${r}+D${r}`,
    `=ROUND(E${r}-G${r}-H${r},2)`, '=-' + pay('T'), '=' + pay('U'),
    `=SUMIF(Cagnottes!$A:$A,${c},Cagnottes!$G:$G)`, `=ROUND(H${r}-I${r},2)`].map(f => local(ss, f))]);
}

// À lancer UNE fois après la mise à jour du 26 nov 2026 (Exécuter → installerRepartition) :
// titres des colonnes à jour, somme à reverser des anciens paiements des besoins selon l'ANCIENNE règle (net − 7 %, rien pour l'association),
// « Cagnottes » recalculée sur 90 %, onglet « Répartition » créé. Ne touche JAMAIS aux reversements déjà notés (colonnes G, H, J de « Cagnottes »).
function installerRepartition() {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  ['Virements', 'Paiements', 'Détail par type', 'Cagnottes'].forEach(nom => { const w = ss.getSheetByName(nom); if (w) w.getRange(1, 1, 1, ONGLETS[nom].length).setValues([ONGLETS[nom]]).setFontWeight('bold').setFontColor('#ffffff').setBackground('#1f6a72').setWrap(true); });
  const wp = ss.getSheetByName('Paiements'); let n = 0;
  if (wp && wp.getLastRow() > 1) {
    const L = wp.getRange(2, 1, wp.getLastRow() - 1, 21).getValues();
    const out = L.map(x => { if (x[2] !== 'Besoin (cagnotte)' || (x[19] !== '' && x[20] !== '')) return [x[19], x[20]]; n++;
      // paiements déjà dans le Sheet = faits avant la règle 5 / 5 / 90 : ancienne règle, part association 0, à reverser = net − frais 7 % (colonne N)
      const net = Math.round(((Number(x[11]) || 0) + (Number(x[12]) || 0) + (Number(x[13]) || 0)) * 100);
      return [0, net / 100]; });
    wp.getRange(2, 20, out.length, 2).setValues(out);
    mettreEnForme(wp, [12, 13, 14, 15, 20, 21]);
  }
  const wc = ss.getSheetByName('Cagnottes'), noms = [];
  if (wc && wc.getLastRow() > 1) for (let r = 2; r <= wc.getLastRow(); r++) { const nm = wc.getRange(r, 1).getValue(); if (nm) { formulesCagnotte(ss, wc, r); noms.push(nm); } }
  const wr = onglet(ss, 'Répartition'), deja = wr.getLastRow() > 1 ? wr.getRange(2, 1, wr.getLastRow() - 1, 1).getValues().map(r => r[0]) : [];
  noms.filter(nm => deja.indexOf(nm) < 0).forEach(nm => { const r = wr.getLastRow() + 1; wr.getRange(r, 1).setValue(nm); });
  for (let r = 2; r <= wr.getLastRow(); r++) formulesRepartition(ss, wr, r);
  mettreEnForme(wr, [3, 4, 5, 6, 7, 8, 9, 10]);
  return 'répartition installée : ' + n + ' ancien(s) paiement(s) de besoin complété(s), ' + noms.length + ' cagnotte(s)';
}

// Déclencheur « à chaque modification » du Sheet (installé par installer()) :
//  - choix en colonne L → ajoute au « Reversé » (G) : tout le reste, ou la moitié du reste ; date (H) et historique (J) ; puis L est vidée ;
//  - « Autre montant » → on tape le total reversé dans G ; la date et l'historique suivent ;
//  - G modifié à la main → date et historique.
function quandModifie(e) {
  if (!e || !e.range) return;
  const w = e.range.getSheet(); if (w.getName() !== 'Cagnottes') return;
  const r = e.range.getRow(), col = e.range.getColumn(); if (r < 2 || e.range.getNumRows() > 1) return;
  const eur = x => (Math.round(x * 100) / 100).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
  const quand = new Date(), jour = Utilities.formatDate(quand, 'Europe/Paris', 'dd/MM/yyyy');
  const noter = (texte) => { const h = String(w.getRange(r, 10).getValue() || ''); w.getRange(r, 8).setValue(quand); w.getRange(r, 10).setValue((h ? h + '\n' : '') + jour + ' : ' + texte); };
  if (col === 12) {
    const v = String(e.value || ''), du = Number(w.getRange(r, 4).getValue()) || 0, deja = Number(w.getRange(r, 7).getValue()) || 0, reste = Math.round((du - deja) * 100) / 100;
    if (v === 'Autre montant') { w.getRange(r, 12).setNote('Tapez le TOTAL reversé à ce jour dans la colonne G « Reversé (total) ».'); return; }
    if (!v || reste <= 0) { w.getRange(r, 12).clearContent(); return; }
    const ajout = v === 'Tout reversé' ? reste : Math.round(reste / 2 * 100) / 100;
    w.getRange(r, 7).setValue(Math.round((deja + ajout) * 100) / 100);
    noter('+ ' + eur(ajout) + ' (' + v.toLowerCase() + ')');
    w.getRange(r, 12).clearContent().clearNote();
  } else if (col === 7) {
    const avant = Number(e.oldValue) || 0, apres = Number(w.getRange(r, 7).getValue()) || 0;
    if (apres !== avant) { noter((apres > avant ? '+ ' : '− ') + eur(Math.abs(apres - avant)) + ' (montant tapé, total ' + eur(apres) + ')'); w.getRange(r, 12).clearContent().clearNote(); }
  }
}

// À lancer UNE fois depuis l'éditeur (Exécuter → installer) : installe le déclencheur, met « Cagnottes » au nouveau format, supprime « Reversements ».
function installer() {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  ScriptApp.getProjectTriggers().filter(t => t.getHandlerFunction() === 'quandModifie').forEach(t => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('quandModifie').forSpreadsheet(ss).onEdit().create();
  const rev = ss.getSheetByName('Reversements'); if (rev) ss.deleteSheet(rev);
  const wc = ss.getSheetByName('Cagnottes');
  if (wc) {
    const n = wc.getLastRow();
    if (n > 1) { wc.getRange(2, 7, n - 1, 6).clearContent().clearDataValidations(); for (let r = 2; r <= n; r++) formulesCagnotte(ss, wc, r); }
    wc.getRange(1, 1, 1, ONGLETS.Cagnottes.length).setValues([ONGLETS.Cagnottes]).setFontWeight('bold').setFontColor('#ffffff').setBackground('#1f6a72').setWrap(true);
    wc.getRange(1, 12).setBackground('#a8842a'); wc.getRange('H2:H1000').setNumberFormat('dd/mm/yyyy hh:mm');
    const st = wc.getRange('K2:K1000');
    wc.setConditionalFormatRules([['Soldé', '#d9ead3'], ['Reversé en partie', '#fff2cc'], ['À reverser', '#f4cccc'], ['En attente de Stripe', '#e3f1f0']].map(([t, c]) => SpreadsheetApp.newConditionalFormatRule().whenTextEqualTo(t).setBackground(c).setRanges([st]).build()));
    choix(wc); mettreEnForme(wc, [3, 4, 5, 6, 7, 9]); wc.setColumnWidth(10, 320);
  }
  return 'installé';
}

function mettreEnForme(w, colonnes) {
  const n = Math.max(1, w.getLastRow() - 1);
  colonnes.forEach(c => w.getRange(2, c, n, 1).setNumberFormat('#,##0.00 €'));
  if (w.getFilter()) w.getFilter().remove();   // le filtre suit les nouvelles lignes
  if (w.getLastRow() > 1) w.getRange(1, 1, w.getLastRow(), w.getLastColumn()).createFilter();
  w.autoResizeColumns(1, w.getLastColumn());   // largeur selon le contenu : rien n'est coupé
  for (let c = 1; c <= w.getLastColumn(); c++) if (w.getColumnWidth(c) < 90) w.setColumnWidth(c, 90); else if (w.getColumnWidth(c) > 320) w.setColumnWidth(c, 320);
}

function repondre(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }
