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
import {
  RequestCustomerPhoneOtpDto,
  VerifyCustomerPhoneOtpDto,
} from './dto/phone-auth.dto';
import { ConfirmPasswordResetDto, RequestPasswordResetDto } from './dto/password-reset.dto';
import { RequestEmailSignupOtpDto, VerifyEmailSignupOtpDto } from './dto/email-signup.dto';

const IS_PLAYWRIGHT_QA = process.env.PLAYWRIGHT_QA === 'true';
const AUTH_LIMIT = IS_PLAYWRIGHT_QA ? 500 : 3;
const OTP_REQUEST_LIMIT = IS_PLAYWRIGHT_QA ? 500 : 5;
const OTP_VERIFY_LIMIT = IS_PLAYWRIGHT_QA ? 500 : 8;
const PROFILE_LIMIT = IS_PLAYWRIGHT_QA ? 2000 : 180;

@Controller('auth')
@UseGuards(ThrottlerGuard)
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  private setSessionCookie(response: Response, token: string) {
    const secure = process.env.COOKIE_SECURE === 'true' || (process.env.NODE_ENV === 'production' && process.env.COOKIE_SECURE !== 'false');
    response.cookie('access_token', token, {
      httpOnly: true,
      secure,
      sameSite: secure ? 'none' : 'lax',
      path: '/',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });
  }

  private loginIdentifier(dto: LoginDto) {
    return dto.identifier || dto.phoneE164 || dto.email || '';
  }

  @Post('signup')
  @Throttle({ short: { limit: AUTH_LIMIT, ttl: 60000 } })
  async signUp(@Body() signupDto: SignupDto) {
    return this.authService.signUp(signupDto.email, signupDto.password, signupDto.name);
  }

  @Post('phone/request')
  @Throttle({ short: { limit: OTP_REQUEST_LIMIT, ttl: 60000 } })
  requestPhoneOtp(@Body() dto: RequestCustomerPhoneOtpDto) {
    return this.authService.requestPhoneOtp(dto.phoneE164, dto.purpose);
  }

  @Post('phone/verify')
  @Throttle({ short: { limit: OTP_VERIFY_LIMIT, ttl: 60000 } })
  async verifyPhoneOtp(
    @Body() dto: VerifyCustomerPhoneOtpDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.authService.verifyPhoneOtp(dto);
    this.setSessionCookie(response, result.session.access_token);
    return { message: 'Phone verified successfully', user: result.user };
  }

  @Post('mobile/phone/verify')
  @Throttle({ short: { limit: OTP_VERIFY_LIMIT, ttl: 60000 } })
  async mobileVerifyPhoneOtp(@Body() dto: VerifyCustomerPhoneOtpDto) {
    const result = await this.authService.verifyPhoneOtp(dto);
    return {
      message: 'Phone verified successfully',
      user: result.user,
      access_token: result.session.access_token,
    };
  }

  @Post('partner/phone/request')
  @Throttle({ short: { limit: OTP_REQUEST_LIMIT, ttl: 60000 } })
  requestPartnerPhoneOtp(@Body() dto: RequestCustomerPhoneOtpDto) {
    return this.authService.requestPartnerPhoneOtp(dto.phoneE164);
  }

  @Post('mobile/partner/phone/verify')
  @Throttle({ short: { limit: OTP_VERIFY_LIMIT, ttl: 60000 } })
  async mobileVerifyPartnerPhoneOtp(@Body() dto: VerifyCustomerPhoneOtpDto) {
    const result = await this.authService.verifyPartnerPhoneOtp(dto);
    return {
      message: 'Partner phone verified successfully',
      user: result.user,
      access_token: result.session.access_token,
    };
  }

  @Post('login')
  @Throttle({ short: { limit: AUTH_LIMIT, ttl: 60000 } })
  async signIn(@Body() loginDto: LoginDto, @Res({ passthrough: true }) response: Response) {
    const result = await this.authService.signIn(this.loginIdentifier(loginDto), loginDto.password);
    this.setSessionCookie(response, result.session.access_token);
    return { message: 'Logged in successfully', user: result.user };
  }

  @Post('email/signup/request')
  @Throttle({ short: { limit: OTP_REQUEST_LIMIT, ttl: 60000 } })
  requestEmailSignupOtp(@Body() dto: RequestEmailSignupOtpDto) {
    return this.authService.requestEmailSignupOtp(dto.email);
  }

  @Post('email/signup/verify')
  @Throttle({ short: { limit: OTP_VERIFY_LIMIT, ttl: 60000 } })
  async verifyEmailSignupOtp(@Body() dto: VerifyEmailSignupOtpDto, @Res({ passthrough: true }) response: Response) {
    const result = await this.authService.verifyEmailSignupOtp(dto);
    this.setSessionCookie(response, result.session.access_token);
    return { message: 'Email verified and account created', user: result.user };
  }

  @Post('password/forgot')
  @Throttle({ short: { limit: OTP_REQUEST_LIMIT, ttl: 60000 } })
  requestPasswordReset(@Body() dto: RequestPasswordResetDto) {
    return this.authService.requestPasswordReset(dto.email);
  }

  @Post('password/reset')
  @Throttle({ short: { limit: OTP_VERIFY_LIMIT, ttl: 60000 } })
  resetPassword(@Body() dto: ConfirmPasswordResetDto) {
    return this.authService.resetPassword(dto);
  }

  @Post('mobile/login')
  @Throttle({ short: { limit: AUTH_LIMIT, ttl: 60000 } })
  async mobileSignIn(@Body() loginDto: LoginDto) {
    const result = await this.authService.signIn(this.loginIdentifier(loginDto), loginDto.password);
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
    const secure = process.env.COOKIE_SECURE === 'true' || (process.env.NODE_ENV === 'production' && process.env.COOKIE_SECURE !== 'false');
    response.clearCookie('access_token', {
      path: '/',
      secure,
      sameSite: secure ? 'none' : 'lax',
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
