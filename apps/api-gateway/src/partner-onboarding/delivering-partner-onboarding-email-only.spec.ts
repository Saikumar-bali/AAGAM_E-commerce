import { prisma } from '@aagam/database';
import { DeliveringPartnerOnboardingService } from './delivering-partner-onboarding.service';
import {
  PartnerApplicationType,
  PartnerContactChannel,
} from './partner-onboarding.types';

jest.mock('@aagam/database', () => ({
  prisma: {
    $queryRawUnsafe: jest.fn(),
    $transaction: jest.fn(async (callback: any) =>
      callback({ $executeRawUnsafe: jest.fn() }),
    ),
  },
}));

function build() {
  const repository = { writeEvent: jest.fn() };
  const security = {
    issueAccessToken: jest.fn().mockReturnValue('a'.repeat(40)),
    hash: jest.fn().mockReturnValue('hashed-token'),
  };
  const verification = {
    requestContactCode: jest.fn().mockResolvedValue({
      channel: PartnerContactChannel.EMAIL,
      provider: 'MAILJET',
    }),
  };
  const service = new DeliveringPartnerOnboardingService(
    repository as any,
    security as any,
    {} as any,
    verification as any,
  );
  return { service, repository, security, verification };
}

describe('DeliveringPartnerOnboardingService email-only mode', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = {
      ...originalEnv,
      PARTNER_PHONE_VERIFICATION_MODE: 'EMAIL_ONLY',
    };
    (prisma.$queryRawUnsafe as jest.Mock).mockResolvedValue([]);
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('rejects a phone-only application before inserting a draft', async () => {
    const { service, verification } = build();
    await expect(
      service.createApplication({
        type: PartnerApplicationType.RIDER,
        applicantName: 'Phone Applicant',
        phoneE164: '+919999999999',
        verificationChannel: PartnerContactChannel.PHONE,
      } as any),
    ).rejects.toThrow('Email is required while phone verification is temporarily unavailable');
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(verification.requestContactCode).not.toHaveBeenCalled();
  });

  it('rejects an explicit phone channel even when an email is supplied', async () => {
    const { service } = build();
    await expect(
      service.createApplication({
        type: PartnerApplicationType.STORE,
        applicantName: 'Store Applicant',
        email: 'store@example.com',
        phoneE164: '+919999999999',
        verificationChannel: PartnerContactChannel.PHONE,
      } as any),
    ).rejects.toThrow('Phone verification is temporarily unavailable');
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('creates an email challenge when the channel is omitted', async () => {
    const { service, verification } = build();
    await service.createApplication({
      type: PartnerApplicationType.RIDER,
      applicantName: 'Email Applicant',
      email: 'Partner@Example.com',
    } as any);
    expect(verification.requestContactCode).toHaveBeenCalledWith(
      expect.any(String),
      'a'.repeat(40),
      PartnerContactChannel.EMAIL,
    );
  });
});
