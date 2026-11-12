// Actualités : flux RSS public de hassidout.org, lu côté serveur (le navigateur ne peut pas le lire directement), mis en cache 15 minutes.
// On ne garde que ce que le flux publie pour être repris : titre, date, rubrique, court extrait, image, et le lien vers l'article d'origine.
// L'article complet (fonction article, plus bas) est repris avec l'accord de hassidout.org, crédité, avec lien vers l'original.

const SOURCE = 'https://hassidout.org/feed/';
const SITE = /^https:\/\/(www\.)?hassidout\.org\//;
const DUREE = 15 * 60 * 1000;
let cache = null, enCours = null;

const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', hellip: '…', laquo: '«', raquo: '»', rsquo: '’', lsquo: '‘', ldquo: '“', rdquo: '”', ndash: '–', mdash: '—' };
function texte(s) {
  return String(s || '')
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&#x([0-9a-f]+);/gi, (m, h) => { const n = parseInt(h, 16); return n > 0 && n < 0x110000 ? String.fromCodePoint(n) : ''; })
    .replace(/&#(\d+);/g, (m, d) => { const n = +d; return n > 0 && n < 0x110000 ? String.fromCodePoint(n) : ''; })
    .replace(/&([a-z]+);/gi, (m, n) => ENT[n.toLowerCase()] != null ? ENT[n.toLowerCase()] : m)
    .replace(/[ \s]+/g, ' ')
    .trim();
}
function balise(s, tag) { const m = s.match(new RegExp('<' + tag + '(?:\\s[^>]*)?>([\\s\\S]*?)</' + tag + '>', 'i')); return m ? m[1] : ''; }
function extrait(s, max = 260) {
  s = s.replace(/\s*(Lire la suite|The post|L’article|L'article)\b[\s\S]*$/i, '').replace(/\s*\[(…|\.\.\.)\]\s*$/, '').trim();
  if (s.length <= max) return s;
  const c = s.slice(0, max); const i = c.lastIndexOf(' ');
  return c.slice(0, i > max * 0.6 ? i : max).replace(/[\s,;:.–—-]+$/, '') + '…';
}

function lire(xml) {
  const items = String(xml).split(/<item(?:\s[^>]*)?>/i).slice(1).map(x => x.split(/<\/item>/i)[0]);
  const out = [];
  for (const it of items) {
    const lien = texte(balise(it, 'link'));
    if (!SITE.test(lien)) continue;   // seulement des liens vers le site d'origine
    const titre = texte(balise(it, 'title'));
    if (!titre) continue;
    const d = Date.parse(texte(balise(it, 'pubDate')));
    let image = '';
    const m = it.match(/<media:content[^>]*\burl="([^"]+)"[^>]*>/i) || it.match(/<enclosure[^>]*\burl="([^"]+)"[^>]*type="image\/[^"]*"/i) || it.match(/<img[^>]*\bsrc="([^"]+)"/i);
    if (m && SITE.test(m[1]) && /\.(webp|jpe?g|png|gif|avif)(\?|$)/i.test(m[1])) image = m[1];
    const audio = /<enclosure[^>]*type="audio\//i.test(it);
    out.push({
      titre: titre.slice(0, 220),
      lien,
      date: isNaN(d) ? null : new Date(d).toISOString(),
      rubrique: texte(balise(it, 'category')).slice(0, 40),
      resume: extrait(texte(balise(it, 'description'))),
      image,
      audio,
    });
    if (out.length >= 30) break;
  }
  return out;
}

async function charger(fetchFn = fetch) {
  const r = await fetchFn(SOURCE, { headers: { 'user-agent': 'Mozilla/5.0 (compatible; lecteur RSS emounateha.fr)', accept: 'application/rss+xml, application/xml, text/xml' }, signal: AbortSignal.timeout(10000) });
  if (!r.ok) throw new Error('flux ' + r.status);
  const items = lire(await r.text());
  if (!items.length) throw new Error('flux vide');
  return items;
}

// Renvoie { items, source, maj, ancien } ; en cas de panne du site d'origine, sert la dernière version connue.
async function actualites(fetchFn) {
  if (cache && Date.now() - cache.at < DUREE) return { items: cache.items, source: 'https://hassidout.org/', maj: new Date(cache.at).toISOString() };
  if (!enCours) enCours = charger(fetchFn).then(items => { cache = { at: Date.now(), items }; return items; }).finally(() => { enCours = null; });
  try { const items = await enCours; return { items, source: 'https://hassidout.org/', maj: new Date(cache.at).toISOString() }; }
  catch (e) { if (cache) return { items: cache.items, source: 'https://hassidout.org/', maj: new Date(cache.at).toISOString(), ancien: true }; throw e; }
}

// ---------- Article complet (avec l'accord de hassidout.org) : lu par l'API WordPress publique du site, puis nettoyé ----------
// Nettoyage à liste blanche : seules ces balises passent, sans aucun attribut sauf ceux listés ; scripts, styles, formulaires, cadres… sont retirés avec leur contenu.
const GARDE = new Set(['p', 'br', 'strong', 'b', 'em', 'i', 'u', 'blockquote', 'ul', 'ol', 'li', 'h2', 'h3', 'h4', 'h5', 'hr', 'a', 'img', 'figure', 'figcaption', 'audio', 'source', 'span', 'sup', 'sub', 'small']);
const VIDE = new Set(['br', 'hr', 'img', 'source']);
const JETE = new Set(['script', 'style', 'noscript', 'iframe', 'object', 'embed', 'form', 'svg', 'math', 'template', 'textarea', 'select', 'button', 'video', 'canvas', 'head', 'title']);
const MEDIA = /^https:\/\/((www\.)?hassidout\.org\/wp-content\/|i[0-3]\.wp\.com\/(www\.)?hassidout\.org\/wp-content\/)/;
function attrs(s) { const o = {}; s.replace(/([a-zA-Z_:][\w:.-]*)\s*=\s*("([^"]*)"|'([^']*)'|([^\s"'>]+))/g, (m, k, v, a, b, c) => { o[k.toLowerCase()] = texte(a != null ? a : b != null ? b : c); return ''; }); return o; }
const ea = v => String(v).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
// mots hébreux au milieu du français (ex. « ע״ה ») : isolés, sinon le navigateur mélange l'ordre avec les mots voisins
function hebreu(t) { return t.replace(/[\u200e\u200f]/g, '').replace(/([\u0590-\u05ff])[\u00a0 ]?[«»"”“][\u00a0 ]?([\u0590-\u05ff])/g, '$1״$2')   // « ע »ה » (guillemet français mis par erreur à la place du ״ hébreu) → ע״ה
    .replace(/[\u0590-\u05ff](?:[\u0590-\u05ff\u05f3\u05f4"'׳״\u00a0 ]*[\u0590-\u05ff\u05f3\u05f4׳״])?/g, m => '<bdi dir="rtl" lang="he">' + m + '</bdi>'); }
function nettoyer(html) {
  html = String(html || '').replace(/<!--[\s\S]*?-->/g, '').replace(/<!\[CDATA\[[\s\S]*?\]\]>/g, '');
  const out = [], pile = []; let saute = null, sautN = 0;
  const re = /<\/?([a-zA-Z][\w-]*)((?:[^>"']|"[^"]*"|'[^']*')*)>|<[!?][^>]*>|[^<]+|</g; let m;
  while ((m = re.exec(html))) {
    const tok = m[0];
    if (tok[0] !== '<' || tok === '<') { if (!saute) out.push(hebreu(tok.replace(/</g, '&lt;').replace(/>/g, '&gt;'))); continue; }
    if (!m[1]) continue;   // balise mal formée : ignorée
    const nom = m[1].toLowerCase(), ferme = tok[1] === '/';
    if (saute) { if (nom === saute) { if (ferme) { if (--sautN === 0) saute = null; } else if (!/\/\s*>$/.test(tok)) sautN++; } continue; }
    if (JETE.has(nom)) { if (!ferme && !/\/\s*>$/.test(tok)) { saute = nom; sautN = 1; } continue; }
    if (!GARDE.has(nom)) continue;   // balise inconnue : on garde seulement son texte
    if (ferme) { if (VIDE.has(nom)) continue; const i = pile.lastIndexOf(nom); if (i < 0) continue; while (pile.length > i) out.push('</' + pile.pop() + '>'); continue; }
    const a = attrs(m[2] || ''); let x = '';
    if (nom === 'a') {
      const h = a.href || '';
      if (!/^https?:\/\//i.test(h) && !/^mailto:/i.test(h)) { continue; }   // lien relatif ou javascript: → texte seul
      x = ' href="' + ea(h) + '" target="_blank" rel="noopener noreferrer"';
    } else if (nom === 'img') {
      const src = a['data-src'] || a['data-lazy-src'] || a.src || '';
      if (!MEDIA.test(src)) continue;
      x = ' src="' + ea(src) + '" alt="' + ea((a.alt || '').slice(0, 200)) + '" loading="lazy" decoding="async" referrerpolicy="no-referrer"';
    } else if (nom === 'audio' || nom === 'source') {
      const src = a.src || '';
      if (src && !MEDIA.test(src)) continue;
      x = (src ? ' src="' + ea(src) + '"' : '') + (nom === 'audio' ? ' controls preload="none"' : '') + (nom === 'source' && /^audio\/[\w.+-]+$/.test(a.type || '') ? ' type="' + a.type + '"' : '');
    }
    out.push('<' + nom + x + '>');
    if (!VIDE.has(nom)) pile.push(nom);
  }
  while (pile.length) out.push('</' + pile.pop() + '>');
  return out.join('')
    .replace(/<(p|span|strong|em|b|i|u)>(\s|&nbsp;|&#160;)*<\/\1>/g, '')   // paragraphes vides
    .replace(/(<br>\s*){3,}/g, '<br><br>')
    .trim();
}

const SLUG = /^[a-z0-9%_-]{1,220}$/i, API = 'https://hassidout.org/wp-json/wp/v2/posts';
const articles = new Map(), ARTICLE_DUREE = 60 * 60 * 1000;
async function article(slug, fetchFn = fetch) {
  slug = String(slug || '').toLowerCase();
  if (!SLUG.test(slug)) { const e = new Error('adresse invalide'); e.code = 400; throw e; }
  const c = articles.get(slug); if (c && Date.now() - c.at < ARTICLE_DUREE) return c.v;
  try {
    const r = await fetchFn(API + '?slug=' + encodeURIComponent(decodeURIComponent(slug)) + '&_embed=wp:featuredmedia,wp:term', { headers: { 'user-agent': 'Mozilla/5.0 (compatible; lecteur emounateha.fr)', accept: 'application/json' }, signal: AbortSignal.timeout(12000) });
    if (!r.ok) throw new Error('article ' + r.status);
    const j = await r.json(), p = Array.isArray(j) && j[0];
    if (!p) { const e = new Error('article introuvable'); e.code = 404; throw e; }
    const fm = p._embedded && p._embedded['wp:featuredmedia'] && p._embedded['wp:featuredmedia'][0];
    const terms = (p._embedded && p._embedded['wp:term'] || []).flat().filter(t => t && t.taxonomy === 'category').map(t => texte(t.name));
    const image = fm && MEDIA.test(fm.source_url || '') ? fm.source_url : '';
    const lien = SITE.test(p.link || '') ? p.link : 'https://hassidout.org/';
    const v = { titre: texte(p.title && p.title.rendered).slice(0, 300), date: p.date_gmt ? p.date_gmt + 'Z' : p.date || null, rubrique: terms[0] || '', image, lien, html: nettoyer(p.content && p.content.rendered) };
    if (articles.size > 300) articles.clear();
    articles.set(slug, { at: Date.now(), v });
    return v;
  } catch (e) { if (c) return c.v; throw e; }
}

module.exports = { actualites, article, nettoyer, lire, extrait, texte, _vider: () => { cache = null; articles.clear(); } };
