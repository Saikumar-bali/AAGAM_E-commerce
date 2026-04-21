import { Controller, Post, Body, Res, Get, UseGuards, Req } from '@nestjs/common';
import { AuthService } from './auth.service';
import { Response, Request } from 'express';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { RolesGuard } from './guards/roles.guard';
import { Roles } from './decorators/roles.decorator';
import { Role } from '@aagam/database';
import { ThrottlerGuard, Throttle } from '@nestjs/throttler';
import { SignupDto } from './dto/signup.dto';
import { LoginDto } from './dto/login.dto';

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
    console.log('[AuthController] Login attempt for:', loginDto.email);
    const result = await this.authService.signIn(loginDto.email, loginDto.password);
    
    // Set HTTP-only cookie
    const isProduction = process.env.NODE_ENV === 'production';
    response.cookie('access_token', result.session.access_token, {
      httpOnly: true,
      secure: isProduction,
      sameSite: 'strict',
      path: '/',
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    });

    console.log('[AuthController] Login successful, cookie set for:', loginDto.email);

    return {
      message: 'Logged in successfully',
      user: result.user,
    };
  }

  @UseGuards(JwtAuthGuard)
  @Get('me')
  async getProfile(@Req() req: any) {
    console.log('[AuthController] /me request received. User from request:', req.user?.email);
    return req.user;
  }

  @Post('logout')
  @Throttle({ short: { limit: 10, ttl: 60000 } })
  async logout(@Res({ passthrough: true }) response: Response) {
    const isProduction = process.env.NODE_ENV === 'production';
    response.clearCookie('access_token', { 
      path: '/',
      secure: isProduction,
      sameSite: 'strict',
    });
    return { message: 'Logged out successfully' };
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @Get('users')
  async findAll() {
    return this.authService.findAll();
  }
}
