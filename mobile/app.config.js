// Configuration dynamique : reprend app.json tel quel et ne surcharge QUE le chemin de
// google-services.json.
//
// Ce fichier est volontairement hors du dépôt (.gitignore, mise en service push du 16/09/2026),
// or EAS Build n'envoie que les fichiers suivis par git. Sur EAS, il est donc fourni par la
// variable d'environnement de type « file » GOOGLE_SERVICES_JSON (eas env:create), qui contient le
// chemin du fichier sur la machine de build. En local, on retombe sur ./google-services.json.
//
// SHEPHR_API_URL (JP 27/10) : surcharge `extra.API_URL` le temps d'une session, sans toucher à
// app.json (qui pointe la production). Utilisé par `npm run web:local` pour tester l'app dans le
// navigateur contre le backend local — cf. scripts/web-local.sh.
module.exports = ({ config }) => ({
  ...config,
  extra: {
    ...config.extra,
    API_URL: process.env.SHEPHR_API_URL ?? config.extra.API_URL,
  },
  android: {
    ...config.android,
    googleServicesFile: process.env.GOOGLE_SERVICES_JSON ?? config.android.googleServicesFile,
  },
});
