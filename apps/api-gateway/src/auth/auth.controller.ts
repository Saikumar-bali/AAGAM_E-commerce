import { Controller, Post, Body, Res, Get, Patch, UseGuards, Req } from '@nestjs/common';
import { AuthService } from './auth.service';
import { Response } from 'express';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { RolesGuard } from './guards/roles.guard';
import { Roles } from './decorators/roles.decorator';
import { Role } from '@aagam/database';
import { ThrottlerGuard, Throttle } from '@nestjs/throttler';
import { SignupDto } from './dto/signup.dto';
import { LoginDto } from './dto/login.dto';
import { GoogleLoginDto } from './dto/google-login.dto';

const AUTH_LIMIT = process.env.PLAYWRIGHT_QA === 'true' ? 500 : 3;
const PROFILE_LIMIT = process.env.PLAYWRIGHT_QA === 'true' ? 2000 : 180;

@Controller('auth')
@UseGuards(ThrottlerGuard)
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  private setSessionCookie(response: Response, token: string) {
    const isProduction = process.env.NODE_ENV === 'production';
    response.cookie('access_token', token, {
      httpOnly: true,
      secure: isProduction,
      sameSite: isProduction ? 'none' : 'lax',
      path: '/',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });
  }

  @Post('signup')
  @Throttle({ short: { limit: AUTH_LIMIT, ttl: 60000 } })
  async signUp(@Body() signupDto: SignupDto) {
    return this.authService.signUp(signupDto.email, signupDto.password, signupDto.name, signupDto.role);
  }

  /**
   * Browser login is cookie-only. The JWT is never returned to JavaScript,
   * which preserves the protection of the HttpOnly session cookie.
   */
  @Post('login')
  @Throttle({ short: { limit: AUTH_LIMIT, ttl: 60000 } })
  async signIn(@Body() loginDto: LoginDto, @Res({ passthrough: true }) response: Response) {
    const result = await this.authService.signIn(loginDto.email, loginDto.password);
    this.setSessionCookie(response, result.session.access_token);
    return { message: 'Logged in successfully', user: result.user };
  }

  /**
   * Native applications cannot use a browser HttpOnly cookie jar reliably.
   * They receive a bearer token and persist it in the platform Keychain.
   */
  @Post('mobile/login')
  @Throttle({ short: { limit: AUTH_LIMIT, ttl: 60000 } })
  async mobileSignIn(@Body() loginDto: LoginDto) {
    const result = await this.authService.signIn(loginDto.email, loginDto.password);
    return {
      message: 'Logged in successfully',
      user: result.user,
      access_token: result.session.access_token,
    };
  }

  @Post('google')
  @Throttle({ short: { limit: 10, ttl: 60000 } })
  async signInWithGoogle(@Body() body: GoogleLoginDto, @Res({ passthrough: true }) response: Response) {
    const result = await this.authService.signInWithGoogle(body.idToken);
    this.setSessionCookie(response, result.session.access_token);
    return { message: 'Logged in successfully', user: result.user };
  }

  @Post('mobile/google')
  @Throttle({ short: { limit: 10, ttl: 60000 } })
  async mobileSignInWithGoogle(@Body() body: GoogleLoginDto) {
    const result = await this.authService.signInWithGoogle(body.idToken);
    return {
      message: 'Logged in successfully',
      user: result.user,
      access_token: result.session.access_token,
    };
  }

  @UseGuards(JwtAuthGuard)
  @Throttle({ short: { limit: PROFILE_LIMIT, ttl: 60000 } })
  @Get('me')
  async getProfile(@Req() req: any) {
    return req.user;
  }

  @UseGuards(JwtAuthGuard)
  @Throttle({ short: { limit: 5, ttl: 1000 }, medium: { limit: 20, ttl: 10000 }, long: { limit: 60, ttl: 60000 } })
  @Patch('me')
  async updateProfile(@Req() req: any, @Body() body: { name?: string }) {
    return this.authService.updateProfile(req.user.id, { name: body.name });
  }

  @Post('logout')
  @Throttle({ short: { limit: 10, ttl: 60000 } })
  async logout(@Res({ passthrough: true }) response: Response) {
    const isProduction = process.env.NODE_ENV === 'production';
    response.clearCookie('access_token', {
      path: '/',
      secure: isProduction,
      sameSite: isProduction ? 'none' : 'lax',
    });
    return { message: 'Logged out successfully' };
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @Get('users')
  async findAll() {
    return this.authService.findAll();
  }

  @UseGuards(JwtAuthGuard)
  @Post('fcm-token')
  async updateFcmToken(@Req() req: any, @Body() body: { token: string }) {
    return this.authService.updateFcmToken(req.user.id, body.token);
  }
}
