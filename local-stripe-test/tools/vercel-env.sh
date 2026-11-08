#!/bin/bash
# Copie les secrets du paiement vers le projet Vercel « emounateha-don » (production), sans les afficher.
# À lancer soi-même dans Terminal :  bash /Users/yarone/Emounateha-paiement-cerfa/local-stripe-test/tools/vercel-env.sh
set -e
DIR="$(cd "$(dirname "$0")/.." && pwd)"          # local-stripe-test
SITE=/Users/yarone/Emounateha                   # site (DATABASE_URL)
V="npx --yes vercel@latest"
get() { grep -m1 "^$1=" "$2" 2>/dev/null | cut -d= -f2- | sed -e 's/^["'\'']//' -e 's/["'\'']$//'; }
put() { # put NOM VALEUR
  [ -z "$2" ] && { echo "  - $1 : vide, ignoré"; return; }
  $V env rm "$1" production --yes >/dev/null 2>&1 || true
  printf '%s' "$2" | $V env add "$1" production --sensitive >/dev/null && echo "  ✓ $1"
}

echo "1) Connexion à Vercel (compte emounateha) — une page s'ouvre dans le navigateur"
$V whoami >/dev/null 2>&1 || $V login
cd "$DIR"
$V link --yes --project emounateha-don --scope emounateha >/dev/null && echo "  ✓ projet emounateha-don lié"

echo "2) Envoi des secrets"
put STRIPE_SECRET_KEY      "$(get STRIPE_SECRET_KEY "$DIR/.env")"
put STRIPE_PUBLISHABLE_KEY "$(get STRIPE_PUBLISHABLE_KEY "$DIR/.env")"
put DATA_KEY               "$(get DATA_KEY "$DIR/.env")"
DB="$(get DATABASE_URL "$SITE/vercel.env")"; [ -z "$DB" ] && DB="$(get DATABASE_URL "$SITE/.env")"
put DATABASE_URL "$DB"
put PUBLIC_URL "https://www.emounateha.fr/don-cerfa"

echo
echo "3) Secret du webhook Stripe : dans Stripe (mode test) > Workbench > Webhooks > whimsical-breeze,"
echo "   « Clé secrète de signature » > Révéler, copie le whsec_… puis colle-le ici (rien ne s'affiche) :"
read -rs WH; echo
put STRIPE_WEBHOOK_SECRET "$WH"

echo
echo "4) E-mails (facultatif, Entrée pour passer). Hôte SMTP (ex. smtp-relay.brevo.com) :"
read -r SH
if [ -n "$SH" ]; then
  read -rp "   Identifiant SMTP : " SU
  read -rsp "   Mot de passe SMTP (rien ne s'affiche) : " SP; echo
  read -rp "   Expéditeur (ex. Émounatéha <emounateha770@gmail.com>) : " SF
  put SMTP_HOST "$SH"; put SMTP_PORT "587"; put SMTP_USER "$SU"; put SMTP_PASS "$SP"; put MAIL_FROM "$SF"
fi

echo
echo "5) Redéploiement"
$V deploy --prod --yes >/dev/null && echo "  ✓ en ligne : https://www.emounateha.fr/don-cerfa/"
