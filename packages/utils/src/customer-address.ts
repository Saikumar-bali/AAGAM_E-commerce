export type CustomerAddressInput = {
  label?: string | null;
  recipientName?: string | null;
  phoneE164?: string | null;
  alternatePhoneE164?: string | null;
  line1?: string | null;
  line2?: string | null;
  landmark?: string | null;
  city?: string | null;
  state?: string | null;
  pincode?: string | null;
  country?: string | null;
  latitude?: number | string | null;
  longitude?: number | string | null;
  instructions?: string | null;
  isDefault?: boolean;
};

export type CustomerAddressProfile = {
  name?: string | null;
  phone?: string | null;
};

export type CustomerAddressPayload = {
  label: string;
  recipientName: string;
  phoneE164: string;
  alternatePhoneE164?: string;
  line1: string;
  line2?: string;
  landmark?: string;
  city: string;
  state: string;
  pincode: string;
  country: string;
  latitude: number;
  longitude: number;
  instructions?: string;
  isDefault: boolean;
};

function cleanText(value: unknown) {
  return String(value ?? '').trim().replace(/\s+/g, ' ');
}

export function normalizeIndianPhone(value: unknown) {
  const raw = cleanText(value).replace(/[\s()-]/g, '');
  if (/^\+91\d{10}$/.test(raw)) return raw;
  if (/^91\d{10}$/.test(raw)) return `+${raw}`;
  if (/^\d{10}$/.test(raw)) return `+91${raw}`;
  return raw;
}

export function cleanIndianPincode(value: unknown) {
  return String(value ?? '').replace(/\D/g, '').slice(0, 6);
}

export function createCustomerAddressDraft(
  profile: CustomerAddressProfile = {},
  isDefault = false,
) {
  return {
    label: 'Home',
    recipientName: cleanText(profile.name),
    phoneE164: normalizeIndianPhone(profile.phone),
    alternatePhoneE164: '',
    line1: '',
    line2: '',
    landmark: '',
    city: '',
    state: '',
    pincode: '',
    country: 'IN',
    latitude: null as number | null,
    longitude: null as number | null,
    instructions: '',
    isDefault,
  };
}

export function buildCustomerAddressPayload(
  input: CustomerAddressInput,
  options: {
    fallbackProfile?: CustomerAddressProfile;
    isDefault?: boolean;
  } = {},
): CustomerAddressPayload {
  const fallback = options.fallbackProfile || {};
  const recipientName = cleanText(input.recipientName) || cleanText(fallback.name);
  const phoneE164 = normalizeIndianPhone(input.phoneE164 || fallback.phone);
  const alternatePhoneE164 = normalizeIndianPhone(input.alternatePhoneE164);
  const label = cleanText(input.label) || 'Home';
  const line1 = cleanText(input.line1);
  const line2 = cleanText(input.line2);
  const landmark = cleanText(input.landmark);
  const city = cleanText(input.city);
  const state = cleanText(input.state);
  const pincode = cleanIndianPincode(input.pincode);
  const country = cleanText(input.country || 'IN').toUpperCase();
  const instructions = cleanText(input.instructions);
  const latitude = input.latitude === '' || input.latitude == null
    ? Number.NaN
    : Number(input.latitude);
  const longitude = input.longitude === '' || input.longitude == null
    ? Number.NaN
    : Number(input.longitude);

  if (recipientName.length < 2) {
    throw new Error('Enter the recipient name using at least 2 characters.');
  }
  if (recipientName.length > 80) throw new Error('Recipient name cannot exceed 80 characters.');
  if (label.length > 32) throw new Error('Address label cannot exceed 32 characters.');
  if (!/^\+?[1-9]\d{7,14}$/.test(phoneE164)) {
    throw new Error('Enter a valid phone number. Example: 9876543210 or +919876543210.');
  }
  if (alternatePhoneE164 && !/^\+?[1-9]\d{7,14}$/.test(alternatePhoneE164)) {
    throw new Error('Enter a valid alternate phone number.');
  }
  if (line1.length < 3) throw new Error('Enter an address line using at least 3 characters.');
  if (city.length < 2) throw new Error('Enter a valid city.');
  if (state.length < 2) throw new Error('Enter a valid state.');
  if (!/^\d{6}$/.test(pincode)) throw new Error('Enter a valid 6 digit pincode.');
  if (country.length !== 2) throw new Error('Country must use a 2 letter code.');
  if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90) {
    throw new Error('Please pin your address using live location, search, or the map.');
  }
  if (!Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
    throw new Error('Please pin your address using live location, search, or the map.');
  }

  return {
    label,
    recipientName,
    phoneE164,
    ...(alternatePhoneE164 ? { alternatePhoneE164 } : {}),
    line1,
    ...(line2 ? { line2 } : {}),
    ...(landmark ? { landmark } : {}),
    city,
    state,
    pincode,
    country,
    latitude,
    longitude,
    ...(instructions ? { instructions } : {}),
    isDefault: options.isDefault ?? Boolean(input.isDefault),
  };
}

export function getApiErrorMessage(error: any, fallback: string) {
  const value = error?.response?.data?.message ?? error?.message;
  if (Array.isArray(value)) return value.map((item) => String(item)).join(' ');
  return typeof value === 'string' && value.trim() ? value : fallback;
}
