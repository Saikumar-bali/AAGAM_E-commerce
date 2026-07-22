const fs = require('node:fs');
const path = require('node:path');

const apiUrl = process.env.MAESTRO_API_URL || 'http://127.0.0.1:3005';
const password = process.env.MAESTRO_STORE_PASSWORD || 'Maestro2026Test';
const accounts = [
  {
    label: 'two-store-owner',
    identifier: process.env.MAESTRO_STORE_EMAIL || 'maestro.store@aagam.test',
    expectedStoreCount: 2,
  },
  {
    label: 'zero-store-owner',
    identifier: process.env.MAESTRO_EMPTY_STORE_EMAIL || 'maestro.empty@aagam.test',
    expectedStoreCount: 0,
  },
];

async function request(route, options = {}) {
  const response = await fetch(`${apiUrl}${route}`, options);
  const text = await response.text();
  let body = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = { unparsed: text.slice(0, 300) };
  }
  return { response, body };
}

async function verifyAccount(account) {
  const login = await request('/auth/mobile/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ identifier: account.identifier, password }),
  });
  if (!login.response.ok) {
    throw new Error(`${account.label} mobile login failed with ${login.response.status}: ${JSON.stringify(login.body)}`);
  }

  const token = login.body?.access_token;
  const roles = Array.isArray(login.body?.user?.roles) ? login.body.user.roles : [login.body?.user?.role].filter(Boolean);
  if (!token) throw new Error(`${account.label} mobile login returned no bearer token`);
  if (!roles.includes('STORE_OWNER')) {
    throw new Error(`${account.label} does not include STORE_OWNER role: ${JSON.stringify(roles)}`);
  }

  const headers = { authorization: `Bearer ${token}` };
  const [profile, stores] = await Promise.all([
    request('/auth/me', { headers }),
    request('/stores/my-stores', { headers }),
  ]);
  if (!profile.response.ok) {
    throw new Error(`${account.label} /auth/me failed with ${profile.response.status}: ${JSON.stringify(profile.body)}`);
  }
  if (!stores.response.ok) {
    throw new Error(`${account.label} /stores/my-stores failed with ${stores.response.status}: ${JSON.stringify(stores.body)}`);
  }
  const storeRows = Array.isArray(stores.body) ? stores.body : [];
  if (storeRows.length !== account.expectedStoreCount) {
    throw new Error(`${account.label} expected ${account.expectedStoreCount} stores, found ${storeRows.length}`);
  }

  return {
    label: account.label,
    identifier: account.identifier,
    loginStatus: login.response.status,
    tokenPresent: true,
    userId: login.body.user.id,
    primaryRole: login.body.user.role,
    roles,
    profileStatus: profile.response.status,
    profileUserId: profile.body.id,
    storesStatus: stores.response.status,
    stores: storeRows.map((store) => ({ id: store.id, name: store.name })),
  };
}

async function main() {
  const results = [];
  for (const account of accounts) results.push(await verifyAccount(account));
  const proof = {
    result: 'PASSED',
    verifiedAt: new Date().toISOString(),
    apiUrl,
    passwordIncluded: false,
    accessTokensIncluded: false,
    accounts: results,
  };
  const outputDir = path.resolve(process.cwd(), 'artifacts/maestro');
  fs.mkdirSync(outputDir, { recursive: true });
  fs.writeFileSync(path.join(outputDir, 'auth-api-proof.json'), `${JSON.stringify(proof, null, 2)}\n`);
  console.log(JSON.stringify(proof, null, 2));
}

main().catch((error) => {
  const outputDir = path.resolve(process.cwd(), 'artifacts/maestro');
  fs.mkdirSync(outputDir, { recursive: true });
  fs.writeFileSync(path.join(outputDir, 'auth-api-proof.json'), `${JSON.stringify({ result: 'FAILED', error: error.message }, null, 2)}\n`);
  console.error(error);
  process.exitCode = 1;
});
