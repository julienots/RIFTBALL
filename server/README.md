# RIFTBALL — serveur autoritaire (référence)

Zéro dépendance, Node ≥ 20. Le client n'est jamais la source de vérité pour les achats, récompenses et trophées.

```bash
GOOGLE_SERVICE_ACCOUNT=./service-account.json PACKAGE_NAME=com.superessence.riftball node server.mjs
```

Puis construire le client avec `VITE_SERVER_URL=https://votre-serveur npm run build`.

- `POST /v1/iap/verify` : vérifie le jeton d'achat via l'API Google Play Developer (`purchases.products.get`), un jeton ne peut appartenir qu'à un seul joueur.
- `POST /v1/rtdn` : branchez le topic Pub/Sub des notifications temps réel Google Play ; les achats annulés/remboursés sont révoqués.
- `GET /v1/iap/revocations` : le client retire les objets remboursés.
- `POST /v1/match/report` : validation de plausibilité + anti-doublon.

Étape suivante prévue : simulation de match côté serveur (le moteur `src/game/Match.ts` est déterministe et sans DOM, il peut tourner tel quel dans Node).
