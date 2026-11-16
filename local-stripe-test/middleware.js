// Vercel (avant les fichiers statiques) : sur clubhai.emounateha.fr, la racine affiche la page du Club 'Haï — sans redirection, l'adresse reste la même.
// Ne s'applique qu'à « / » ; toutes les autres adresses et tous les autres domaines passent sans changement.
export const config = { matcher: '/' };
export default function middleware(request) {
  const hote = (request.headers.get('host') || '').toLowerCase();
  if (hote !== 'clubhai.emounateha.fr') return;
  const url = new URL(request.url); url.pathname = '/campagne/club';
  return new Response(null, { headers: { 'x-middleware-rewrite': url.toString() } });
}
