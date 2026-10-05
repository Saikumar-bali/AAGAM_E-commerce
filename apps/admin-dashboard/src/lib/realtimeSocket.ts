import { io, ManagerOptions, Socket, SocketOptions } from 'socket.io-client';

export const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3005';

/**
 * The Socket.IO gateway is served at the API server's origin root namespace
 * (`/`), while REST routes live under `NEXT_PUBLIC_API_URL` (e.g.
 * `https://aagaam.in/api`). Passing the API URL straight to `io()` makes the
 * client treat `/api` as the namespace, so every handshake is rejected with
 * "Invalid namespace" and admin live tracking silently falls back to polling.
 * Strip a trailing `/api` (and any trailing slash) to reach the server root.
 */
export const REALTIME_SOCKET_URL = API_BASE_URL.replace(/\/api\/?$/, '').replace(/\/+$/, '') || '/';

// Socket.IO returns the Socket instance from disconnect()/close() for chaining.
// React effect cleanup functions, however, must return void. Expose the shared
// web socket through a narrowed lifecycle interface so callers cannot
// accidentally return the Socket object from an effect destructor.
export type RealtimeSocket = Omit<Socket, 'disconnect' | 'close'> & {
  disconnect(): void;
  close(): void;
};

export function createRealtimeSocket(
  options: Partial<ManagerOptions & SocketOptions> = {},
): RealtimeSocket {
  const isRelativeUrl = REALTIME_SOCKET_URL.startsWith('/');
  return io(REALTIME_SOCKET_URL, {
    withCredentials: true,
    transports: isRelativeUrl ? ['polling'] : ['websocket', 'polling'],
    ...options,
  }) as unknown as RealtimeSocket;
}
