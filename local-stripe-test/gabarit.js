// Mise en page commune des relevés envoyés par e-mail et en PDF : avis de virement (association) et relevé de commission (prestataire).
// Même ordre de lecture partout : bandeau (logo + nature du document), grand montant et état, trois repères, calcul, détail avec total, références.
// Tableaux et styles en ligne uniquement : c'est ce que les messageries affichent correctement.
const TEAL = '#1f6a72', OR = '#a8842a', GRIS = '#6b7280', TRAIT = '#e5e7eb', ENCRE = '#111827', FOND = '#f3f8f8', ROUGE = '#b91c1c';
const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const LOGO_URL = 'https://don.emounateha.fr/logo-asso.png';
let logoCache = null;
function logoData() {   // logo intégré au PDF (pas d'accès réseau au moment de l'impression)
  if (logoCache === null) {   // deux emplacements : public/ (en local) ou la racine du serveur des dons (fichier embarqué par vercel.json)
    logoCache = '';
    for (const f of [require('path').join(__dirname, 'public', 'logo-asso.png'), require('path').join(__dirname, 'logo-asso.png')]) { try { logoCache = 'data:image/png;base64,' + require('fs').readFileSync(f).toString('base64'); break; } catch (e) {} }
  }
  return logoCache;
}

// Bandeau : logo à gauche, nature du document et date à droite
function bandeau({ titre, sous, pourPdf }) {
  const src = pourPdf ? logoData() : LOGO_URL, h = pourPdf ? 84 : 72;
  return `<table cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;margin:0 0 22px;border-bottom:3px solid ${TEAL}"><tr>
<td style="padding:0 0 12px;vertical-align:bottom">${src ? `<img src="${src}" alt="Émounatéha" height="${h}" style="height:${h}px;width:auto;display:block">` : `<span style="font-size:22px;font-weight:bold;color:${TEAL}">Émounatéha</span>`}</td>
<td style="padding:0 0 12px;vertical-align:bottom;text-align:right"><span style="font-size:${pourPdf ? 21 : 19}px;font-weight:bold;color:${TEAL}">${esc(titre)}</span>${sous ? `<br><span style="font-size:12px;color:${GRIS}">${esc(sous)}</span>` : ''}</td></tr></table>`;
}

// Le chiffre à retenir, avec son état en pastille
function montant({ etiquette, valeur, etat, alerte }) {
  const c = alerte ? ROUGE : TEAL;
  return `<p style="margin:0 0 6px;font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:${alerte ? ROUGE : OR};font-weight:bold">${esc(etiquette)}</p>
<p style="margin:0;font-size:38px;font-weight:bold;color:${c};line-height:1.05">${esc(valeur)}</p>
${etat ? `<p style="margin:10px 0 0"><span style="display:inline-block;padding:5px 12px;border-radius:99px;background:${alerte ? '#fdecec' : '#e3f1f0'};color:${c};font-size:13px;font-weight:bold">${esc(etat)}</span></p>` : ''}`;
}

// Trois repères côte à côte (ou moins) : [{ l: libellé, v: valeur, sous: précision }]
function reperes(cases) {
  const C = (cases || []).filter(Boolean); if (!C.length) return '';
  const w = Math.floor(100 / C.length);
  return `<table cellpadding="0" cellspacing="0" style="width:100%;border-collapse:separate;border-spacing:0;margin:18px 0 6px"><tr>` + C.map((x, i) =>
    `<td style="width:${w}%;vertical-align:top;padding:12px 14px;background:${FOND};border-left:${i ? '4px solid #fff' : '0'};${i === 0 ? 'border-radius:10px 0 0 10px;' : ''}${i === C.length - 1 ? 'border-radius:0 10px 10px 0;' : ''}"><span style="font-size:11px;letter-spacing:.05em;text-transform:uppercase;color:${GRIS}">${esc(x.l)}</span><br><span style="font-size:16px;font-weight:bold;color:${ENCRE};line-height:1.35">${esc(x.v)}</span>${x.sous ? `<br><span style="font-size:12px;color:${GRIS}">${esc(x.sous)}</span>` : ''}</td>`).join('') + '</tr></table>';
}

// Titre de partie, numéroté : on suit le document dans l'ordre
function partie(n, titre) {
  return `<table cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin:24px 0 8px"><tr><td style="width:26px;height:26px;border-radius:50%;background:${TEAL};color:#fff;font-size:13px;font-weight:bold;text-align:center;vertical-align:middle">${esc(n)}</td><td style="padding-left:10px;font-size:16px;font-weight:bold;color:${ENCRE}">${esc(titre)}</td></tr></table>`;
}

// Encadré d'explications, une idée par ligne
function note(lignes, titre) {
  return `<div style="margin:16px 0 0;padding:13px 16px;background:${FOND};border-left:4px solid ${TEAL};border-radius:0 10px 10px 0;font-size:13.5px;line-height:1.6;color:#374151">${titre ? `<b style="color:${ENCRE}">${esc(titre)}</b><br>` : ''}${(lignes || []).map(x => '• ' + esc(x)).join('<br>')}</div>`;
}

// Avertissement (exemple, compte de test)
function avertissement(texte) {
  if (!texte) return '';
  const i = texte.indexOf(':');
  return `<p style="margin:0 0 18px;padding:10px 12px;background:#fff9ea;border:1px solid #f5d48a;border-radius:8px;font-size:13px;line-height:1.5;color:#7a5a10">${i > 0 ? `<b>${esc(texte.slice(0, i))} :</b>${esc(texte.slice(i + 1))}` : `<b>${esc(texte)}</b>`}</p>`;
}

// Références en bas de document : [[libellé, valeur]]
function references(paires) {
  return `<table cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;margin-top:22px;border-top:1px solid ${TRAIT};font-size:12.5px;color:${GRIS}">` + (paires || []).filter(Boolean).map(x => `<tr><td style="padding:5px 0 0">${esc(x[0])}</td><td style="padding:5px 0 0;text-align:right;color:#374151">${esc(x[1])}</td></tr>`).join('') + '</table>';
}

const PIED = 'Document établi automatiquement à partir des mouvements enregistrés par Stripe. Montants en euros, sans estimation.';
function enMail(corps, pied) {
  return `<div style="font-family:Arial,Helvetica,sans-serif;color:#1f2937;max-width:640px;margin:0 auto;padding:22px 20px;background:#fff">${corps}${pied ? `<p style="margin:20px 0 0;padding-top:12px;border-top:1px solid ${TRAIT};font-size:12px;color:${GRIS};line-height:1.5">${esc(pied)}</p>` : ''}</div>`;
}
function enPdf(corps) {
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><style>@page{size:A4;margin:15mm 15mm 16mm}html,body{background:#fff}body{font-family:Arial,Helvetica,sans-serif;color:#1f2937;margin:0}tr{page-break-inside:avoid}thead{display:table-header-group}</style></head><body>
${corps}<p style="margin:22px 0 0;padding-top:10px;border-top:1px solid ${TRAIT};font-size:10.5px;color:${GRIS}">${esc(PIED)}</p></body></html>`;
}

module.exports = { TEAL, OR, GRIS, TRAIT, ENCRE, FOND, ROUGE, esc, logoData, bandeau, montant, reperes, partie, note, avertissement, references, enMail, enPdf, PIED };
