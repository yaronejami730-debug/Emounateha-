// Petit générateur de fichiers Excel (.xlsx), sans dépendance : quelques onglets, du texte, des nombres, des formules,
// une ligne d'en-tête colorée et figée, des filtres, des largeurs de colonnes et un format « euros ».
// Un .xlsx est un zip de fichiers XML : on les écrit sans compression (méthode « stockée », lue par Excel, Numbers, LibreOffice et Google Sheets).
//
// feuilles = [{ nom, colonnes: [largeurs], lignes: [[cellule, …], …], filtre: true, figer: 1 }]
// cellule  = texte | nombre | null | { v (valeur, ou valeur déjà calculée de la formule), f (formule sans « = »), s: 'entete' | 'eur' | 'gras' | 'eurGras' | 'total' | 'eurTotal' | 'titre' | 'alerte' }

const zlib = require('zlib');
const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
const crc32 = b => { if (typeof zlib.crc32 === 'function') return zlib.crc32(b) >>> 0; let c = 0xffffffff; for (const x of b) c = CRC[(c ^ x) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };

function zip(fichiers) {   // [{ nom, contenu: Buffer }] → Buffer (zip, méthode stockée)
  const parts = [], central = []; let pos = 0;
  for (const f of fichiers) {
    const nom = Buffer.from(f.nom, 'utf8'), d = f.contenu, crc = crc32(d), h = Buffer.alloc(30);
    h.writeUInt32LE(0x04034b50, 0); h.writeUInt16LE(20, 4); h.writeUInt16LE(0x0800, 6); h.writeUInt16LE(0, 8); h.writeUInt16LE(0, 10); h.writeUInt16LE(0x21, 12);
    h.writeUInt32LE(crc, 14); h.writeUInt32LE(d.length, 18); h.writeUInt32LE(d.length, 22); h.writeUInt16LE(nom.length, 26); h.writeUInt16LE(0, 28);
    const c = Buffer.alloc(46);
    c.writeUInt32LE(0x02014b50, 0); c.writeUInt16LE(20, 4); c.writeUInt16LE(20, 6); c.writeUInt16LE(0x0800, 8); c.writeUInt16LE(0, 10); c.writeUInt16LE(0, 12); c.writeUInt16LE(0x21, 14);
    c.writeUInt32LE(crc, 16); c.writeUInt32LE(d.length, 20); c.writeUInt32LE(d.length, 24); c.writeUInt16LE(nom.length, 28); c.writeUInt32LE(pos, 42);
    parts.push(h, nom, d); central.push(c, nom); pos += 30 + nom.length + d.length;
  }
  const cd = Buffer.concat(central), fin = Buffer.alloc(22);
  fin.writeUInt32LE(0x06054b50, 0); fin.writeUInt16LE(fichiers.length, 8); fin.writeUInt16LE(fichiers.length, 10); fin.writeUInt32LE(cd.length, 12); fin.writeUInt32LE(pos, 16);
  return Buffer.concat([...parts, cd, fin]);
}

const x = s => String(s == null ? '' : s).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const colonne = i => { let s = ''; i++; while (i) { const r = (i - 1) % 26; s = String.fromCharCode(65 + r) + s; i = Math.floor((i - 1) / 26); } return s; };
// styles (index dans cellXfs) : 0 normal, 1 en-tête, 2 euros, 3 gras, 4 euros gras, 5 total, 6 euros total, 7 titre, 8 alerte
const STYLE = { entete: 1, eur: 2, gras: 3, eurGras: 4, total: 5, eurTotal: 6, titre: 7, alerte: 8 };
const STYLES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<numFmts count="1"><numFmt numFmtId="164" formatCode="#,##0.00\\ &quot;€&quot;"/></numFmts>
<fonts count="5"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="14"/><color rgb="FF1F6A72"/><name val="Calibri"/></font><font><b/><sz val="11"/><color rgb="FFB45309"/><name val="Calibri"/></font></fonts>
<fills count="4"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF1F6A72"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFE3F1F0"/></patternFill></fill></fills>
<borders count="2"><border/><border><top style="medium"><color rgb="FF1F6A72"/></top></border></borders>
<cellStyleXfs count="1"><xf/></cellStyleXfs>
<cellXfs count="9"><xf/><xf fontId="1" fillId="2" applyFont="1" applyFill="1" applyAlignment="1"><alignment wrapText="1" vertical="center"/></xf><xf numFmtId="164" applyNumberFormat="1"/><xf fontId="2" fillId="3" applyFont="1" applyFill="1"/><xf numFmtId="164" fontId="2" fillId="3" applyNumberFormat="1" applyFont="1" applyFill="1"/><xf fontId="2" borderId="1" applyFont="1" applyBorder="1"/><xf numFmtId="164" fontId="2" borderId="1" applyNumberFormat="1" applyFont="1" applyBorder="1"/><xf fontId="3" applyFont="1"/><xf fontId="4" applyFont="1"/></cellXfs>
<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`;

function feuille(f) {
  const L = f.lignes || [], larg = f.colonnes || [], nbCol = Math.max(1, ...L.map(r => r.length));
  const rows = L.map((r, i) => `<row r="${i + 1}">` + r.map((c, j) => {
    if (c == null || c === '') return '';
    const o = typeof c === 'object' ? c : { v: c }, ref = colonne(j) + (i + 1), s = o.s ? ` s="${STYLE[o.s] || 0}"` : '';
    if (o.f) return `<c r="${ref}"${s}><f>${x(o.f)}</f>${typeof o.v === 'number' && isFinite(o.v) ? `<v>${o.v}</v>` : ''}</c>`;   // valeur déjà calculée : affichée même par les aperçus qui ne calculent pas
    if (typeof o.v === 'number' && isFinite(o.v)) return `<c r="${ref}"${s}><v>${o.v}</v></c>`;
    if (o.v == null || o.v === '') return s ? `<c r="${ref}"${s}/>` : '';
    return `<c r="${ref}"${s} t="inlineStr"><is><t xml:space="preserve">${x(o.v)}</t></is></c>`;
  }).join('') + '</row>').join('');
  const fig = f.figer ? `<sheetViews><sheetView workbookViewId="0"><pane ySplit="${f.figer}" topLeftCell="A${f.figer + 1}" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>` : '';
  const cols = larg.length ? '<cols>' + larg.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join('') + '</cols>' : '';
  const filtre = f.filtre && L.length > 1 ? `<autoFilter ref="A${f.filtreLigne || 1}:${colonne(nbCol - 1)}${f.filtreFin || L.length}"/>` : '';
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">${fig}${cols}<sheetData>${rows}</sheetData>${filtre}</worksheet>`;
}

function classeur(feuilles) {
  const F = feuilles.map((f, i) => ({ ...f, nom: String(f.nom || 'Feuille ' + (i + 1)).replace(/[\\/?*[\]:]/g, ' ').slice(0, 31) }));
  const B = s => Buffer.from(s, 'utf8');
  return zip([
    { nom: '[Content_Types].xml', contenu: B(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${F.map((f, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}</Types>`) },
    { nom: '_rels/.rels', contenu: B(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`) },
    { nom: 'xl/workbook.xml', contenu: B(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${F.map((f, i) => `<sheet name="${x(f.nom)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets><definedNames>${F.map((f, i) => f.filtre && (f.lignes || []).length > 1 ? `<definedName name="_xlnm._FilterDatabase" localSheetId="${i}" hidden="1">'${x(f.nom).replace(/'/g, "''")}'!$A$${f.filtreLigne || 1}:$${colonne(Math.max(1, ...f.lignes.map(r => r.length)) - 1)}$${f.filtreFin || f.lignes.length}</definedName>` : '').join('')}</definedNames><calcPr calcId="191029" fullCalcOnLoad="1"/></workbook>`) },
    { nom: 'xl/_rels/workbook.xml.rels', contenu: B(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${F.map((f, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')}<Relationship Id="rId${F.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`) },
    { nom: 'xl/styles.xml', contenu: B(STYLES) },
    ...F.map((f, i) => ({ nom: `xl/worksheets/sheet${i + 1}.xml`, contenu: B(feuille(f)) }))
  ]);
}

module.exports = { classeur, colonne, zip, crc32 };
