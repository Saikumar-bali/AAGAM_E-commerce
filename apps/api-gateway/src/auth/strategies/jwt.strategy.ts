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
      jwtFromRequest: ExtractJwt.fromExtractors([
        (request: Request) => {
          const token = request?.cookies?.access_token;
          if (process.env.NODE_ENV === 'development') {
            if (token) {
              console.log('[JwtStrategy] Token found in cookie');
            } else {
              console.log('[JwtStrategy] No token in cookie, checking auth header');
            }
          }
          return token;
        },
        ExtractJwt.fromAuthHeaderAsBearerToken(),
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
