import { Server } from 'socket.io';
import type { IncomingOrder } from '@kassomat/types';

export class RealtimeService {
  private io: Server;

  constructor(io: Server) {
    this.io = io;
  }

  /**
   * Emit an arbitrary event to all sockets in a tenant's room.
   */
  emitToTenant(tenantId: string, event: string, data: unknown): void {
    this.io.to(`tenant_${tenantId}`).emit(event, data);
  }

  /**
   * Emit a new incoming order event to the tenant's room.
   * Clients can listen for "order:new" to show a notification/sound.
   */
  emitNewOrder(tenantId: string, order: unknown): void {
    this.emitToTenant(tenantId, 'order:new', order);
  }

  /**
   * Emit a receipt-signed event to the tenant's room.
   * Clients listen for "receipt:signed" to display the finalized receipt.
   */
  emitReceiptSigned(tenantId: string, receipt: unknown): void {
    this.emitToTenant(tenantId, 'receipt:signed', receipt);
  }

  /**
   * Emit an order-status-update event to the tenant's room.
   * Clients listen for "order:updated" to refresh their order list.
   */
  emitOrderUpdate(tenantId: string, order: unknown): void {
    this.emitToTenant(tenantId, 'order:updated', order);
  }

  /**
   * Emit a delivery update event to the tenant's room.
   * Clients listen for "delivery:update" to refresh delivery state.
   */
  emitDeliveryUpdate(tenantId: string, delivery: unknown): void {
    this.emitToTenant(tenantId, 'delivery:update', delivery);
  }

  /**
   * Emit a driver GPS position update to the tenant's room.
   * Clients listen for "driver:gps" to update map markers.
   */
  emitDriverGps(tenantId: string, data: { driverId: string; lat: number; lng: number; heading?: number; speed?: number }): void {
    this.emitToTenant(tenantId, 'driver:gps', data);
  }
}
