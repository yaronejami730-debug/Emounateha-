# Consignes du projet Émounatéha

## DÉPLOIEMENT : règle impérative

Avant **tout** déploiement (`vercel deploy`, push sur `main`, mise en ligne), **lire `DEPLOIEMENT.md` en entier et appliquer sa procédure**, sans exception et quelle que soit la demande.

- Interdit de déployer si un bouton de paiement, un moyen de paiement, un reçu CERFA (ponctuel ou chaque mensualité) ou un don mensuel ne fonctionne pas.
- **Au moindre doute, ne pas déployer** : prévenir Yarone et expliquer.
- Porte automatique : `node scripts/verifier-avant-deploiement.js` doit réussir (laissez-passer `.deploiement-verifie` du commit courant).
- Après déploiement : `node scripts/verifier-apres-deploiement.js` ; en cas d'échec, retour arrière immédiat.
- Jamais de vrais paiements pour tester, jamais le serveur de la racine en local (base de production).
