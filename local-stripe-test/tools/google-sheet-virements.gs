/**
 * Google Sheet « Virements Émounatéha » : tenu à jour automatiquement par le serveur des dons, à chaque virement Stripe → banque.
 *
 * À coller dans un projet Apps Script du compte de l'association (script.google.com → Nouveau projet ; ou Extensions → Apps Script dans le Sheet) → Enregistrer.
 * Puis : Paramètres du projet (roue dentée) → Propriétés du script → ajouter SECRET = (le code secret donné par Claude).
 * Puis : Déployer → Nouveau déploiement → type « Application Web » → Exécuter en tant que : Moi → Accès : Tout le monde → Déployer.
 * Copier l'URL de l'application Web (https://script.google.com/macros/s/…/exec) et la donner à Claude.
 *
 * Trois onglets, créés tout seuls au premier virement :
 *  - « Virements »  : une ligne par virement (brut, frais Stripe, virement banque, frais 7 %, net, dont dons généraux, dont besoins) ;
 *  - « Paiements »  : une ligne par paiement (type de don ou cagnotte, donateur, e-mail, ID de paiement Stripe, montants, virement) ;
 *  - « Cagnottes »  : pour chaque cagnotte, le total dû (calculé depuis « Paiements »), une colonne « Déjà reversé » à remplir
 *                     par la trésorière, et le reste à reverser.
 * Un même virement n'est jamais écrit deux fois (repéré par sa référence Stripe po_…).
 */

// Sheet de l'association « Virements Émounatéha » (compte emounateha770) : utilisé si le script n'est pas rattaché au Sheet lui-même.
const SHEET_ID = '1_4U4WtC2x2FjRoQu2-TsSkVDipUtKsc26u_LpMc0qpc';

const ONGLETS = {
  Virements: ['Date du virement', 'Référence Stripe', 'Paiements', 'Brut', 'Frais Stripe', 'Virement reçu en banque', 'Frais 7 %', 'Net pour l\'association', 'dont dons généraux', 'dont besoins (cagnottes)', 'Écart à vérifier', 'Écrit le'],
  Paiements: ['Date du virement', 'Référence du virement', 'Catégorie', 'Type de don / cagnotte', 'Nature', 'Date du paiement', 'Prénom', 'Nom', 'E-mail', 'ID de paiement Stripe', 'N° de reçu', 'Brut', 'Frais Stripe', 'Frais 7 %', 'Net'],
  Cagnottes: ['Cagnotte', 'Paiements', 'Brut', 'Net dû à la cagnotte', 'Déjà reversé (à remplir)', 'Reste à reverser']
};

function doPost(e) {
  const verrou = LockService.getScriptLock();
  verrou.waitLock(30000);
  try {
    const d = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    const secret = PropertiesService.getScriptProperties().getProperty('SECRET');
    if (!secret || d.secret !== secret) return repondre({ ok: false, error: 'secret invalide' });
    const v = d.virement || {}, P = Array.isArray(d.paiements) ? d.paiements : [];
    if (!/^po_[A-Za-z0-9]+$/.test(String(v.id || ''))) return repondre({ ok: false, error: 'virement sans référence' });
    const ss = SpreadsheetApp.getActiveSpreadsheet() || SpreadsheetApp.openById(SHEET_ID), wv = onglet(ss, 'Virements'), wp = onglet(ss, 'Paiements'), wc = onglet(ss, 'Cagnottes');
    if (wv.getLastRow() > 1 && wv.getRange(2, 2, wv.getLastRow() - 1, 1).getValues().some(r => r[0] === v.id)) return repondre({ ok: true, deja: true });
    const e2 = c => Math.round(Number(c) || 0) / 100, S = (L, k) => L.reduce((a, x) => a + (Number(x[k]) || 0), 0), txt = s => String(s == null ? '' : s).replace(/^[=+\-@]/, "'$&");
    const gen = P.filter(p => p.categorie === 'general'), bes = P.filter(p => p.categorie === 'besoin'), CAT = { general: 'Dons généraux', besoin: 'Besoin (cagnotte)', autre: 'Autre mouvement Stripe' };
    wv.appendRow([v.date, v.id, P.filter(p => p.nature === 'Don').length, e2(S(P, 'brut')), -e2(S(P, 'frais')), e2(v.montant), -e2(S(P, 'com')), e2(v.montant) - e2(S(P, 'com')), e2(S(gen, 'net')), e2(S(bes, 'net')), e2(v.ecart), new Date()]);
    if (P.length) wp.getRange(wp.getLastRow() + 1, 1, P.length, ONGLETS.Paiements.length).setValues(P.map(p => [v.date, v.id, CAT[p.categorie] || txt(p.categorie), txt(p.type), txt(p.nature === 'Autre' ? 'Mouvement Stripe' : p.nature), p.date, txt(p.prenom), txt(p.nom), txt(p.email), txt(p.id), txt(p.recu), e2(p.brut), -e2(p.frais), -e2(p.com), e2(p.net)]));
    // nouvelles cagnottes : une ligne chacune, avec ses formules (le total suit tout seul les paiements suivants)
    const connues = wc.getLastRow() > 1 ? wc.getRange(2, 1, wc.getLastRow() - 1, 1).getValues().map(r => r[0]) : [];
    [...new Set(bes.map(p => txt(p.type)))].filter(n => n && connues.indexOf(n) < 0).forEach(n => {
      const r = wc.getLastRow() + 1, cle = 'A' + r, f = col => `=SUMIFS(Paiements!${col}:${col},Paiements!$C:$C,"Besoin (cagnotte)",Paiements!$D:$D,${cle})`;
      wc.getRange(r, 1, 1, 6).setValues([[n, `=COUNTIFS(Paiements!$C:$C,"Besoin (cagnotte)",Paiements!$D:$D,${cle},Paiements!$E:$E,"Don")`, f('L'), f('O'), 0, `=D${r}-E${r}`]]);
    });
    mettreEnForme(wv, [4, 5, 6, 7, 8, 9, 10, 11]); mettreEnForme(wp, [12, 13, 14, 15]); mettreEnForme(wc, [3, 4, 5, 6]);
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
  }
  return w;
}

function mettreEnForme(w, colonnes) {
  const n = Math.max(1, w.getLastRow() - 1);
  colonnes.forEach(c => w.getRange(2, c, n, 1).setNumberFormat('#,##0.00 €'));
  if (w.getFilter()) w.getFilter().remove();   // le filtre suit les nouvelles lignes
  if (w.getLastRow() > 1) w.getRange(1, 1, w.getLastRow(), w.getLastColumn()).createFilter();
}

function repondre(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }
