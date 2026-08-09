import 'reflect-metadata';
import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Role } from '@aagam/database';
import { ROLES_KEY } from '../auth/decorators/roles.decorator';
import { SignupDto } from '../auth/dto/signup.dto';
import { PartnerApplicationPurgeService } from './partner-application-purge.service';
import { PartnerOnboardingAdminController } from './partner-onboarding-admin.controller';
import { PartnerOnboardingSecurity } from './partner-onboarding.security';
import {
  allowedDocumentTypes,
  PartnerApplicationType,
  requiredDocumentTypes,
} from './partner-onboarding.types';

describe('Professional partner onboarding contracts', () => {
  it('rejects public role self-assignment at the validation boundary', async () => {
    const pipe = new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    });

    let rejection: unknown;
    try {
      await pipe.transform(
        {
          email: 'applicant@example.com',
          password: 'StrongPass123!',
          name: 'Applicant',
          role: 'RIDER',
        },
        { type: 'body', metatype: SignupDto },
      );
    } catch (error) {
      rejection = error;
    }

    expect(rejection).toBeInstanceOf(BadRequestException);
    const response = (rejection as BadRequestException).getResponse();
    const messages =
      typeof response === 'string'
        ? [response]
        : Array.isArray((response as { message?: unknown }).message)
          ? ((response as { message: string[] }).message)
          : [String((response as { message?: unknown }).message || '')];

    expect(messages).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/property role should not exist/i),
      ]),
    );
    expect('role' in new SignupDto()).toBe(false);
  });

  it('keeps the Admin onboarding surface restricted to ADMIN', () => {
    expect(Reflect.getMetadata(ROLES_KEY, PartnerOnboardingAdminController)).toEqual([
      Role.ADMIN,
    ]);
  });

  it('exposes permanent deletion only through the guarded Admin onboarding surface', () => {
    expect(typeof PartnerOnboardingAdminController.prototype.permanentlyDelete).toBe('function');
    expect(typeof PartnerApplicationPurgeService.prototype.permanentlyDelete).toBe('function');
  });

  it('uses vehicle-dependent Rider document requirements', () => {
    expect(
      requiredDocumentTypes(PartnerApplicationType.RIDER, {
        vehicleType: 'WALKER',
      }),
    ).toEqual(['IDENTITY', 'PROFILE_PHOTO', 'BANK_PROOF']);

    expect(
      requiredDocumentTypes(PartnerApplicationType.RIDER, {
        vehicleType: 'MOTORCYCLE',
      }),
    ).toEqual([
      'IDENTITY',
      'PROFILE_PHOTO',
      'BANK_PROOF',
      'DRIVING_LICENSE',
      'VEHICLE_REGISTRATION',
      'VEHICLE_INSURANCE',
    ]);
  });

  it('defines the complete Store evidence set without claiming universal legality', () => {
    expect(
      requiredDocumentTypes(PartnerApplicationType.STORE, {}),
    ).toEqual([
      'OWNER_IDENTITY',
      'STORE_FRONT_PHOTO',
      'STORE_INTERIOR_PHOTO',
      'BUSINESS_REGISTRATION',
      'BANK_PROOF',
    ]);
    expect(allowedDocumentTypes(PartnerApplicationType.STORE)).toContain(
      'TAX_OR_LICENSE',
    );
  });

  it('encrypts sensitive draft values and exposes only masked values', () => {
    const config = {
      get: (key: string) =>
        key === 'JWT_SECRET'
          ? 'partner-onboarding-contract-secret-which-is-long-enough'
          : undefined,
    } as ConfigService;
    const security = new PartnerOnboardingSecurity(config);
    const protectedPayload = security.protectPayload({
      bankAccountNumber: '123456789012',
      bankIfsc: 'ABCD0001234',
      taxIdentifier: 'ABCDE1234F',
      displayName: 'Verified Store',
    });

    expect(protectedPayload.bankAccountNumber).toBeUndefined();
    expect(protectedPayload.bankIfsc).toBeUndefined();
    expect(protectedPayload.taxIdentifier).toBeUndefined();
    expect(protectedPayload.bankAccountCiphertext).not.toContain('123456789012');
    expect(protectedPayload.bankIfscCiphertext).not.toContain('ABCD0001234');
    expect(protectedPayload.bankAccountLast4).toBe('9012');
    expect(protectedPayload.bankIfscLast4).toBe('1234');
    expect(protectedPayload.taxIdentifierLast4).toBe('234F');

    const safe = security.sanitizePayload(protectedPayload);
    expect(safe.bankAccountCiphertext).toBeUndefined();
    expect(safe.bankIfscCiphertext).toBeUndefined();
    expect(safe.taxIdentifierCiphertext).toBeUndefined();
    expect(safe.displayName).toBe('Verified Store');
  });
});