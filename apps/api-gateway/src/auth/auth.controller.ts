import { Controller, Post, Body, Res, Get, Patch, UseGuards, Req } from '@nestjs/common';
import { AuthService } from './auth.service';
import { Response, Request } from 'express';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { RolesGuard } from './guards/roles.guard';
import { Roles } from './decorators/roles.decorator';
import { Role } from '@aagam/database';
import { ThrottlerGuard, Throttle } from '@nestjs/throttler';
import { SignupDto } from './dto/signup.dto';
import { LoginDto } from './dto/login.dto';
import { GoogleLoginDto } from './dto/google-login.dto';

@Controller('auth')
@UseGuards(ThrottlerGuard)
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('signup')
  @Throttle({ short: { limit: 5, ttl: 60000 } }) // 5 requests per minute
  async signUp(@Body() signupDto: SignupDto) {
    return this.authService.signUp(signupDto.email, signupDto.password, signupDto.name, signupDto.role);
  }

  @Post('login')
  @Throttle({ short: { limit: 5, ttl: 900000 } }) // 5 attempts per 15 minutes
  async signIn(@Body() loginDto: LoginDto, @Res({ passthrough: true }) response: Response) {
    if (process.env.NODE_ENV === 'development') {
      console.log('[AuthController] Login attempt');
    }
    const result = await this.authService.signIn(loginDto.email, loginDto.password);
    
    // Set HTTP-only cookie
    const isProduction = process.env.NODE_ENV === 'production';
    response.cookie('access_token', result.session.access_token, {
      httpOnly: true,
      secure: isProduction,
      sameSite: isProduction ? 'none' : 'lax',
      path: '/',
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    });

    if (process.env.NODE_ENV === 'development') {
      console.log('[AuthController] Login successful');
    }

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
    const isProduction = process.env.NODE_ENV === 'production';
    response.cookie('access_token', result.session.access_token, {
      httpOnly: true,
      secure: isProduction,
      sameSite: isProduction ? 'none' : 'lax',
      path: '/',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    return {
      message: 'Logged in successfully',
      user: result.user,
      access_token: result.session.access_token,
    };
  }

  @UseGuards(JwtAuthGuard)
  @Throttle({ short: { limit: 30, ttl: 1000 }, medium: { limit: 120, ttl: 10000 }, long: { limit: 300, ttl: 60000 } })
  @Get('me')
  async getProfile(@Req() req: any) {
    if (process.env.NODE_ENV === 'development') {
      console.log('[AuthController] /me request received');
    }
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
