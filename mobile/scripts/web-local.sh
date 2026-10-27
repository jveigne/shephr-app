#!/usr/bin/env bash
# Lance l'app mobile dans le navigateur (Expo web), au format téléphone, contre le backend local.
# Usage : npm run web:local            (API http://localhost:8080)
#         SHEPHR_API_URL=https://… npm run web:local   (autre backend)
# Le backend local se lance à part :
#   cd ../../cmfipraise-backend && JAVA_HOME=$(/usr/libexec/java_home -v 17) \
#     mvn spring-boot:run -Dspring-boot.run.arguments="--spring.profiles.active=local"
# Port 8081 obligatoire : c'est l'origine CORS autorisée par le profil local (frontend.origin).
set -euo pipefail
cd "$(dirname "$0")/.."

export SHEPHR_API_URL="${SHEPHR_API_URL:-http://localhost:8080}"
URL="http://localhost:8081"

if [[ "$SHEPHR_API_URL" == *localhost* ]] && ! curl -s -o /dev/null --max-time 2 "$SHEPHR_API_URL/actuator/health" \
   && ! curl -s -o /dev/null --max-time 2 "$SHEPHR_API_URL"; then
  echo "⚠  Aucun backend ne répond sur $SHEPHR_API_URL — lance-le d'abord (voir l'en-tête de ce script)."
fi
echo "API : $SHEPHR_API_URL"

# Fenêtre « téléphone » (430×932, format iPhone Pro Max) dès que Metro répond.
(
  for _ in $(seq 1 90); do
    curl -s -o /dev/null --max-time 1 "$URL" && break
    sleep 1
  done
  if [ -d "/Applications/Google Chrome.app" ]; then
    open -na "Google Chrome" --args --app="$URL" --window-size=430,932 \
      --user-data-dir="${TMPDIR:-/tmp}/shephr-web-phone"
  else
    open "$URL"
  fi
) &

# --clear obligatoire : la config (dont extra.API_URL) est inlinée dans le bundle web au moment de la
# transformation, et Metro réutilise sinon un bundle en cache compilé avec l'URL de prod (constaté 27/10).
exec npx expo start --web --port 8081 --clear
