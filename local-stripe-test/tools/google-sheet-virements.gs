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
 *  - « Reversements » (REMPLI PAR LA TRÉSORIÈRE) : chaque sortie d'argent d'une cagnotte : reversé à la personne, ou utilisé autrement par l'association ;
 *  - « Cagnottes »    (calculé tout seul) : par cagnotte, net dû, en cours de virement, arrivé en banque, reversé, utilisé autrement, prévu, reste, STATUT.
 * Un même virement n'est jamais écrit deux fois (repéré par sa référence Stripe po_…).
 */

// Sheet de l'association « Virements Émounatéha » : utilisé si le script n'est pas rattaché au Sheet lui-même.
const SHEET_ID = '1_4U4WtC2x2FjRoQu2-TsSkVDipUtKsc26u_LpMc0qpc';

const ONGLETS = {
  Virements: ['Date du virement', 'Référence Stripe', 'Paiements', 'Brut', 'Frais Stripe', 'Virement reçu en banque', 'Frais 7 %', 'Net pour l\'association', 'dont dons généraux', 'dont besoins (cagnottes)', 'Écart à vérifier', 'Écrit le', 'Statut du virement', 'Statut mis à jour le'],
  Paiements: ['Date du virement', 'Référence du virement', 'Catégorie', 'Type de don / cagnotte', 'Nature', 'Date du paiement', 'Prénom', 'Nom', 'E-mail', 'ID de paiement Stripe', 'N° de reçu', 'Brut', 'Frais Stripe', 'Frais 7 %', 'Net', 'Statut du virement', 'Moyen de paiement', 'Fréquence', 'Particulier / entreprise'],
  'Détail par type': ['Date du virement', 'Référence du virement', 'Catégorie', 'Type de don / cagnotte', 'Paiements', 'Brut', 'Frais Stripe', 'Frais 7 %', 'Net', 'Statut du virement'],
  Reversements: ['Date', 'Cagnotte', 'Nature', 'Montant', 'Moyen (virement, chèque…)', 'Statut', 'Motif / commentaire'],
  Cagnottes: ['Cagnotte', 'Paiements', 'Brut', 'Net dû à la cagnotte', 'dont en cours de virement', 'dont arrivé en banque', 'Reversé à la personne', 'Utilisé autrement par l\'association', 'Prévu (pas encore envoyé)', 'Reste à reverser', 'Statut']
};
const NATURES = ['Reversé à la personne', 'Utilisé autrement par l\'association'];
const STATUTS_REV = ['Prévu', 'Envoyé', 'Reçu par la personne'];
const STATUT_VIR = { pending: 'En cours de virement', in_transit: 'En cours de virement', paid: 'Arrivé en banque', failed: 'Refusé par la banque', canceled: 'Annulé' };

function doPost(e) {
  const verrou = LockService.getScriptLock();
  verrou.waitLock(30000);
  try {
    const d = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    const secret = PropertiesService.getScriptProperties().getProperty('SECRET');
    if (!secret || d.secret !== secret) return repondre({ ok: false, error: 'secret invalide' });
    const v = d.virement || {}, P = Array.isArray(d.paiements) ? d.paiements : [];
    if (!/^po_[A-Za-z0-9]+$/.test(String(v.id || ''))) return repondre({ ok: false, error: 'virement sans référence' });
    const ss = SpreadsheetApp.getActiveSpreadsheet() || SpreadsheetApp.openById(SHEET_ID);
    const wv = onglet(ss, 'Virements'), wp = onglet(ss, 'Paiements'), wr = onglet(ss, 'Reversements'), wc = onglet(ss, 'Cagnottes');
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
    wv.appendRow([v.date, v.id, P.filter(p => p.nature === 'Don').length, e2(S(P, 'brut')), -e2(S(P, 'frais')), e2(v.montant), -e2(S(P, 'com')), e2(v.montant) - e2(S(P, 'com')), e2(S(gen, 'net')), e2(S(bes, 'net')), e2(v.ecart), new Date(), statut, new Date()]);
    if (P.length) wp.getRange(wp.getLastRow() + 1, 1, P.length, ONGLETS.Paiements.length).setValues(P.map(p => [v.date, v.id, CAT[p.categorie] || txt(p.categorie), txt(p.type), txt(p.nature === 'Autre' ? 'Mouvement Stripe' : p.nature), p.date, txt(p.prenom), txt(p.nom), txt(p.email), txt(p.id), txt(p.recu), e2(p.brut), -e2(p.frais), -e2(p.com), e2(p.net), statut, txt(p.moyen), txt(p.frequence), txt(p.donateurType)]));
    // « Détail par type » : le résumé du PDF (une ligne par type de don et par cagnotte de ce virement)
    const wt = onglet(ss, 'Détail par type'), G = {};
    P.forEach(p => { const k = p.categorie + '|' + p.type; const g = G[k] || (G[k] = { cat: CAT[p.categorie] || p.categorie, type: p.type, n: 0, brut: 0, frais: 0, com: 0, net: 0 }); if (p.nature === 'Don') g.n++; ['brut', 'frais', 'com', 'net'].forEach(x => g[x] += Number(p[x]) || 0); });
    const ordre = { 'Dons généraux': 0, 'Besoin (cagnotte)': 1 }, T = Object.values(G).sort((a, b) => (ordre[a.cat] ?? 2) - (ordre[b.cat] ?? 2) || b.brut - a.brut);
    if (T.length) wt.getRange(wt.getLastRow() + 1, 1, T.length, ONGLETS['Détail par type'].length).setValues(T.map(g => [v.date, v.id, g.cat, txt(g.type), g.n, e2(g.brut), -e2(g.frais), -e2(g.com), e2(g.net), statut]));
    // nouvelles cagnottes : une ligne chacune, avec ses formules (tout se recalcule tout seul : paiements, statut des virements, reversements)
    const connues = wc.getLastRow() > 1 ? wc.getRange(2, 1, wc.getLastRow() - 1, 1).getValues().map(r => r[0]) : [];
    [...new Set(bes.map(p => txt(p.type)))].filter(n => n && connues.indexOf(n) < 0).forEach(n => {
      const r = wc.getLastRow() + 1, c = 'A' + r;
      const pay = (col, extra) => `SUMIFS(Paiements!${col}:${col},Paiements!$C:$C,"Besoin (cagnotte)",Paiements!$D:$D,${c}${extra || ''})`;
      const rev = (nature, statuts) => statuts.map(s => `SUMIFS(Reversements!$D:$D,Reversements!$B:$B,${c},Reversements!$C:$C,"${nature}",Reversements!$F:$F,"${s}")`).join('+');
      wc.getRange(r, 1).setValue(n);
      // formules écrites avec « , » puis adaptées à la langue du Sheet (un Sheet en français veut « ; », sinon #ERROR!, constaté le 23 nov 2026)
      wc.getRange(r, 2, 1, 10).setFormulas([[
        `=COUNTIFS(Paiements!$C:$C,"Besoin (cagnotte)",Paiements!$D:$D,${c},Paiements!$E:$E,"Don")`,
        '=' + pay('L'), '=' + pay('O'),
        '=' + pay('O', ',Paiements!$P:$P,"En cours de virement"'),
        '=' + pay('O', ',Paiements!$P:$P,"Arrivé en banque"'),
        '=' + rev(NATURES[0], ['Envoyé', 'Reçu par la personne']),
        '=' + rev(NATURES[1], ['Envoyé', 'Reçu par la personne']),
        `=SUMIFS(Reversements!$D:$D,Reversements!$B:$B,${c},Reversements!$F:$F,"Prévu")`,
        `=ROUND(D${r}-G${r}-H${r},2)`,
        `=IF(D${r}=0,"Aucun don",IF(J${r}<=0,"Soldé",IF(G${r}+H${r}>0,"Reversé en partie",IF(F${r}=0,"En attente de Stripe","À reverser"))))`].map(f => local(ss, f))]);
    });
    listes(wr, wc);
    mettreEnForme(wv, [4, 5, 6, 7, 8, 9, 10, 11]); mettreEnForme(wp, [12, 13, 14, 15]); mettreEnForme(wc, [3, 4, 5, 6, 7, 8, 9, 10]); mettreEnForme(onglet(ss, 'Détail par type'), [6, 7, 8, 9]);
    return repondre({ ok: true, lignes: P.length });
  } catch (err) {
    return repondre({ ok: false, error: String(err && err.message || err) });
  } finally { verrou.releaseLock(); }
}

function onglet(ss, nom) {
  let w = ss.getSheetByName(nom);
  if (!w) {
    w = ss.insertSheet(nom);
    w.getRange(1, 1, 1, ONGLETS[nom].length).setValues([ONGLETS[nom]]).setFontWeight('bold').setFontColor('#ffffff').setBackground(nom === 'Reversements' ? '#a8842a' : '#1f6a72').setWrap(true);
    w.setFrozenRows(1);
    if (nom === 'Reversements') {
      w.getRange(2, 1, 999, 1).setNumberFormat('dd/mm/yyyy');
      w.getRange(2, 4, 999, 1).setNumberFormat('#,##0.00 €').setDataValidation(SpreadsheetApp.newDataValidation().requireNumberGreaterThan(0).setAllowInvalid(false).build());
      w.getRange(2, 3, 999, 1).setDataValidation(SpreadsheetApp.newDataValidation().requireValueInList(NATURES, true).setAllowInvalid(false).build());
      w.getRange(2, 6, 999, 1).setDataValidation(SpreadsheetApp.newDataValidation().requireValueInList(STATUTS_REV, true).setAllowInvalid(false).build());
      w.setColumnWidths(1, 7, 170);
    }
    if (nom === 'Cagnottes') {   // statut en couleur
      const st = w.getRange('K2:K1000');
      w.setConditionalFormatRules([['Soldé', '#d9ead3'], ['Reversé en partie', '#fff2cc'], ['À reverser', '#f4cccc'], ['En attente de Stripe', '#e3f1f0']].map(([t, c]) => SpreadsheetApp.newConditionalFormatRule().whenTextEqualTo(t).setBackground(c).setRanges([st]).build()));
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

// Liste déroulante des cagnottes dans « Reversements » (toujours à jour)
function listes(wr, wc) {
  wr.getRange(2, 2, 999, 1).setDataValidation(SpreadsheetApp.newDataValidation().requireValueInRange(wc.getRange('A2:A1000'), true).setAllowInvalid(false).build());
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
