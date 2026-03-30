import { useEffect, useRef, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTheme } from '../context/ThemeContext';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { useDeliveryStore } from '../store/useDeliveryStore';
import DriverPINGate from '../components/DriverPINGate';
import type { Driver, Delivery } from '@kassomat/types';
import { io, Socket } from 'socket.io-client';

const API = import.meta.env.VITE_API_URL as string;
// If API URL is relative (/api), Socket.IO must connect directly to Railway
const SOCKET_URL = (import.meta.env.VITE_SOCKET_URL
  ?? (API.startsWith('/') ? 'https://kassomat-production.up.railway.app' : API)) as string;
const DRIVER_COLOR = '#4f8ef7';

// OSRM routing
async function getRoute(coords: [number, number][]): Promise<{ geometry: any; steps: any[]; distance: number; duration: number } | null> {
  if (coords.length < 2) return null;
  const coordStr = coords.map(([lng, lat]) => `${lng},${lat}`).join(';');
  try {
    const res = await fetch(`https://router.project-osrm.org/route/v1/driving/${coordStr}?steps=true&geometries=geojson&overview=full`);
    const data = await res.json();
    if (data.routes?.[0]) {
      return {
        geometry: data.routes[0].geometry,
        steps: data.routes[0].legs.flatMap((l: any) => l.steps),
        distance: data.routes[0].distance,
        duration: data.routes[0].duration,
      };
    }
  } catch {}
  return null;
}

// Geocode address
async function geocode(address: string): Promise<[number, number] | null> {
  try {
    const res = await fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(address)}&format=json&limit=1`, {
      headers: { 'User-Agent': 'Kassomat/1.0' },
    });
    const data = await res.json();
    if (data[0]) return [parseFloat(data[0].lon), parseFloat(data[0].lat)];
  } catch {}
  return null;
}

function getArrowIcon(modifier: string): string {
  if (modifier.includes('left')) return '←';
  if (modifier.includes('right')) return '→';
  if (modifier.includes('uturn')) return '↩';
  return '↑';
}

function TenantCodeScreen({ onTenantId }: { onTenantId: (id: string) => void }) {
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!code.trim()) return;
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`${API}/tenant/lookup/${encodeURIComponent(code.trim().toLowerCase())}`);
      if (!res.ok) { setError('Betrieb nicht gefunden'); setLoading(false); return; }
      const data = await res.json();
      localStorage.setItem('kassomat_driver_tenant', data.data.id);
      onTenantId(data.data.id);
    } catch {
      setError('Verbindungsfehler');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6" style={{ background: '#080a0c' }}>
      <div className="w-full max-w-xs flex flex-col items-center">
        <p className="text-white/40 text-xs tracking-widest uppercase mb-2">Fahrer-Login</p>
        <h2 className="text-white font-bold text-2xl mb-2">Betriebscode</h2>
        <p className="text-white/40 text-sm mb-8 text-center">Frag deinen Chef nach dem Betriebscode</p>
        <form onSubmit={handleSubmit} className="w-full space-y-4">
          <input
            type="text"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="z.B. mein-betrieb"
            autoFocus
            className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white text-center text-lg font-medium placeholder-white/20 focus:outline-none focus:border-[#4f8ef7]/50 focus:ring-1 focus:ring-[#4f8ef7]/30 transition-colors"
          />
          {error && <p className="text-red-400 text-sm text-center">{error}</p>}
          <button
            type="submit"
            disabled={loading || !code.trim()}
            className="w-full py-3 rounded-xl font-semibold text-sm transition-all bg-[#4f8ef7] text-white hover:bg-[#4f8ef7]/90 disabled:opacity-50"
          >
            {loading ? 'Wird gesucht...' : 'Weiter'}
          </button>
        </form>
      </div>
    </div>
  );
}

export default function DriverNavPage() {
  const { drivers, setActiveDriverId } = useDeliveryStore();
  const [loadingDrivers, setLoadingDrivers] = useState(true);
  const [tenantReady, setTenantReady] = useState(false);
  const [activeDriver, setActiveDriver] = useState<Driver | null>(null);
  const [myDeliveries, setMyDeliveries] = useState<Delivery[]>([]);
  const [sortedDeliveries, setSortedDeliveries] = useState<Delivery[]>([]);
  const [currentStopIdx, setCurrentStopIdx] = useState(0);
  const [routeSteps, setRouteSteps] = useState<any[]>([]);
  const [currentStepIdx] = useState(0);
  const [totalDistance, setTotalDistance] = useState(0);
  const [currentSpeed, setCurrentSpeed] = useState(0);
  const [is3D, setIs3D] = useState(true);
  const [pickedUp, setPickedUp] = useState(false);
  const [position, setPosition] = useState<GeolocationPosition | null>(null);
  const navigate = useNavigate();
  const { theme } = useTheme();

  const mapRef = useRef<maplibregl.Map | null>(null);
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const markerRef = useRef<maplibregl.Marker | null>(null);
  const socketRef = useRef<Socket | null>(null);
  const watchIdRef = useRef<number | null>(null);
  const lastGeocode = useRef<number>(0);

  // Check if we have a tenantId already
  useEffect(() => {
    const token = localStorage.getItem('kassomat_access_token');
    const userRaw = localStorage.getItem('kassomat_user');
    const savedTenant = localStorage.getItem('kassomat_driver_tenant');
    const userTenant = userRaw ? (JSON.parse(userRaw) as { tenantId: string }).tenantId : null;

    if (token || savedTenant || userTenant) {
      setTenantReady(true);
    } else {
      setLoadingDrivers(false);
    }
  }, []);

  // Load drivers once tenantReady
  useEffect(() => {
    if (!tenantReady) return;

    const token = localStorage.getItem('kassomat_access_token');
    const userRaw = localStorage.getItem('kassomat_user');
    const tenantId = localStorage.getItem('kassomat_driver_tenant')
      ?? (userRaw ? (JSON.parse(userRaw) as { tenantId: string }).tenantId : null);

    const url = token
      ? `${API}/drivers`
      : tenantId
        ? `${API}/drivers?tenantId=${tenantId}`
        : null;

    if (!url) { setLoadingDrivers(false); return; }

    fetch(url, token ? { headers: { Authorization: `Bearer ${token}` } } : {})
      .then(r => r.json())
      .then(data => { useDeliveryStore.getState().setDrivers(Array.isArray(data) ? data : []); })
      .catch(() => {})
      .finally(() => setLoadingDrivers(false));
  }, [tenantReady]);

  // On driver login
  const handleDriverLogin = useCallback(async (driver: Driver) => {
    setActiveDriver(driver);
    setActiveDriverId(driver.id);

    // PIN from localStorage (saved by DriverPINGate on successful verify)
    const driverPin = localStorage.getItem('kassomat_driver_pin') ?? '';

    // Load driver's deliveries (requires x-driver-pin header)
    const res = await fetch(`${API}/deliveries/driver/${driver.id}`, {
      headers: { 'x-driver-pin': driverPin },
    });
    const data = await res.json();
    const myD = Array.isArray(data) ? data : [];
    setMyDeliveries(myD);

    // tenantId from driver session or admin login
    const userRaw = localStorage.getItem('kassomat_user');
    const tenantId: string = localStorage.getItem('kassomat_driver_tenant')
      ?? (userRaw ? (JSON.parse(userRaw) as { tenantId: string }).tenantId : '');

    // Connect socket — auth via driverPin + driverId (server verifies and joins tenant room)
    const socket = io(SOCKET_URL, {
      transports: ['websocket', 'polling'],
      auth: { driverId: driver.id, driverPin },
    });
    socketRef.current = socket;
    socket.on('delivery:update', (d: Delivery) => {
      if (d.driverId === driver.id) {
        setMyDeliveries(prev => {
          const idx = prev.findIndex(x => x.id === d.id);
          if (idx >= 0) { const u = [...prev]; u[idx] = d; return u; }
          return [...prev, d];
        });
      }
    });

    // GPS watching
    if (navigator.geolocation) {
      watchIdRef.current = navigator.geolocation.watchPosition(
        (pos) => {
          setPosition(pos);
          setCurrentSpeed(pos.coords.speed ? pos.coords.speed * 3.6 : 0);
          // Emit GPS to server — tenantId mitsenden damit Relay zum richtigen Raum geht
          socket.emit('driver:gps', {
            driverId: driver.id,
            tenantId,
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
            heading: pos.coords.heading ?? undefined,
            speed: pos.coords.speed ?? undefined,
          });
          // Move marker
          if (markerRef.current) {
            markerRef.current.setLngLat([pos.coords.longitude, pos.coords.latitude]);
          }
          // Follow on map
          if (mapRef.current) {
            mapRef.current.easeTo({
              center: [pos.coords.longitude, pos.coords.latitude],
              bearing: pos.coords.heading ?? 0,
            });
          }
        },
        () => {},
        { enableHighAccuracy: true, maximumAge: 0 }
      );
    }
  }, [setActiveDriverId]);

  // Init map
  useEffect(() => {
    if (!activeDriver || !mapContainerRef.current || mapRef.current) return;

    const map = new maplibregl.Map({
      container: mapContainerRef.current,
      style: {
        version: 8,
        sources: {
          osm: {
            type: 'raster',
            tiles: ['a','b','c'].map(s => `https://${s}.basemaps.cartocdn.com/${theme === 'light' ? 'light_all' : 'dark_all'}/{z}/{x}/{y}.png`),
            tileSize: 256,
            attribution: '© OpenStreetMap contributors © CARTO',
          },
        },
        layers: [{ id: 'base', type: 'raster', source: 'osm' }],
      },
      center: [11.3928, 47.2682], // Innsbruck
      zoom: 14,
      pitch: is3D ? 60 : 0,
    });

    mapRef.current = map;

    // GPS marker
    const el = document.createElement('div');
    el.style.cssText = `width:16px;height:16px;background:${DRIVER_COLOR};border:3px solid white;border-radius:50%;box-shadow:0 0 0 8px ${DRIVER_COLOR}33;`;
    markerRef.current = new maplibregl.Marker({ element: el })
      .setLngLat([11.3928, 47.2682])
      .addTo(map);

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, [activeDriver]);

  // Calculate route when deliveries change and picked up
  useEffect(() => {
    if (!pickedUp || myDeliveries.length === 0 || !position) return;

    async function calcRoute() {
      const activeDeliveries = myDeliveries.filter(d => d.status !== 'delivered' && d.status !== 'cancelled');
      if (activeDeliveries.length === 0) return;

      const startCoord: [number, number] = [position!.coords.longitude, position!.coords.latitude];

      // Geocode all addresses
      const geocoded: { delivery: Delivery; coord: [number, number] }[] = [];
      for (const delivery of activeDeliveries) {
        const order = delivery.order as any;
        const addr = `${order?.deliveryAddress?.street ?? order?.deliveryStreet ?? ''}, ${order?.deliveryAddress?.zip ?? order?.deliveryZip ?? ''} ${order?.deliveryAddress?.city ?? order?.deliveryCity ?? ''}`;
        const now = Date.now();
        if (now - lastGeocode.current < 1100) await new Promise(r => setTimeout(r, 1100 - (now - lastGeocode.current)));
        lastGeocode.current = Date.now();
        const coord = await geocode(addr);
        if (coord) geocoded.push({ delivery, coord });
      }

      if (geocoded.length === 0) return;

      // Nearest-neighbor sort: always go to closest remaining stop first
      const sorted: typeof geocoded = [];
      const remaining = [...geocoded];
      let cur: [number, number] = startCoord;
      while (remaining.length > 0) {
        let nearestIdx = 0;
        let nearestDist = Infinity;
        remaining.forEach((s, i) => {
          const d = (s.coord[0] - cur[0]) ** 2 + (s.coord[1] - cur[1]) ** 2;
          if (d < nearestDist) { nearestDist = d; nearestIdx = i; }
        });
        sorted.push(remaining[nearestIdx]!);
        cur = remaining[nearestIdx]!.coord;
        remaining.splice(nearestIdx, 1);
      }

      setSortedDeliveries(sorted.map(s => s.delivery));
      const coords: [number, number][] = [startCoord, ...sorted.map(s => s.coord)];

      const route = await getRoute(coords);
      if (!route || !mapRef.current) return;

      setRouteSteps(route.steps);
      setTotalDistance(route.distance);

      const map = mapRef.current;
      if (map.getSource('route')) {
        (map.getSource('route') as maplibregl.GeoJSONSource).setData(route.geometry);
      } else {
        map.addSource('route', { type: 'geojson', data: route.geometry });
        map.addLayer({
          id: 'route-line',
          type: 'line',
          source: 'route',
          layout: { 'line-join': 'round', 'line-cap': 'round' },
          paint: { 'line-color': DRIVER_COLOR, 'line-width': 4, 'line-opacity': 0.85 },
        });
      }

      // Add stop markers in optimized order
      sorted.forEach((s, i) => {
        const el = document.createElement('div');
        el.style.cssText = `width:28px;height:28px;background:${DRIVER_COLOR};border:2px solid white;border-radius:50%;display:flex;align-items:center;justify-content:center;color:white;font-weight:bold;font-size:12px;`;
        el.textContent = String(i + 1);
        new maplibregl.Marker({ element: el }).setLngLat(s.coord).addTo(map);
      });
    }

    void calcRoute();
  }, [pickedUp, myDeliveries, position]);

  // Confirm pickup — mark ALL active deliveries as picked_up (driver collects all orders at once)
  async function handlePickup() {
    const activeDeliveries = myDeliveries.filter(d => d.status !== 'delivered' && d.status !== 'cancelled');
    if (activeDeliveries.length === 0) return;
    await Promise.all(activeDeliveries.map(d =>
      fetch(`${API}/deliveries/${d.id}/pickup`, { method: 'POST' })
    ));
    setPickedUp(true);
  }

  // Mark stop as delivered
  async function handleDelivered() {
    const active = myDeliveries.filter(d => d.status !== 'delivered' && d.status !== 'cancelled');
    const ordered = sortedDeliveries.length > 0 ? sortedDeliveries.filter(d => d.status !== 'delivered' && d.status !== 'cancelled') : active;
    const delivery = ordered[currentStopIdx];
    if (!delivery) return;
    await fetch(`${API}/deliveries/${delivery.id}/delivered`, { method: 'POST' });
    setCurrentStopIdx(prev => prev + 1);
  }

  // Toggle 3D
  function toggle3D() {
    setIs3D(v => {
      mapRef.current?.easeTo({ pitch: v ? 0 : 60 });
      return !v;
    });
  }

  // Center on position
  function centerOnMe() {
    if (position && mapRef.current) {
      mapRef.current.easeTo({ center: [position.coords.longitude, position.coords.latitude], zoom: 16 });
    }
  }

  // Cleanup
  useEffect(() => {
    return () => {
      if (watchIdRef.current) navigator.geolocation.clearWatch(watchIdRef.current);
      socketRef.current?.disconnect();
    };
  }, []);

  if (loadingDrivers) {
    return <div className="min-h-screen bg-[#080a0c] flex items-center justify-center text-white/50">Laden...</div>;
  }

  // No tenantId known → show tenant code entry
  if (!tenantReady) {
    return <TenantCodeScreen onTenantId={() => { setTenantReady(true); }} />;
  }

  if (!activeDriver) {
    return <DriverPINGate drivers={drivers} onSuccess={handleDriverLogin} />;
  }

  const activeDeliveries = myDeliveries.filter(d => d.status !== 'delivered' && d.status !== 'cancelled');
  // Use optimized order if available, otherwise fall back to original order
  const orderedDeliveries = sortedDeliveries.length > 0 ? sortedDeliveries.filter(d => d.status !== 'delivered' && d.status !== 'cancelled') : activeDeliveries;
  const currentDelivery = orderedDeliveries[currentStopIdx];
  const currentStep = routeSteps[currentStepIdx];
  const completedStops = myDeliveries.filter(d => d.status === 'delivered').length;
  const totalStops = myDeliveries.length;

  return (
    <div className="relative w-screen h-screen overflow-hidden bg-[#080a0c]">
      {/* Map */}
      <div ref={mapContainerRef} className="absolute inset-0" />

      {/* Top navigation banner */}
      {pickedUp && currentStep && (
        <div className="absolute top-4 left-4 right-4 z-10 rounded-2xl p-4 flex items-center gap-4"
          style={{ background: 'rgba(15,17,23,0.92)', backdropFilter: 'blur(8px)', border: '1px solid rgba(255,255,255,0.08)' }}>
          <span className="text-4xl font-bold text-white">{getArrowIcon(currentStep.maneuver?.modifier ?? '')}</span>
          <div className="flex-1 min-w-0">
            <p className="text-white font-semibold text-lg truncate">{currentStep.name || 'Weiterfahren'}</p>
            <p className="text-white/50 text-sm">
              {currentStep.distance < 1000
                ? `${Math.round(currentStep.distance)} m`
                : `${(currentStep.distance / 1000).toFixed(1)} km`}
              {routeSteps[currentStepIdx + 1] && ` · dann ${getArrowIcon(routeSteps[currentStepIdx + 1]?.maneuver?.modifier ?? '')} ${routeSteps[currentStepIdx + 1]?.name}`}
            </p>
          </div>
        </div>
      )}

      {/* Bottom info */}
      <div className="absolute bottom-0 left-0 right-0 z-10 p-4 space-y-3">
        {/* Current stop info */}
        {currentDelivery && (
          <div className="rounded-2xl p-4" style={{ background: 'rgba(15,17,23,0.92)', backdropFilter: 'blur(8px)', border: '1px solid rgba(255,255,255,0.08)' }}>
            <div className="flex items-start justify-between">
              <div className="flex-1 min-w-0">
                <p className="text-white/50 text-xs font-medium uppercase tracking-wide mb-1">
                  Stop {completedStops + 1} / {totalStops}
                </p>
                <p className="text-white font-semibold truncate">{(currentDelivery.order as any)?.customerName ?? 'Kunde'}</p>
                <p className="text-white/60 text-sm truncate">
                  {(currentDelivery.order as any)?.deliveryStreet}, {(currentDelivery.order as any)?.deliveryCity}
                </p>
              </div>
              <div className="text-right ml-4">
                <p className="text-white/40 text-xs">Distanz</p>
                <p className="text-white font-mono text-sm">
                  {totalDistance > 0 ? `${(totalDistance / 1000).toFixed(1)} km` : '—'}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Action buttons */}
        <div className="flex gap-3">
          {activeDeliveries.length === 0 ? (
            <div className="flex-1 py-4 rounded-xl text-center text-white/40 text-sm bg-[#0e1115] border border-white/[0.06]">
              Warte auf Aufträge…
            </div>
          ) : !pickedUp ? (
            <button
              onClick={handlePickup}
              className="flex-1 py-4 rounded-xl font-semibold text-white text-base"
              style={{ backgroundColor: DRIVER_COLOR }}
            >
              Abgeholt — Ich bin im Auto
            </button>
          ) : currentDelivery ? (
            <button
              onClick={handleDelivered}
              className="flex-1 py-4 rounded-xl font-semibold text-white text-base bg-emerald-600"
            >
              Zugestellt
            </button>
          ) : (
            <div className="flex-1 py-4 rounded-xl text-center text-white/50 bg-[#0e1115] border border-white/[0.06]">
              Alle Stops erledigt!
            </div>
          )}
          <button
            onClick={toggle3D}
            className="px-4 py-4 rounded-xl text-white/60 text-sm bg-[#0e1115] border border-white/[0.06]"
          >
            {is3D ? '2D' : '3D'}
          </button>
          <button
            onClick={centerOnMe}
            className="px-4 py-4 rounded-xl text-white/60 bg-[#0e1115] border border-white/[0.06]"
          >
            <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <circle cx="12" cy="12" r="3" /><path d="M12 2v3m0 14v3M2 12h3m14 0h3" />
            </svg>
          </button>
        </div>

        {/* Speed */}
        <div className="flex justify-between items-center px-1">
          <span className="text-white/30 text-xs">{Math.round(currentSpeed)} km/h</span>
          <button
            onClick={() => { setActiveDriver(null); setActiveDriverId(null); setPickedUp(false); setMyDeliveries([]); navigate('/'); }}
            className="text-white/30 text-xs"
          >
            Abmelden
          </button>
        </div>
      </div>
    </div>
  );
}
