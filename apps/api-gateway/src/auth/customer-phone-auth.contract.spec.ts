import { ConflictException, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { CustomerPhoneOtpPurpose } from './dto/phone-auth.dto';

jest.mock('@aagam/database', () => ({
  prisma: {
    user: { findUnique: jest.fn() },
    $transaction: jest.fn(),
    $queryRawUnsafe: jest.fn(),
  },
  Role: {
    ADMIN: 'ADMIN',
    CUSTOMER: 'CUSTOMER',
    RIDER: 'RIDER',
    STORE_OWNER: 'STORE_OWNER',
  },
}));

jest.mock('./user-roles', () => ({
  activeUserRoles: jest.fn(),
  grantUserRole: jest.fn(),
}));

const { prisma: mockPrisma } = jest.requireMock('@aagam/database') as {
  prisma: {
    user: { findUnique: jest.Mock };
    $transaction: jest.Mock;
    $queryRawUnsafe: jest.Mock;
  };
};
const {
  activeUserRoles: mockActiveUserRoles,
  grantUserRole: mockGrantUserRole,
} = jest.requireMock('./user-roles') as {
  activeUserRoles: jest.Mock;
  grantUserRole: jest.Mock;
};

describe('customer phone authentication contracts', () => {
  const phone = '+919876543210';
  const user = {
    id: 'customer-1',
    email: 'customer@example.com',
    phone,
    role: 'CUSTOMER',
    name: 'Aagam Customer',
    avatarUrl: null,
  };
  let contactOtp: { request: jest.Mock; verify: jest.Mock };
  let service: AuthService;

  beforeEach(() => {
    jest.clearAllMocks();
    contactOtp = { request: jest.fn(), verify: jest.fn() };
    mockActiveUserRoles.mockResolvedValue(['CUSTOMER']);
    mockPrisma.$queryRawUnsafe.mockResolvedValue([{ phoneVerifiedAt: new Date('2026-07-20T00:00:00.000Z') }]);
    service = new AuthService(
      { get: jest.fn((key: string) => key === 'JWT_SECRET' ? 'customer-phone-contract-secret' : undefined) } as any,
      contactOtp as any,
    );
  });

  it('returns the existing not-found contract for an unknown LOGIN phone', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(null);

    await expect(service.requestPhoneOtp(phone, CustomerPhoneOtpPurpose.LOGIN))
      .rejects.toEqual(expect.any(NotFoundException));
    await expect(service.requestPhoneOtp(phone, CustomerPhoneOtpPurpose.LOGIN))
      .rejects.toMatchObject({ response: expect.objectContaining({ message: 'No Customer account uses this phone number' }) });
    expect(contactOtp.request).not.toHaveBeenCalled();
  });

  it('creates a SIGNUP OTP challenge for an unknown phone', async () => {
    const challenge = { channel: 'PHONE', maskedDestination: '+91987*****10', expiresAt: '2026-07-20T00:10:00.000Z' };
    mockPrisma.user.findUnique.mockResolvedValue(null);
    contactOtp.request.mockResolvedValue(challenge);

    await expect(service.requestPhoneOtp(phone, CustomerPhoneOtpPurpose.SIGNUP)).resolves.toEqual(challenge);
    expect(contactOtp.request).toHaveBeenCalledWith(expect.objectContaining({
      purpose: 'CUSTOMER_SIGNUP',
      channel: 'PHONE',
      destination: phone,
      targetId: null,
    }));
  });

  it('creates a CUSTOMER and returns a mobile session after valid SIGNUP verification', async () => {
    contactOtp.verify.mockResolvedValue({ targetId: null });
    mockPrisma.user.findUnique.mockResolvedValueOnce(null).mockResolvedValueOnce(null);
    const tx = {
      user: { create: jest.fn().mockResolvedValue(user) },
      $executeRawUnsafe: jest.fn().mockResolvedValue(1),
    };
    mockPrisma.$transaction.mockImplementation(async (callback: (client: typeof tx) => unknown) => callback(tx));

    const result = await service.verifyPhoneOtp({
      phoneE164: phone,
      purpose: CustomerPhoneOtpPurpose.SIGNUP,
      code: '123456',
      name: '  Aagam Customer  ',
      email: 'customer@example.com',
    });

    expect(tx.user.create).toHaveBeenCalledWith({ data: expect.objectContaining({
      phone,
      email: 'customer@example.com',
      name: 'Aagam Customer',
      role: 'CUSTOMER',
    }) });
    expect(mockGrantUserRole).toHaveBeenCalledWith(tx, user.id, 'CUSTOMER', 'PHONE_CUSTOMER_SIGNUP');
    expect(result.user).toEqual(expect.objectContaining({ id: user.id, phone, role: 'CUSTOMER' }));
    expect(result.session.access_token).toEqual(expect.any(String));
  });

  it('allows LOGIN OTP requests after the customer exists', async () => {
    const challenge = { channel: 'PHONE', maskedDestination: '+91987*****10', expiresAt: '2026-07-20T00:10:00.000Z' };
    mockPrisma.user.findUnique.mockResolvedValue(user);
    contactOtp.request.mockResolvedValue(challenge);

    await expect(service.requestPhoneOtp(phone, CustomerPhoneOtpPurpose.LOGIN)).resolves.toEqual(challenge);
    expect(contactOtp.request).toHaveBeenCalledWith(expect.objectContaining({
      purpose: 'CUSTOMER_LOGIN',
      targetId: user.id,
    }));
  });

  it('does not create a user when the OTP is invalid or expired', async () => {
    contactOtp.verify.mockRejectedValue(new UnauthorizedException('Invalid or expired verification code'));

    await expect(service.verifyPhoneOtp({
      phoneE164: phone,
      purpose: CustomerPhoneOtpPurpose.SIGNUP,
      code: '000000',
      name: 'Aagam Customer',
    })).rejects.toEqual(expect.any(UnauthorizedException));
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
  });

  it('rejects a duplicate email before creating the customer', async () => {
    contactOtp.verify.mockResolvedValue({ targetId: null });
    mockPrisma.user.findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ ...user, id: 'existing-email-user', phone: '+919111111111' });

    await expect(service.verifyPhoneOtp({
      phoneE164: phone,
      purpose: CustomerPhoneOtpPurpose.SIGNUP,
      code: '123456',
      name: 'Aagam Customer',
      email: 'customer@example.com',
    })).rejects.toEqual(expect.any(ConflictException));
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
  });

  it('keeps the native verification endpoint bearer-session response contract', async () => {
    const authService = {
      verifyPhoneOtp: jest.fn().mockResolvedValue({
        user,
        session: { access_token: 'mobile-bearer-session' },
      }),
    };
    const controller = new AuthController(authService as any);
    const dto = { phoneE164: phone, purpose: CustomerPhoneOtpPurpose.LOGIN, code: '123456' };

    await expect(controller.mobileVerifyPhoneOtp(dto)).resolves.toEqual({
      message: 'Phone verified successfully',
      user,
      access_token: 'mobile-bearer-session',
    });
  });
});
