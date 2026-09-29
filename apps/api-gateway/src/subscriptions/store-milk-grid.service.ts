/**
 * Store milk grid facade.
 *
 * Split out of the former store-milk-grid.service.ts god-service.
 * Behaviour is unchanged; this file only relocates cohesive members.
 */
import { Injectable } from "@nestjs/common";
import { Role } from "@aagam/database";
import { StoreMilkGridGridService } from "./store-milk-grid.grid.service";
import { StoreMilkGridQuickActionService } from "./store-milk-grid.quick-action.service";
import { StoreMilkGridDispatchService } from "./store-milk-grid.dispatch.service";
import { StoreMilkGridStatementService } from "./store-milk-grid.statement.service";
export { GridCell, PlanInfo, GridRow } from "./store-milk-grid.types";

@Injectable()
export class StoreMilkGridService {
  constructor(
    private readonly grid: StoreMilkGridGridService,
    private readonly quickAction: StoreMilkGridQuickActionService,
    private readonly dispatch: StoreMilkGridDispatchService,
    private readonly statement: StoreMilkGridStatementService
  ) {}

  async getGrid(actor: { id: string; role: Role; email?: string }, year?: number, month?: number) {
    return this.grid.getGrid(actor, year, month);
  }

  async executeQuickAction(
    actor: { id: string; role: Role; email?: string },
    deliveryId: string,
    action: {
      type: 'TOGGLE_DELIVERED' | 'SKIP' | 'EXTRA_MILK' | 'TOGGLE_SLOT' | 'RECORD_PAYMENT' | 'VOID_PAYMENT' | 'ATTACH_EVENING_MILK';
      extraQuantity?: string;
      extraPaise?: number;
      paymentMode?: 'CASH' | 'PHONE_PE';
      amountPaise?: number;
      note?: string;
      consecutiveDays?: number;
      targetSlot?: 'AM' | 'PM';
    },
  ) {
    return this.quickAction.executeQuickAction(actor, deliveryId, action);
  }

  async getDispatchSummary(actor: { id: string; role: Role; email?: string }, dateStr?: string) {
    return this.dispatch.getDispatchSummary(actor, dateStr);
  }

  async exportCsv(actor: { id: string; role: Role; email?: string }, year?: number, month?: number): Promise<string> {
    return this.grid.exportCsv(actor, year, month);
  }

  async getCustomerStatement(actor: { id: string; role: Role; email?: string }, subscriptionId: string) {
    return this.statement.getCustomerStatement(actor, subscriptionId);
  }

  async getAvailableRiders(_actor: { id: string; role: Role }) {
    return this.dispatch.getAvailableRiders(_actor);
  }

  async dispatchToRider(
    actor: { id: string; role: Role; email?: string },
    dto: {
      deliveryIds: string[];
      riderProfileId: string;
      slot?: 'AM' | 'PM';
      saveAsDefaultRider?: boolean;
      saveAsTemporaryRange?: boolean;
      temporaryStartDate?: string;
      temporaryEndDate?: string;
    },
  ) {
    return this.dispatch.dispatchToRider(actor, dto);
  }

  async setDefaultRider(
    actor: { id: string; role: Role; email?: string },
    subscriptionId: string,
    riderProfileId?: string | null,
  ) {
    return this.dispatch.setDefaultRider(actor, subscriptionId, riderProfileId);
  }

  async setTemporaryRider(
    actor: { id: string; role: Role; email?: string },
    subscriptionId: string,
    dto: { riderProfileId?: string | null; startDate?: string; endDate?: string; applyToScheduledDeliveries?: boolean },
  ) {
    return this.dispatch.setTemporaryRider(actor, subscriptionId, dto);
  }

  async autoDispatchDefaultRiders(
    actor: { id: string; role: Role; email?: string },
    dto: { dateStr: string; slot?: 'AM' | 'PM' | 'ALL'; channel?: 'ALL' | 'ONLINE' | 'OFFLINE' },
  ) {
    return this.dispatch.autoDispatchDefaultRiders(actor, dto);
  }
}
