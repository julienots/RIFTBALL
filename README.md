# ⚡ RIFTBALL — by SuperEssence

Jeu mobile compétitif **3v3 en 2.5D** (rendu 3D, gameplay sur plan 2D), parties de 3 minutes.
Capturez **le Rift** — une créature d'énergie vivante qui fuit, s'approche, mute — et amenez-la dans le portail adverse.

## Lancer

```bash
npm install
npm run dev          # http://localhost:5173  (?skipintro pour sauter l'intro)
npm test             # 47 tests unitaires (gameplay, Rift, bots, progression, boutique, IAP, pass, sauvegarde, longs runs)
npm run test:long    # 180 matchs complets (tous modes × toutes arènes) : fuites, invariants, doublons
npm run test:e2e     # Playwright : démarrage → tutoriel → match → résultats
npm run android:debug     # releases/riftball-<ver>-debug.apk
npm run android:release   # APK + AAB signés (scripts/create-keystore.sh d'abord)
```

Contrôles : joystick à gauche ; ATTAQUE / CAPACITÉ / ULTIME à droite (toucher = visée auto, glisser = visée manuelle).
Clavier : ZQSD/WASD, clic gauche = attaque, clic droit/E = capacité, Espace/R = ultime, F = emote. Debug (dev) : F3, F4 = mutation.

## Technologie

| Choix | Raison |
|---|---|
| TypeScript + **Three.js** (WebGL), rendu toon + contours | 2.5D stylisé, léger (APK ≈ 4,7 Mo), 60 FPS visés en milieu de gamme |
| Simulation **déterministe sans DOM** (`src/game/Match.ts`, pas fixe 60 Hz, RNG seedé) | testable en headless, réutilisable telle quelle sur un serveur autoritaire |
| **Capacitor 7** → Android natif (WebView), plugin Java **Google Play Billing 7** maison | pas d'Unity disponible ; build Android 100 % en ligne de commande |
| Audio **100 % procédural** (WebAudio) | musiques/sons originaux, aucun asset sous licence |

Unity n'étant pas présent dans le projet (dépôt vide), IL2CPP/URP ne s'appliquent pas ; l'APK ne contient aucune lib native et tourne nativement sur ARM64.

## Architecture (`src/`)

`core/` App (composition root), EventBus, RNG, réglages · `data/` **toutes les données configurables** (CharacterData, AbilityData, RiftMutationData, ArenaData, cosmétiques/SkinData, ShopOfferData, BattlePassRewardData, MissionData, SeasonData, EventData, ProductData) ·
`game/` Match, entités, Input, session, `render/` (Three.js) · `rift/` IA à états + mutations · `combat/` · `abilities/` · `arenas/` · `bots/` (A* + IA utilitaire, 4 niveaux) · `gamemodes/` ·
`ui/` écrans · `shop/` · `iap/` · `battlepass/` · `missions/` · `events/` · `progression/` · `collection/` · `cosmetics/` · `profile/` · `leaderboard/` · `friends/` · `clans/` · `save/` · `audio/` · `networking/` · `analytics/` · `debug/` · `tutorial/` · `notifications/`.
`server/` : serveur autoritaire de référence (vérification Google Play, remboursements RTDN, validation des matchs).

## Contenu

- **11 héros** (10 + EMBER, héroïne de la Saison 1) avec PV, vitesse, attaque, portée, cadence, capacité, ultime, passif — tous déblocables gratuitement (Route des trophées ou coins).
- **Rift** : états IDLE, ROAM, FLEE, CHASE, ATTRACTED, CARRIED, DROPPED, FRENZY, MUTATING, CLONING, PORTAL ; **7 mutations** (FURY, CLONE, ELECTRIC, GRAVITY, PORTAL, PHASE, CHAOS).
- **6 modes** : RIFTBALL, RIFT RUSH, RIFT CHAOS, RIFT DUEL, RIFT BOSS, SURVIVAL (+ entraînement 4 niveaux, tutoriel en 8 étapes).
- **5 arènes** : Rift Valley, Volcanic Core (lave cyclique), Frozen Lab (glace), Void Station (téléporteurs), Jungle Ruins (buissons).
- **150 objets de collection** : skins, emotes, sprays, effets, bannières, titres, icônes.

## Économie & monétisation (anti pay-to-win)

- Rift Coins (gratuits, plafond quotidien en match), Rift Gems (premium, registre de transactions vérifiable), Rift XP, Trophées (jamais achetables).
- Boutique : offres (Starter, Weekly, Event, Season, Legendary) avec prix, contenu, **valeur de référence honnête** et durée ; boutique quotidienne à rotation contrôlée par données ; coffres **cosmétiques, achetables uniquement en coins, probabilités affichées**.
- RIFT PASS gratuit / Premium / PASS+ (30 paliers) — uniquement cosmétiques et ressources.
- Un test automatique vérifie qu'aucun produit payant ne donne de héros ou de puissance.

### Achats intégrés

Flux : achat → confirmation Google Play → **validation serveur** → attribution idempotente (par `orderId`) → acknowledge/consume. Gère annulation, attente, déjà possédé, indisponible, hors ligne, erreur, restauration et remboursements.
**Sans serveur configuré, un achat réel n'est jamais crédité** (il reste « en vérification »). Pour la mise en production :
1. Créer les produits de `src/data/products.ts` dans la Play Console (ids modifiables à cet endroit uniquement).
2. Déployer `server/` avec un compte de service Google (`androidpublisher`) et brancher les notifications RTDN sur `/v1/rtdn`.
3. Construire avec `VITE_SERVER_URL=https://… npm run android:release`.

En mode développement (`npm run dev`), une boutique simulée permet de tester tous les cas sans paiement.

## Jeu en ligne

```
JOUEUR → FILE D'ATTENTE (par mode) → MATCHMAKING (vrais joueurs pendant 8 s max, niveau proche) → BOTS pour compléter → MATCH
```

- Serveur **autoritaire** (`server/src/GameServer.ts`, WebSocket `/v1/play`) : il fait tourner la même simulation déterministe que le jeu à 60 Hz et envoie l'état 20 fois/s. Le client envoie seulement ses commandes ; son propre héros est prédit localement puis réconcilié.
- **Pas d'autres joueurs → bots** : après `QUEUE_WAIT_MS` (8 s par défaut), les places libres sont remplies par des bots (niveau selon les trophées). Un joueur qui se déconnecte est remplacé par un bot (et peut revenir dans son match) ; quitter un match classé compte comme une défaite.
- Les récompenses d'un match en ligne ne sont accordées que si le **résultat officiel du serveur** correspond.
- Sans serveur ou sans réseau, le jeu bascule automatiquement sur des matchs locaux contre des bots.

### Mettre le serveur en ligne

```bash
npm run server:start                      # local : http://localhost:8787 (WebSocket ws://localhost:8787/v1/play)
docker build -t riftball-server . && docker run -p 8787:8787 riftball-server
```
- **Render** (gratuit, WebSocket OK) : *New + → Blueprint* → choisir ce dépôt (`render.yaml`).
- **Fly.io** : `fly launch --copy-config && fly deploy` (`fly.toml`).

Puis dans le jeu : **Options → Jeu en ligne → Serveur**, coller l'adresse (ex. `https://riftball-server.onrender.com`), ou la figer dans l'APK : `VITE_SERVER_URL=https://… npm run android:release`.
Test multi-joueur local : `npm run server:start` puis `npm run dev:online` dans deux onglets.

## Ce qui est simulé hors ligne

Hors ligne, le matchmaking est rempli de bots. Classements, amis, crews et chat sont encore **simulés localement** derrière des interfaces prêtes pour le serveur (`networking/`, `leaderboard/`, `friends/`, `clans/`). Le jeu complet fonctionne sans connexion.

## Android

- Package `com.superessence.riftball`, version 1.0.0 (code 1), paysage, plein écran immersif, icône et splash noir (enchaîné avec l'intro animée SuperEssence).
- `releases/` contient les APK debug/release et l'AAB du dernier build. ⚠️ Ces builds release ont été signés avec une clé temporaire générée dans l'environnement de build : pour publier sur Google Play, générez **votre propre clé** (`scripts/create-keystore.sh`) et conservez-la précieusement.
