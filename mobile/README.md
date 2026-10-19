# CMFIPraise App (readme WIP)

Application mobile React Native / Expo pour la consultation de recueils de chants religieux.

## 📱 Fonctionnalités

- 🏠 Sélection de langue (Français/Anglais)
- 📚 Consultation de plusieurs recueils de chants
- 🔍 Recherche avancée de chants (titre, artiste, paroles)
- 📖 Visualisation des paroles avec zoom
- 🎭 Mode présentation (diaporama couplet par couplet)
- 💾 Téléchargement de recueils pour consultation hors-ligne
- 💬 Système de feedback et suggestions
- 🌐 Support multilingue (FR/EN)

## 🚀 Installation et Développement

### Prérequis

- Node.js (v16 ou supérieur)
- npm ou yarn
- Expo CLI : `npm install -g expo-cli`
- Compte Expo (pour le déploiement)

### Installation des dépendances

```bash
npm install
```

### Configuration

Créez un fichier `app.config.js` à la racine avec vos variables d'environnement :

```javascript
export default {
  expo: {
    extra: {
      API_URL: "https://votre-api-url.com"
    }
  }
}
```

### Démarrage en mode développement

```bash
# Démarrer le serveur de développement
npx expo start

# Démarrer avec cache vidé
npx expo start --clear

# Démarrer en mode tunnel (pour tester sur un appareil distant)
npx expo start --tunnel
```

## 🏗️ Architecture

```
src/
├── components/        # Composants réutilisables
│   ├── BottomNav.js  # Navigation par onglets
│   └── ...
├── navigation/        # Configuration de navigation
│   ├── HomeStack.js
│   └── SearchStack.js
├── pages/            # Écrans de l'application
│   ├── HomeScreen/
│   ├── RecueilScreen/
│   ├── ListeChansonsScreen/
│   ├── LyricScreen/
│   ├── SearchScreen/
│   └── FeedbackScreen/
├── utils/            # Utilitaires
│   ├── i18n.js      # Configuration i18n
│   ├── AuthContext.js
│   └── storageKeys.js
└── locales/          # Fichiers de traduction
    ├── fr.json
    └── en.json
```

## 📦 Déploiement

### ⚠️ Nouveau binaire natif requis (module Évènements, 14/10)

Le module Évènements ajoute `expo-crypto` (UUID des déclarations, RG-EVT-07) : un module **natif**,
qu'une publication OTA ne peut pas livrer. Avant la mise en production, reconstruire et republier
les binaires (`eas build --profile production`, puis soumission aux stores) et refaire le dev build
(`eas build --profile development`). L'application ne plante pas dans un binaire plus ancien —
le module est chargé en option (`requireOptionalNativeModule`, `services/eventQueue.ts`) et
l'identifiant est alors tiré par `crypto.getRandomValues` ou, en dernier recours, `Math.random` —
mais seul un binaire à jour tire ses UUID du générateur du système.

### 🧪 Build de Test (Development)

#### 1. Build pour Android (APK de développement)

```bash
# Build pour Android en mode développement
eas build --profile development --platform android

# Ou avec expo-cli classique
expo build:android -t apk
```

#### 2. Build pour iOS (Simulateur)

```bash
# Build pour iOS en mode développement
eas build --profile development --platform ios

# Installation sur simulateur
expo install:ios
```

#### 3. Preview Build (pour tester avant production)

```bash
# Build de preview pour Android
eas build --profile preview --platform android

# Build de preview pour iOS
eas build --profile preview --platform ios
```

### 🚀 Build de Production

#### Prérequis pour la production

1. **Installer EAS CLI**
   ```bash
   npm install -g eas-cli
   ```

2. **Se connecter à Expo**
   ```bash
   eas login
   ```

3. **Configurer le projet EAS**
   ```bash
   eas build:configure
   ```

#### Configuration `eas.json`

Créez un fichier `eas.json` à la racine :

```json
{
  "cli": {
    "version": ">= 5.0.0"
  },
  "build": {
    "development": {
      "developmentClient": true,
      "distribution": "internal"
    },
    "preview": {
      "distribution": "internal",
      "android": {
        "buildType": "apk"
      }
    },
    "production": {
      "android": {
        "buildType": "app-bundle"
      },
      "ios": {
        "buildType": "archive"
      }
    }
  },
  "submit": {
    "production": {}
  }
}
```

#### Build de Production Android (Google Play)

```bash
# Build AAB pour Google Play Store
eas build --platform android --profile production

# Soumettre automatiquement au Play Store (nécessite configuration)
eas submit --platform android
```

**Configuration requise pour Android :**
- Créer une clé de signature (keystore) ou utiliser Google Play App Signing
- Configurer les credentials dans `eas.json` ou via `eas credentials`

#### Build de Production iOS (App Store)

```bash
# Build pour App Store
eas build --platform ios --profile production

# Soumettre automatiquement à l'App Store (nécessite configuration)
eas submit --platform ios
```

**Configuration requise pour iOS :**
- Compte Apple Developer actif
- Certificats et profils de provisioning
- Configuration via `eas credentials`

#### Build pour les deux plateformes

```bash
# Build simultané Android + iOS
eas build --platform all --profile production
```

### 📲 Publication OTA (Over-The-Air)

Pour publier des mises à jour JavaScript sans rebuild :

```bash
# Publier une mise à jour OTA
eas update --branch production --message "Description de la mise à jour"

# Publier sur un canal spécifique
eas update --channel production --message "Nouvelle version"
```

### 🔄 Gestion des Versions

1. **Incrémenter la version dans `app.json`** :
   ```json
   {
     "expo": {
       "version": "1.0.1",
       "android": {
         "versionCode": 2
       },
       "ios": {
         "buildNumber": "2"
       }
     }
   }
   ```

2. **Créer un tag git** :
   ```bash
   git tag -a v1.0.1 -m "Version 1.0.1"
   git push origin v1.0.1
   ```

## 🧪 Tests et Validation

### Tester le build localement

```bash
# Android
eas build --platform android --profile preview --local

# iOS (nécessite macOS)
eas build --platform ios --profile preview --local
```

### Installer le build de test

```bash
# Android - après téléchargement du APK
adb install chemin/vers/app.apk

# iOS - utiliser Apple Configurator ou TestFlight
```

## 🔐 Gestion des Secrets

Les variables sensibles doivent être configurées via :

1. **Variables d'environnement Expo** :
   ```bash
   eas secret:create --scope project --name API_URL --value "https://api.exemple.com"
   ```

2. **Fichier `.env` (développement seulement)** :
   ```
   API_URL=https://api-dev.exemple.com
   ```

3. **Configuration dans `app.config.js`** :
   ```javascript
   export default {
     expo: {
       extra: {
         API_URL: process.env.API_URL
       }
     }
   }
   ```

## 📝 Checklist de Déploiement

### Avant chaque déploiement :

- [ ] Tester l'app en mode développement
- [ ] Vérifier les traductions (FR/EN)
- [ ] Tester les fonctionnalités hors-ligne
- [ ] Vérifier les permissions (stockage, etc.)
- [ ] Mettre à jour la version dans `app.json`
- [ ] Créer un changelog
- [ ] Tester le build de preview
- [ ] Valider avec les tests utilisateurs

### Pour la production :

- [ ] Build de production réussi
- [ ] Tests complets sur appareils réels
- [ ] Captures d'écran mises à jour
- [ ] Description des stores mise à jour
- [ ] Notes de version rédigées
- [ ] Tag git créé
- [ ] Build soumis aux stores

## 🐛 Debugging

```bash
# Logs en temps réel
npx expo start --dev-client

# Nettoyer le cache
npx expo start --clear

# Réinitialiser complètement
rm -rf node_modules
rm -rf .expo
npm install
npx expo start --clear
```

## 📚 Documentation Technique

- **Navigation** : React Navigation v6 (Stack + Bottom Tabs)
- **État global** : React Context API
- **Stockage local** : AsyncStorage
- **Internationalisation** : react-i18next
- **Fonts** : Google Fonts (Playfair Display, Libre Baskerville)
- **Icons** : Feather Icons, MaterialIcons

## 🤝 Contribution

1. Créer une branche feature : `git checkout -b feature/ma-feature`
2. Commit les changements : `git commit -m "feat: description"`
3. Push la branche : `git push origin feature/ma-feature`
4. Ouvrir une Pull Request

## 📄 License

[À définir]

## 👥 Équipe

- Développement : VEIGNE YOUNDJEU Jean Philippe
- Design : VEIGNE YOUNDJEU Jean Philippe
- Backend API : VEIGNE YOUNDJEU Jean Philippe

## 🔗 Liens Utiles

- [Documentation Expo](https://docs.expo.dev/)
- [EAS Build Documentation](https://docs.expo.dev/build/introduction/)
- [React Navigation](https://reactnavigation.org/)
- [React Native](https://reactnative.dev/)