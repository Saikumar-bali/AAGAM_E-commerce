import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { APIRequestContext, Browser, Page, expect, test } from '@playwright/test';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3005';
const WEB_BASE = 'http://localhost:3001';
const SCREENSHOT_DIR = path.resolve(__dirname, '../../../docs/qa/phase-4');
const adminEmail = process.env.ADMIN_EMAIL;
const adminPassword = process.env.ADMIN_PASSWORD;

type Applicant = {
  applicationId: string;
  accessToken: string;
  applicationNumber: string;
  type: 'RIDER' | 'STORE';
  name: string;
  email: string;
  requiredDocuments: string[];
};

const headers = (applicant: Applicant) => ({ Authorization: `Application ${applicant.accessToken}` });

async function startApplication(request: APIRequestContext, type: 'RIDER' | 'STORE', suffix: string, email?: string) {
  const name = type === 'RIDER' ? `QA Rider ${suffix}` : `QA Store ${suffix}`;
  const response = await request.post(`${API_BASE}/partner-onboarding/applications`, {
    data: {
      type,
      applicantName: name,
      email: email || `${type.toLowerCase()}.${suffix}@example.com`,
      verificationChannel: 'EMAIL',
    },
  });
  expect(response.ok(), await response.text()).toBeTruthy();
  const body = await response.json();
  expect(body.verification?.code).toMatch(/^\d{6}$/);
  return { body, name, email: email || `${type.toLowerCase()}.${suffix}@example.com` };
}

async function submittedApplication(
  request: APIRequestContext,
  type: 'RIDER' | 'STORE',
  suffix: string,
  email?: string,
): Promise<Applicant> {
  const started = await startApplication(request, type, suffix, email);
  const applicant: Applicant = {
    applicationId: started.body.applicationId,
    accessToken: started.body.accessToken,
    applicationNumber: started.body.applicationNumber,
    type,
    name: started.name,
    email: started.email,
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
    const document = (await upload.json()).documents.find((item: any) => item.type === documentType);
    expect(document.version).toBe(1);
    expect(document.uploadedAt).toBeTruthy();
  }

  const submit = await request.post(
    `${API_BASE}/partner-onboarding/applications/${applicant.applicationId}/submit`,
    {
      headers: { ...headers(applicant), 'Idempotency-Key': `qa-${type}-${suffix}` },
      data: {},
    },
  );
  expect(submit.ok(), await submit.text()).toBeTruthy();
  expect((await submit.json()).application.status).toBe('SUBMITTED');
  return applicant;
}

async function adminPage(browser: Browser) {
  expect(adminEmail, 'ADMIN_EMAIL must be configured for Playwright').toBeTruthy();
  expect(adminPassword, 'ADMIN_PASSWORD must be configured for Playwright').toBeTruthy();
  const context = await browser.newContext({ baseURL: WEB_BASE });
  const page = await context.newPage();
  await page.goto('/login');
  await page.getByRole('textbox', { name: /email address/i }).fill(adminEmail!);
  await page.locator('input[type="password"]').fill(adminPassword!);
  await Promise.all([
    page.waitForURL('**/admin**', { timeout: 20_000 }),
    page.getByRole('button', { name: 'Continue', exact: true }).click(),
  ]);
  return page;
}

async function openApplication(page: Page, applicant: Applicant) {
  await page.goto('/admin/partner-applications');
  await page.getByPlaceholder(/Search name, email or application/i).fill(applicant.applicationNumber);
  const card = page.getByRole('button').filter({ hasText: applicant.applicationNumber }).first();
  await expect(card).toBeVisible();
  await card.click();
  await expect(page.getByRole('heading', { name: applicant.name })).toBeVisible();
}

async function approve(page: Page, applicant: Applicant, linked = false) {
  await openApplication(page, applicant);
  await page.getByRole('button', { name: /Start review and assign to me/i }).click();
  await page.getByRole('button', { name: /Verify all submitted documents/i }).click();
  for (const type of applicant.requiredDocuments) {
    const card = page.locator('article').filter({ hasText: type.replaceAll('_', ' ') });
    await expect(card.getByText('VERIFIED', { exact: true })).toBeVisible();
    await expect(card.getByRole('button', { name: 'Download', exact: true })).toBeVisible();
  }
  const button = page.getByRole('button', {
    name: new RegExp(`Approve and provision ${applicant.type === 'RIDER' ? 'Rider' : 'Store'}`, 'i'),
  });
  await expect(button).toBeEnabled();
  await button.click();
  await expect(page.locator('header').getByText('APPROVED')).toBeVisible();
  if (linked) await expect(page.getByText('EXISTING CUSTOMER LINKED')).toBeVisible();
  await page.screenshot({
    path: path.join(SCREENSHOT_DIR, `partner-v2-${applicant.type.toLowerCase()}-${linked ? 'linked' : 'approved'}.png`),
    fullPage: true,
  });
}

async function activateNewAccount(request: APIRequestContext, applicant: Applicant, password: string) {
  const claim = await request.post(
    `${API_BASE}/partner-onboarding/applications/${applicant.applicationId}/activation`,
    { headers: headers(applicant), data: {} },
  );
  expect(claim.ok(), await claim.text()).toBeTruthy();
  const token = (await claim.json()).token;
  const activation = await request.post(`${API_BASE}/partner-onboarding/activate`, {
    data: { token, password },
  });
  expect(activation.ok(), await activation.text()).toBeTruthy();
  const login = await request.post(`${API_BASE}/auth/mobile/login`, {
    data: { email: applicant.email, password },
  });
  expect(login.ok(), await login.text()).toBeTruthy();
  return login.json();
}

test.describe.serial('Partner Onboarding V2 E2E', () => {
  test.beforeAll(() => mkdirSync(SCREENSHOT_DIR, { recursive: true }));

  test('new Rider and Store complete review, provisioning, activation and multi-role login', async ({ browser, request }) => {
    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const rider = await submittedApplication(request, 'RIDER', suffix);
    const store = await submittedApplication(request, 'STORE', suffix);
    const page = await adminPage(browser);
    try {
      await approve(page, rider);
      await approve(page, store);
    } finally {
      await page.context().close();
    }
    const riderSession = await activateNewAccount(request, rider, `Rider-${suffix}-42!`);
    const storeSession = await activateNewAccount(request, store, `Store-${suffix}-42!`);
    expect(riderSession.user.roles).toEqual(expect.arrayContaining(['CUSTOMER', 'RIDER']));
    expect(storeSession.user.roles).toEqual(expect.arrayContaining(['CUSTOMER', 'STORE_OWNER']));
  });

  test('existing Customer receives Rider access without password replacement', async ({ browser, request }) => {
    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const email = `customer.rider.${suffix}@example.com`;
    const password = `Customer-${suffix}-42!`;
    const signup = await request.post(`${API_BASE}/auth/signup`, {
      data: { email, password, name: `Existing Customer ${suffix}` },
    });
    expect(signup.ok(), await signup.text()).toBeTruthy();
    const rider = await submittedApplication(request, 'RIDER', `linked-${suffix}`, email);
    const page = await adminPage(browser);
    try {
      await approve(page, rider, true);
    } finally {
      await page.context().close();
    }
    const claim = await request.post(
      `${API_BASE}/partner-onboarding/applications/${rider.applicationId}/activation`,
      { headers: headers(rider), data: {} },
    );
    expect(claim.status()).toBe(409);
    const login = await request.post(`${API_BASE}/auth/mobile/login`, { data: { email, password } });
    expect(login.ok(), await login.text()).toBeTruthy();
    const session = await login.json();
    expect(session.user.role).toBe('CUSTOMER');
    expect(session.user.roles).toEqual(expect.arrayContaining(['CUSTOMER', 'RIDER']));
    const profile = await request.get(`${API_BASE}/riders/me`, {
      headers: { Authorization: `Bearer ${session.access_token}` },
    });
    expect(profile.ok(), await profile.text()).toBeTruthy();
  });

  test('Admin can assist contact verification and delete then restore a draft', async ({ browser, request }) => {
    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const started = await startApplication(request, 'RIDER', `draft-${suffix}`);
    const draft: Applicant = {
      applicationId: started.body.applicationId,
      accessToken: started.body.accessToken,
      applicationNumber: started.body.applicationNumber,
      type: 'RIDER',
      name: started.name,
      email: started.email,
      requiredDocuments: [],
    };
    const page = await adminPage(browser);
    try {
      await openApplication(page, draft);
      await page.getByPlaceholder('Reason and evidence checked').fill('Identity matched during an in-person QA support check.');
      await page.getByRole('button', { name: /Mark contact verified by Admin/i }).click();
      await page.getByPlaceholder('Required deletion reason').fill('Duplicate QA draft retained for recovery proof.');
      await page.getByRole('button', { name: 'Delete draft', exact: true }).click();
      await expect(page.getByRole('button', { name: 'Restore draft', exact: true })).toBeVisible();
      await page.getByRole('button', { name: 'Restore draft', exact: true }).click();
      await expect(page.getByRole('button', { name: 'Delete draft', exact: true })).toBeVisible();
    } finally {
      await page.context().close();
    }
  });
});
