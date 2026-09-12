import { Controller, Get, Post, Body, UseGuards } from '@nestjs/common';
import { GoogleSheetsService } from './google-sheets.service';
import { Role } from '@aagam/database';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';

@Controller('google-sheets')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
export class GoogleSheetsController {
  constructor(private readonly sheetsService: GoogleSheetsService) {}

  @Get('status')
  getStatus() {
    return {
      connected: this.sheetsService.isConnected,
      sheetUrl: null,
    };
  }

  @Get('url')
  async getUrl() {
    const url = await this.sheetsService.getSheetUrl();
    return { url };
  }

  @Post('sync-order')
  async syncOrder(
    @Body()
    order: {
      id: string;
      shortId: string;
      status: string;
      customerName: string;
      customerPhone: string;
      storeName: string;
      itemsSummary: string;
      subtotal: number;
      deliveryFee: number;
      discountAmount: number;
      taxAmount: number;
      grandTotal: number;
      paymentMethod: string;
      paymentStatus: string;
      riderName: string;
      address: string;
      createdAt: string;
    },
  ) {
    const success = await this.sheetsService.appendOrder(order);
    return { success };
  }
}
