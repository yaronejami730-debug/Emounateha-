// ambassadeur.emounateha.fr
//   /         → page « Devenir ambassadeur » (inscription)
//   /<prenom> → page de don avec le lien de l'ambassadeur (?amb=<prenom>), pour lui attribuer les dons
export const config = { matcher: ['/', '/:slug([a-z0-9-]+)'] };

export default function middleware(request) {
  const url = new URL(request.url);
  if (url.hostname !== 'ambassadeur.emounateha.fr') return;
  if (url.pathname === '/') {
    return new Response(null, { headers: { 'x-middleware-rewrite': new URL('/ambassadeur/', url).toString() } });
  }
  const slug = url.pathname.slice(1).toLowerCase();
  if (/^[a-z0-9-]{1,40}$/.test(slug) && slug !== 'ambassadeur') {
    return Response.redirect('https://don.emounateha.fr/?amb=' + encodeURIComponent(slug), 302);
  }
}
