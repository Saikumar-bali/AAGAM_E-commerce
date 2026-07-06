import { Injectable, UnauthorizedException, ConflictException, BadRequestException } from '@nestjs/common';
import { prisma } from '@aagam/database';
import { Role } from '@aagam/database';
import * as bcrypt from 'bcrypt';
import * as jwt from 'jsonwebtoken';
import { ConfigService } from '@nestjs/config';
import { OAuth2Client } from 'google-auth-library';
import { createPublicKey, KeyObject } from 'crypto';

const FPNV_JWKS_URL = 'https://fpnv.googleapis.com/v1beta/jwks';
const FPNV_JWKS_TTL_MS = 60 * 60 * 1000;

type FpnvJwk = {
  kid?: string;
  kty?: string;
  crv?: string;
  x?: string;
  y?: string;
  alg?: string;
  use?: string;
};

type FpnvJwtPayload = jwt.JwtPayload & {
  sub?: string;
  aud?: string | string[];
};

@Injectable()
export class AuthService {
  private jwtSecret: string;
  private googleClient: OAuth2Client;
  private fpnvKeys: { expiresAt: number; keys: FpnvJwk[] } | null = null;

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

  private buildAuthResponse(user: { id: string; email: string; role: Role; name: string | null; avatarUrl?: string | null; phone?: string | null }) {
    const token = jwt.sign({ sub: user.id, email: user.email, role: user.role }, this.jwtSecret, { expiresIn: '7d' });
    return {
      session: { access_token: token },
      user: { id: user.id, email: user.email, role: user.role, name: user.name, avatarUrl: user.avatarUrl || null, phone: user.phone || null },
    };
  }

  private getFpnvConfig() {
    const projectNumber = this.configService.get<string>('FIREBASE_PNV_PROJECT_NUMBER')?.trim();
    const projectId = this.configService.get<string>('FIREBASE_PNV_PROJECT_ID')?.trim();
    if (!projectNumber) throw new BadRequestException('Firebase PNV is not configured on server');
    return { projectNumber, projectId };
  }

  private async getFpnvJwks() {
    const now = Date.now();
    if (this.fpnvKeys && this.fpnvKeys.expiresAt > now) return this.fpnvKeys.keys;
    const response = await fetch(FPNV_JWKS_URL);
    if (!response.ok) throw new UnauthorizedException('Could not load Firebase PNV signing keys');
    const body = (await response.json()) as { keys?: FpnvJwk[] };
    const keys = Array.isArray(body.keys) ? body.keys : [];
    this.fpnvKeys = { keys, expiresAt: now + FPNV_JWKS_TTL_MS };
    return keys;
  }

  private async getFpnvSigningKey(kid?: string): Promise<KeyObject> {
    if (!kid) throw new UnauthorizedException('Firebase PNV token is missing key id');
    const keys = await this.getFpnvJwks();
    const jwk = keys.find((key) => key.kid === kid && key.alg === 'ES256');
    if (!jwk) throw new UnauthorizedException('Firebase PNV signing key not found');
    return createPublicKey({ key: jwk as any, format: 'jwk' });
  }

  private assertValidPhone(phone: unknown) {
    if (typeof phone !== 'string') throw new UnauthorizedException('Firebase PNV token is missing phone number');
    const normalized = phone.trim();
    if (!/^\+[1-9]\d{7,14}$/.test(normalized)) throw new UnauthorizedException('Firebase PNV phone number is invalid');
    return normalized;
  }

  private phoneEmail(phone: string) {
    const encoded = Buffer.from(phone).toString('base64url').toLowerCase();
    return `phone.${encoded}@phone.aagam.local`;
  }

  private async verifyFirebasePnvToken(fpnvToken: string) {
    if (!fpnvToken || typeof fpnvToken !== 'string') throw new BadRequestException('Firebase PNV token is required');
    const { projectNumber, projectId } = this.getFpnvConfig();
    const decoded = jwt.decode(fpnvToken, { complete: true });
    if (!decoded || typeof decoded === 'string') throw new UnauthorizedException('Invalid Firebase PNV token');
    if (decoded.header?.typ !== 'JWT') throw new UnauthorizedException('Invalid Firebase PNV token type');
    if (decoded.header?.alg !== 'ES256') throw new UnauthorizedException('Invalid Firebase PNV token algorithm');

    const publicKey = await this.getFpnvSigningKey(decoded.header.kid);
    let payload: FpnvJwtPayload;
    try {
      payload = jwt.verify(fpnvToken, publicKey, {
        algorithms: ['ES256'],
        issuer: `https://fpnv.googleapis.com/projects/${projectNumber}`,
      }) as FpnvJwtPayload;
    } catch (error) {
      throw new UnauthorizedException('Invalid Firebase PNV token');
    }

    const audiences = Array.isArray(payload.aud) ? payload.aud : [payload.aud].filter(Boolean) as string[];
    const requiredAudience = `https://fpnv.googleapis.com/projects/${projectNumber}`;
    const projectIdAudience = projectId ? `https://fpnv.googleapis.com/projects/${projectId}` : null;
    if (!audiences.includes(requiredAudience)) throw new UnauthorizedException('Firebase PNV audience does not match project number');
    if (projectIdAudience && !audiences.includes(projectIdAudience)) throw new UnauthorizedException('Firebase PNV audience does not match project id');

    return { phone: this.assertValidPhone(payload.sub) };
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

  async signInWithPhonePnv(fpnvToken: string, name?: string) {
    const { phone } = await this.verifyFirebasePnvToken(fpnvToken);
    const existing = await prisma.user.findUnique({ where: { phone } });
    if (existing) {
      if (existing.role !== Role.CUSTOMER) throw new UnauthorizedException('This phone number belongs to an operational account. Use the partner app.');
      return this.buildAuthResponse(existing);
    }

    const email = this.phoneEmail(phone);
    const existingEmail = await prisma.user.findUnique({ where: { email } });
    if (existingEmail) return this.buildAuthResponse(existingEmail);

    const created = await prisma.user.create({
      data: {
        email,
        phone,
        name: name?.trim() || `Customer ${phone.slice(-4)}`,
        role: Role.CUSTOMER,
        emailVerified: false,
      },
    });
    return this.buildAuthResponse(created);
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
