export enum PartnerApplicationType {
  RIDER = 'RIDER',
  STORE = 'STORE',
}

export enum PartnerApplicationStatus {
  DRAFT = 'DRAFT',
  SUBMITTED = 'SUBMITTED',
  UNDER_REVIEW = 'UNDER_REVIEW',
  ACTION_REQUIRED = 'ACTION_REQUIRED',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
  WITHDRAWN = 'WITHDRAWN',
  EXPIRED = 'EXPIRED',
}

export enum PartnerDocumentStatus {
  PENDING = 'PENDING',
  VERIFIED = 'VERIFIED',
  REJECTED = 'REJECTED',
  EXPIRED = 'EXPIRED',
  REPLACEMENT_REQUIRED = 'REPLACEMENT_REQUIRED',
}

export enum PartnerContactChannel {
  EMAIL = 'EMAIL',
  PHONE = 'PHONE',
}

export const RIDER_DOCUMENT_TYPES = [
  'IDENTITY',
  'PROFILE_PHOTO',
  'DRIVING_LICENSE',
  'VEHICLE_REGISTRATION',
  'VEHICLE_INSURANCE',
  'BANK_PROOF',
] as const;

export const STORE_DOCUMENT_TYPES = [
  'OWNER_IDENTITY',
  'STORE_FRONT_PHOTO',
  'STORE_INTERIOR_PHOTO',
  'BUSINESS_REGISTRATION',
  'BANK_PROOF',
  'TAX_OR_LICENSE',
] as const;

export type PartnerDocumentType =
  | (typeof RIDER_DOCUMENT_TYPES)[number]
  | (typeof STORE_DOCUMENT_TYPES)[number];

export type JsonRecord = Record<string, any>;

export function allowedDocumentTypes(type: PartnerApplicationType): readonly string[] {
  return type === PartnerApplicationType.RIDER
    ? RIDER_DOCUMENT_TYPES
    : STORE_DOCUMENT_TYPES;
}

export function requiredDocumentTypes(
  type: PartnerApplicationType,
  payload: JsonRecord,
): string[] {
  if (type === PartnerApplicationType.STORE) {
    return [
      'OWNER_IDENTITY',
      'STORE_FRONT_PHOTO',
      'STORE_INTERIOR_PHOTO',
      'BUSINESS_REGISTRATION',
      'BANK_PROOF',
    ];
  }

  const required = ['IDENTITY', 'PROFILE_PHOTO', 'BANK_PROOF'];
  const vehicleType = String(payload.vehicleType || '').toUpperCase();
  const registeredVehicle = !['', 'WALKER', 'BICYCLE'].includes(vehicleType);
  if (registeredVehicle) {
    required.push('DRIVING_LICENSE', 'VEHICLE_REGISTRATION', 'VEHICLE_INSURANCE');
  }
  return required;
}

export const REQUIRED_PAYLOAD_FIELDS: Record<PartnerApplicationType, string[]> = {
  [PartnerApplicationType.RIDER]: [
    'dateOfBirth',
    'addressLine1',
    'city',
    'state',
    'pincode',
    'vehicleType',
    'emergencyContactName',
    'emergencyContactPhone',
    'bankAccountCiphertext',
    'bankIfscCiphertext',
  ],
  [PartnerApplicationType.STORE]: [
    'legalName',
    'displayName',
    'businessType',
    'storeAddress',
    'city',
    'state',
    'pincode',
    'latitude',
    'longitude',
    'operatingHours',
    'serviceRadiusKm',
    'orderCapacity',
    'bankAccountCiphertext',
    'bankIfscCiphertext',
  ],
};
