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
      const values = [
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
        order.customerName,
        order.customerPhone,
        order.address,
        order.itemsSummary,
        order.subtotal,
        order.deliveryFee,
        order.discountAmount,
        order.taxAmount,
        order.grandTotal,
        order.paymentMethod,
        order.paymentStatus,
        order.status,
        order.riderName || 'Unassigned',
        order.storeName,
        new Date(order.createdAt).toLocaleString('en-IN'),
        new Date().toLocaleString('en-IN'),
        'NEW',
      ];

      await this.sheets!.spreadsheets.values.append({
        spreadsheetId: this.spreadsheetId!,
        range: 'Live Orders!A:T',
        valueInputOption: 'USER_ENTERED',
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

  async updateOrderStatus(
    shortId: string,
    newStatus: string,
  ): Promise<boolean> {
    if (!this.isConnected) return false;

    try {
      const response = await this.sheets!.spreadsheets.values.get({
        spreadsheetId: this.spreadsheetId!,
        range: 'Live Orders!A:F',
      });

      const rows = response.data.values || [];
      for (let i = 0; i < rows.length; i++) {
        if (rows[i][0] === shortId) {
          const rowNum = i + 1;
          await this.sheets!.spreadsheets.values.update({
            spreadsheetId: this.spreadsheetId!,
            range: `Live Orders!O${rowNum}`,
            valueInputOption: 'USER_ENTERED',
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
