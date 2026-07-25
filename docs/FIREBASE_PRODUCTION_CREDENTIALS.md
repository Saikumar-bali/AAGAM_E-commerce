# Firebase Admin credentials for production deployment

AAGAM requires Firebase Admin credentials in production so Store and Rider notifications still arrive when the Partners app is backgrounded, swiped away, or not running.

## Preferred GitHub setup

Open **Repository Settings → Environments → production → Environment secrets** and add exactly one of these:

- `FIREBASE_SERVICE_ACCOUNT_JSON` — paste the complete Firebase Admin SDK JSON file as the secret value. This is the preferred option.
- `FIREBASE_SERVICE_ACCOUNT_JSON_B64` — base64-encode the complete JSON file and store the single-line output. Use this only when multiline secret entry is inconvenient.

Do not configure both secrets. The deployment rejects ambiguous credentials.

The Firebase JSON must include non-empty `project_id`, `client_email`, and `private_key` fields. When `FIREBASE_PROJECT_ID` exists in the production environment file, its value must match the JSON `project_id`.

## Existing production environment secret

`PRODUCTION_ENV_FILE_B64` remains required and still contains the rest of the production `.env`. An existing shell-quoted `FIREBASE_SERVICE_ACCOUNT_JSON` inside that file remains supported.

When one of the dedicated Firebase secrets is configured, the deployment safely appends it as the final `FIREBASE_SERVICE_ACCOUNT_JSON` assignment. That final assignment overrides an older embedded value without printing the credential.

## Generate the base64 form

Linux:

```bash
base64 -w 0 firebase-adminsdk.json
```

macOS:

```bash
base64 < firebase-adminsdk.json | tr -d '\n'
```

Windows PowerShell:

```powershell
[Convert]::ToBase64String([IO.File]::ReadAllBytes((Resolve-Path .\firebase-adminsdk.json)))
```

## Deployment behavior

Before connecting to the VPS, GitHub Actions now:

1. Decodes `PRODUCTION_ENV_FILE_B64` into a temporary file with restricted permissions.
2. Overlays the protected Firebase secret when configured.
3. Loads the assembled file and runs the real production validator with closed-app push required.
4. Stops before SSH if any production value is missing, malformed, or mismatched.
5. Sends the exact validated file to the VPS and deploys the exact successful `main` commit.

Never commit `firebase-adminsdk.json`, paste its contents into an issue, pull request, chat message, workflow file, or build log.
