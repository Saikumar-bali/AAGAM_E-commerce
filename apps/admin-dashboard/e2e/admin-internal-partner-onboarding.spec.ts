import { APIRequestContext, expect, test } from '@playwright/test';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3005';
const adminEmail = process.env.ADMIN_EMAIL;
const adminPassword = process.env.ADMIN_PASSWORD;

const uniquePhone = (offset: number) => `+919${String(Date.now() + offset).slice(-9).padStart(9, '0')}`;

async function adminBearer(request: APIRequestContext) {
  expect(adminEmail, 'ADMIN_EMAIL must be configured').toBeTruthy();
  expect(adminPassword, 'ADMIN_PASSWORD must be configured').toBeTruthy();
  const login = await request.post(`${API_BASE}/auth/mobile/login`, {
    data: { identifier: adminEmail, password: adminPassword },
  });
  expect(login.ok(), await login.text()).toBeTruthy();
  return (await login.json()).access_token as string;
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
  const applicantName = type === 'RIDER' ? `Internal Rider ${Date.now()}` : `Internal Store Owner ${Date.now()}`;
  const create = await request.post(`${API_BASE}/admin/partner-onboarding/internal-applications`, {
    headers: { Authorization: `Bearer ${token}` },
    data: { type, applicantName, phoneE164 },
  });
  expect(create.ok(), await create.text()).toBeTruthy();
  const created = await create.json();
  expect(created.application.status).toBe('DRAFT');
  const applicationId = created.application.id as string;

  const payload = type === 'RIDER'
    ? {
        dateOfBirth: '1995-05-10',
        addressLine1: 'Internal QA Address',
        city: 'Visakhapatnam',
        state: 'Andhra Pradesh',
        pincode: '530041',
        vehicleType: 'WALKER',
        emergencyContactName: 'Emergency Contact',
        emergencyContactPhone: '+919999999999',
        availability: 'Full day',
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
  expect(updated.application.applicantPayload.bankAccountNumber).toBeUndefined();
  expect(updated.application.applicantPayload.bankIfsc).toBeUndefined();
  expect(updated.application.applicantPayload.bankAccountLast4).toBe(type === 'RIDER' ? '9012' : '1012');

  const verifyContact = await request.post(
    `${API_BASE}/admin/partner-onboarding/applications/${applicationId}/contact-verification`,
    {
      headers: { Authorization: `Bearer ${token}` },
      data: {
        channel: 'PHONE',
        method: 'DOCUMENT_MATCH',
        reason: 'Identity and original documents checked in person by Admin.',
      },
    },
  );
  expect(verifyContact.ok(), await verifyContact.text()).toBeTruthy();
  expect((await verifyContact.json()).application.phoneVerifiedAt).toBeTruthy();

  const requiredDocuments = type === 'RIDER'
    ? ['IDENTITY', 'PROFILE_PHOTO', 'BANK_PROOF']
    : ['OWNER_IDENTITY', 'STORE_FRONT_PHOTO', 'STORE_INTERIOR_PHOTO', 'BUSINESS_REGISTRATION', 'BANK_PROOF'];
  for (const documentType of requiredDocuments) {
    await uploadDocument(request, token, applicationId, documentType);
  }

  const submit = await request.post(
    `${API_BASE}/admin/partner-onboarding/internal-applications/${applicationId}/submit-for-review`,
    {
      headers: { Authorization: `Bearer ${token}` },
      data: { note: 'Internal Admin QA onboarding completed.' },
    },
  );
  expect(submit.ok(), await submit.text()).toBeTruthy();
  const submitted = await submit.json();
  expect(submitted.application.status).toBe('UNDER_REVIEW');
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
        ? { operationalName: payload.displayName, latitude: payload.latitude, longitude: payload.longitude }
        : { operationalName: applicantName },
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
  test('Admin can complete and provision a Rider with full Rider access', async ({ request }) => {
    const token = await adminBearer(request);
    const rider = await createAndApprove(request, token, 'RIDER', 101);
    const session = await phoneLogin(request, rider.phoneE164);
    expect(session.user.roles).toEqual(expect.arrayContaining(['CUSTOMER', 'RIDER']));
  });

  test('Admin can complete and provision a Store with full Store Owner access', async ({ request }) => {
    const token = await adminBearer(request);
    const store = await createAndApprove(request, token, 'STORE', 102);
    const session = await phoneLogin(request, store.phoneE164);
    expect(session.user.roles).toEqual(expect.arrayContaining(['CUSTOMER', 'STORE_OWNER']));
  });
});
