# Terres d’ocre — prototype 3D navigateur

Un prototype jouable d’exploration en escouade dans une vallée désertique. La scène, les personnages et les objets sont de véritables géométries 3D rendues avec WebGL 2. Les quatre textures du kit artistique sont appliquées aux matériaux ; le concept d’environnement accompagne l’écran d’accueil.

Ce dépôt autonome contient les sources du jeu et ses assets. Les cinq PNG ont été créés pour le projet avec imagegen ; les personnages sont construits et animés par le code. Aucun asset n’a été extrait du jeu Kenshi.

## Démarrer

Sous Windows, lancer **[Lancer-jeu.cmd](Lancer-jeu.cmd)**. Le lanceur démarre un serveur local et ouvre le navigateur à `http://127.0.0.1:4173`. Node.js doit être installé ; le lanceur reconnaît aussi son installation habituelle dans `C:\Program Files\nodejs`, même si Node est absent du PATH.

Depuis un terminal ouvert dans ce dossier, sous Windows, macOS ou Linux avec Node.js installé :

```sh
npm start
```

Ouvrir ensuite `http://127.0.0.1:4173`. Le serveur s’arrête avec Ctrl+C. Sous Windows, le lanceur peut aussi être appelé ainsi :

```powershell
.\start.ps1
```

Le serveur reste actif après fermeture de l’onglet. Pour l’arrêter :

```powershell
.\stop.ps1
```

Pour utiliser un autre port : `powershell -ExecutionPolicy Bypass -File .\start.ps1 -Port 4174`. La progression appartient à l’adresse locale utilisée ; changer de port ouvre un autre espace de sauvegarde dans le navigateur.

Le dossier `dist/` est un site statique complet. Il faut le servir en HTTP ou HTTPS ; l’ouverture directe de son `index.html` depuis le disque ne convient pas aux modules JavaScript et aux textures WebGL.

## Jouer

Le but de l’expédition est de découvrir la colonie et de récupérer trois réserves. L’exploration reste possible après la réussite. Les bidons bleu-vert contiennent de l’eau, les amas de pièces donnent du métal. L’eau diminue pendant le voyage et une réserve vide ralentit l’escouade.

| Commande | Action |
| --- | --- |
| Clic sur le sol | Déplacer les personnages sélectionnés |
| Clic sur une réserve | S’y rendre et la récupérer |
| Clic personnage ou portrait, touches 1 / 2 / 3 | Sélection individuelle |
| Maj + clic | Ajouter ou retirer un personnage de la sélection |
| G ou « Tous » | Sélectionner les trois personnages |
| F ou « Centrer » | Retrouver la sélection avec la caméra |
| Molette | Zoom |
| Glisser bouton droit | Rotation et inclinaison de la caméra |
| Bouton central ou glisser tactile | Déplacer la vue |
| WASD / ZQSD | Déplacer la caméra |
| E ou « Récupérer » | Prendre une réserve à proximité |
| Espace ou « Pause » | Arrêter / reprendre la simulation |
| Bouton ×1 / ×2 / ×3 | Vitesse de simulation |
| Échap | Annuler l’ordre de déplacement |
| Clic sur la minimap | Déplacer le centre de la caméra |

Sur écran tactile : toucher pour donner un ordre, glisser avec un doigt pour déplacer la vue, deux doigts pour tourner et pincer pour zoomer. Les portraits et boutons fournissent la sélection, la récupération, la pause et la vitesse. La minimap est masquée sur les petits écrans.

La progression est sauvegardée automatiquement dans le stockage local du navigateur, environ toutes les huit secondes et à chaque récolte. L’aide « ? » contient « Recommencer l’expédition ». Quitter l’onglet met la simulation en pause ; revenir permet de la reprendre.

## Contenu

- Trois personnages procéduraux animés : Nara la prospectrice, Brak le convoyeur et Ivo l’automate.
- Terrain de 180 × 180 unités, huit bâtiments traversables, toiles, citernes, pylônes, rochers, végétation sèche et moulin animé.
- Quatre lieux à découvrir et neuf réserves d’eau ou de métal.
- Navigation A* avec évitement des obstacles et contrôle continu des segments du chemin.
- Caméra tactique, ombres, brume, sélection d’escouade, carte et HUD responsive.
- Sauvegarde, reprise et réinitialisation locales.

Cette première version porte sur l’exploration. Elle ne comprend pas encore de combat, d’ennemis, de construction de base ou de fabrication d’objets. Les personnages utilisent des formes 3D stylisées et un rig procédural ; les concepts artistiques restent des références pour une production plus détaillée.

## Organisation et dépendances

| Fichier | Rôle |
| --- | --- |
| `dist/js/main.js` | Rendu, caméra, entrées, simulation, collecte et sauvegarde |
| `dist/js/world.js` | Terrain, colonie, lieux, ressources et obstacles |
| `dist/js/characters.js` | Modèles procéduraux et animation articulée |
| `dist/js/navigation.js` | Grille A*, index spatial et collisions de trajet |
| `dist/index.html`, `dist/style.css` | Interface et aide |
| `dist/assets/` | Textures et concept issus du kit artistique |
| `dist/vendor/` | Three.js 0.170.0, version locale et licence MIT |
| `server.mjs` | Serveur HTTP local sans dépendance npm |
| `tests/navigation.test.mjs` | Régressions de navigation et accessibilité des lieux |

Aucune installation npm ni compilation n’est nécessaire. Three.js et les assets sont servis localement, sans appel à un CDN pendant le jeu. Le rendu s’appuie sur les API documentées par le [projet Three.js](https://threejs.org/docs/). La licence de la bibliothèque est conservée dans `dist/vendor/THREE-LICENSE.txt`.

## Vérification

```sh
npm run check
npm test
```

Sept tests de navigation vérifient les approches des neuf ressources depuis les positions initiales, les trajets entre ressources, l’entrée et la sortie des huit bâtiments, les changements d’ordre et deux régressions de collision. Chaque segment est contrôlé indépendamment par échantillonnage de la distance aux obstacles.

Une revue réelle a été effectuée dans Microsoft Edge, avec WebGL 2 via SwiftShader, en vues 1 440 × 900 et 390 × 844. Le démarrage, les quatre textures, le clic au sol, le déplacement, la sélection, la pause, les vitesses, le zoom et la récolte ont été vérifiés. Une expédition complète a atteint l’objectif ; le rechargement a restauré sa progression et « Recommencer » l’a réinitialisée. Ces essais ne constituent pas une mesure de performances sur un téléphone physique. Voir [le compte rendu](reports/verification.json).

Le lanceur et l’arrêt ont également été essayés sur un port distinct, avec réponse HTTP 200.

## Hébergement

Le dossier `dist/` peut être déployé sur un hébergement statique avec HTTPS. Il contient tous les modules, la bibliothèque Three.js et les images nécessaires. Le jeu n’utilise ni API externe ni service de sauvegarde distant.

## Licence

Le code et les assets propres au projet sont fournis sous la [licence MIT](LICENSE) existante du projet source. Three.js conserve sa [licence MIT](dist/vendor/THREE-LICENSE.txt).
