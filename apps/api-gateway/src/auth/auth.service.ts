import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { prisma, Role } from '@aagam/database';
import * as bcrypt from 'bcrypt';
import * as jwt from 'jsonwebtoken';
import { createHash } from 'crypto';
import { ConfigService } from '@nestjs/config';
import { OAuth2Client } from 'google-auth-library';
import { activeUserRoles, grantUserRole } from './user-roles';
import {
  ContactOtpService,
  normalizeEmail,
  normalizePhoneE164,
} from '../contact-verification/contact-otp.service';
import {
  CustomerPhoneOtpPurpose,
  VerifyCustomerPhoneOtpDto,
} from './dto/phone-auth.dto';

@Injectable()
export class AuthService {
  private jwtSecret: string;
  private googleClient: OAuth2Client;

  constructor(
    private configService: ConfigService,
    private readonly contactOtp: ContactOtpService,
  ) {
    const secret = this.configService.get<string>('JWT_SECRET');
    if (!secret) throw new Error('JWT_SECRET must be defined in environment variables');
    this.jwtSecret = secret;
    this.googleClient = new OAuth2Client();
  }

  private getGoogleAudiences() {
    const audiences = [
      this.configService.get<string>('GOOGLE_WEB_CLIENT_ID'),
      this.configService.get<string>('GOOGLE_ANDROID_CLIENT_ID'),
    ].filter((value): value is string => Boolean(value?.trim()));
    return [...new Set(audiences)];
  }

  private async assertAccountActive(userId: string) {
    const rows = await prisma.$queryRawUnsafe(
      'SELECT "accountStatus" FROM "User" WHERE "id" = $1 LIMIT 1',
      userId,
    );
    const status = rows[0]?.accountStatus || 'ACTIVE';
    if (status === 'PENDING_ACTIVATION') {
      throw new UnauthorizedException('Account activation is required');
    }
    if (status !== 'ACTIVE') throw new UnauthorizedException('Account is not active');
  }

  private publicEmail(email: string) {
    return email.endsWith('@phone.aagam.local') ? null : email;
  }

  private syntheticPhoneEmail(phone: string) {
    const digest = createHash('sha256').update(phone).digest('hex').slice(0, 28);
    return `phone-${digest}@phone.aagam.local`;
  }

  private async buildAuthResponse(user: {
    id: string;
    email: string;
    phone?: string | null;
    role: Role;
    name: string | null;
    avatarUrl?: string | null;
  }) {
    const roles = await activeUserRoles(user.id, user.role);
    const identity = await prisma.$queryRawUnsafe(
      'SELECT "phoneVerifiedAt" FROM "User" WHERE "id" = $1 LIMIT 1',
      user.id,
    );
    const token = jwt.sign(
      { sub: user.id, email: user.email, phone: user.phone || null, role: user.role, roles },
      this.jwtSecret,
      { expiresIn: '7d' },
    );
    return {
      session: { access_token: token },
      user: {
        id: user.id,
        email: this.publicEmail(user.email),
        phone: user.phone || null,
        phoneVerifiedAt: identity[0]?.phoneVerifiedAt || null,
        role: user.role,
        roles,
        name: user.name,
        avatarUrl: user.avatarUrl || null,
      },
    };
  }

  async signUp(email: string, pass: string, name: string) {
    const normalizedEmail = normalizeEmail(email);
    const existing = await prisma.user.findUnique({ where: { email: normalizedEmail } });
    if (existing) throw new ConflictException('User already exists');
    const hashedPassword = await bcrypt.hash(pass, 10);

    try {
      const user = await prisma.$transaction(async (tx) => {
        const created = await tx.user.create({
          data: {
            email: normalizedEmail,
            name: name.trim(),
            password: hashedPassword,
            role: Role.CUSTOMER,
          },
        });
        await grantUserRole(tx as any, created.id, Role.CUSTOMER, 'CUSTOMER_SIGNUP');
        return created;
      });
      return {
        message: 'Customer account created successfully',
        user: { id: user.id, email: user.email, phone: user.phone, role: user.role, roles: [Role.CUSTOMER] },
      };
    } catch (error) {
      console.error('DB Signup Error:', error);
      throw new ConflictException('Failed to create user record');
    }
  }

  async signIn(identifier: string, pass: string) {
    const raw = String(identifier || '').trim();
    if (!raw) throw new BadRequestException('Phone number or email is required');
    const user = raw.includes('@')
      ? await prisma.user.findUnique({ where: { email: normalizeEmail(raw) } })
      : await prisma.user.findUnique({ where: { phone: normalizePhoneE164(raw) } });
    if (!user?.password) throw new UnauthorizedException('Invalid credentials');
    if (!(await bcrypt.compare(pass, user.password))) {
      throw new UnauthorizedException('Invalid credentials');
    }
    await this.assertAccountActive(user.id);
    return this.buildAuthResponse(user);
  }

  async requestPhoneOtp(phoneInput: string, purpose: CustomerPhoneOtpPurpose) {
    const phone = normalizePhoneE164(phoneInput);
    const existing = await prisma.user.findUnique({ where: { phone } });
    if (purpose === CustomerPhoneOtpPurpose.LOGIN && !existing) {
      throw new NotFoundException('No Customer account uses this phone number');
    }
    if (purpose === CustomerPhoneOtpPurpose.SIGNUP && existing) {
      throw new ConflictException('An account already uses this phone number. Sign in instead.');
    }
    return this.contactOtp.request({
      purpose:
        purpose === CustomerPhoneOtpPurpose.LOGIN ? 'CUSTOMER_LOGIN' : 'CUSTOMER_SIGNUP',
      channel: 'PHONE',
      destination: phone,
      masked: `${phone.slice(0, Math.max(3, phone.length - 7))}*****${phone.slice(-2)}`,
      targetId: existing?.id || null,
      reference: purpose === CustomerPhoneOtpPurpose.LOGIN ? 'Customer sign in' : 'Customer signup',
      metadata: { phone },
    });
  }

  async verifyPhoneOtp(dto: VerifyCustomerPhoneOtpDto) {
    const phone = normalizePhoneE164(dto.phoneE164);
    const challenge = await this.contactOtp.verify({
      purpose:
        dto.purpose === CustomerPhoneOtpPurpose.LOGIN ? 'CUSTOMER_LOGIN' : 'CUSTOMER_SIGNUP',
      channel: 'PHONE',
      destination: phone,
      code: dto.code,
    });

    if (dto.purpose === CustomerPhoneOtpPurpose.LOGIN) {
      const user = challenge.targetId
        ? await prisma.user.findUnique({ where: { id: challenge.targetId } })
        : await prisma.user.findUnique({ where: { phone } });
      if (!user) throw new NotFoundException('Customer account not found');
      await this.assertAccountActive(user.id);
      return this.buildAuthResponse(user);
    }

    if (!dto.name?.trim()) {
      throw new BadRequestException('Full name is required to create a Customer account');
    }
    const existingPhone = await prisma.user.findUnique({ where: { phone } });
    if (existingPhone) throw new ConflictException('An account already uses this phone number');
    const email = dto.email?.trim() ? normalizeEmail(dto.email) : this.syntheticPhoneEmail(phone);
    const existingEmail = await prisma.user.findUnique({ where: { email } });
    if (existingEmail) throw new ConflictException('An account already uses this email address');

    const user = await prisma.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: {
          email,
          phone,
          name: dto.name!.trim(),
          role: Role.CUSTOMER,
          emailVerified: false,
        },
      });
      await tx.$executeRawUnsafe(
        'UPDATE "User" SET "phoneVerifiedAt" = CURRENT_TIMESTAMP WHERE "id" = $1',
        created.id,
      );
      await grantUserRole(tx as any, created.id, Role.CUSTOMER, 'PHONE_CUSTOMER_SIGNUP');
      return created;
    });
    return this.buildAuthResponse(user);
  }

  async signInWithGoogle(idToken: string) {
    const audiences = this.getGoogleAudiences();
    if (!audiences.length) {
      throw new BadRequestException('Google sign-in is not configured on server');
    }

    let payload: {
      sub?: string;
      email?: string;
      email_verified?: boolean;
      name?: string;
      picture?: string;
      iss?: string;
      aud?: string;
      exp?: number;
    };
    try {
      const ticket = await this.googleClient.verifyIdToken({ idToken, audience: audiences });
      payload = ticket.getPayload() || {};
    } catch {
      throw new UnauthorizedException('Invalid Google token');
    }

    if (!payload.email || !payload.sub) {
      throw new UnauthorizedException('Google account email is required');
    }
    if (!['accounts.google.com', 'https://accounts.google.com'].includes(String(payload.iss))) {
      throw new UnauthorizedException('Invalid Google token issuer');
    }

    const email = payload.email.toLowerCase().trim();
    const name = payload.name?.trim() || email.split('@')[0];
    const avatarUrl = payload.picture || null;
    const emailVerified = Boolean(payload.email_verified);
    const existingByGoogleSub = await prisma.user.findFirst({ where: { googleSub: payload.sub } });

    if (existingByGoogleSub) {
      await this.assertAccountActive(existingByGoogleSub.id);
      const updated = await prisma.user.update({
        where: { id: existingByGoogleSub.id },
        data: { name, avatarUrl, emailVerified },
      });
      await grantUserRole(prisma as any, updated.id, updated.role, 'AUTH_RECONCILIATION');
      return this.buildAuthResponse(updated);
    }

    const existingByEmail = await prisma.user.findUnique({ where: { email } });
    if (existingByEmail) {
      await this.assertAccountActive(existingByEmail.id);
      const linkedUser = await prisma.user.update({
        where: { id: existingByEmail.id },
        data: {
          googleSub: payload.sub,
          name: existingByEmail.name || name,
          avatarUrl: avatarUrl || existingByEmail.avatarUrl,
          emailVerified: emailVerified || existingByEmail.emailVerified,
        },
      });
      await grantUserRole(prisma as any, linkedUser.id, linkedUser.role, 'AUTH_RECONCILIATION');
      return this.buildAuthResponse(linkedUser);
    }

    const createdUser = await prisma.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: {
          email,
          name,
          role: Role.CUSTOMER,
          googleSub: payload.sub,
          avatarUrl,
          emailVerified,
        },
      });
      await grantUserRole(tx as any, created.id, Role.CUSTOMER, 'GOOGLE_CUSTOMER_SIGNUP');
      return created;
    });
    return this.buildAuthResponse(createdUser);
  }

  async findAll() {
    const users = await prisma.user.findMany({
      select: { id: true, email: true, phone: true, name: true, role: true, createdAt: true },
    });
    return Promise.all(
      users.map(async (user) => ({
        ...user,
        email: this.publicEmail(user.email),
        roles: await activeUserRoles(user.id, user.role),
      })),
    );
  }

  async updateProfile(userId: string, data: { name?: string }) {
    const updated = await prisma.user.update({
      where: { id: userId },
      data: { ...(data.name !== undefined && { name: data.name }) },
      select: {
        id: true,
        email: true,
        phone: true,
        role: true,
        name: true,
        avatarUrl: true,
        emailVerified: true,
        createdAt: true,
      },
    });
    return {
      ...updated,
      email: this.publicEmail(updated.email),
      roles: await activeUserRoles(updated.id, updated.role),
    };
  }

  async updateFcmToken(userId: string, token: string) {
    await prisma.user.update({ where: { id: userId }, data: { fcmToken: token } });
    return { message: 'FCM token updated' };
  }
}
