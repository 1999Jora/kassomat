import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { useDeliveryStore } from '../store/useDeliveryStore';
import type { Delivery, DriverGpsEvent } from '@kassomat/types';
import { io } from 'socket.io-client';
import useAuthStore from '../store/useAuthStore';
import { useTheme } from '../context/ThemeContext';

function getMapTiles(theme: 'dark' | 'light') {
  const style = theme === 'light' ? 'light_all' : 'dark_all';
  return ['a', 'b', 'c'].map(s => `https://${s}.basemaps.cartocdn.com/${style}/{z}/{x}/{y}.png`);
}

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
  const navigate = useNavigate();
  const { theme } = useTheme();
  const [activeDriverTab, setActiveDriverTab] = useState<string>('all');
  const mapRef = useRef<maplibregl.Map | null>(null);
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const driverMarkersRef = useRef<Record<string, maplibregl.Marker>>({});
  // Refs to the time-label DOM elements so we can update them without re-render
  const driverTimeLabelRefs = useRef<Record<string, HTMLElement>>({});
  const geocodeCacheRef = useRef<Record<string, [number, number]>>({});
  const lastGeocodeRef = useRef<number>(0);
  const routeGeometriesRef = useRef<Record<string, any>>({});
  // Always-current snapshot for callbacks (avoids stale closures in map event handlers)
  const stateRef = useRef({ driverLocations, deliveries, drivers });
  useEffect(() => { stateRef.current = { driverLocations, deliveries, drivers }; });

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
            tiles: getMapTiles(theme),
            tileSize: 256,
          },
        },
        layers: [{ id: 'base', type: 'raster', source: 'osm' }],
      },
      center: [11.3928, 47.2682],
      zoom: 12,
    });
    mapRef.current = map;
    // Resize after mount so canvas gets correct dimensions
    map.once('load', () => map.resize());
    setTimeout(() => map.resize(), 100);
    // ResizeObserver for dynamic layout changes
    const ro = new ResizeObserver(() => map.resize());
    ro.observe(mapContainerRef.current);
    return () => { ro.disconnect(); map.remove(); mapRef.current = null; };
  }, []);

  // Tiles bei Theme-Wechsel aktualisieren
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const src = map.getSource('osm') as maplibregl.RasterTileSource | undefined;
    if (src) {
      map.setStyle({
        version: 8,
        sources: { osm: { type: 'raster', tiles: getMapTiles(theme), tileSize: 256 } },
        layers: [{ id: 'base', type: 'raster', source: 'osm' }],
      });
      // setStyle wipes all sources/layers — re-draw route lines after reload
      map.once('styledata', () => drawRouteLines(map));
    }
  }, [theme]);

  // Update driver markers on map
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    Object.entries(driverLocations).forEach(([driverId, loc]) => {
      const driver = drivers.find(d => d.id === driverId);
      if (!driver) return;

      if (driverMarkersRef.current[driverId]) {
        // Nur Position updaten
        driverMarkersRef.current[driverId]!.setLngLat([loc.lng, loc.lat]);
      } else {
        // Marker-Element mit Punkt + Name + Zeit
        const wrap = document.createElement('div');
        wrap.style.cssText = 'display:flex;flex-direction:column;align-items:center;gap:3px;cursor:default;';

        const dot = document.createElement('div');
        dot.style.cssText = `width:14px;height:14px;background:${driver.color};border:2px solid white;border-radius:50%;box-shadow:0 0 0 6px ${driver.color}44;flex-shrink:0;`;

        const label = document.createElement('div');
        label.style.cssText = `background:rgba(15,17,23,0.85);backdrop-filter:blur(6px);color:white;font-size:11px;font-weight:600;padding:2px 6px;border-radius:6px;white-space:nowrap;border:1px solid rgba(255,255,255,0.12);font-family:monospace;`;

        const timeEl = document.createElement('span');
        timeEl.style.cssText = `color:${driver.color};font-weight:400;margin-left:4px;`;
        timeEl.textContent = '0s';

        label.textContent = driver.name + ' ';
        label.appendChild(timeEl);

        wrap.appendChild(dot);
        wrap.appendChild(label);

        driverTimeLabelRefs.current[driverId] = timeEl;
        driverMarkersRef.current[driverId] = new maplibregl.Marker({ element: wrap, anchor: 'bottom' })
          .setLngLat([loc.lng, loc.lat])
          .addTo(map);
      }

      // Zeit-Label sofort aktualisieren
      const timeEl = driverTimeLabelRefs.current[driverId];
      if (timeEl) {
        const secs = Math.round((Date.now() - loc.updatedAt) / 1000);
        timeEl.textContent = `${secs}s`;
      }
    });
  }, [driverLocations, drivers]);

  // Sekunden-Ticker: alle 1s Zeit-Labels aktualisieren
  useEffect(() => {
    const id = setInterval(() => {
      Object.entries(driverLocations).forEach(([driverId, loc]) => {
        const timeEl = driverTimeLabelRefs.current[driverId];
        if (timeEl) {
          const secs = Math.round((Date.now() - loc.updatedAt) / 1000);
          timeEl.textContent = `${secs}s`;
        }
      });
    }, 1000);
    return () => clearInterval(id);
  }, [driverLocations]);

  // Geocode an address string (Nominatim, rate-limited, cached)
  async function geocodeAddr(addr: string): Promise<[number, number] | null> {
    if (geocodeCacheRef.current[addr]) return geocodeCacheRef.current[addr]!;
    const wait = Math.max(0, 1100 - (Date.now() - lastGeocodeRef.current));
    if (wait > 0) await new Promise(r => setTimeout(r, wait));
    lastGeocodeRef.current = Date.now();
    try {
      const res = await fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(addr)}&format=json&limit=1`, { headers: { 'User-Agent': 'Kassomat/1.0' } });
      const data = await res.json();
      if (data[0]) {
        const coord: [number, number] = [parseFloat(data[0].lon), parseFloat(data[0].lat)];
        geocodeCacheRef.current[addr] = coord;
        return coord;
      }
    } catch {}
    return null;
  }

  // Fetch OSRM road route for a list of coordinates
  async function getOsrmRoute(coords: [number, number][]): Promise<any | null> {
    if (coords.length < 2) return null;
    const coordStr = coords.map(([lng, lat]) => `${lng},${lat}`).join(';');
    try {
      const res = await fetch(`https://router.project-osrm.org/route/v1/driving/${coordStr}?geometries=geojson&overview=full`);
      const data = await res.json();
      return data.routes?.[0]?.geometry ?? null;
    } catch {}
    return null;
  }

  // Apply cached OSRM geometries as route lines on the map
  function drawRouteLines(map: maplibregl.Map) {
    if (!map.isStyleLoaded()) return;
    const { drivers: drvs } = stateRef.current;
    Object.entries(routeGeometriesRef.current).forEach(([driverId, geometry]) => {
      const driver = drvs.find(d => d.id === driverId);
      if (!driver || !geometry) return;
      const sourceId = `route-${driverId}`;
      const layerId = `route-line-${driverId}`;
      if (map.getSource(sourceId)) {
        (map.getSource(sourceId) as maplibregl.GeoJSONSource).setData(geometry);
      } else {
        map.addSource(sourceId, { type: 'geojson', data: geometry });
        map.addLayer({ id: layerId, type: 'line', source: sourceId, layout: { 'line-join': 'round', 'line-cap': 'round' }, paint: { 'line-color': driver.color, 'line-width': 3, 'line-opacity': 0.85 } });
      }
    });
  }

  // Geocode addresses → nearest-neighbor sort stops → fetch OSRM route per driver
  useEffect(() => {
    let cancelled = false;
    async function update() {
      const map = mapRef.current;
      if (!map) return;

      // 1. Geocode any uncached addresses
      const addrs = new Set<string>();
      deliveries.filter(d => d.status !== 'delivered' && d.status !== 'cancelled').forEach(delivery => {
        const order = delivery.order as any;
        const addr = [order?.deliveryStreet ?? '', order?.deliveryCity ?? ''].filter(Boolean).join(', ');
        if (addr && !geocodeCacheRef.current[addr]) addrs.add(addr);
      });
      for (const addr of addrs) {
        if (cancelled) return;
        await geocodeAddr(addr);
      }
      if (cancelled) return;

      // 2. For each driver with a GPS location, fetch OSRM road route
      for (const [driverId, loc] of Object.entries(driverLocations)) {
        if (cancelled) return;
        const driverDels = deliveries.filter(d => d.driverId === driverId && d.status !== 'delivered' && d.status !== 'cancelled');
        const stopCoords: [number, number][] = [];
        for (const delivery of driverDels) {
          const order = delivery.order as any;
          const addr = [order?.deliveryStreet ?? '', order?.deliveryCity ?? ''].filter(Boolean).join(', ');
          const coord = geocodeCacheRef.current[addr];
          if (coord) stopCoords.push(coord);
        }
        if (stopCoords.length === 0) continue;

        // Nearest-neighbor sort stops from driver position
        const sorted: [number, number][] = [];
        const remaining = [...stopCoords];
        let cur: [number, number] = [loc.lng, loc.lat];
        while (remaining.length > 0) {
          let nearestIdx = 0;
          let nearestDist = Infinity;
          remaining.forEach((c, i) => {
            const d = (c[0] - cur[0]) ** 2 + (c[1] - cur[1]) ** 2;
            if (d < nearestDist) { nearestDist = d; nearestIdx = i; }
          });
          sorted.push(remaining[nearestIdx]!);
          cur = remaining[nearestIdx]!;
          remaining.splice(nearestIdx, 1);
        }

        const geometry = await getOsrmRoute([[loc.lng, loc.lat], ...sorted]);
        if (geometry) routeGeometriesRef.current[driverId] = geometry;
      }

      if (cancelled || !mapRef.current?.isStyleLoaded()) return;
      drawRouteLines(mapRef.current);
    }
    void update();
    return () => { cancelled = true; };
  }, [driverLocations, deliveries, drivers]);

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
    <div className="h-screen bg-[#080a0c] flex overflow-hidden">
      {/* Left panel */}
      <div className="w-full max-w-md flex flex-col border-r border-white/[0.06] overflow-hidden">
        {/* Header */}
        <div className="p-4 border-b border-white/[0.06] flex items-center gap-3">
          <button
            onClick={() => navigate('/')}
            className="w-8 h-8 rounded-lg bg-white/5 hover:bg-white/10 flex items-center justify-center border border-white/[0.06] shrink-0"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M3 12L12 3l9 9"/><path d="M9 21V12h6v9"/>
            </svg>
          </button>
          <div>
            <h1 className="text-white font-bold text-lg leading-tight">Dispatcher</h1>
            <p className="text-white/40 text-xs">{activeDeliveries.length} aktive Aufträge</p>
          </div>
        </div>

        {/* Driver tabs */}
        <div className="flex gap-2 p-3 border-b border-white/[0.06] overflow-x-auto">
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
        <div className="flex-1 overflow-y-auto scrollbar-none p-3 space-y-2">
          {filtered.length === 0 && (
            <p className="text-white/30 text-sm text-center mt-8">Keine Aufträge</p>
          )}
          {filtered.map(delivery => {
            const order = delivery.order as any;
            const assignedDriver = drivers.find(d => d.id === delivery.driverId);
            return (
              <div key={delivery.id} className="bg-[#0e1115] rounded-xl p-3 border border-white/5">
                <div className="flex items-start justify-between mb-2">
                  <div className="flex-1 min-w-0">
                    <p className="text-white font-medium text-sm truncate">{order?.customerName ?? 'Unbekannt'}</p>
                    <p className="text-white/50 text-xs truncate">{order?.deliveryStreet}, {order?.deliveryCity}</p>
                  </div>
                  <div className="flex items-center gap-1.5 ml-2 shrink-0">
                    {/* Assigned driver badge */}
                    {assignedDriver ? (
                      <span className="text-xs px-2 py-0.5 rounded-full flex items-center gap-1"
                        style={{ backgroundColor: assignedDriver.color + '22', color: assignedDriver.color, border: `1px solid ${assignedDriver.color}44` }}>
                        <span className="w-1.5 h-1.5 rounded-full inline-block" style={{ backgroundColor: assignedDriver.color }} />
                        {assignedDriver.name}
                      </span>
                    ) : (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-white/5 text-white/30 border border-white/[0.06]">Offen</span>
                    )}
                    <span className="text-xs px-2 py-0.5 rounded-full"
                      style={{ backgroundColor: STATUS_COLOR[delivery.status] + '33', color: STATUS_COLOR[delivery.status] }}>
                      {STATUS_LABEL[delivery.status]}
                    </span>
                  </div>
                </div>
                {/* Phone */}
                {order?.customerPhone && (
                  <p className="text-white/40 text-xs mb-2">Tel: {order.customerPhone}</p>
                )}
                {/* Assign / Reassign — show all active drivers */}
                {delivery.status !== 'delivered' && (
                  <div className="flex gap-2 mt-2 flex-wrap">
                    {drivers.filter(d => d.isActive).map(d => (
                      <button
                        key={d.id}
                        onClick={() => reassign(delivery.id, d.id)}
                        className="text-xs px-2 py-1 rounded-lg"
                        style={{ backgroundColor: d.color + '22', color: d.color, border: `1px solid ${d.color}44`,
                          opacity: d.id === delivery.driverId ? 0.4 : 1 }}
                      >
                        {d.id === delivery.driverId ? '✓' : '→'} {d.name}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Stats footer */}
        <div className="p-3 border-t border-white/[0.06] flex gap-2">
          {drivers.filter(d => d.isActive).map(driver => {
            const dDeliveries = deliveries.filter(d2 => d2.driverId === driver.id);
            const done = dDeliveries.filter(d2 => d2.status === 'delivered').length;
            const active = dDeliveries.filter(d2 => d2.status !== 'delivered' && d2.status !== 'cancelled').length;
            return (
              <div key={driver.id} className="flex-1 rounded-lg p-2 text-center" style={{ backgroundColor: driver.color + '11' }}>
                <p className="text-xs font-medium" style={{ color: driver.color }}>{driver.name}</p>
                <p className="text-white text-sm font-bold">{active} offen</p>
                <p className="text-white/30 text-xs">{done} erledigt</p>
              </div>
            );
          })}
        </div>
      </div>

      {/* Map (hidden on mobile, shown on tablet+) */}
      <div className="hidden md:flex flex-1">
        <div ref={mapContainerRef} style={{ width: '100%', height: '100%' }} />
      </div>
    </div>
  );
}
