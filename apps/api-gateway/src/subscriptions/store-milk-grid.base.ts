/**
 * Shared helpers for the store milk grid services.
 *
 * Split out of the former store-milk-grid.service.ts god-service.
 * Behaviour is unchanged; this file only relocates cohesive members.
 */
import { parseVolumeLiters } from "./delivery-add-on";

export abstract class StoreMilkGridBase {
  protected static extractWeightGramsFromName(name: string): number | undefined {
    if (!name) return undefined;
    const lower = name.toLowerCase();
    const fracMatch = lower.match(/(\d+)\s*\/\s*(\d+)\s*l/);
    if (fracMatch) {
      const liters = parseInt(fracMatch[1]) / parseInt(fracMatch[2]);
      return Math.round(liters * 1000);
    }
    const mlMatch = lower.match(/(\d+)\s*ml/);
    if (mlMatch) return parseInt(mlMatch[1], 10);
    const literMatch = lower.match(/(\d+(?:\.\d+)?)\s*l/);
    if (literMatch) return Math.round(parseFloat(literMatch[1]) * 1000);
    return undefined;
  }

  protected resolveBaseLiters(
    planName: string,
    priceSnapshot: unknown,
    deliverySlot: string,
    itemsSnapshot?: unknown,
  ): number {
    const itemsSnap = Array.isArray(itemsSnapshot) ? itemsSnapshot : [];
    const firstItem = itemsSnap.length > 0 ? itemsSnap[0] : null;
    const weightGrams: number | undefined = firstItem?.weightGrams ?? StoreMilkGridBase.extractWeightGramsFromName(firstItem?.name);

    let planMultiplier: number;
    if (weightGrams && weightGrams <= 300) {
      planMultiplier = 0.25;
    } else if (weightGrams && weightGrams <= 600) {
      planMultiplier = 0.5;
    } else if (planName.toLowerCase().includes('0.25') || planName.toLowerCase().includes('250') || planName.toLowerCase().includes('1/4')) {
      planMultiplier = 0.25;
    } else if (planName.toLowerCase().includes('0.5') || planName.toLowerCase().includes('500') || planName.toLowerCase().includes('1/2')) {
      planMultiplier = 0.5;
    } else {
      planMultiplier = 1.0;
    }

    const splitItems = (priceSnapshot as any)?.splitItems;
    if (!splitItems) return planMultiplier;

    if (deliverySlot === 'AM') {
      return parseVolumeLiters(splitItems.amQuantity || '0.5L') ?? planMultiplier;
    }
    return parseVolumeLiters(splitItems.pmQuantity || '1L') ?? planMultiplier;
  }
}
