#!/usr/bin/env bash
# MyDrive: Google Cloud setup for Cloud Shell (https://shell.cloud.google.com).
#
#   bash <(curl -sSL https://raw.githubusercontent.com/imad-os/g_drive/main/tools/gcloud-setup.sh) [PROJECT_ID]
#
# Automated: project, Drive + Picker APIs, the Picker API key (restricted to the site and the Picker API), the project number.
# Manual (Google has no public API for these): the consent screen + publishing, the "TVs and Limited Input devices"
# client and the "Web application" client. The script opens the right console pages, waits for you, asks for the
# values and prints the JSON to paste into App Store Manager > MyDrive > Config.
# Safe to run again: it reuses the project and the key it finds.

set -euo pipefail

PROJECT_ID="${1:-${PROJECT_ID:-}}"
ORIGIN="https://imad-os.github.io"
SITE="https://imad-os.github.io/g_drive/"
REFERRER="${SITE}*"
KEY_NAME="MyDrive Picker"
OUT="$HOME/mydrive-config.json"

b() { printf '\033[1m%s\033[0m' "$*"; }
step() { printf '\n\033[1;36m== %s\033[0m\n' "$*"; }
ok() { printf '   \033[32m✓\033[0m %s\n' "$*"; }
die() { printf '\n\033[31mError:\033[0m %s\n' "$*" >&2; exit 1; }
pause() { read -rp "   Press Enter when done… " _; }
ask() {   # ask VAR "prompt" regex [hidden]
    local __v="" __p="$2" __re="$3"
    while :; do
        if [ "${4:-}" = hidden ]; then read -rsp "   $__p: " __v; echo " (hidden)"; else read -rp "   $__p: " __v; fi
        __v="$(printf '%s' "$__v" | tr -d '[:space:]')"
        [[ "$__v" =~ $__re ]] && break
        echo "   That does not look right, try again."
    done
    printf -v "$1" '%s' "$__v"
}

command -v gcloud >/dev/null || die "gcloud not found. Run this in Cloud Shell: https://shell.cloud.google.com"
command -v jq >/dev/null || die "jq not found (Cloud Shell has it)."
ACCOUNT="$(gcloud config get-value account 2>/dev/null || true)"
[ -n "$ACCOUNT" ] || die "Not signed in. Run: gcloud auth login"

# ---------------------------------------------------------------- 1. project
step "1/5  Project"
if [ -z "$PROJECT_ID" ]; then
    PROJECT_ID="mydrive-$(od -An -N3 -tx1 /dev/urandom | tr -d ' \n')"
fi
[[ "$PROJECT_ID" =~ ^[a-z][a-z0-9-]{4,28}[a-z0-9]$ ]] || die "Bad project id '$PROJECT_ID' (6-30 chars: a-z 0-9 -)."
if gcloud projects describe "$PROJECT_ID" >/dev/null 2>&1; then
    ok "Using existing project $(b "$PROJECT_ID")"
else
    echo "   Creating $(b "$PROJECT_ID") as $ACCOUNT…"
    gcloud projects create "$PROJECT_ID" --name="MyDrive" --quiet
    ok "Project created"
fi
gcloud config set project "$PROJECT_ID" --quiet >/dev/null 2>&1
PROJECT_NUMBER="$(gcloud projects describe "$PROJECT_ID" --format='value(projectNumber)')"
ok "Project number: $PROJECT_NUMBER"

# ---------------------------------------------------------------- 2. APIs
step "2/5  APIs (no billing needed)"
gcloud services enable drive.googleapis.com picker.googleapis.com apikeys.googleapis.com --project="$PROJECT_ID" --quiet
ok "Google Drive API, Google Picker API enabled"

# ---------------------------------------------------------------- 3. API key for the phone Picker page
step "3/5  Picker API key"
KEY_ID="$(gcloud services api-keys list --project="$PROJECT_ID" --filter="displayName='$KEY_NAME'" --limit=1 --format='value(name)' 2>/dev/null || true)"
if [ -z "$KEY_ID" ]; then
    gcloud services api-keys create --project="$PROJECT_ID" --display-name="$KEY_NAME" \
        --allowed-referrers="$REFERRER" --api-target=service=picker.googleapis.com --quiet >/dev/null
    KEY_ID="$(gcloud services api-keys list --project="$PROJECT_ID" --filter="displayName='$KEY_NAME'" --limit=1 --format='value(name)')"
    ok "Key created"
else
    gcloud services api-keys update "$KEY_ID" --allowed-referrers="$REFERRER" --api-target=service=picker.googleapis.com --quiet >/dev/null
    ok "Existing key reused (restrictions refreshed)"
fi
[ -n "$KEY_ID" ] || die "The API key could not be created (an organization policy may forbid API keys)."
API_KEY="$(gcloud services api-keys get-key-string "$KEY_ID" --format='value(keyString)')"
ok "Restricted to $REFERRER and the Google Picker API"

# ---------------------------------------------------------------- 4. consent screen (manual)
C="https://console.cloud.google.com"
step "4/5  Consent screen (manual: Google has no API for it)"
cat <<EOF
   Open: $(b "$C/auth/overview?project=$PROJECT_ID")
     • Get started → App name: MyDrive · support email: yours → Audience: $(b External) → contact email → agree → Create
   Open: $(b "$C/auth/branding?project=$PROJECT_ID")
     • Application home page:         $(b "$SITE")
     • Application privacy policy:    $(b "${SITE}privacy.html")
     • Application terms of service:  $(b "${SITE}terms.html")
     • Authorized domains → Add domain: $(b "imad-os.github.io") → $(b Save)
   Open: $(b "$C/auth/scopes?project=$PROJECT_ID")
     • Add or remove scopes → tick: openid, .../auth/userinfo.email, .../auth/userinfo.profile, .../auth/drive.file
       → Update → $(b Save)   (do NOT add .../auth/drive)
   Open: $(b "$C/auth/audience?project=$PROJECT_ID")
     • $(b "Publish app") → Confirm  (status must say "In production", else tokens expire every 7 days)
   Do not upload a logo (it starts a brand review).
EOF
pause

# ---------------------------------------------------------------- 5. OAuth clients (manual)
step "5/5  OAuth clients (manual: Google has no API for these)"
cat <<EOF
   Open: $(b "$C/auth/clients/create?project=$PROJECT_ID")

   A) Application type: $(b "TVs and Limited Input devices") · name: MyDrive TV → Create
      Copy the Client ID and the Client secret NOW (the secret is shown only once).
EOF
ask TV_ID "TV client ID" '^[0-9]+-[a-z0-9]+\.apps\.googleusercontent\.com$'
ask TV_SECRET "TV client secret" '^[A-Za-z0-9_-]{10,}$' hidden
cat <<EOF

   B) Create client again → Application type: $(b "Web application") · name: MyDrive Picker
      Authorized JavaScript origins → Add URI: $(b "$ORIGIN")   (no path, no trailing slash)
      Leave redirect URIs empty → Create → copy the Client ID (no secret needed)
EOF
ask WEB_ID "Web client ID" '^[0-9]+-[a-z0-9]+\.apps\.googleusercontent\.com$'
[ "$WEB_ID" != "$TV_ID" ] || die "Both client IDs are the same: B) must be a separate Web application client."

# ---------------------------------------------------------------- result
jq -n --arg tv "$TV_ID" --arg sec "$TV_SECRET" --arg web "$WEB_ID" --arg key "$API_KEY" --arg num "$PROJECT_NUMBER" \
    '{google: {tvClientId: $tv, tvClientSecret: $sec, pickerClientId: $web, pickerApiKey: $key, projectNumber: $num}, pageSize: 100, thumbConcurrency: 4}' > "$OUT"
chmod 600 "$OUT"

step "Done"
echo "   Paste this into $(b "https://imad-os.github.io/g/installer/") → MyDrive → Config:"
echo
cat "$OUT"
echo
echo "   (also saved in $OUT; delete it when pasted: rm $OUT)"
echo "   Then on the TV: MyDrive → Link a Google account."
