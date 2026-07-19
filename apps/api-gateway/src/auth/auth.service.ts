import {
  BadRequestException,
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { prisma, Role } from '@aagam/database';
import * as bcrypt from 'bcrypt';
import * as jwt from 'jsonwebtoken';
import { ConfigService } from '@nestjs/config';
import { OAuth2Client } from 'google-auth-library';
import { activeUserRoles, grantUserRole } from './user-roles';

@Injectable()
export class AuthService {
  private jwtSecret: string;
  private googleClient: OAuth2Client;

  constructor(private configService: ConfigService) {
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

  private async buildAuthResponse(user: {
    id: string;
    email: string;
    role: Role;
    name: string | null;
    avatarUrl?: string | null;
  }) {
    const roles = await activeUserRoles(user.id, user.role);
    const token = jwt.sign(
      { sub: user.id, email: user.email, role: user.role, roles },
      this.jwtSecret,
      { expiresIn: '7d' },
    );
    return {
      session: { access_token: token },
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        roles,
        name: user.name,
        avatarUrl: user.avatarUrl || null,
      },
    };
  }

  async signUp(email: string, pass: string, name: string) {
    const normalizedEmail = email.trim().toLowerCase();
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
        user: { id: user.id, email: user.email, role: user.role, roles: [Role.CUSTOMER] },
      };
    } catch (error) {
      console.error('DB Signup Error:', error);
      throw new ConflictException('Failed to create user record');
    }
  }

  async signIn(email: string, pass: string) {
    const user = await prisma.user.findUnique({
      where: { email: email.trim().toLowerCase() },
    });
    if (!user?.password) throw new UnauthorizedException('Invalid credentials');
    if (!(await bcrypt.compare(pass, user.password))) {
      throw new UnauthorizedException('Invalid credentials');
    }
    await this.assertAccountActive(user.id);
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
      select: { id: true, email: true, name: true, role: true, createdAt: true },
    });
    return Promise.all(
      users.map(async (user) => ({
        ...user,
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
        role: true,
        name: true,
        avatarUrl: true,
        emailVerified: true,
        createdAt: true,
      },
    });
    return { ...updated, roles: await activeUserRoles(updated.id, updated.role) };
  }

  async updateFcmToken(userId: string, token: string) {
    await prisma.user.update({ where: { id: userId }, data: { fcmToken: token } });
    return { message: 'FCM token updated' };
  }
}
