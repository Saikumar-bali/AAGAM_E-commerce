const fs = require('node:fs');

const required = (name) => {
  const value = String(process.env[name] || '').trim();
  if (!value) throw new Error(`${name} is required for Customer Google Sign-In`);
  return value;
};

const normalizeSha1 = (value) =>
  String(value || '')
    .replace(/[^a-fA-F0-9]/g, '')
    .toUpperCase();

const packageName = required('EXPECTED_PACKAGE_NAME');
const webClientId = required('GOOGLE_WEB_CLIENT_ID');
const androidClientId = required('GOOGLE_ANDROID_CLIENT_ID');
const signingSha1 = normalizeSha1(required('SIGNING_CERT_SHA1'));
const configPath = required('GOOGLE_SERVICES_JSON_PATH');

if (!webClientId.endsWith('.apps.googleusercontent.com')) {
  throw new Error('GOOGLE_WEB_CLIENT_ID is not a Google OAuth client ID');
}
if (!androidClientId.endsWith('.apps.googleusercontent.com')) {
  throw new Error('GOOGLE_ANDROID_CLIENT_ID_CUSTOMER is not a Google OAuth client ID');
}
if (signingSha1.length !== 40) {
  throw new Error('The Customer APK signing certificate SHA-1 is invalid');
}

let config;
try {
  config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
} catch (error) {
  throw new Error(`GOOGLE_SERVICES_JSON_CUSTOMER is not valid JSON: ${error.message}`);
}

const clients = Array.isArray(config.client) ? config.client : [];
const androidConfig = clients.find(
  (client) =>
    client?.client_info?.android_client_info?.package_name === packageName,
);
if (!androidConfig) {
  throw new Error(
    `GOOGLE_SERVICES_JSON_CUSTOMER has no Android client for ${packageName}`,
  );
}

const directOauth = Array.isArray(androidConfig.oauth_client)
  ? androidConfig.oauth_client
  : [];
const otherOauth = Array.isArray(
  androidConfig?.services?.appinvite_service?.other_platform_oauth_client,
)
  ? androidConfig.services.appinvite_service.other_platform_oauth_client
  : [];
const oauthClients = [...directOauth, ...otherOauth];
const configuredWebClient = oauthClients.some(
  (client) => client?.client_type === 3 && client?.client_id === webClientId,
);
if (!configuredWebClient) {
  throw new Error(
    'GOOGLE_WEB_CLIENT_ID does not match the web OAuth client in GOOGLE_SERVICES_JSON_CUSTOMER',
  );
}

const androidOauth = directOauth.find(
  (client) => client?.client_type === 1 && client?.client_id === androidClientId,
);
if (!androidOauth) {
  throw new Error(
    `GOOGLE_ANDROID_CLIENT_ID_CUSTOMER is not registered for ${packageName} in GOOGLE_SERVICES_JSON_CUSTOMER`,
  );
}

const oauthPackage = androidOauth?.android_info?.package_name;
if (oauthPackage && oauthPackage !== packageName) {
  throw new Error(`The Android OAuth client is registered for ${oauthPackage}, not ${packageName}`);
}
const configuredSha1 = normalizeSha1(
  androidOauth?.android_info?.certificate_hash,
);
if (configuredSha1 !== signingSha1) {
  throw new Error(
    `The Customer APK signing SHA-1 is not registered for ${packageName}. Expected ${signingSha1}; update the Android OAuth client and GOOGLE_SERVICES_JSON_CUSTOMER before releasing.`,
  );
}

console.log(
  `Customer Google Sign-In configuration verified for ${packageName} and signing SHA-1 ${signingSha1}`,
);
