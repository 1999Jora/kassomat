import { useEffect, useRef, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { useDeliveryStore } from '../store/useDeliveryStore';
import DriverPINGate from '../components/DriverPINGate';
import type { Driver, Delivery } from '@kassomat/types';
import { io, Socket } from 'socket.io-client';

const API = import.meta.env.VITE_API_URL as string;
const SOCKET_URL = (import.meta.env.VITE_SOCKET_URL ?? API) as string;
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

export default function DriverNavPage() {
  const { drivers, setActiveDriverId } = useDeliveryStore();
  const [loadingDrivers, setLoadingDrivers] = useState(true);
  const [activeDriver, setActiveDriver] = useState<Driver | null>(null);
  const [myDeliveries, setMyDeliveries] = useState<Delivery[]>([]);
  const [currentStopIdx, setCurrentStopIdx] = useState(0);
  const [routeSteps, setRouteSteps] = useState<any[]>([]);
  const [currentStepIdx] = useState(0);
  const [totalDistance, setTotalDistance] = useState(0);
  const [currentSpeed, setCurrentSpeed] = useState(0);
  const [is3D, setIs3D] = useState(true);
  const [pickedUp, setPickedUp] = useState(false);
  const [position, setPosition] = useState<GeolocationPosition | null>(null);
  const navigate = useNavigate();

  const mapRef = useRef<maplibregl.Map | null>(null);
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const markerRef = useRef<maplibregl.Marker | null>(null);
  const socketRef = useRef<Socket | null>(null);
  const watchIdRef = useRef<number | null>(null);
  const lastGeocode = useRef<number>(0);

  // Load drivers on mount
  useEffect(() => {
    fetch(`${API}/drivers`)
      .then(r => r.json())
      .then(data => { useDeliveryStore.getState().setDrivers(Array.isArray(data) ? data : []); })
      .catch(() => {})
      .finally(() => setLoadingDrivers(false));
  }, []);

  // On driver login
  const handleDriverLogin = useCallback(async (driver: Driver) => {
    setActiveDriver(driver);
    setActiveDriverId(driver.id);

    // Load driver's deliveries
    const res = await fetch(`${API}/deliveries/driver/${driver.id}`);
    const data = await res.json();
    const myD = Array.isArray(data) ? data : [];
    setMyDeliveries(myD);

    // Connect socket (no JWT needed for drivers)
    const socket = io(SOCKET_URL, { transports: ['websocket'] });
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
          // Emit GPS to server
          socket.emit('driver:gps', {
            driverId: driver.id,
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
            tiles: [
              'https://a.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png',
              'https://b.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png',
              'https://c.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png',
            ],
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
  }, [activeDriver, is3D]);

  // Calculate route when deliveries change and picked up
  useEffect(() => {
    if (!pickedUp || myDeliveries.length === 0 || !position) return;

    async function calcRoute() {
      const activeDeliveries = myDeliveries.filter(d => d.status !== 'delivered' && d.status !== 'cancelled');
      if (activeDeliveries.length === 0) return;

      const startCoord: [number, number] = [position!.coords.longitude, position!.coords.latitude];

      // Geocode addresses with rate limiting
      const coords: [number, number][] = [startCoord];
      for (const delivery of activeDeliveries) {
        const order = delivery.order as any;
        const addr = `${order?.deliveryAddress?.street ?? order?.deliveryStreet ?? ''}, ${order?.deliveryAddress?.zip ?? order?.deliveryZip ?? ''} ${order?.deliveryAddress?.city ?? order?.deliveryCity ?? ''}`;
        const now = Date.now();
        if (now - lastGeocode.current < 1100) await new Promise(r => setTimeout(r, 1100 - (now - lastGeocode.current)));
        lastGeocode.current = Date.now();
        const coord = await geocode(addr);
        if (coord) coords.push(coord);
      }

      if (coords.length < 2) return;
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
          paint: { 'line-color': DRIVER_COLOR, 'line-width': 4, 'line-opacity': 0.85 },
        });
      }

      // Add stop markers
      activeDeliveries.forEach((_d, i) => {
        if (coords[i + 1]) {
          const el = document.createElement('div');
          el.style.cssText = `width:28px;height:28px;background:${DRIVER_COLOR};border:2px solid white;border-radius:50%;display:flex;align-items:center;justify-content:center;color:white;font-weight:bold;font-size:12px;`;
          el.textContent = String(i + 1);
          new maplibregl.Marker({ element: el })
            .setLngLat(coords[i + 1]!)
            .addTo(map);
        }
      });
    }

    void calcRoute();
  }, [pickedUp, myDeliveries, position]);

  // Confirm pickup
  async function handlePickup() {
    const activeDeliveries = myDeliveries.filter(d => d.status !== 'delivered' && d.status !== 'cancelled');
    const currentDelivery = activeDeliveries[currentStopIdx];
    if (!currentDelivery) return;
    await fetch(`${API}/deliveries/${currentDelivery.id}/pickup`, { method: 'POST' });
    setPickedUp(true);
  }

  // Mark stop as delivered
  async function handleDelivered() {
    const activeDeliveries = myDeliveries.filter(d => d.status !== 'delivered' && d.status !== 'cancelled');
    const currentDelivery = activeDeliveries[currentStopIdx];
    if (!currentDelivery) return;
    await fetch(`${API}/deliveries/${currentDelivery.id}/delivered`, { method: 'POST' });
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
    return <div className="min-h-screen bg-[#0f1117] flex items-center justify-center text-white/50">Laden...</div>;
  }

  if (!activeDriver) {
    return <DriverPINGate drivers={drivers} onSuccess={handleDriverLogin} />;
  }

  const activeDeliveries = myDeliveries.filter(d => d.status !== 'delivered' && d.status !== 'cancelled');
  const currentDelivery = activeDeliveries[currentStopIdx];
  const currentStep = routeSteps[currentStepIdx];
  const completedStops = myDeliveries.filter(d => d.status === 'delivered').length;
  const totalStops = myDeliveries.length;

  return (
    <div className="relative w-screen h-screen overflow-hidden bg-[#0f1117]">
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
          {!pickedUp ? (
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
            <div className="flex-1 py-4 rounded-xl text-center text-white/50 bg-[#181c27]">
              Alle Stops erledigt!
            </div>
          )}
          <button
            onClick={toggle3D}
            className="px-4 py-4 rounded-xl text-white/60 text-sm bg-[#181c27] border border-white/10"
          >
            {is3D ? '2D' : '3D'}
          </button>
          <button
            onClick={centerOnMe}
            className="px-4 py-4 rounded-xl text-white/60 bg-[#181c27] border border-white/10"
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
