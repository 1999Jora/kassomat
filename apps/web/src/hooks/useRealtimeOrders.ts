import { useEffect, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import { useAppStore } from '../store/useAppStore';
import type { IncomingOrder } from '@kassomat/types';
import { formatCents } from '../lib/formatters';
import { jsPDF } from 'jspdf';

// ── Auto-download receipt as PDF ──────────────────────────────────────────────

function downloadOrderAsPDF(order: IncomingOrder): void {
  const doc = new jsPDF({ unit: 'mm', format: 'a5', orientation: 'portrait' });
  const W = doc.internal.pageSize.getWidth();
  const margin = 15;
  const col2 = W - margin;
  let y = 20;

  const source = order.source === 'lieferando' ? 'Lieferando' : 'Wix';
  const paid = order.paymentMethod === 'online_paid' ? 'Online bezahlt' : 'Barzahlung bei Lieferung';

  // Header
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.text(`${source} – Bestellung #${order.externalId}`, margin, y);
  y += 7;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(90, 90, 90);
  doc.text(`${new Date(order.receivedAt).toLocaleString('de-AT')}  ·  ${paid}`, margin, y);
  y += 5;

  if (order.customer) {
    doc.setTextColor(0, 0, 0);
    doc.setFont('helvetica', 'bold');
    doc.text(order.customer.name, margin, y);
    if (order.customer.phone) {
      doc.setFont('helvetica', 'normal');
      doc.text(`  ·  ${order.customer.phone}`, margin + doc.getTextWidth(order.customer.name), y);
    }
    y += 5;
  }

  if (order.deliveryAddress) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(60, 60, 60);
    doc.text(`${order.deliveryAddress.street}, ${order.deliveryAddress.zip} ${order.deliveryAddress.city}`, margin, y);
    y += 5;
  }

  // Divider
  y += 2;
  doc.setDrawColor(0);
  doc.line(margin, y, col2, y);
  y += 6;

  // Items
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(0, 0, 0);
  for (const item of order.items) {
    const label = `${item.quantity}×  ${item.name}`;
    const price = formatCents(item.totalPrice);
    doc.text(label, margin, y);
    doc.text(price, col2, y, { align: 'right' });
    y += 6;
  }

  // Total
  y += 1;
  doc.setDrawColor(0);
  doc.line(margin, y, col2, y);
  y += 6;
  doc.setFont('helvetica', 'bold');
  doc.text('GESAMT', margin, y);
  doc.text(formatCents(order.totalAmount), col2, y, { align: 'right' });

  // Notes
  if (order.notes) {
    y += 8;
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(9);
    doc.setTextColor(90, 90, 90);
    doc.text(`Notiz: ${order.notes}`, margin, y);
  }

  doc.save(`Bestellung_${order.externalId}.pdf`);
}

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

    const apiUrl = import.meta.env['VITE_API_URL'] ?? '';
    const socket: Socket = io(apiUrl, {
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
      downloadOrderAsPDF(order);
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [addPendingOrder]);
}
