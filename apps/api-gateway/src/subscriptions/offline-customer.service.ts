/**
 * Offline customer facade.
 *
 * Split out of the former offline-customer.service.ts god-service.
 * Behaviour is unchanged; this file only relocates cohesive members.
 */
import { Injectable } from '@nestjs/common';
import { OfflineCustomerActor } from './offline-customer.service.base';
import { OfflineCustomerDirectoryService } from './offline-customer-directory.service';
import { OfflineCustomerLifecycleService } from './offline-customer-lifecycle.service';
import { OfflineCustomerPurgeService } from './offline-customer-purge.service';

@Injectable()
export class OfflineCustomerService {
  static readonly RECYCLE_BIN_PAUSE_PREFIX = 'OFFLINE_CUSTOMER_IN_RECYCLE_BIN:';

  static readonly RECYCLE_BIN_PAUSE_REASON = 'OFFLINE_CUSTOMER_IN_RECYCLE_BIN';

  static readonly PURGED_EMAIL = 'purged@offline.local';

  private readonly directory: OfflineCustomerDirectoryService;
  private readonly lifecycle: OfflineCustomerLifecycleService;
  private readonly purge: OfflineCustomerPurgeService;

  constructor() {
    this.directory = new OfflineCustomerDirectoryService();
    this.lifecycle = new OfflineCustomerLifecycleService();
    this.purge = new OfflineCustomerPurgeService();
  }

  async listCustomers(params: { search?: string; storeId?: string; storeIds?: string[]; status?: string; recycleBin?: boolean; page?: number; pageSize?: number }) {
    return this.directory.listCustomers(params);
  }

  async getCustomerDetail(customerId: string, actor?: OfflineCustomerActor) {
    return this.directory.getCustomerDetail(customerId, actor);
  }

  async getDeliveryTracker(subscriptionId: string, actor?: OfflineCustomerActor) {
    return this.directory.getDeliveryTracker(subscriptionId, actor);
  }

  async reactivateCustomer(customerId: string, storeId: string, actorId: string) {
    return this.directory.reactivateCustomer(customerId, storeId, actorId);
  }

  async moveToRecycleBin(customerId: string, reason?: string, actor?: OfflineCustomerActor) {
    return this.lifecycle.moveToRecycleBin(customerId, reason, actor);
  }

  async restoreFromRecycleBin(customerId: string, actor?: OfflineCustomerActor) {
    return this.lifecycle.restoreFromRecycleBin(customerId, actor);
  }

  async permanentDeleteCustomer(customerId: string, actor?: OfflineCustomerActor) {
    return this.purge.permanentDeleteCustomer(customerId, actor);
  }
}
