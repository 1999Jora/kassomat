import { create } from 'zustand';
import type { Delivery, Driver, DriverGpsEvent } from '@kassomat/types';

interface DriverLocation {
  driverId: string;
  lat: number;
  lng: number;
  heading?: number;
  speed?: number;
  updatedAt: number;
}

interface DeliveryStore {
  deliveries: Delivery[];
  drivers: Driver[];
  driverLocations: Record<string, DriverLocation>;
  activeDriverId: string | null; // currently logged-in driver

  setDeliveries: (d: Delivery[]) => void;
  upsertDelivery: (d: Delivery) => void;
  setDrivers: (d: Driver[]) => void;
  updateDriverLocation: (ev: DriverGpsEvent) => void;
  setActiveDriverId: (id: string | null) => void;
}

export const useDeliveryStore = create<DeliveryStore>((set) => ({
  deliveries: [],
  drivers: [],
  driverLocations: {},
  activeDriverId: null,

  setDeliveries: (deliveries) => set({ deliveries }),
  upsertDelivery: (delivery) =>
    set((s) => {
      const idx = s.deliveries.findIndex((d) => d.id === delivery.id);
      if (idx >= 0) {
        const updated = [...s.deliveries];
        updated[idx] = delivery;
        return { deliveries: updated };
      }
      return { deliveries: [delivery, ...s.deliveries] };
    }),
  setDrivers: (drivers) => set({ drivers }),
  updateDriverLocation: (ev) =>
    set((s) => ({
      driverLocations: {
        ...s.driverLocations,
        [ev.driverId]: { ...ev, updatedAt: Date.now() },
      },
    })),
  setActiveDriverId: (id) => set({ activeDriverId: id }),
}));
