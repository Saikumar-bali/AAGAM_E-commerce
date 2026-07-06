import { Injectable, UnauthorizedException, ConflictException, BadRequestException } from '@nestjs/common';
import { prisma } from '@aagam/database';
import { Role } from '@aagam/database';
import * as bcrypt from 'bcrypt';
import * as jwt from 'jsonwebtoken';
import { ConfigService } from '@nestjs/config';
import { OAuth2Client } from 'google-auth-library';

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
    const audiences = [this.configService.get<string>('GOOGLE_WEB_CLIENT_ID'), this.configService.get<string>('GOOGLE_ANDROID_CLIENT_ID')].filter((value): value is string => Boolean(value?.trim()));
    return [...new Set(audiences)];
  }

  private buildAuthResponse(user: { id: string; email: string; role: Role; name: string | null; avatarUrl?: string | null; phone?: string | null }) {
    const token = jwt.sign({ sub: user.id, email: user.email, role: user.role }, this.jwtSecret, { expiresIn: '7d' });
    return {
      session: { access_token: token },
      user: { id: user.id, email: user.email, role: user.role, name: user.name, avatarUrl: user.avatarUrl || null, phone: user.phone || null },
    };
  }

  async signUp(email: string, pass: string, name: string, role: string = 'CUSTOMER') {
    const requestedRole = (role || 'CUSTOMER').toUpperCase();
    if (requestedRole !== Role.CUSTOMER) {
      throw new BadRequestException('Public signup is customer-only. Riders and store partners must use the partner app and admin approval workflow.');
    }
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) throw new ConflictException('User already exists');
    const hashedPassword = await bcrypt.hash(pass, 10);
    try {
      const user = await prisma.user.create({ data: { email, name, password: hashedPassword, role: Role.CUSTOMER } });
      return { message: 'Customer account created successfully', user: { id: user.id, email: user.email, role: user.role } };
    } catch (error) {
      console.error('DB Signup Error:', error);
      throw new ConflictException('Failed to create user record');
    }
  }

  async signIn(email: string, pass: string) {
    if (process.env.NODE_ENV === 'development') console.log('SignIn Attempt: Authentication request received');
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      console.log('SignIn Error: Invalid credentials');
      throw new UnauthorizedException('Invalid credentials');
    }
    if (!user.password) {
      console.log('SignIn Error: Invalid credentials (no password)');
      throw new UnauthorizedException('Invalid credentials');
    }
    const isMatch = await bcrypt.compare(pass, user.password);
    if (!isMatch) {
      console.log('SignIn Error: Password verification failed');
      throw new UnauthorizedException('Invalid credentials');
    }
    if (process.env.NODE_ENV === 'development') console.log('SignIn Success: User authenticated successfully');
    return this.buildAuthResponse(user);
  }

  async signInWithGoogle(idToken: string) {
    const audiences = this.getGoogleAudiences();
    if (!audiences.length) throw new BadRequestException('Google sign-in is not configured on server');

    let payload: { sub?: string; email?: string; email_verified?: boolean; name?: string; picture?: string; iss?: string; aud?: string; exp?: number };
    try {
      const ticket = await this.googleClient.verifyIdToken({ idToken, audience: audiences });
      payload = ticket.getPayload() || {};
    } catch (error) {
      throw new UnauthorizedException('Invalid Google token');
    }

    if (!payload.email || !payload.sub) throw new UnauthorizedException('Google account email is required');
    const isValidIssuer = payload.iss === 'accounts.google.com' || payload.iss === 'https://accounts.google.com';
    if (!isValidIssuer) throw new UnauthorizedException('Invalid Google token issuer');

    const email = payload.email.toLowerCase().trim();
    const name = payload.name?.trim() || email.split('@')[0];
    const avatarUrl = payload.picture || null;
    const emailVerified = Boolean(payload.email_verified);
    const existingByGoogleSub = await prisma.user.findFirst({ where: { googleSub: payload.sub } });

    if (existingByGoogleSub) {
      const updated = await prisma.user.update({ where: { id: existingByGoogleSub.id }, data: { name, avatarUrl, emailVerified } });
      return this.buildAuthResponse(updated);
    }

    const existingByEmail = await prisma.user.findUnique({ where: { email } });
    if (existingByEmail) {
      const linkedUser = await prisma.user.update({ where: { id: existingByEmail.id }, data: { googleSub: payload.sub, name: existingByEmail.name || name, avatarUrl: avatarUrl || existingByEmail.avatarUrl, emailVerified: emailVerified || existingByEmail.emailVerified } });
      return this.buildAuthResponse(linkedUser);
    }

    const createdUser = await prisma.user.create({ data: { email, name, role: Role.CUSTOMER, googleSub: payload.sub, avatarUrl, emailVerified } });
    return this.buildAuthResponse(createdUser);
  }

  async findAll() {
    return prisma.user.findMany({ select: { id: true, email: true, name: true, role: true, createdAt: true } });
  }

  async updateProfile(userId: string, data: { name?: string }) {
    return prisma.user.update({ where: { id: userId }, data: { ...(data.name !== undefined && { name: data.name }) }, select: { id: true, email: true, phone: true, role: true, name: true, avatarUrl: true, emailVerified: true, createdAt: true } });
  }

  async updateFcmToken(userId: string, token: string) {
    if (process.env.NODE_ENV === 'development') console.log(`[AuthService] Updating FCM token for user ${userId}`);
    return prisma.user.update({ where: { id: userId }, data: { fcmToken: token } });
  }
}
