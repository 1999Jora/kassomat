import { useEffect, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import { useAppStore } from '../store/useAppStore';
import type { IncomingOrder } from '@kassomat/types';
import { printAuftragsbon } from '../components/OrderNotification';
import { playOrderChime } from '../lib/sounds';

// ── Fetch pending orders from API ─────────────────────────────────────────────

async function fetchPendingOrders(apiUrl: string): Promise<IncomingOrder[]> {
  try {
    const token = localStorage.getItem('kassomat_access_token');
    if (!token) return [];
    const res = await fetch(`${apiUrl}/orders?status=pending&pageSize=50`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return [];
    const json = await res.json() as { success: boolean; data: { items: IncomingOrder[] } };
    return json.data?.items ?? [];
  } catch {
    return [];
  }
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useRealtimeOrders() {
  const { addPendingOrder } = useAppStore();
  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    const token = localStorage.getItem('kassomat_access_token');
    if (!token) return;

    const apiUrl = (import.meta.env['VITE_API_URL'] ?? '') as string;
    // If API URL is relative (/api), Socket.IO must connect directly to Railway
    // because Vercel doesn't support WebSocket proxying
    const socketUrl = (import.meta.env['VITE_SOCKET_URL']
      ?? (apiUrl.startsWith('/') ? 'https://kassomat-production.up.railway.app' : apiUrl)) as string;
    const socket: Socket = io(socketUrl, {
      path: '/socket.io',
      auth: (cb) => cb({ token: localStorage.getItem('kassomat_access_token') }),
      transports: ['websocket', 'polling'],
      reconnectionDelay: 3000,
      reconnectionAttempts: 30,
    });

    socketRef.current = socket;

    socket.on('connect', () => {
      console.log('[Socket.IO] Verbunden:', socket.id);
      // Beim Verbinden alle offenen Bestellungen laden (falls während Offline etwas ankam)
      void fetchPendingOrders(apiUrl).then((orders) => {
        for (const order of orders) {
          addPendingOrder(order);
        }
        if (orders.length > 0) {
          console.log(`[Socket.IO] ${orders.length} offene Bestellung(en) geladen`);
        }
      });
    });

    socket.on('connect_error', (err) => {
      console.warn('[Socket.IO] Verbindungsfehler:', err.message);
    });

    socket.on('order:new', (order: IncomingOrder) => {
      addPendingOrder(order);
      playOrderChime();
      void printAuftragsbon(order);
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [addPendingOrder]);
}
