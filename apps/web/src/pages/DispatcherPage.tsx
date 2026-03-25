import { useEffect, useRef, useState } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { useDeliveryStore } from '../store/useDeliveryStore';
import type { Delivery, DriverGpsEvent } from '@kassomat/types';
import { io } from 'socket.io-client';
import useAuthStore from '../store/useAuthStore';

const API = import.meta.env.VITE_API_URL as string;
const SOCKET_URL = (import.meta.env.VITE_SOCKET_URL ?? API) as string;

const STATUS_LABEL: Record<string, string> = {
  pending: 'Ausstehend',
  picked_up: 'Abgeholt',
  en_route: 'Unterwegs',
  delivered: 'Erledigt',
  cancelled: 'Abgebrochen',
};

const STATUS_COLOR: Record<string, string> = {
  pending: '#f97316',
  picked_up: '#4f8ef7',
  en_route: '#4f8ef7',
  delivered: '#2dd4a0',
  cancelled: '#6b7280',
};

export default function DispatcherPage() {
  const { deliveries, drivers, driverLocations, setDeliveries, setDrivers, upsertDelivery, updateDriverLocation } = useDeliveryStore();
  const { token } = useAuthStore();
  const [activeDriverTab, setActiveDriverTab] = useState<string>('all');
  const mapRef = useRef<maplibregl.Map | null>(null);
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const driverMarkersRef = useRef<Record<string, maplibregl.Marker>>({});

  // Load data
  useEffect(() => {
    if (!token) return;
    const headers = { Authorization: `Bearer ${token}` };
    Promise.all([
      fetch(`${API}/drivers`, { headers }).then(r => r.json()),
      fetch(`${API}/deliveries`, { headers }).then(r => r.json()),
    ]).then(([d, del]) => {
      setDrivers(Array.isArray(d) ? d : []);
      setDeliveries(Array.isArray(del) ? del : []);
    }).catch(() => {});

    // Socket
    const socket = io(SOCKET_URL, { auth: { token }, transports: ['websocket'] });
    socket.on('delivery:update', (d: Delivery) => upsertDelivery(d));
    socket.on('driver:gps', (ev: DriverGpsEvent) => updateDriverLocation(ev));

    return () => { socket.disconnect(); };
  }, [token, setDeliveries, setDrivers, upsertDelivery, updateDriverLocation]);

  // Init map
  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;
    const map = new maplibregl.Map({
      container: mapContainerRef.current,
      style: {
        version: 8,
        sources: {
          osm: {
            type: 'raster',
            tiles: [
              'https://a.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png',
              'https://b.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png',
              'https://c.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png',
            ],
            tileSize: 256,
          },
        },
        layers: [{ id: 'base', type: 'raster', source: 'osm' }],
      },
      center: [11.3928, 47.2682],
      zoom: 12,
    });
    mapRef.current = map;
    return () => { map.remove(); mapRef.current = null; };
  }, []);

  // Update driver markers on map
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    Object.entries(driverLocations).forEach(([driverId, loc]) => {
      const driver = drivers.find(d => d.id === driverId);
      if (!driver) return;
      if (driverMarkersRef.current[driverId]) {
        driverMarkersRef.current[driverId]!.setLngLat([loc.lng, loc.lat]);
      } else {
        const el = document.createElement('div');
        el.style.cssText = `width:14px;height:14px;background:${driver.color};border:2px solid white;border-radius:50%;box-shadow:0 0 0 6px ${driver.color}44;`;
        driverMarkersRef.current[driverId] = new maplibregl.Marker({ element: el })
          .setLngLat([loc.lng, loc.lat])
          .addTo(map);
      }
    });
  }, [driverLocations, drivers]);

  // Reassign delivery
  async function reassign(deliveryId: string, driverId: string) {
    if (!token) return;
    await fetch(`${API}/deliveries/${deliveryId}/assign`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ driverId }),
    });
  }

  const activeDeliveries = deliveries.filter(d => d.status !== 'delivered' && d.status !== 'cancelled');
  const filtered = activeDriverTab === 'all'
    ? activeDeliveries
    : activeDeliveries.filter(d => d.driverId === activeDriverTab);

  const getDriverDeliveries = (driverId: string) => activeDeliveries.filter(d => d.driverId === driverId);

  return (
    <div className="h-screen bg-[#0f1117] flex overflow-hidden">
      {/* Left panel */}
      <div className="w-full max-w-md flex flex-col border-r border-white/8 overflow-hidden">
        {/* Header */}
        <div className="p-4 border-b border-white/8">
          <h1 className="text-white font-bold text-lg">Dispatcher</h1>
          <p className="text-white/40 text-sm">{activeDeliveries.length} aktive Aufträge</p>
        </div>

        {/* Driver tabs */}
        <div className="flex gap-2 p-3 border-b border-white/8 overflow-x-auto">
          <button
            onClick={() => setActiveDriverTab('all')}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium whitespace-nowrap ${activeDriverTab === 'all' ? 'bg-white/10 text-white' : 'text-white/40 hover:text-white'}`}
          >
            Alle ({activeDeliveries.length})
          </button>
          {drivers.filter(d => d.isActive).map(driver => {
            const count = getDriverDeliveries(driver.id).length;
            const isOnline = !!driverLocations[driver.id] && Date.now() - driverLocations[driver.id]!.updatedAt < 30000;
            return (
              <button
                key={driver.id}
                onClick={() => setActiveDriverTab(driver.id)}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium whitespace-nowrap flex items-center gap-2 ${activeDriverTab === driver.id ? 'text-white' : 'text-white/40 hover:text-white'}`}
                style={activeDriverTab === driver.id ? { backgroundColor: driver.color + '33', border: `1px solid ${driver.color}66` } : {}}
              >
                <span className={`w-2 h-2 rounded-full ${isOnline ? 'bg-emerald-400' : 'bg-white/20'}`} />
                {driver.name} ({count})
                {count > 6 && <span className="text-yellow-400 text-xs">!</span>}
              </button>
            );
          })}
        </div>

        {/* Deliveries list */}
        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          {filtered.length === 0 && (
            <p className="text-white/30 text-sm text-center mt-8">Keine Aufträge</p>
          )}
          {filtered.map(delivery => {
            const order = delivery.order as any;
            return (
              <div key={delivery.id} className="bg-[#181c27] rounded-xl p-3 border border-white/5">
                <div className="flex items-start justify-between mb-2">
                  <div className="flex-1 min-w-0">
                    <p className="text-white font-medium text-sm truncate">{order?.customerName ?? 'Unbekannt'}</p>
                    <p className="text-white/50 text-xs truncate">{order?.deliveryStreet}, {order?.deliveryCity}</p>
                  </div>
                  <span className="text-xs px-2 py-0.5 rounded-full ml-2 shrink-0"
                    style={{ backgroundColor: STATUS_COLOR[delivery.status] + '33', color: STATUS_COLOR[delivery.status] }}>
                    {STATUS_LABEL[delivery.status]}
                  </span>
                </div>
                {/* Phone */}
                {order?.customerPhone && (
                  <p className="text-white/40 text-xs mb-2">Tel: {order.customerPhone}</p>
                )}
                {/* Reassign */}
                {delivery.status !== 'delivered' && (
                  <div className="flex gap-2 mt-2 flex-wrap">
                    {drivers.filter(d => d.isActive && d.id !== delivery.driverId).map(d => (
                      <button
                        key={d.id}
                        onClick={() => reassign(delivery.id, d.id)}
                        className="text-xs px-2 py-1 rounded-lg"
                        style={{ backgroundColor: d.color + '22', color: d.color, border: `1px solid ${d.color}44` }}
                      >
                        → {d.name}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Stats footer */}
        <div className="p-3 border-t border-white/8 grid grid-cols-3 gap-2">
          {drivers.filter(d => d.isActive).map(driver => {
            const dDeliveries = deliveries.filter(d2 => d2.driverId === driver.id);
            const done = dDeliveries.filter(d2 => d2.status === 'delivered').length;
            const active = dDeliveries.filter(d2 => d2.status !== 'delivered' && d2.status !== 'cancelled').length;
            return (
              <div key={driver.id} className="rounded-lg p-2 text-center" style={{ backgroundColor: driver.color + '11' }}>
                <p className="text-xs font-medium" style={{ color: driver.color }}>{driver.name}</p>
                <p className="text-white text-sm font-bold">{active} offen</p>
                <p className="text-white/30 text-xs">{done} erledigt</p>
              </div>
            );
          })}
        </div>
      </div>

      {/* Map (hidden on mobile, shown on tablet+) */}
      <div ref={mapContainerRef} className="hidden md:flex flex-1" />
    </div>
  );
}
