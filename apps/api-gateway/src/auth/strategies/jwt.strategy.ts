import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';
import { prisma } from '@aagam/database';
import { activeUserRoles } from '../user-roles';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(private configService: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromExtractors([
        ExtractJwt.fromAuthHeaderAsBearerToken(),
        (request: Request) => request?.cookies?.access_token,
      ]),
      ignoreExpiration: false,
      secretOrKey:
        configService.get<string>('JWT_SECRET') ||
        (() => {
          throw new Error('JWT_SECRET missing');
        })(),
    });
  }

  async validate(payload: any) {
    const user = await prisma.user.findUnique({
      where: { id: payload.sub },
      select: {
        id: true,
        email: true,
        role: true,
        name: true,
        phone: true,
        avatarUrl: true,
        emailVerified: true,
      },
    });
    if (!user) throw new UnauthorizedException('User account no longer exists');
    const identity = await prisma.$queryRawUnsafe(
      'SELECT "phoneVerifiedAt" FROM "User" WHERE "id" = $1 LIMIT 1',
      user.id,
    );
    return {
      ...user,
      email: user.email.endsWith('@phone.aagam.local') ? null : user.email,
      phoneVerifiedAt: identity[0]?.phoneVerifiedAt || null,
      roles: await activeUserRoles(user.id, user.role),
    };
  }
}
