# Soutien Affectif — Site complet

Version du 17 octobre 2026 : 24 situations, 14 signes corporels, 10 signaux de danger. Français, anglais, espagnol, créole haïtien.

## Publier gratuitement sur GitHub Pages

1. Décompressez ce ZIP sur votre ordinateur.
2. Créez un dépôt public nommé `soutien-affectif` sur GitHub.
3. Ajoutez **le contenu du dossier Soutien_Affectif**, pas le ZIP. `index.html` et `couple-hero.webp` doivent se trouver à la racine du dépôt. Incluez aussi `.nojekyll` si votre explorateur le masque.
4. Dans **Settings → Pages → Build and deployment**, choisissez **Deploy from a branch**, puis **main** et **/ (root)**. Cliquez sur **Save**.
5. Attendez le déploiement. GitHub affiche l’adresse du site dans Pages.

Aucun build, installation de dépendances, compte utilisateur ou clé API n’est nécessaire pour utiliser le site. Cette version autonome ne dépend pas de ChatGPT pour fonctionner.

## Tester localement

Ouvrez `index.html` dans un navigateur. Pour tester avec une adresse locale stable, lancez `python -m http.server 8000` dans ce dossier puis ouvrez `http://localhost:8000`. Le stockage en ouverture directe de fichier dépend du navigateur.

## Modifier les sources

- `src/app.js` : navigation, formulaires, journal et parcours interactifs.
- `src/content.json` : scénarios, signes et comportements dans les quatre langues.
- `src/ui.json` : textes de l’interface dans les quatre langues.
- `src/styles.css` : styles responsive.
- `couple-hero.webp` : image de couple générée pour ce projet.

Après une modification, lancez `python build.py` depuis ce dossier pour recréer `index.html`. Les bibliothèques standard de Python suffisent. La version prête à publier est déjà fournie.

Pour vérifier les parcours par code avec Node.js installé : `node src/check.cjs`. La vérification visuelle sur navigateur reste à effectuer.

## Journal et confidentialité

Les notes restent dans le navigateur de chaque utilisateur, sur chaque origine, sous la clé locale `suppor-journal` conservée pour compatibilité. Elles ne sont pas chiffrées ni synchronisées. Changer de domaine ne transfère pas les anciennes notes : exportez-les auparavant. L’export est un fichier texte ; cette version ne propose pas de réimport automatique. La préférence de langue utilise `soutien-language`. Les formulaires de contexte et de sécurité ne sont pas enregistrés.

Le site ne contient pas de compte, de base de données ni d’outil d’analyse de visage, voix ou messages privés. Les pages et le code seront publics sur GitHub Pages. Les liens externes de référence mènent aux sites des sources.

## Portée

Outil éducatif de dialogue, non un détecteur d’infidélité, de mensonge ou de criminalité. Les exemples ne prouvent pas une tromperie et ne donnent aucun score individuel. Les sources et limites figurent dans l’application. Le parcours de sécurité ne remplace pas une aide spécialisée et n’est pas une échelle clinique validée. Les coordonnées américaines ne s’appliquent pas automatiquement à d’autres pays.

## Contenu du ZIP

Le site prêt à publier, son image, les sources, le générateur et les vérifications. Aucun identifiant de déploiement, historique Git, jeton d’accès ni donnée de journal personnel n’est inclus.

## Compteur de visiteurs en direct

Ouvrez `stats.html` sur le site publié (ex. `https://<compte>.github.io/soutien-affectif/stats.html`) et entrez le mot de passe pour voir le nombre de personnes connectées en temps réel. Chaque onglet ouvert envoie toutes les 15 s un identifiant aléatoire (sans donnée personnelle ni contenu) au relais MQTT public `broker.hivemq.com`. Une personne est comptée si elle a donné signe de vie dans les 40 dernières secondes. Le relais étant public, le chiffre est indicatif. Si le relais est bloqué, le site fonctionne normalement. Le code est dans `src/presence.js`.
