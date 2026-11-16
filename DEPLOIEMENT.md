# DÉPLOIEMENT — PORTE OBLIGATOIRE

> **À LIRE EN ENTIER, À CHAQUE FOIS, avant tout `vercel deploy`, tout `git push` sur `main`, toute mise en ligne.**
> Ce fichier s'applique à tout agent (Claude ou autre) et à toute personne. Il ne se discute pas et ne se contourne pas.
> Demandé par Yarone le 17 novembre 2026, après une panne du bouton « Rejoindre » du Club ’Haï.

## La règle

**Il est STRICTEMENT INTERDIT de déployer si un seul bouton de paiement, un seul moyen de paiement, un seul reçu CERFA ou une seule mensualité ne fonctionne pas, ou si on n'est pas SÛR que tout fonctionne.**

**Au moindre doute, on ne déploie pas.** On prévient Yarone, on explique le doute, on attend.

Un doute, c'est par exemple : un test qui ne se lance pas, un test « ignoré », une vérification faite seulement à la main « à peu près », une modification de paiement jamais testée en vrai navigateur, un message d'erreur qu'on ne comprend pas, un compte Vercel qui n'est pas le bon. Un test qui ne s'exécute pas est un **échec**, pas un succès.

Cette règle passe avant toute demande de rapidité, y compris « pousse tout » ou « déploie vite ». Si Yarone demande de déployer alors que la porte est fermée, on lui répond que la porte est fermée, pourquoi, et ce qu'il faut réparer.

## La procédure (dans cet ordre, sans en sauter)

### 1. Committer d'abord
L'arbre git doit être propre : on déploie exactement ce qui a été testé. La CLI Vercel envoie le dossier tel qu'il est, pas le dernier commit.

### 2. Lancer la porte automatique
```bash
cd /Users/yarone/Emounateha
node scripts/verifier-avant-deploiement.js
```
- Elle lance tous les tests de `local-stripe-test/tests/` sur des **serveurs jetables** (données jetables, Stripe en mode **TEST**, mails simulés). **Aucun vrai paiement, aucun vrai mail, aucune écriture dans la base de production.**
- Elle exige : arbre git propre, `local-stripe-test/.env` présent, **chaque** fichier de test exécuté avec **zéro** échec.
- Si tout passe, elle écrit `.deploiement-verifie` (commit + date). **Pas de ce fichier, ou fichier d'un autre commit : on ne déploie pas.**
- Si elle échoue : on répare la cause, on relance. **Interdit** de supprimer, affaiblir, commenter ou « skipper » un test pour le faire passer.

Ce que la porte contrôle (voir `local-stripe-test/tests/`) :

| Fichier | Ce qu'il prouve |
|---|---|
| `boutons-pages.js` | En vrai navigateur (téléphone + ordinateur) : « Rejoindre » (Club), « Participer » (Hanouka), « Continuer » (don) ouvrent le formulaire ; montant libre ; montant invalide bloqué ; pas d'erreur JavaScript |
| `moyens.js` | Carte, PayPal, Klarna, prélèvement SEPA, en don ponctuel **et** mensuel ; SEPA : reçu seulement après versement |
| `campagnes.js` | Club (18 €/26 € par mois, abonnement actif, sans date de fin) et Hanouka : montant et fréquence imposés par le serveur ; compteur |
| `tous-les-dons.js` | Tous les types de dons (particulier, entreprise, affectations, mensuel…), reçus créés |
| `recu-a-la-demande.js` | Un reçu CERFA redemandé ressort identique (contenu et image), y compris après correction |
| `echecs.js` | Mensualité refusée par la banque : traitement et e-mails |
| `commission-*.js`, `virements.js` | Commission de 7 % et e-mails de virement |
| `cagnottes-calcul.js` | Calcul des mini-cagnottes |

### 3. Contrôles que les tests ne peuvent pas faire seuls (à faire à chaque fois qu'on touche au paiement)
Si la modification touche l'un de ces fichiers : `local-stripe-test/public/index.html`, `local-stripe-test/server.js`, `accounts.js`, `mailer.js`, `store.js`, `vault.js`, `local-stripe-test/vercel.json`, `middleware.js`, `vercel.json`, ou la page d'un Club/campagne — alors **en plus** de la porte :

1. **Reçus CERFA** : un don ponctuel de test produit un reçu (numéro, PDF). Un don mensuel produit **un reçu à chaque mensualité** (événement Stripe `invoice.paid`, motif `subscription_cycle`, traité par `fabriquer()` dans `server.js`). Le test `moyens.js`/`campagnes.js` doit le prouver — relire sa sortie, pas seulement « vert ».
2. **Dons mensuels** : l'abonnement créé est actif, au bon montant, **sans date de fin**, et le donateur peut l'arrêter depuis son espace.
3. **Webhook Stripe réel** (non testable hors ligne) : dans le tableau de bord Stripe **du projet** (pas le compte personnel de Yarone), le point d'entrée du webhook existe et écoute au minimum `payment_intent.succeeded`, `payment_intent.payment_failed`, `invoice.paid`. Si un doute : on ne déploie pas, on demande à Yarone de vérifier.
4. **Clés** : on ne change jamais les clés (`STRIPE_*`, `DATABASE_URL`, `DATA_KEY`) sans accord explicite de Yarone. Mode test/réel : ne jamais le basculer sans accord. Numérotation des reçus : série réelle `A2026/…` en production, série `TEST-…` seulement en test (`NUM_PREFIX`) — ne jamais les mélanger.
5. **Connexion donateur** : le code à 6 chiffres part par e-mail **et** par SMS (`accounts.js`).

### 4. Déployer (seulement si 1, 2 et 3 sont verts)
- Vérifier le compte : `vercel whoami` doit afficher `emounateha770-1135`. Sinon : **stop**, demander à Yarone de se reconnecter (`vercel login`).
- Site : `vercel deploy --prod --yes --scope emounateha` (depuis la racine du dépôt).
- Dons et Club ’Haï (projet `emounateha-don`, racine `local-stripe-test`) :
  `VERCEL_ORG_ID=team_DLgzh4RgtfmyUGYGd6cY1UHL VERCEL_PROJECT_ID=prj_gixnHFI6kbrHWNcQjwuD9JZSKXm1 vercel deploy --prod --yes`
- Un `git push` sur `main` peut aussi déclencher un déploiement : **la porte s'applique avant le push**.
- Ne jamais lancer `server.js` de la racine en local : il travaille sur la base de production (voir la note du projet).

### 5. Contrôle immédiat du site EN LIGNE
```bash
node scripts/verifier-apres-deploiement.js
```
Il ouvre les vraies pages (Club ’Haï, page de dons, site), clique sur les boutons, vérifie que le formulaire s'ouvre, que Stripe est configuré, que le webhook répond. Il ne paie rien.
**S'il échoue : retour arrière IMMÉDIAT** (ci-dessous), puis on prévient Yarone.

### 6. Rapport honnête à Yarone
Dire précisément : ce qui a été testé, ce qui a passé, ce qui n'a **pas** pu être testé (ex. prochain prélèvement mensuel réel). Ne jamais écrire « tout marche » sans les résultats des étapes 2 et 5.

## Retour arrière
1. `vercel ls --scope emounateha` : repérer le dernier déploiement qui marchait.
2. `vercel rollback <url-du-déploiement> --scope emounateha` (pour `emounateha-don`, mêmes variables `VERCEL_ORG_ID` / `VERCEL_PROJECT_ID` que ci-dessus).
3. Relancer `node scripts/verifier-apres-deploiement.js`.
4. Prévenir Yarone, corriger, et rejouer toute la procédure depuis l'étape 1.

## Si on ajoute ou modifie un moyen de paiement, un reçu, une mensualité
Le même commit **doit** contenir le test correspondant dans `local-stripe-test/tests/` (qui affiche des lignes `ok` / `ECHEC`, sort avec le code 1 en cas d'échec, tourne sur serveur jeté, sans vrai paiement). Sans test, la fonctionnalité n'est pas déployable.

## Interdits absolus
- Déployer ou pousser sur `main` avec la porte fermée, ou sans laissez-passer du commit courant.
- Supprimer, affaiblir, renommer ou ignorer un test pour passer la porte.
- Utiliser de vrais paiements, de vraies cartes, de vraies clés « live », ou le compte Stripe personnel de Yarone pour tester.
- Envoyer de vrais e-mails/SMS de test à de vrais donateurs.
- Faire tourner le serveur de la racine en local (base de production).
- Dire « c'est bon » sans preuve.

## Journal des pannes (pour ne pas recommencer)
- **17 nov 2026** : le bouton « Rejoindre pour 18 € par mois » du Club ne faisait rien (le formulaire de don restait caché). Cause : en ajoutant le champ « Autre montant », 5 lignes voisines ont été supprimées par erreur (passage page d'accueil → formulaire, couleur de la barre, case « Afficher mon nom »). Les tests ne cliquaient pas sur le bouton. Réparé le jour même ; `tests/boutons-pages.js` et `scripts/verifier-apres-deploiement.js` ajoutés pour que cela ne se reproduise plus.
