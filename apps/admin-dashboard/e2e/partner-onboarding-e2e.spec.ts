import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { APIRequestContext, Browser, Page, expect, test } from '@playwright/test';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3005';
const WEB_BASE = 'http://localhost:3001';
const SCREENSHOT_DIR = path.resolve(__dirname, '../../../docs/qa/phase-email-verification');
const adminEmail = process.env.ADMIN_EMAIL;
const adminPassword = process.env.ADMIN_PASSWORD;

const qaPhone = (offset = 0) => `+919${String(Date.now() + offset).slice(-9).padStart(9, '0')}`;
const qaEmail = (suffix: string) => `qa.${suffix.replace(/[^a-zA-Z0-9.-]/g, '.')}@example.com`.toLowerCase();

type Applicant = {
  applicationId: string;
  accessToken: string;
  applicationNumber: string;
  type: 'RIDER' | 'STORE';
  name: string;
  phone: string;
  email: string;
  requiredDocuments: string[];
};

const headers = (applicant: Applicant) => ({ Authorization: `Application ${applicant.accessToken}` });

async function startApplication(
  request: APIRequestContext,
  type: 'RIDER' | 'STORE',
  suffix: string,
  phone: string,
  email: string,
) {
  const name = type === 'RIDER' ? `QA Rider ${suffix}` : `QA Store ${suffix}`;
  const response = await request.post(`${API_BASE}/partner-onboarding/applications`, {
    data: {
      type,
      applicantName: name,
      phoneE164: phone,
      email,
      // Deliberately request the retired channel to prove the API, not just the app UI,
      // enforces email verification for every newly-created Partner application.
      verificationChannel: 'PHONE',
    },
  });
  expect(response.ok(), await response.text()).toBeTruthy();
  const body = await response.json();
  expect(body.verification?.channel).toBe('EMAIL');
  expect(body.verification?.code).toMatch(/^\d{6}$/);
  return { body, name };
}

async function submittedApplication(
  request: APIRequestContext,
  type: 'RIDER' | 'STORE',
  suffix: string,
  phone: string,
  email: string,
): Promise<Applicant> {
  const started = await startApplication(request, type, suffix, phone, email);
  const applicant: Applicant = {
    applicationId: started.body.applicationId,
    accessToken: started.body.accessToken,
    applicationNumber: started.body.applicationNumber,
    type,
    name: started.name,
    phone,
    email,
    requiredDocuments:
      type === 'RIDER'
        ? ['IDENTITY', 'PROFILE_PHOTO', 'BANK_PROOF']
        : ['OWNER_IDENTITY', 'STORE_FRONT_PHOTO', 'STORE_INTERIOR_PHOTO', 'BUSINESS_REGISTRATION', 'BANK_PROOF'],
  };

  const verify = await request.post(
    `${API_BASE}/partner-onboarding/applications/${applicant.applicationId}/verify-contact`,
    { headers: headers(applicant), data: { code: started.body.verification.code } },
  );
  expect(verify.ok(), await verify.text()).toBeTruthy();
  const verifiedApplication = (await verify.json()).application;
  expect(verifiedApplication.emailVerifiedAt).toBeTruthy();
  expect(verifiedApplication.phoneVerifiedAt).toBeFalsy();

  const payload = type === 'RIDER'
    ? {
        dateOfBirth: '1995-05-10', addressLine1: 'QA Address', city: 'Visakhapatnam',
        state: 'Andhra Pradesh', pincode: '530041', vehicleType: 'WALKER',
        emergencyContactName: 'QA Contact', emergencyContactPhone: '+919999999999',
        preferredZones: ['Madhurawada'], availability: 'Full day', experience: 'First-time Rider',
        bankAccountHolderName: started.name, bankAccountNumber: '123456789012', bankIfsc: 'ABCD0001234',
      }
    : {
        legalName: `QA Store Legal ${suffix}`, displayName: `QA Store ${suffix}`, businessType: 'Grocery',
        storeAddress: 'QA Store Address', city: 'Visakhapatnam', state: 'Andhra Pradesh', pincode: '530041',
        latitude: 17.7231, longitude: 83.3013, operatingHours: '7 AM–11 PM', serviceRadiusKm: 5,
        orderCapacity: 100, categories: ['Groceries'], pickupInstructions: 'Front counter',
        bankAccountHolderName: started.name, bankAccountNumber: '987654321012', bankIfsc: 'WXYZ0004321',
      };

  const update = await request.patch(
    `${API_BASE}/partner-onboarding/applications/${applicant.applicationId}`,
    { headers: headers(applicant), data: { payload } },
  );
  expect(update.ok(), await update.text()).toBeTruthy();
  expect((await update.json()).application.applicantPayload.bankAccountNumber).toBeUndefined();

  for (const documentType of applicant.requiredDocuments) {
    const upload = await request.post(
      `${API_BASE}/partner-onboarding/applications/${applicant.applicationId}/documents`,
      {
        headers: headers(applicant),
        multipart: {
          type: documentType,
          file: {
            name: `${documentType.toLowerCase()}.pdf`,
            mimeType: 'application/pdf',
            buffer: Buffer.from(`%PDF-1.4 AAGAM QA ${documentType}`),
          },
        },
      },
    );
    expect(upload.ok(), await upload.text()).toBeTruthy();
  }

  const submit = await request.post(
    `${API_BASE}/partner-onboarding/applications/${applicant.applicationId}/submit`,
    {
      headers: { ...headers(applicant), 'Idempotency-Key': `email-${type}-${suffix}` },
      data: {},
    },
  );
  expect(submit.ok(), await submit.text()).toBeTruthy();
  expect((await submit.json()).application.status).toBe('SUBMITTED');
  return applicant;
}

async function adminBearer(request: APIRequestContext) {
  expect(adminEmail, 'ADMIN_EMAIL must be configured for Playwright').toBeTruthy();
  expect(adminPassword, 'ADMIN_PASSWORD must be configured for Playwright').toBeTruthy();
  const login = await request.post(`${API_BASE}/auth/mobile/login`, {
    data: { identifier: adminEmail, password: adminPassword },
  });
  expect(login.ok(), await login.text()).toBeTruthy();
  return (await login.json()).access_token as string;
}

async function adminPage(browser: Browser) {
  expect(adminEmail, 'ADMIN_EMAIL must be configured for Playwright').toBeTruthy();
  expect(adminPassword, 'ADMIN_PASSWORD must be configured for Playwright').toBeTruthy();
  const context = await browser.newContext({ baseURL: WEB_BASE });
  const page = await context.newPage();
  await page.goto('/login');
  await page.getByLabel('Phone number or email').fill(adminEmail!);
  await page.getByLabel('Password').fill(adminPassword!);
  await Promise.all([
    page.waitForURL('**/admin**', { timeout: 20_000 }),
    page.getByRole('button', { name: 'Continue', exact: true }).click(),
  ]);
  return page;
}

async function openApplication(page: Page, applicant: Applicant) {
  await page.goto('/admin/partner-applications');
  await page.getByPlaceholder(/Search phone, name, email or application/i).fill(applicant.applicationNumber);
  const card = page.getByRole('button').filter({ hasText: applicant.applicationNumber }).first();
  await expect(card).toBeVisible();
  await card.click();
  await expect(page.getByRole('heading', { name: applicant.name })).toBeVisible();
}

async function approve(page: Page, applicant: Applicant) {
  await openApplication(page, applicant);
  await page.getByRole('button', { name: /Start review and assign to me/i }).click();
  await page.getByRole('button', { name: /Verify all documents/i }).click();
  const approveButton = page.getByRole('button', { name: /Approve and provision/i });
  await expect(approveButton).toBeEnabled();
  await approveButton.click();
  await expect(page.locator('header').getByText('APPROVED')).toBeVisible();
  await page.screenshot({
    path: path.join(SCREENSHOT_DIR, `email-verified-${applicant.type.toLowerCase()}-approved.png`),
    fullPage: true,
  });
}

async function phoneLogin(request: APIRequestContext, phone: string) {
  const challenge = await request.post(`${API_BASE}/auth/phone/request`, {
    data: { phoneE164: phone, purpose: 'LOGIN' },
  });
  expect(challenge.ok(), await challenge.text()).toBeTruthy();
  const challengeBody = await challenge.json();
  expect(challengeBody.code).toMatch(/^\d{6}$/);
  const verify = await request.post(`${API_BASE}/auth/mobile/phone/verify`, {
    data: { phoneE164: phone, purpose: 'LOGIN', code: challengeBody.code },
  });
  expect(verify.ok(), await verify.text()).toBeTruthy();
  return verify.json();
}

test.describe.serial('Email-first identity and Partner recovery E2E', () => {
  test.beforeAll(() => mkdirSync(SCREENSHOT_DIR, { recursive: true }));

  test('Customer creates a mobile account with verified email and can sign in with the same credentials', async ({ request }) => {
    const suffix = `${Date.now()}-customer`;
    const email = qaEmail(suffix);
    const password = 'EmailQa#2026';
    const signupChallenge = await request.post(`${API_BASE}/auth/email/signup/request`, {
      data: { email },
    });
    expect(signupChallenge.ok(), await signupChallenge.text()).toBeTruthy();
    const challenge = await signupChallenge.json();
    expect(challenge.channel).toBe('EMAIL');
    expect(challenge.code).toMatch(/^\d{6}$/);

    const signup = await request.post(`${API_BASE}/auth/mobile/email/signup/verify`, {
      data: {
        email,
        code: challenge.code,
        name: 'Email Customer QA',
        password,
        confirmPassword: password,
      },
    });
    expect(signup.ok(), await signup.text()).toBeTruthy();
    const signupSession = await signup.json();
    expect(signupSession.access_token).toBeTruthy();
    expect(signupSession.user.email).toBe(email);
    expect(signupSession.user.phone).toBeNull();
    expect(signupSession.user.roles).toContain('CUSTOMER');

    const login = await request.post(`${API_BASE}/auth/mobile/login`, {
      data: { identifier: email, password },
    });
    expect(login.ok(), await login.text()).toBeTruthy();
    const loginSession = await login.json();
    expect(loginSession.user.email).toBe(email);
    expect(loginSession.user.roles).toContain('CUSTOMER');
  });

  test('Partner application recovery rotates the secret and restores the complete saved state', async ({ request }) => {
    const suffix = `${Date.now()}-recovery`;
    const phone = qaPhone(2);
    const applicant = await submittedApplication(request, 'RIDER', suffix, phone, qaEmail(`recover.${suffix}`));
    const oldToken = applicant.accessToken;

    // Recovery remains an independent existing flow. The application itself was email-verified above.
    const recoveryRequest = await request.post(`${API_BASE}/partner-onboarding/resume/request`, {
      data: { identifier: phone },
    });
    expect(recoveryRequest.ok(), await recoveryRequest.text()).toBeTruthy();
    const recoveryChallenge = await recoveryRequest.json();
    expect(recoveryChallenge.channel).toBe('PHONE');

    const recoveryVerify = await request.post(`${API_BASE}/partner-onboarding/resume/verify`, {
      data: { identifier: phone, code: recoveryChallenge.code },
    });
    expect(recoveryVerify.ok(), await recoveryVerify.text()).toBeTruthy();
    const recovered = await recoveryVerify.json();
    expect(recovered.application.status).toBe('SUBMITTED');
    expect(recovered.application.emailVerifiedAt).toBeTruthy();
    expect(recovered.application.applicantPayload.vehicleType).toBe('WALKER');
    expect(recovered.documents.length).toBe(applicant.requiredDocuments.length);
    expect(recovered.accessToken).not.toBe(oldToken);

    const oldSession = await request.get(`${API_BASE}/partner-onboarding/applications/${applicant.applicationId}`, {
      headers: { Authorization: `Application ${oldToken}` },
    });
    expect(oldSession.status()).toBe(401);

    const edit = await request.patch(`${API_BASE}/partner-onboarding/applications/${applicant.applicationId}`, {
      headers: { Authorization: `Application ${recovered.accessToken}` },
      data: { payload: { availability: 'Evening' } },
    });
    expect(edit.ok(), await edit.text()).toBeTruthy();
    expect((await edit.json()).application.status).toBe('DRAFT');
  });

  test('Admin Delete draft button uses reliable action endpoint and restore works', async ({ browser, request }) => {
    const suffix = `${Date.now()}-delete`;
    const phone = qaPhone(3);
    const email = qaEmail(`delete.${suffix}`);
    const started = await startApplication(request, 'RIDER', suffix, phone, email);
    const draft: Applicant = {
      applicationId: started.body.applicationId,
      accessToken: started.body.accessToken,
      applicationNumber: started.body.applicationNumber,
      type: 'RIDER',
      name: started.name,
      phone,
      email,
      requiredDocuments: [],
    };
    const page = await adminPage(browser);
    try {
      await openApplication(page, draft);
      await page.getByPlaceholder('Required deletion reason').fill('Duplicate QA draft retained for restore proof.');
      await page.getByRole('button', { name: 'Delete draft', exact: true }).click();
      await expect(page.getByText('Draft moved to deleted items.')).toBeVisible();
      await expect(page.getByRole('button', { name: 'Restore draft', exact: true })).toBeVisible();
      await page.getByRole('button', { name: 'Restore draft', exact: true }).click();
      await expect(page.getByText('Draft restored.')).toBeVisible();
      await expect(page.getByRole('button', { name: 'Delete draft', exact: true })).toBeVisible();
    } finally {
      await page.context().close();
    }

    const token = await adminBearer(request);
    const deleteApi = await request.post(`${API_BASE}/admin/partner-onboarding/applications/${draft.applicationId}/delete`, {
      headers: { Authorization: `Bearer ${token}` },
      data: { reason: 'API action route proof for reverse proxies.', retentionDays: 14 },
    });
    expect(deleteApi.ok(), await deleteApi.text()).toBeTruthy();
    expect((await deleteApi.json()).application.deletedAt).toBeTruthy();
  });

  test('approved Rider and Store sign in directly with verified phone OTP', async ({ browser, request }) => {
    const suffix = `${Date.now()}-approval`;
    const rider = await submittedApplication(
      request,
      'RIDER',
      `${suffix}-rider`,
      qaPhone(4),
      qaEmail(`${suffix}.rider`),
    );
    const store = await submittedApplication(
      request,
      'STORE',
      `${suffix}-store`,
      qaPhone(5),
      qaEmail(`${suffix}.store`),
    );
    const page = await adminPage(browser);
    try {
      await approve(page, rider);
      await approve(page, store);
    } finally {
      await page.context().close();
    }
    const riderSession = await phoneLogin(request, rider.phone);
    const storeSession = await phoneLogin(request, store.phone);
    expect(riderSession.user.roles).toEqual(expect.arrayContaining(['CUSTOMER', 'RIDER']));
    expect(storeSession.user.roles).toEqual(expect.arrayContaining(['CUSTOMER', 'STORE_OWNER']));
  });
});
