import { Injectable, OnModuleInit } from '@nestjs/common';
import * as admin from 'firebase-admin';
import * as path from 'path';
import * as fs from 'fs';

@Injectable()
export class NotificationService implements OnModuleInit {
  onModuleInit() {
    try {
      const serviceAccountPath = path.resolve(process.cwd(), 'firebase-adminsdk.json');
      if (fs.existsSync(serviceAccountPath)) {
        const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, 'utf8'));
        
        if (admin.apps.length === 0) {
          admin.initializeApp({
            credential: admin.credential.cert(serviceAccount),
          });
          console.log('[NotificationService] Firebase Admin Initialized Successfully!');
        }
      } else {
        console.warn(`[NotificationService] Service account file not found at ${serviceAccountPath}`);
      }
    } catch (error) {
      console.error('[NotificationService] Failed to initialize Firebase Admin:', error);
    }
  }

  /**
   * Sends a push notification to a specific device
   */
  async sendPushNotification(fcmToken: string, title: string, body: string, data?: any) {
    if (!fcmToken) return;

    if (admin.apps.length === 0) {
      console.warn('[NotificationService] Firebase not initialized. Skipping push notification.');
      return;
    }

    try {
      const message = {
        notification: {
          title,
          body,
        },
        data: data || {},
        token: fcmToken,
        android: {
          notification: {
            sound: 'default',
            priority: 'high' as const,
            channelId: 'high_priority_orders',
          },
        },
        apns: {
          payload: {
            aps: {
              sound: 'default',
              contentAvailable: true,
            },
          },
        },
      };

      const response = await admin.messaging().send(message);
      console.log(`[NotificationService] Push notification sent successfully: ${response}`);
      return response;
    } catch (error) {
      console.error(`[NotificationService] Error sending push notification:`, error);
      throw error;
    }
  }

  /**
   * Helper to send "New Order" notification
   */
  async sendNewOrderAlert(fcmToken: string, orderData: { orderId: string; amount: number; storeName: string }) {
    return this.sendPushNotification(
      fcmToken,
      'New Delivery Request! 🚀',
      `A new order of ₹${orderData.amount} is ready for pickup at ${orderData.storeName}.`,
      {
        type: 'NEW_ORDER',
        orderId: orderData.orderId,
      }
    );
  }
}
