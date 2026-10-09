# Publier RIFTBALL sur le Google Play Store — guide pas à pas

## Ce que contient le kit
| Fichier | À quoi ça sert |
|---|---|
| `riftball-1.0.5-release.aab` | Le fichier à envoyer sur Google Play (signé avec ta clé d'importation) |
| `CLE-UPLOAD-RIFTBALL.zip` | **Ta clé d'importation** (`riftball-upload.jks`) + ses mots de passe. **À garder précieusement, en 2 copies (ex. Google Drive + clé USB).** |
| `icone-512.png` | Icône de la fiche (512×512) |
| `image-presentation-1024x500.png` | Image de présentation (bannière) |
| `screenshots/` | 7 captures d'écran 1920×1080 |
| `FICHE-PLAY-STORE.md` | Tous les textes de la fiche à copier-coller |

> ⚠️ **La clé est indispensable pour publier les mises à jour.** Sans elle (ou sans ses mots de passe), il faudra demander une réinitialisation de clé à Google (possible grâce à la signature d'application Google Play, mais long). Ne la publie jamais et ne l'envoie à personne.

## 1. Créer le compte développeur (une seule fois)
1. Va sur https://play.google.com/console et crée un compte développeur (25 $ une seule fois).
2. Vérifie ton identité (pièce d'identité) et ton numéro de téléphone.
3. Pour vendre des gemmes : **Paramètres › Profil de paiement** → crée un compte marchand.

## 2. Créer l'application
1. **Créer une application** → Nom : `RIFTBALL` · Langue : Français · Type : **Jeu** · **Gratuit**.
2. Coche les déclarations (règles du programme, lois d'exportation).

## 3. Remplir la fiche (Croissance › Présence sur le Play Store › Fiche principale)
- Copie les textes de `FICHE-PLAY-STORE.md`.
- Envoie `icone-512.png`, `image-presentation-1024x500.png` et au moins 2 captures du dossier `screenshots/` (section « Téléphone »).
- Catégorie : **Action**. E-mail de contact : le tien.

## 4. Configurer l'application (Règles › Contenu de l'application)
- **Politique de confidentialité** : `https://riftball-server.onrender.com/privacy.html` (déjà en ligne, et accessible depuis Options dans le jeu).
- **Accès à l'application** : « Toutes les fonctionnalités sont disponibles sans restriction » (pas de compte à créer).
- **Annonces** : **Non**, l'application ne contient pas d'annonces.
- **Classification du contenu (questionnaire IARC)** : catégorie *Jeu* →
  - Violence : **oui, fantastique / dessin animé** (personnages stylisés, pas de sang, pas de mort réaliste) ;
  - Peur, sexualité, langage grossier, drogues, jeux d'argent : **non** ;
  - Les utilisateurs peuvent-ils interagir ? **Oui** (parties en ligne avec pseudos, emotes prédéfinies, **pas de chat**) ;
  - Achats numériques : **oui**.
  → Résultat attendu : PEGI 7 environ.
- **Public cible** : **13 ans et plus** (recommandé : jeu en ligne + achats intégrés ; éviter « enfants » qui impose le programme Familles).
- **Sécurité des données** :
  - Collecte de données : **Oui**. Chiffrées en transit : **Oui**. Suppression sur demande : **Oui**.
  - *Identifiants de l'appareil ou autres* → identifiant de joueur aléatoire : collecté, non partagé, *Fonctionnement de l'appli, Prévention des fraudes*.
  - *Activité dans l'appli › Interactions avec l'appli* → statistiques de jeu : collecté, non partagé, *Fonctionnement de l'appli, Analyses*.
  - *Informations financières › Historique des achats* → jetons d'achat : collecté, non partagé, *Fonctionnement de l'appli, Prévention des fraudes*.
  - Rien d'autre (pas de position, contacts, photos, e-mail, etc.).
- **Application gouvernementale / financière / santé / actualités** : non.

## 5. Envoyer l'AAB
1. **Tests › Test fermé** (ou *Test interne* pour essayer tout de suite) → *Créer une version*.
2. Google propose la **signature d'application Google Play** → **Accepter** (Google garde la clé finale, toi tu gardes la clé d'importation du kit).
3. Envoie `riftball-1.0.5-release.aab`, colle les notes de version, *Enregistrer* → *Examiner* → *Lancer le déploiement*.

> 📌 **Compte personnel créé après novembre 2023** : Google exige un **test fermé avec au moins 12 testeurs pendant 14 jours** avant de pouvoir publier en *Production*. Ajoute 12 adresses Gmail (amis, famille) dans la liste des testeurs, envoie-leur le lien d'inscription, et attends 14 jours. Ensuite : *Production › Créer une version* avec le même AAB.

## 6. Achats intégrés (facultatif, pour vendre les gemmes)
Dans **Monétiser › Produits › Produits intégrés à l'application**, crée ces produits (IDs **exactement** ainsi), puis active-les :

| ID produit | Prix conseillé | Contenu |
|---|---|---|
| `gems_small` | 0,99 € | 80 gemmes |
| `gems_medium` | 4,99 € | 450 gemmes |
| `gems_large` | 9,99 € | 950 gemmes |
| `gems_xlarge` | 19,99 € | 2000 gemmes |
| `starter_pack` | 2,99 € | Pack de démarrage |
| `special_bundle` | 7,99 € | Bundle spécial |
| `battle_pass` | 5,99 € | RIFT PASS Premium (saison 1) |
| `battle_pass_plus` | 9,99 € | RIFT PASS+ (saison 1) |
| `season_pack` | 14,99 € | Pack Saison (saison 1) |

Pour chaque nouvelle saison, crée les mêmes produits « pass » avec le suffixe de la saison : `battle_pass_s2`, `battle_pass_plus_s2`, `season_pack_s2` (puis `_s3`, `_s4`…). Le jeu choisit automatiquement celui de la saison en cours.

**Vérification des achats côté serveur (obligatoire pour que les achats soient livrés)** :
1. Google Cloud Console → crée un **compte de service**, télécharge sa clé JSON.
2. Play Console → **Utilisateurs et autorisations** → invite l'e-mail du compte de service avec le droit *Gérer les commandes et abonnements*.
3. Render → service `riftball-server` → **Environment › Secret Files** : ajoute le fichier `service-account.json` avec le contenu de la clé, puis la variable d'environnement `GOOGLE_SERVICE_ACCOUNT=/etc/secrets/service-account.json`. Redéploie.

Sans cette étape, le jeu fonctionne normalement mais **refuse les achats** (le serveur ne fait jamais confiance au téléphone).

## 7. Mises à jour suivantes
À chaque nouvelle version, je génère un nouvel AAB avec un numéro de version plus grand (versionCode). Il suffit de l'envoyer dans une nouvelle version sur la Play Console. La clé du kit doit rester la même : garde-la !

## Infos techniques
- Package : `com.superessence.riftball` · Version : 1.0.6 (versionCode 8)
- SDK cible : Android 15 (API 35) · minimum : Android 7 (API 24)
- Permissions : Internet, état du réseau, vibration, facturation Google Play
