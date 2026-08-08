import fs from 'fs';
import path from 'path';

const root = path.resolve(__dirname, '../../..');
const realtimeSocket = fs.readFileSync(
  path.join(root, 'apps/admin-dashboard/src/lib/realtimeSocket.ts'),
  'utf8',
);

describe('dashboard realtime socket cleanup contract', () => {
  it('exposes disconnect and close as void-returning lifecycle methods', () => {
    expect(realtimeSocket).toContain("Omit<Socket, 'disconnect' | 'close'>");
    expect(realtimeSocket).toContain('disconnect(): void');
    expect(realtimeSocket).toContain('close(): void');
    expect(realtimeSocket).toContain('): RealtimeSocket');
  });

  it('keeps cookie credentials enabled for realtime authentication', () => {
    expect(realtimeSocket).toContain('withCredentials: true');
  });
});
