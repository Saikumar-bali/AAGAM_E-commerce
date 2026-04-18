import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(private configService: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromExtractors([
        (request: Request) => {
          const token = request?.cookies?.access_token;
          const cookieHeader = request.headers.cookie;
          if (token) {
            console.log('[JwtStrategy] Token found in cookie');
          } else {
            console.log('[JwtStrategy] No token found in cookie.');
            console.log('[JwtStrategy] Cookie Header:', cookieHeader || 'None');
            console.log('[JwtStrategy] Parsed Cookies:', Object.keys(request?.cookies || {}));
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
    return { id: payload.sub, email: payload.email, role: payload.role };
  }
}
