import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { APIRequestContext, Browser, Page, expect, test } from '@playwright/test';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3005';
const WEB_BASE = 'http://localhost:3001';
const SCREENSHOT_DIR = path.resolve(__dirname, '../../../docs/qa/phase-4');

const adminEmail = process.env.ADMIN_EMAIL || 'admin@aagam.com';
const adminPassword = process.env.ADMIN_PASSWORD || 'admin@2026!';

type Applicant = {
  applicationId: string;
  accessToken: string;
  applicationNumber: string;
  type: 'RIDER' | 'STORE';
  name: string;
  email: string;
  requiredDocuments: string[];
};

function applicantHeaders(applicant: Pick<Applicant, 'accessToken'>) {
  return { Authorization: `Application ${applicant.accessToken}` };
}

async function createSubmittedApplication(
  request: APIRequestContext,
  type: 'RIDER' | 'STORE',
  suffix: string,
): Promise<Applicant> {
  const name = type === 'RIDER' ? `QA Rider ${suffix}` : `QA Store Owner ${suffix}`;
  const email = `${type.toLowerCase()}.${suffix}@example.com`;
  const start = await request.post(`${API_BASE}/partner-onboarding/applications`, {
    data: {
      type,
      applicantName: name,
      email,
      verificationChannel: 'EMAIL',
    },
  });
  expect(start.ok(), await start.text()).toBeTruthy();
  const started = await start.json();
  expect(started.accessToken).toBeTruthy();
  expect(started.verification?.code).toMatch(/^\d{6}$/);

  const applicant: Applicant = {
    applicationId: started.applicationId,
    accessToken: started.accessToken,
    applicationNumber: started.applicationNumber,
    type,
    name,
    email,
    requiredDocuments:
      type === 'RIDER'
        ? ['IDENTITY', 'PROFILE_PHOTO', 'BANK_PROOF']
        : [
            'OWNER_IDENTITY',
            'STORE_FRONT_PHOTO',
            'STORE_INTERIOR_PHOTO',
            'BUSINESS_REGISTRATION',
            'BANK_PROOF',
          ],
  };

  const verify = await request.post(
    `${API_BASE}/partner-onboarding/applications/${applicant.applicationId}/verify-contact`,
    {
      headers: applicantHeaders(applicant),
      data: { code: started.verification.code },
    },
  );
  expect(verify.ok(), await verify.text()).toBeTruthy();

  const payload =
    type === 'RIDER'
      ? {
          dateOfBirth: '1995-05-10',
          addressLine1: 'QA Rider Address',
          city: 'Visakhapatnam',
          state: 'Andhra Pradesh',
          pincode: '530041',
          vehicleType: 'WALKER',
          emergencyContactName: 'QA Emergency Contact',
          emergencyContactPhone: '+919999999999',
          preferredZones: ['Madhurawada'],
          availability: 'Daily 09:00-20:00',
          experience: 'End-to-end QA applicant',
          bankAccountNumber: '123456789012',
          bankIfsc: 'ABCD0001234',
        }
      : {
          legalName: `QA Store Legal ${suffix}`,
          displayName: `QA Store ${suffix}`,
          businessType: 'GROCERY',
          storeAddress: 'QA Store Address, Visakhapatnam',
          city: 'Visakhapatnam',
          state: 'Andhra Pradesh',
          pincode: '530041',
          latitude: 17.7231,
          longitude: 83.3013,
          operatingHours: 'Daily 07:00-23:00',
          serviceRadiusKm: 5,
          orderCapacity: 100,
          packingCapacity: 10,
          categories: ['Groceries', 'Dairy'],
          pickupInstructions: 'Use the front pickup counter.',
          bankAccountNumber: '987654321012',
          bankIfsc: 'WXYZ0004321',
        };

  const update = await request.patch(
    `${API_BASE}/partner-onboarding/applications/${applicant.applicationId}`,
    {
      headers: applicantHeaders(applicant),
      data: { payload },
    },
  );
  expect(update.ok(), await update.text()).toBeTruthy();
  const updated = await update.json();
  expect(updated.application.applicantPayload.bankAccountNumber).toBeUndefined();
  expect(updated.application.applicantPayload.bankAccountCiphertext).toBeUndefined();
  expect(updated.application.applicantPayload.bankAccountLast4).toBe(
    type === 'RIDER' ? '9012' : '1012',
  );

  for (const documentType of applicant.requiredDocuments) {
    const upload = await request.post(
      `${API_BASE}/partner-onboarding/applications/${applicant.applicationId}/documents`,
      {
        headers: applicantHeaders(applicant),
        multipart: {
          type: documentType,
          documentNumber: `QA-${documentType}-1234`,
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
      headers: {
        ...applicantHeaders(applicant),
        'Idempotency-Key': `qa-submit-${type}-${suffix}`,
      },
      data: {},
    },
  );
  expect(submit.ok(), await submit.text()).toBeTruthy();
  const submitted = await submit.json();
  expect(submitted.application.status).toBe('SUBMITTED');
  expect(submitted.application.submissionVersion).toBe(1);
  expect(submitted.requirements.completionPercent).toBe(100);

  const repeated = await request.post(
    `${API_BASE}/partner-onboarding/applications/${applicant.applicationId}/submit`,
    {
      headers: {
        ...applicantHeaders(applicant),
        'Idempotency-Key': `qa-submit-${type}-${suffix}`,
      },
      data: {},
    },
  );
  expect(repeated.ok(), await repeated.text()).toBeTruthy();
  expect((await repeated.json()).application.submissionVersion).toBe(1);

  return applicant;
}

async function loginAdmin(browser: Browser): Promise<Page> {
  const context = await browser.newContext({ baseURL: WEB_BASE });
  const page = await context.newPage();
  await page.goto('/login');
  await page.getByRole('textbox', { name: /email address/i }).fill(adminEmail);
  await page.locator('input[type="password"]').fill(adminPassword);
  await Promise.all([
    page.waitForURL('**/admin**', { timeout: 20_000 }),
    page.getByRole('button', { name: 'Continue', exact: true }).click(),
  ]);
  return page;
}

async function reviewAndApprove(page: Page, applicant: Applicant) {
  await page.goto('/admin/partner-applications');
  await expect(
    page.getByRole('heading', { name: 'Partner Applications' }),
  ).toBeVisible();
  await page.getByPlaceholder(/Search application/).fill(applicant.applicationNumber);

  const applicationCard = page
    .getByRole('button')
    .filter({ hasText: applicant.applicationNumber })
    .first();
  await expect(applicationCard).toBeVisible();
  await applicationCard.click();
  await expect(page.getByRole('heading', { name: applicant.name })).toBeVisible();

  await page
    .getByRole('button', { name: /Start review and assign to me/i })
    .click();
  await expect(page.locator('header').getByText('UNDER REVIEW')).toBeVisible();

  for (const documentType of applicant.requiredDocuments) {
    const documentCard = page
      .locator('article')
      .filter({ hasText: documentType.replaceAll('_', ' ') });
    await expect(documentCard).toBeVisible();
    await documentCard.getByRole('button', { name: 'Verify', exact: true }).click();
    await expect(documentCard.getByText('VERIFIED', { exact: true })).toBeVisible();
  }

  await page.screenshot({
    path: path.join(
      SCREENSHOT_DIR,
      `partner-onboarding-${applicant.type.toLowerCase()}-documents-verified.png`,
    ),
    fullPage: true,
  });

  const approveButton = page.getByRole('button', {
    name: new RegExp(`Approve and provision ${applicant.type === 'RIDER' ? 'Rider' : 'Store'}`, 'i'),
  });
  await expect(approveButton).toBeEnabled();
  await approveButton.click();
  await expect(page.locator('header').getByText('APPROVED')).toBeVisible();

  await page.screenshot({
    path: path.join(
      SCREENSHOT_DIR,
      `partner-onboarding-${applicant.type.toLowerCase()}-approved.png`,
    ),
    fullPage: true,
  });
}

async function activateAndLogin(
  request: APIRequestContext,
  applicant: Applicant,
  password: string,
) {
  const pendingLogin = await request.post(`${API_BASE}/auth/mobile/login`, {
    data: { email: applicant.email, password },
  });
  expect(pendingLogin.status()).toBe(401);

  const claim = await request.post(
    `${API_BASE}/partner-onboarding/applications/${applicant.applicationId}/activation`,
    {
      headers: applicantHeaders(applicant),
      data: {},
    },
  );
  expect(claim.ok(), await claim.text()).toBeTruthy();
  const activation = await claim.json();
  expect(activation.token).toBeTruthy();

  const activate = await request.post(`${API_BASE}/partner-onboarding/activate`, {
    data: { token: activation.token, password },
  });
  expect(activate.ok(), await activate.text()).toBeTruthy();

  const login = await request.post(`${API_BASE}/auth/mobile/login`, {
    data: { email: applicant.email, password },
  });
  expect(login.ok(), await login.text()).toBeTruthy();
  const session = await login.json();
  expect(session.user.role).toBe(applicant.type === 'RIDER' ? 'RIDER' : 'STORE_OWNER');
  expect(session.access_token).toBeTruthy();

  if (applicant.type === 'RIDER') {
    const profile = await request.get(`${API_BASE}/riders/me`, {
      headers: { Authorization: `Bearer ${session.access_token}` },
    });
    expect(profile.ok(), await profile.text()).toBeTruthy();
    expect((await profile.json()).approvalStatus).toBe('APPROVED');
  } else {
    const stores = await request.get(`${API_BASE}/stores/my-stores`, {
      headers: { Authorization: `Bearer ${session.access_token}` },
    });
    expect(stores.ok(), await stores.text()).toBeTruthy();
    const storeRows = await stores.json();
    expect(storeRows).toHaveLength(1);
    expect(storeRows[0].isActive).toBe(true);
    expect(storeRows[0].name).toContain('QA Store');
  }

  const reuse = await request.post(`${API_BASE}/partner-onboarding/activate`, {
    data: { token: activation.token, password: `${password}x` },
  });
  expect(reuse.status()).toBe(401);
}

test.describe.serial('Professional Rider and Store onboarding E2E', () => {
  test.beforeAll(() => mkdirSync(SCREENSHOT_DIR, { recursive: true }));

  test('Rider and Store applications pass review, provisioning, activation and role login', async ({
    browser,
    request,
  }) => {
    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const rider = await createSubmittedApplication(request, 'RIDER', suffix);
    const store = await createSubmittedApplication(request, 'STORE', suffix);

    const page = await loginAdmin(browser);
    try {
      await reviewAndApprove(page, rider);
      await reviewAndApprove(page, store);
    } finally {
      await page.context().close();
    }

    await activateAndLogin(request, rider, 'RiderStrongPass123!');
    await activateAndLogin(request, store, 'StoreStrongPass123!');
  });
});
