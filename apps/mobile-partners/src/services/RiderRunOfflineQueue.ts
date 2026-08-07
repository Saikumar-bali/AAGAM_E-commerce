import AsyncStorage from '@react-native-async-storage/async-storage';
import { subscriptionOperationsService, type DeliveryFailureReason } from '../api/subscriptionOperationsService';

const KEY = '@aagam/rider-run-offline-queue/v1';
export type OfflineRunAction =
  | { id: string; kind: 'ARRIVE'; runId: string; stopId: string; payload: { version: number; latitude: number; longitude: number; accuracyMetres?: number }; createdAt: string }
  | { id: string; kind: 'FAIL'; runId: string; stopId: string; payload: { version: number; latitude: number; longitude: number; accuracyMetres?: number; reason: DeliveryFailureReason; note?: string; retryRequested?: boolean }; createdAt: string }
  | { id: string; kind: 'REORDER'; runId: string; stopId: string; payload: { version: number; newSequenceNumber: number; reason: string }; createdAt: string }
  | { id: string; kind: 'TRUSTED_DROP_RESCAN_REQUIRED'; runId: string; stopId: string; payload: { version: number; evidenceUri?: string; evidenceName?: string; evidenceType?: string }; createdAt: string };

async function read(): Promise<OfflineRunAction[]> { try { return JSON.parse((await AsyncStorage.getItem(KEY)) || '[]'); } catch { return []; } }
async function write(items: OfflineRunAction[]) { await AsyncStorage.setItem(KEY, JSON.stringify(items.slice(-100))); }
function id(kind: string, runId: string, stopId: string) { return `${kind}:${runId}:${stopId}:${Date.now()}:${Math.random().toString(36).slice(2,8)}`; }

export const RiderRunOfflineQueue = {
  list: read,
  enqueue: async (action: Omit<OfflineRunAction, 'id' | 'createdAt'>) => {
    const items = await read();
    const row = { ...action, id: id(action.kind, action.runId, action.stopId), createdAt: new Date().toISOString() } as OfflineRunAction;
    await write([...items, row]);
    return row;
  },
  remove: async (actionId: string) => write((await read()).filter((row) => row.id !== actionId)),
  clearTrustedDropMarker: async (runId: string, stopId: string) => write((await read()).filter((row) => !(row.kind === 'TRUSTED_DROP_RESCAN_REQUIRED' && row.runId === runId && row.stopId === stopId))),
  flush: async () => {
    const items = await read();
    const remaining: OfflineRunAction[] = [];
    const conflicts: OfflineRunAction[] = [];
    for (const row of items) {
      if (row.kind === 'TRUSTED_DROP_RESCAN_REQUIRED') { remaining.push(row); continue; }
      try {
        if (row.kind === 'ARRIVE') await subscriptionOperationsService.arriveAtStop(row.runId, row.stopId, row.payload);
        if (row.kind === 'FAIL') await subscriptionOperationsService.failStop(row.runId, row.stopId, row.payload);
        if (row.kind === 'REORDER') await subscriptionOperationsService.reorderStop(row.runId, row.stopId, row.payload);
      } catch (error: any) {
        const status = Number(error?.response?.status || 0);
        if (status === 409 || status === 400 || status === 404) conflicts.push(row);
        else remaining.push(row);
      }
    }
    await write(remaining);
    return { replayed: items.length - remaining.length - conflicts.length, remaining, conflicts };
  },
};
