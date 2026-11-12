# Émounatéha — Application native (iPhone et Android)

## Deux mondes, un vocabulaire

| On dit | C'est quoi | Où est le code |
|---|---|---|
| **[SITE]** | www.emounateha.fr, don.emounateha.fr, ambassadeur.emounateha.fr, le CRM | dossier racine du dépôt (`public/`, `server.js`, `local-stripe-test/`, `crm-app/`) |
| **[APPLI]** | l'application native App Store / Google Play | ce dossier `application-native/` uniquement |

Règles :
- Une demande commence par « [SITE] » ou « [APPLI] ». Sans précision, on demande.
- L'[APPLI] **lit** les API publiques du [SITE] (`/api/news`, `/api/besoins-accueil`…). Elle n'a aucune clé secrète et n'écrit jamais dans la base.
- Les dons se paient sur don.emounateha.fr, ouvert dans le navigateur sécurisé de l'appli, comme Apple et Google l'exigent pour les associations.
- Quand une fonction existe des deux côtés (banderole, horaires…), le calcul est le même : le site et l'appli montrent la même chose au même moment.

## Technique

Expo SDK 58, React Native, Expo Router (onglets natifs), TypeScript.

```
src/app/(onglets)/   écrans à onglets : index (Accueil), actualites, horaires, don, plus
src/app/article/     lecture d'un article
src/components/      éléments d'interface
src/lib/             api.ts (accès au [SITE]), theme.ts (couleurs), ville.tsx, use-charge.ts
```

Lancer sur le simulateur iPhone : `npm run ios` (dans ce dossier).
Vérifier : `npx tsc --noEmit`.
Publier sur les stores : EAS Build et Submit (compte Apple Developer et Google Play à créer par l'association).
