# Production deployment automation

Production deployments are handled by `.github/workflows/deploy.yml`.

## Deployment policy

- A deployment starts only after the `CI` workflow finishes successfully for `main`.
- `workflow_dispatch` is available for a manual redeploy or rollback to a commit that is already contained in `main`.
- The server is synchronized to the exact successful commit SHA. The workflow uses `git fetch` plus `git reset --hard` instead of a normal `git pull`, so local tracked changes cannot create an untested mixed deployment.
- The deployment installs locked dependencies with `npm ci`, validates and generates Prisma, builds the API, admin dashboard, worker, applies checked-in Prisma migrations, reloads PM2, and checks the API health endpoint.
- `prisma db push` is intentionally not used in production.
- Concurrent production deployments are blocked both by GitHub Actions concurrency and a server-side `flock` lock.

## GitHub Environment

Create an environment named `production`:

1. Open **Repository settings → Environments → New environment**.
2. Name it `production`.
3. Restrict deployment branches to `main`.
4. Optionally add a required reviewer. This creates a manual approval gate before production secrets become available.

Store the following values in the `production` environment rather than in the general repository settings.

### Variables

| Name | Example | Purpose |
| --- | --- | --- |
| `DEPLOY_HOST` | `203.0.113.10` | VPS hostname or IP address |
| `DEPLOY_USER` | `deploy` | Linux account used by Actions |
| `DEPLOY_PORT` | `22` | SSH port; optional, defaults to `22` |
| `DEPLOY_PATH` | `/opt/aagam` | Absolute application directory |
| `HEALTHCHECK_URL` | `http://127.0.0.1:3005/health` | API health endpoint reachable from the VPS |
| `PRODUCTION_URL` | `https://aagam.example.com` | Required public HTTPS frontend URL; verified after deployment |
| `PUBLIC_API_URL` | `https://aagam.example.com/api` | Optional browser API URL override; defaults to `PRODUCTION_URL/api` |
| `PUBLIC_HEALTHCHECK_URL` | `https://aagam.example.com/api/health` | Optional public API health override; defaults to `PRODUCTION_URL/api/health` |

### Secrets

| Name | Content |
| --- | --- |
| `DEPLOY_SSH_PRIVATE_KEY` | Complete private deployment key, including the `BEGIN` and `END` lines |
| `DEPLOY_KNOWN_HOSTS` | Verified SSH host-key entry for the VPS |
| `PRODUCTION_ENV_FILE_B64` | Base64-encoded contents of the production `.env` file |

GitHub Actions cannot answer an interactive SSH password, OTP, or device-verification prompt. Use a dedicated SSH key for unattended deployment. GitHub device login authenticates a person or CLI to GitHub; it does not authenticate a workflow to the VPS.

A self-hosted runner installed on the VPS is an alternative, but it is not the default here. This repository is public, so a permanently connected runner increases the impact of a compromised workflow or untrusted code. The GitHub-hosted runner plus a restricted deployment SSH key keeps the production host separate from CI.

## Create a dedicated deployment key

Do not reuse a personal/root key when a restricted deployment key can be created.

On a trusted computer:

```bash
ssh-keygen -t ed25519 -f ~/.ssh/aagam_github_actions -C "github-actions-aagam" -N ""
```

Add the public key to the deployment user's `~/.ssh/authorized_keys` on the VPS:

```bash
cat ~/.ssh/aagam_github_actions.pub
```

Copy the private key into `DEPLOY_SSH_PRIVATE_KEY`:

```bash
cat ~/.ssh/aagam_github_actions
```

An existing unencrypted PEM private key also works, but it should be dedicated to this deployment user and revoked if exposed. The workflow cannot enter an interactive private-key passphrase.

## Pin the server host key

Run this from a trusted network and verify the fingerprint against the VPS console or provider before saving it:

```bash
ssh-keyscan -p 22 -H YOUR_SERVER_HOST
```

Store the complete verified output as `DEPLOY_KNOWN_HOSTS`. Do not replace strict host checking with `StrictHostKeyChecking=no`.

## Encode the production environment

The `.env` file must be shell-compatible because the deployment script exports it before building and restarting PM2. Keep secrets quoted when they contain spaces or shell characters.

Linux:

```bash
base64 -w 0 .env
```

macOS:

```bash
base64 < .env | tr -d '\n'
```

Windows PowerShell:

```powershell
[Convert]::ToBase64String([IO.File]::ReadAllBytes((Resolve-Path .env)))
```

Store the resulting single-line text as `PRODUCTION_ENV_FILE_B64`. The workflow decodes it to `.env` inside the configured `DEPLOY_PATH` with mode restricted by `umask 077`.

At minimum the current production validator requires:

```env
NODE_ENV=production
DATABASE_URL="postgresql://..."
REDIS_URL="rediss://..."
JWT_SECRET="a-random-secret-with-at-least-32-characters"
CORS_ORIGINS="https://your-admin-domain.example"
NEXT_PUBLIC_API_URL="https://your-api-domain.example"
```

The workflow overrides `NEXT_PUBLIC_API_URL` at build time with `PUBLIC_API_URL`, or with `PRODUCTION_URL/api` when that variable is not set. This prevents an old or local browser URL in the server `.env` from being compiled into the dashboard.

Add the remaining Firebase, Supabase, storage, mail, payment, and application-specific values required by the production service.

## One-time VPS prerequisites

The deployment account must be able to write to `DEPLOY_PATH` and run these commands without an interactive prompt:

```bash
git --version
node --version
npm --version
pm2 --version
curl --version
flock --version
```

Use Node.js `22.x`, matching CI. Install PM2 once and configure it to survive reboots:

```bash
npm install --global pm2
pm2 startup
# Run the sudo command printed by PM2, then:
pm2 save
```

The VPS also needs network access to the production PostgreSQL and Redis services. They may run on the same VPS (`127.0.0.1`) or on managed hosts. Migrations run through `DATABASE_URL`; the API and worker use `REDIS_URL`.

For the first deployment the workflow clones this public repository automatically when the directory at `DEPLOY_PATH` does not exist or is empty. If the directory already contains a checkout, tracked local changes are discarded during deployment; keep server-only configuration in `.env` or outside the repository.

## Manual deployment

After `deploy.yml` is present on `main`, open **Actions → Deploy production → Run workflow**. Select `main` or provide a commit/tag that is contained in `main`. A feature-branch-only commit is rejected.

## Failure behavior

- Failure before Prisma migration leaves PM2 running the previous process version.
- Failure during migration stops the deployment and does not restart PM2.
- Failure after PM2 reload prints PM2 status and recent API logs, then marks the workflow failed.
- Local health must report the exact deployed commit, and database plus Redis readiness must pass.
- The public frontend and public API health endpoint must serve the exact deployed commit before the workflow succeeds.
- Database migrations are not automatically rolled back. Production migrations must remain backward-compatible, and destructive changes should be split across releases.
