import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const root = resolve(__dirname, '../../..');
const prepareScript = resolve(root, 'scripts/prepare-production-env.js');
const validatorScript = resolve(root, 'scripts/validate-prod-env.js');

const serviceAccount = {
  type: 'service_account',
  project_id: 'aagam-ci',
  private_key_id: 'ci-key',
  private_key: '-----BEGIN PRIVATE KEY-----\nci-only\n-----END PRIVATE KEY-----\n',
  client_email: 'firebase-adminsdk@aagam-ci.iam.gserviceaccount.com',
  client_id: '1234567890',
};

const baseEnv = [
  'NODE_ENV=production',
  'DATABASE_URL=postgresql://aagam:ci@127.0.0.1:5432/aagam',
  'REDIS_URL=redis://127.0.0.1:6379',
  'JWT_SECRET=aagam-ci-production-secret-longer-than-32-characters',
  'CORS_ORIGINS=https://aagam.example.com',
  'NEXT_PUBLIC_API_URL=https://aagam.example.com/api',
  'PARTNER_EMAIL_PROVIDER=MAILJET',
  'MAILJET_API_KEY=ci-key',
  'MAILJET_SECRET_KEY=ci-secret',
  'PARTNER_VERIFICATION_FROM_EMAIL=verify@aagam.example.com',
  'PARTNER_PHONE_VERIFICATION_MODE=EMAIL_ONLY',
  // Model a stale value in PRODUCTION_ENV_FILE_B64. A protected service-account
  // secret is authoritative and must align the final project ID automatically.
  'FIREBASE_PROJECT_ID=legacy-aagam-project',
  '',
].join('\n');

function runPrepare(extraEnv: NodeJS.ProcessEnv, sourceEnv = baseEnv) {
  const dir = mkdtempSync(join(tmpdir(), 'aagam-prod-env-'));
  const output = join(dir, '.env');
  const result = spawnSync(process.execPath, [prepareScript, output], {
    cwd: root,
    encoding: 'utf8',
    env: {
      ...process.env,
      PRODUCTION_ENV_FILE_B64: Buffer.from(sourceEnv).toString('base64'),
      ...extraEnv,
    },
  });
  return { dir, output, result };
}

describe('production deployment environment contracts', () => {
  it('overlays a raw Firebase credential, aligns its project id, and passes validation', () => {
    const run = runPrepare({
      FIREBASE_SERVICE_ACCOUNT_JSON_SECRET: JSON.stringify(serviceAccount),
      FIREBASE_SERVICE_ACCOUNT_JSON_B64: '',
    });

    try {
      expect(run.result.status).toBe(0);
      const generated = readFileSync(run.output, 'utf8');
      expect(generated).toContain("FIREBASE_PROJECT_ID='aagam-ci'");
      expect(generated).toContain('FIREBASE_SERVICE_ACCOUNT_JSON=');
      expect(generated).toContain('firebase-adminsdk@aagam-ci.iam.gserviceaccount.com');
      expect(run.result.stdout).toContain(
        'Aligned FIREBASE_PROJECT_ID with the protected Firebase service account.',
      );

      // Workflows that call the API suite may export QA-only variables. The real
      // production deploy job does not, so validate against a deliberately clean
      // child environment rather than leaking the parent test workflow's flags.
      const validationEnv: NodeJS.ProcessEnv = {
        PATH: process.env.PATH,
        HOME: process.env.HOME,
        CI: 'true',
        REQUIRE_CLOSED_APP_PUSH: 'true',
      };
      const validate = spawnSync(
        'bash',
        [
          '-lc',
          'set -a; source "$1"; set +a; node "$2"',
          'bash',
          run.output,
          validatorScript,
        ],
        { cwd: root, encoding: 'utf8', env: validationEnv },
      );
      expect({
        status: validate.status,
        stderr: validate.stderr,
        stdout: validate.stdout,
      }).toEqual({
        status: 0,
        stderr: '',
        stdout: expect.stringContaining('Production environment validation passed.'),
      });
    } finally {
      rmSync(run.dir, { recursive: true, force: true });
    }
  });

  it('accepts a base64 Firebase service-account secret and aligns its project id', () => {
    const run = runPrepare({
      FIREBASE_SERVICE_ACCOUNT_JSON_SECRET: '',
      FIREBASE_SERVICE_ACCOUNT_JSON_B64: Buffer.from(JSON.stringify(serviceAccount)).toString('base64'),
    });

    try {
      expect(run.result.status).toBe(0);
      const generated = readFileSync(run.output, 'utf8');
      expect(generated).toContain("FIREBASE_PROJECT_ID='aagam-ci'");
      expect(generated).toContain('FIREBASE_SERVICE_ACCOUNT_JSON=');
    } finally {
      rmSync(run.dir, { recursive: true, force: true });
    }
  });

  it('overlays protected WhatsApp secrets and validates SMS_ONLY production mode', () => {
    const whatsappBaseEnv = baseEnv.replace(
      'PARTNER_PHONE_VERIFICATION_MODE=EMAIL_ONLY',
      'PARTNER_PHONE_VERIFICATION_MODE=SMS_ONLY\nPARTNER_SMS_PROVIDER=WHATSAPP',
    );
    const run = runPrepare(
      {
        FIREBASE_SERVICE_ACCOUNT_JSON_SECRET: JSON.stringify(serviceAccount),
        FIREBASE_SERVICE_ACCOUNT_JSON_B64: '',
        WHATSAPP_ACCESS_TOKEN_SECRET: "token-with-'quote-and-long-enough-value",
        WHATSAPP_PHONE_NUMBER_ID_SECRET: '1322702964249664',
        WHATSAPP_BUSINESS_ACCOUNT_ID_SECRET: '2471999716613292',
        WHATSAPP_GRAPH_API_VERSION_SECRET: 'v23.0',
        WHATSAPP_OTP_TEMPLATE_NAME_SECRET: 'authentication_code_copy_code_button',
        WHATSAPP_OTP_TEMPLATE_LANGUAGE_CODE_SECRET: 'en_US',
        WHATSAPP_WEBHOOK_VERIFY_TOKEN_SECRET: 'ci-verify-token-at-least-16-chars',
        WHATSAPP_APP_SECRET_SECRET: 'ci-app-secret-at-least-16-chars',
      },
      whatsappBaseEnv,
    );

    try {
      expect(run.result.status).toBe(0);
      const generated = readFileSync(run.output, 'utf8');
      expect(generated).toContain("WHATSAPP_PHONE_NUMBER_ID='1322702964249664'");
      expect(generated).toContain("WHATSAPP_BUSINESS_ACCOUNT_ID='2471999716613292'");
      expect(generated).toContain("WHATSAPP_GRAPH_API_VERSION='v23.0'");
      expect(generated).toContain("WHATSAPP_OTP_TEMPLATE_NAME='authentication_code_copy_code_button'");
      expect(generated).not.toContain("WHATSAPP_ACCESS_TOKEN='token-with-'quote");
      expect(run.result.stdout).toContain(
        'Applied protected WhatsApp production settings without printing secret values.',
      );
      expect(run.result.stdout).not.toContain('token-with-');

      const validate = spawnSync(
        'bash',
        [
          '-lc',
          'set -a; source "$1"; set +a; node "$2"',
          'bash',
          run.output,
          validatorScript,
        ],
        {
          cwd: root,
          encoding: 'utf8',
          env: {
            PATH: process.env.PATH,
            HOME: process.env.HOME,
            CI: 'true',
            FORCE_VERIFICATION_ENV_VALIDATION: 'true',
            REQUIRE_CLOSED_APP_PUSH: 'true',
          },
        },
      );
      expect({ status: validate.status, stderr: validate.stderr }).toEqual({
        status: 0,
        stderr: '',
      });
      expect(validate.stdout).toContain('Production environment validation passed.');
    } finally {
      rmSync(run.dir, { recursive: true, force: true });
    }
  });

  it('rejects invalid or ambiguous Firebase credentials without printing the secret', () => {
    const invalid = runPrepare({
      FIREBASE_SERVICE_ACCOUNT_JSON_SECRET: '{not-json}',
      FIREBASE_SERVICE_ACCOUNT_JSON_B64: '',
    });
    const ambiguous = runPrepare({
      FIREBASE_SERVICE_ACCOUNT_JSON_SECRET: JSON.stringify(serviceAccount),
      FIREBASE_SERVICE_ACCOUNT_JSON_B64: Buffer.from(JSON.stringify(serviceAccount)).toString('base64'),
    });

    try {
      expect(invalid.result.status).not.toBe(0);
      expect(invalid.result.stderr).toContain('must contain valid JSON');
      expect(invalid.result.stderr).not.toContain('not-json');
      expect(ambiguous.result.status).not.toBe(0);
      expect(ambiguous.result.stderr).toContain('configure only one');
    } finally {
      rmSync(invalid.dir, { recursive: true, force: true });
      rmSync(ambiguous.dir, { recursive: true, force: true });
    }
  });

  it('wires protected Firebase and WhatsApp secrets into the production workflow', () => {
    const workflow = readFileSync(resolve(root, '.github/workflows/deploy.yml'), 'utf8');
    expect(workflow).toContain('FIREBASE_SERVICE_ACCOUNT_JSON_SECRET: ${{ secrets.FIREBASE_SERVICE_ACCOUNT_JSON }}');
    expect(workflow).toContain('FIREBASE_SERVICE_ACCOUNT_JSON_B64: ${{ secrets.FIREBASE_SERVICE_ACCOUNT_JSON_B64 }}');
    expect(workflow).toContain('WHATSAPP_ACCESS_TOKEN_SECRET: ${{ secrets.WHATSAPP_ACCESS_TOKEN }}');
    expect(workflow).toContain('WHATSAPP_APP_SECRET_SECRET: ${{ secrets.WHATSAPP_APP_SECRET }}');
    expect(workflow).toContain('WHATSAPP_WEBHOOK_VERIFY_TOKEN_SECRET: ${{ secrets.WHATSAPP_WEBHOOK_VERIFY_TOKEN }}');
    expect(workflow).toContain('node scripts/prepare-production-env.js "$RUNNER_TEMP/aagam-production.env"');
    expect(workflow).toContain('REQUIRE_CLOSED_APP_PUSH=true node scripts/validate-prod-env.js');
  });
});
