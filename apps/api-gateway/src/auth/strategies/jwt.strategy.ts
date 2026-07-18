import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';
import { prisma } from '@aagam/database';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(private configService: ConfigService) {
    super({
      // An explicit Authorization header represents the caller's chosen API or
      // mobile credential and must win over any ambient browser cookie. This
      // prevents a stale web session from shadowing a valid Rider/Store token.
      jwtFromRequest: ExtractJwt.fromExtractors([
        ExtractJwt.fromAuthHeaderAsBearerToken(),
        (request: Request) => {
          const token = request?.cookies?.access_token;
          if (process.env.NODE_ENV === 'development') {
            if (token) {
              console.log('[JwtStrategy] Token found in cookie');
            } else {
              console.log('[JwtStrategy] No token in cookie or auth header');
            }
          }
          return token;
        },
      ]),
      ignoreExpiration: false,
      secretOrKey: configService.get<string>('JWT_SECRET') || (() => { throw new Error('JWT_SECRET missing'); })(),
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
    if (!user) {
      throw new UnauthorizedException('User account no longer exists');
    }
    return user;
  }
}
