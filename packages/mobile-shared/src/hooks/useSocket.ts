import { useEffect, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import { API_URL } from '@env';
import { useAuthStore } from '../store/authStore';

const SOCKET_URL = API_URL || 'https://aagam-api-production.up.railway.app';

export const useSocket = () => {
  const socketRef = useRef<Socket | null>(null);
  const token = useAuthStore((state) => state.token);

  useEffect(() => {
    if (!token) return;
    const socket = io(SOCKET_URL, {
      auth: { token },
      transports: ['websocket'],
    });
    socketRef.current = socket;
    return () => { socket.disconnect(); };
  }, [token]);

  const emit = (event: string, data: any) => {
    socketRef.current?.emit(event, data);
  };
  const on = (event: string, callback: (data: any) => void) => {
    socketRef.current?.on(event, callback);
  };
  const off = (event: string) => {
    socketRef.current?.off(event);
  };

  return { socket: socketRef.current, emit, on, off };
};
