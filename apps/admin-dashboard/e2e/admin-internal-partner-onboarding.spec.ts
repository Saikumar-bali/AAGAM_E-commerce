import { APIRequestContext, expect, test } from '@playwright/test';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3005';
const adminEmail = process.env.ADMIN_EMAIL;
const adminPassword = process.env.ADMIN_PASSWORD;

const uniquePhone = (offset: number) => `+919${String(Date.now() + offset).slice(-9).padStart(9, '0')}`;
const uniqueEmail = (type: string, offset: number) => `internal.${type.toLowerCase()}.${Date.now()}.${offset}@example.com`;

async function adminBearer(request: APIRequestContext) {
  expect(adminEmail, 'ADMIN_EMAIL must be configured').toBeTruthy();
  expect(adminPassword, 'ADMIN_PASSWORD must be configured').toBeTruthy();
  const login = await request.post(`${API_BASE}/auth/mobile/login`, {
    data: { identifier: adminEmail, password: adminPassword },
  });
  expect(login.ok(), await login.text()).toBeTruthy();
  return (await login.json()).access_token as string;
}

async function activeZone(request: APIRequestContext, token: string) {
  const response = await request.get(`${API_BASE}/stores/delivery-zones/admin`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  expect(response.ok(), await response.text()).toBeTruthy();
  const zones = await response.json();
  const existing = (Array.isArray(zones) ? zones : []).find((zone: any) => zone.isActive && zone.name);
  if (existing) return existing.name as string;

  const name = `Internal QA Zone ${Date.now()}`;
  const create = await request.post(`${API_BASE}/stores/delivery-zones`, {
    headers: { Authorization: `Bearer ${token}` },
    data: { name },
  });
  expect(create.ok(), await create.text()).toBeTruthy();
  return name;
}

async function uploadDocument(
  request: APIRequestContext,
  token: string,
  applicationId: string,
  type: string,
) {
  const response = await request.post(
    `${API_BASE}/admin/partner-onboarding/internal-applications/${applicationId}/documents`,
    {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        type,
        file: {
          name: `${type.toLowerCase()}.pdf`,
          mimeType: 'application/pdf',
          buffer: Buffer.from(`%PDF-1.4 AAGAM INTERNAL ADMIN QA ${type}`),
        },
      },
    },
  );
  expect(response.ok(), await response.text()).toBeTruthy();
}

async function phoneLogin(request: APIRequestContext, phoneE164: string) {
  const challenge = await request.post(`${API_BASE}/auth/phone/request`, {
    data: { phoneE164, purpose: 'LOGIN' },
  });
  expect(challenge.ok(), await challenge.text()).toBeTruthy();
  const challengeBody = await challenge.json();
  expect(challengeBody.code).toMatch(/^\d{6}$/);

  const verify = await request.post(`${API_BASE}/auth/mobile/phone/verify`, {
    data: { phoneE164, purpose: 'LOGIN', code: challengeBody.code },
  });
  expect(verify.ok(), await verify.text()).toBeTruthy();
  return verify.json();
}

async function createAndApprove(
  request: APIRequestContext,
  token: string,
  type: 'RIDER' | 'STORE',
  offset: number,
) {
  const phoneE164 = uniquePhone(offset);
  const email = uniqueEmail(type, offset);
  const applicantName = type === 'RIDER' ? `Internal Rider ${Date.now()}` : `Internal Store Owner ${Date.now()}`;
  const zoneName = type === 'RIDER' ? await activeZone(request, token) : undefined;

  const create = await request.post(`${API_BASE}/admin/partner-onboarding/internal-applications`, {
    headers: { Authorization: `Bearer ${token}` },
    data: { type, applicantName, phoneE164, email },
  });
  expect(create.ok(), await create.text()).toBeTruthy();
  const created = await create.json();
  expect(created.application.status).toBe('DRAFT');
  expect(created.application.phoneVerifiedAt).toBeTruthy();
  const applicationId = created.application.id as string;

  const payload = type === 'RIDER'
    ? {
        dateOfBirth: '1995-05-10',
        addressLine1: 'Internal QA Address',
        city: 'Visakhapatnam',
        state: 'Andhra Pradesh',
        pincode: '530041',
        vehicleType: 'WALKER',
        preferredZones: [zoneName],
        availability: 'Full day',
        emergencyContactName: 'Emergency Contact',
        emergencyContactPhone: '+919999999999',
        bankAccountHolderName: applicantName,
        bankAccountNumber: '123456789012',
        bankIfsc: 'ABCD0001234',
      }
    : {
        legalName: `Internal Store Legal ${Date.now()}`,
        displayName: `Internal Store ${Date.now()}`,
        businessType: 'Grocery',
        storeAddress: 'Internal QA Store Address',
        city: 'Visakhapatnam',
        state: 'Andhra Pradesh',
        pincode: '530041',
        latitude: 17.7231,
        longitude: 83.3013,
        operatingHours: '7 AM–11 PM',
        serviceRadiusKm: 5,
        orderCapacity: 100,
        categories: ['Groceries'],
        pickupInstructions: 'Front counter',
        bankAccountHolderName: applicantName,
        bankAccountNumber: '987654321012',
        bankIfsc: 'WXYZ0004321',
      };

  const update = await request.patch(
    `${API_BASE}/admin/partner-onboarding/internal-applications/${applicationId}`,
    {
      headers: { Authorization: `Bearer ${token}` },
      data: { payload },
    },
  );
  expect(update.ok(), await update.text()).toBeTruthy();
  const updated = await update.json();
  expect(updated.application.phoneVerifiedAt).toBeTruthy();
  expect(updated.application.applicantPayload.bankAccountNumber).toBeUndefined();
  expect(updated.application.applicantPayload.bankIfsc).toBeUndefined();
  expect(updated.application.applicantPayload.bankAccountLast4).toBe(type === 'RIDER' ? '9012' : '1012');
  if (type === 'RIDER') expect(updated.application.applicantPayload.preferredZones).toContain(zoneName);

  const requiredDocuments = type === 'RIDER'
    ? ['IDENTITY', 'PROFILE_PHOTO', 'BANK_PROOF']
    : ['OWNER_IDENTITY', 'STORE_FRONT_PHOTO', 'STORE_INTERIOR_PHOTO', 'BUSINESS_REGISTRATION', 'BANK_PROOF'];
  for (const documentType of requiredDocuments) {
    await uploadDocument(request, token, applicationId, documentType);
  }

  // No applicant OTP and no Admin contact-verification API call are performed.
  // The authenticated Admin is the audited identity authority for internal onboarding.
  const submit = await request.post(
    `${API_BASE}/admin/partner-onboarding/internal-applications/${applicationId}/submit-for-review`,
    {
      headers: { Authorization: `Bearer ${token}` },
      data: { note: 'Internal Admin QA onboarding completed without OTP.' },
    },
  );
  expect(submit.ok(), await submit.text()).toBeTruthy();
  const submitted = await submit.json();
  expect(submitted.application.status).toBe('UNDER_REVIEW');
  expect(submitted.application.phoneVerifiedAt).toBeTruthy();
  expect(submitted.requirements.completionPercent).toBe(100);

  const verifyAll = await request.post(
    `${API_BASE}/admin/partner-onboarding/applications/${applicationId}/documents/verify-all`,
    {
      headers: { Authorization: `Bearer ${token}` },
      data: { note: 'Admin reviewed original evidence.' },
    },
  );
  expect(verifyAll.ok(), await verifyAll.text()).toBeTruthy();
  expect((await verifyAll.json()).documents.filter((item: any) => requiredDocuments.includes(item.type)).every((item: any) => item.status === 'VERIFIED')).toBeTruthy();

  const approve = await request.post(
    `${API_BASE}/admin/partner-onboarding/applications/${applicationId}/approve`,
    {
      headers: { Authorization: `Bearer ${token}` },
      data: type === 'STORE'
        ? { ownerEmail: email, operationalName: payload.displayName, latitude: payload.latitude, longitude: payload.longitude }
        : { ownerEmail: email, operationalName: applicantName },
    },
  );
  expect(approve.ok(), await approve.text()).toBeTruthy();
  const approved = await approve.json();
  expect(approved.application.status).toBe('APPROVED');
  expect(approved.application.provisionedUserId).toBeTruthy();
  if (type === 'STORE') expect(approved.application.provisionedStoreId).toBeTruthy();

  return { phoneE164, applicationId };
}

test.describe.serial('Admin internal Partner onboarding', () => {
  test('Admin can create and provision a Rider without onboarding OTP', async ({ request }) => {
    const token = await adminBearer(request);
    const rider = await createAndApprove(request, token, 'RIDER', 101);
    const session = await phoneLogin(request, rider.phoneE164);
    expect(session.user.roles).toEqual(expect.arrayContaining(['CUSTOMER', 'RIDER']));
  });

  test('Admin can create and provision a Store without onboarding OTP', async ({ request }) => {
    const token = await adminBearer(request);
    const store = await createAndApprove(request, token, 'STORE', 102);
    const session = await phoneLogin(request, store.phoneE164);
    expect(session.user.roles).toEqual(expect.arrayContaining(['CUSTOMER', 'STORE_OWNER']));
  });
});
