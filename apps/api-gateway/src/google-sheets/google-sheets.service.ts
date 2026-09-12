import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { google, sheets_v4 } from 'googleapis';

@Injectable()
export class GoogleSheetsService implements OnModuleInit {
  private readonly logger = new Logger(GoogleSheetsService.name);
  private sheets: sheets_v4.Sheets | null = null;
  private spreadsheetId: string | null = null;

  onModuleInit() {
    const keyJson = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
    this.spreadsheetId = process.env.GOOGLE_SHEETS_SPREADSHEET_ID || null;

    if (!keyJson || !this.spreadsheetId) {
      this.logger.warn(
        'Google Sheets integration disabled. Set GOOGLE_SERVICE_ACCOUNT_KEY and GOOGLE_SHEETS_SPREADSHEET_ID to enable.',
      );
      return;
    }

    try {
      const credentials = JSON.parse(keyJson);
      const auth = new google.auth.GoogleAuth({
        credentials,
        scopes: ['https://www.googleapis.com/auth/spreadsheets'],
      });
      this.sheets = google.sheets({ version: 'v4', auth });
      this.logger.log('Google Sheets integration initialized');
    } catch (error) {
      this.logger.error(`Failed to initialize Google Sheets: ${error}`);
    }
  }

  get isConnected(): boolean {
    return this.sheets !== null && this.spreadsheetId !== null;
  }

  private sanitizeForSheets(value: string): string {
    if (!value) return '';
    const trimmed = String(value).trim();
    if (trimmed.startsWith('=') || trimmed.startsWith('+') || trimmed.startsWith('-') || trimmed.startsWith('@')) {
      return `'${trimmed}`;
    }
    return trimmed;
  }

  async appendOrder(order: {
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
  }): Promise<boolean> {
    if (!this.isConnected) return false;

    try {
      const existingRow = await this.findRowByOrderId(order.id);
      if (existingRow) {
        return this.updateOrderStatus(order.shortId, order.status);
      }

      const values = [
        order.id,
        order.shortId,
        new Date(order.createdAt).toLocaleDateString('en-IN', {
          day: '2-digit',
          month: 'short',
          year: 'numeric',
        }),
        new Date(order.createdAt).toLocaleTimeString('en-IN', {
          hour: '2-digit',
          minute: '2-digit',
          hour12: true,
        }),
        this.sanitizeForSheets(order.customerName),
        this.sanitizeForSheets(order.customerPhone),
        this.sanitizeForSheets(order.address),
        this.sanitizeForSheets(order.itemsSummary),
        order.subtotal,
        order.deliveryFee,
        order.discountAmount,
        order.taxAmount,
        order.grandTotal,
        this.sanitizeForSheets(order.paymentMethod),
        this.sanitizeForSheets(order.paymentStatus),
        this.sanitizeForSheets(order.status),
        this.sanitizeForSheets(order.riderName || 'Unassigned'),
        this.sanitizeForSheets(order.storeName),
        new Date(order.createdAt).toLocaleString('en-IN'),
        new Date().toLocaleString('en-IN'),
        'NEW',
      ];

      await this.sheets!.spreadsheets.values.append({
        spreadsheetId: this.spreadsheetId!,
        range: 'Live Orders!A:T',
        valueInputOption: 'RAW',
        insertDataOption: 'INSERT_ROWS',
        requestBody: { values: [values] },
      });

      this.logger.log(`Order ${order.shortId} pushed to Google Sheets`);
      return true;
    } catch (error) {
      this.logger.error(`Failed to push order to Google Sheets: ${error}`);
      return false;
    }
  }

  private async findRowByOrderId(orderId: string): Promise<number | null> {
    if (!this.isConnected) return null;

    try {
      const response = await this.sheets!.spreadsheets.values.get({
        spreadsheetId: this.spreadsheetId!,
        range: 'Live Orders!A:A',
      });

      const rows = response.data.values || [];
      for (let i = 0; i < rows.length; i++) {
        if (rows[i][0] === orderId) {
          return i + 1;
        }
      }
      return null;
    } catch (error) {
      this.logger.error(`Failed to find order row: ${error}`);
      return null;
    }
  }

  async updateOrderStatus(
    shortId: string,
    newStatus: string,
  ): Promise<boolean> {
    if (!this.isConnected) return false;

    try {
      const response = await this.sheets!.spreadsheets.values.get({
        spreadsheetId: this.spreadsheetId!,
        range: 'Live Orders!B:B',
      });

      const rows = response.data.values || [];
      for (let i = 0; i < rows.length; i++) {
        if (rows[i][0] === shortId) {
          const rowNum = i + 1;
          await this.sheets!.spreadsheets.values.update({
            spreadsheetId: this.spreadsheetId!,
            range: `Live Orders!O${rowNum}`,
            valueInputOption: 'RAW',
            requestBody: { values: [[newStatus]] },
          });
          this.logger.log(`Order ${shortId} status updated to ${newStatus} in Google Sheets`);
          return true;
        }
      }
      return false;
    } catch (error) {
      this.logger.error(`Failed to update order status in Google Sheets: ${error}`);
      return false;
    }
  }

  async getSheetUrl(): Promise<string | null> {
    if (!this.spreadsheetId) return null;
    return `https://docs.google.com/spreadsheets/d/${this.spreadsheetId}/edit`;
  }
}
