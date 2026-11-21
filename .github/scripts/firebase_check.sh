#!/usr/bin/env bash
# Read-only health check of the Firebase project used by the apps (creates nothing).
K=$(grep -o 'apiKey: "[^"]*"' android/app/src/main/assets/www/config.js | cut -d'"' -f2)
P=$(grep -o 'projectId: "[^"]*"' android/app/src/main/assets/www/config.js | cut -d'"' -f2)
echo "### project=$P"
A=$(curl -s -X POST "https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=$K" -H 'Content-Type: application/json' \
  -d '{"email":"health-check-nobody@example.com","password":"x12345678","returnSecureToken":true}')
echo "### AUTH: $(echo "$A" | tr -d '\n' | grep -o '"message": *"[^"]*"' | head -1)"
O=$(curl -s -X POST "https://identitytoolkit.googleapis.com/v1/accounts:createAuthUri?key=$K" -H 'Content-Type: application/json' \
  -d '{"identifier":"akrambajwa062@gmail.com","continueUri":"https://'$P'.firebaseapp.com"}')
echo "### OWNER: $(echo "$O" | tr -d '\n' | grep -oE '"registered": *(true|false)|"message": *"[^"]*"|"signinMethods"[^]]*]' | tr '\n' ' ')"
B="https://firestore.googleapis.com/v1/projects/$P/databases/(default)/documents"
for path in settings/store products; do
  R=$(curl -s -w ' HTTP=%{http_code}' "$B/$path?key=$K")
  echo "### FIRESTORE $path: $(echo "$R" | tr -d '\n' | grep -oE '"status": *"[^"]*"|"message": *"[^"]{0,160}|HTTP=[0-9]+' | tr '\n' ' ')"
done
R=$(curl -s -w ' HTTP=%{http_code}' "$B/orders?key=$K")
echo "### FIRESTORE orders (should be denied for strangers): $(echo "$R" | tr -d '\n' | grep -oE '"status": *"[^"]*"|HTTP=[0-9]+' | tr '\n' ' ')"
# check 2026-11-21T07:39:50Z
