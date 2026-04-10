/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useMemo, useRef, FormEvent } from 'react';
import { 
  Search, 
  MapPin, 
  Waves, 
  Info, 
  Navigation, 
  ArrowRight, 
  X, 
  Anchor,
  Loader2,
  ExternalLink,
  ChevronRight,
  Map as MapIcon,
  Crosshair
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { MapContainer, TileLayer, Marker, useMapEvents } from 'react-leaflet';
import L from 'leaflet';

// Fix Leaflet marker icons
// @ts-ignore
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

// Utility for tailwind classes
function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface Wreck {
  id: string | number;
  title: string;
  lat: number;
  lng: number;
  depth: number;
  depthStr: string;
  description: string;
  link: string;
  source: string;
  distance?: number;
}

export default function App() {
  const [wrecks, setWrecks] = useState<Wreck[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedWreck, setSelectedWreck] = useState<Wreck | null>(null);
  
  // Search parameters
  const [maxDistance, setMaxDistance] = useState(50);
  const [minDepth, setMinDepth] = useState(0);
  const [maxDepth, setMaxDepth] = useState(40);
  const [sortBy, setSortBy] = useState<'depth' | 'distance'>('depth');
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [locating, setLocating] = useState(false);
  const [showMap, setShowMap] = useState(false);
  const [latInput, setLatInput] = useState('');
  const [lngInput, setLngInput] = useState('');
  const [placeSearch, setPlaceSearch] = useState('');
  const [searchingPlace, setSearchingPlace] = useState(false);

  // Enforce depth constraint: min < max
  const handleMinDepthChange = (val: number) => {
    setMinDepth(val);
    if (val >= maxDepth) {
      setMaxDepth(val + 1);
    }
  };

  const handleMaxDepthChange = (val: number) => {
    if (val <= minDepth) {
      if (val > 0) {
        setMinDepth(val - 1);
        setMaxDepth(val);
      } else {
        // If max is 0, we can't have min < max if min is non-negative
        // But our range is 1-100 for max, so val is at least 1
        setMinDepth(0);
        setMaxDepth(1);
      }
    } else {
      setMaxDepth(val);
    }
  };

  const handleManualLocation = () => {
    const lat = parseFloat(latInput);
    const lng = parseFloat(lngInput);
    if (!isNaN(lat) && !isNaN(lng)) {
      const loc = { lat, lng };
      setUserLocation(loc);
      fetchWrecks(loc.lat, loc.lng);
    }
  };

  function MapPicker() {
    useMapEvents({
      click(e) {
        const loc = { lat: e.latlng.lat, lng: e.latlng.lng };
        setUserLocation(loc);
        setLatInput(loc.lat.toFixed(6));
        setLngInput(loc.lng.toFixed(6));
        setShowMap(false);
        fetchWrecks(loc.lat, loc.lng);
      },
    });
    return userLocation ? <Marker position={[userLocation.lat, userLocation.lng]} /> : null;
  }

  const handlePlaceSearch = async (e: FormEvent) => {
    e.preventDefault();
    if (!placeSearch.trim()) return;

    setSearchingPlace(true);
    try {
      const response = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(placeSearch)}&limit=1`);
      const data = await response.json();
      
      if (data && data.length > 0) {
        const { lat, lon } = data[0];
        const loc = { lat: parseFloat(lat), lng: parseFloat(lon) };
        setUserLocation(loc);
        setLatInput(loc.lat.toFixed(6));
        setLngInput(loc.lng.toFixed(6));
        fetchWrecks(loc.lat, loc.lng);
      } else {
        setError('Paikkaa ei löytynyt. Kokeile toista hakusanaa.');
      }
    } catch (err) {
      console.error(err);
      setError('Paikkahaku epäonnistui.');
    } finally {
      setSearchingPlace(false);
    }
  };

  const fetchWrecks = async (lat?: number, lng?: number) => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (lat && lng) {
        params.append('lat', lat.toString());
        params.append('lng', lng.toString());
        params.append('maxDist', maxDistance.toString());
      }
      params.append('minDepth', minDepth.toString());
      params.append('maxDepth', maxDepth.toString());
      params.append('sortBy', sortBy);

      const response = await fetch(`/api/wrecks?${params.toString()}`);
      if (!response.ok) throw new Error('Haku epäonnistui');
      const data = await response.json();
      setWrecks(data);
    } catch (err) {
      setError('Hylkyjen haku epäonnistui. Yritä myöhemmin uudelleen.');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleLocate = () => {
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const loc = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        setUserLocation(loc);
        setLatInput(loc.lat.toFixed(6));
        setLngInput(loc.lng.toFixed(6));
        setLocating(false);
        fetchWrecks(loc.lat, loc.lng);
      },
      (err) => {
        console.error(err);
        setError('Sijainnin haku epäonnistui. Salli sijaintitiedot selaimessa.');
        setLocating(false);
      }
    );
  };

  // Initial fetch and re-fetch on sort change
  useEffect(() => {
    fetchWrecks(userLocation?.lat, userLocation?.lng);
  }, [sortBy]);

  return (
    <div className="min-h-screen bg-[#F5F5F0] text-[#141414] font-sans selection:bg-blue-100">
      {/* Header */}
      <header className="sticky top-0 z-30 bg-white/80 backdrop-blur-md border-b border-[#141414]/10 px-6 py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="bg-[#141414] p-2 rounded-lg text-white">
              <Anchor size={24} />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight">Lähihylky</h1>
              <p className="text-xs text-[#141414]/50 font-medium uppercase tracking-widest">Hylyt.net Explorer</p>
            </div>
          </div>
          
          <div className="hidden md:flex items-center gap-6">
            <div className="flex flex-col items-end">
              <span className="text-[10px] uppercase tracking-wider opacity-50">Tietokanta</span>
              <span className="text-sm font-mono font-medium">hylyt.net</span>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-8 grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Sidebar Controls */}
        <aside className="lg:col-span-4 space-y-6">
          <section className="bg-white rounded-2xl p-6 shadow-sm border border-[#141414]/5">
            <h2 className="text-lg font-bold mb-6 flex items-center gap-2">
              <Search size={18} />
              Hakuasetukset
            </h2>
            
            <div className="space-y-8">
              {/* Location */}
              <div className="space-y-4">
                <label className="text-xs font-bold uppercase tracking-wider opacity-60">Sijainti</label>
                
                <form onSubmit={handlePlaceSearch} className="relative">
                  <input 
                    type="text" 
                    value={placeSearch}
                    onChange={(e) => setPlaceSearch(e.target.value)}
                    placeholder="Hae paikan nimellä (esm. Helsinki)"
                    className="w-full bg-white border border-[#141414]/10 rounded-xl px-4 py-3 pr-12 text-sm focus:outline-none focus:border-[#141414]/30 transition-all"
                  />
                  <button 
                    type="submit"
                    disabled={searchingPlace}
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-2 text-[#141414]/40 hover:text-[#141414] transition-colors"
                  >
                    {searchingPlace ? <Loader2 className="animate-spin" size={18} /> : <Search size={18} />}
                  </button>
                </form>

                <div className="grid grid-cols-2 gap-2">
                  <button 
                    onClick={handleLocate}
                    disabled={locating}
                    className={cn(
                      "flex items-center justify-center gap-2 py-3 px-4 rounded-xl border-2 transition-all duration-200 text-sm font-bold",
                      locating ? "bg-blue-50 border-blue-200 text-blue-700" : "bg-white border-[#141414]/10 hover:border-[#141414]/30"
                    )}
                  >
                    {locating ? <Loader2 className="animate-spin" size={16} /> : <Crosshair size={16} />}
                    GPS
                  </button>
                  <button 
                    onClick={() => setShowMap(!showMap)}
                    className={cn(
                      "flex items-center justify-center gap-2 py-3 px-4 rounded-xl border-2 transition-all duration-200 text-sm font-bold",
                      showMap ? "bg-blue-50 border-blue-200 text-blue-700" : "bg-white border-[#141414]/10 hover:border-[#141414]/30"
                    )}
                  >
                    <MapIcon size={16} />
                    Kartta
                  </button>
                </div>

                {showMap && (
                  <div className="h-64 rounded-xl overflow-hidden border border-[#141414]/10">
                    <MapContainer 
                      center={userLocation ? [userLocation.lat, userLocation.lng] : [60.1699, 24.9384]} 
                      zoom={userLocation ? 10 : 5} 
                      style={{ height: '100%', width: '100%' }}
                    >
                      <TileLayer
                        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                      />
                      <MapPicker />
                    </MapContainer>
                    <p className="text-[10px] text-center py-1 bg-blue-50 text-blue-600 font-bold">Klikkaa karttaa asettaaksesi keskipisteen</p>
                  </div>
                )}

                <div className="space-y-2">
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <span className="text-[10px] uppercase opacity-40 font-bold">Latitudi</span>
                      <input 
                        type="text" 
                        value={latInput}
                        onChange={(e) => setLatInput(e.target.value)}
                        placeholder="60.1234"
                        className="w-full bg-[#F5F5F0] border border-[#141414]/10 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:border-[#141414]/30"
                      />
                    </div>
                    <div className="space-y-1">
                      <span className="text-[10px] uppercase opacity-40 font-bold">Longitudi</span>
                      <input 
                        type="text" 
                        value={lngInput}
                        onChange={(e) => setLngInput(e.target.value)}
                        placeholder="24.5678"
                        className="w-full bg-[#F5F5F0] border border-[#141414]/10 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:border-[#141414]/30"
                      />
                    </div>
                  </div>
                  <button 
                    onClick={handleManualLocation}
                    className="w-full py-2 text-xs font-bold uppercase tracking-widest bg-[#141414]/5 hover:bg-[#141414]/10 rounded-lg transition-colors"
                  >
                    Aseta koordinaatit
                  </button>
                </div>

                {userLocation && (
                  <div className="flex items-center justify-center gap-2 text-blue-600">
                    <MapPin size={14} />
                    <p className="text-[10px] font-mono font-bold">
                      {userLocation.lat.toFixed(4)}, {userLocation.lng.toFixed(4)}
                    </p>
                  </div>
                )}
              </div>

              {/* Distance Slider */}
              <div className="space-y-4">
                <div className="flex justify-between items-end">
                  <label className="text-xs font-bold uppercase tracking-wider opacity-60">Maksimietäisyys</label>
                  <span className="text-sm font-mono font-bold">{maxDistance} km</span>
                </div>
                <input 
                  type="range" 
                  min="1" 
                  max="500" 
                  value={maxDistance} 
                  onChange={(e) => setMaxDistance(parseInt(e.target.value))}
                  className="w-full h-1.5 bg-[#141414]/10 rounded-lg appearance-none cursor-pointer accent-[#141414]"
                />
              </div>

              {/* Depth Sliders */}
              <div className="space-y-6">
                <div className="space-y-4">
                  <div className="flex justify-between items-end">
                    <label className="text-xs font-bold uppercase tracking-wider opacity-60">Minimisyvyys</label>
                    <span className="text-sm font-mono font-bold">{minDepth} m</span>
                  </div>
                  <input 
                    type="range" 
                    min="0" 
                    max="100" 
                    value={minDepth} 
                    onChange={(e) => handleMinDepthChange(parseInt(e.target.value))}
                    className="w-full h-1.5 bg-[#141414]/10 rounded-lg appearance-none cursor-pointer accent-[#141414]"
                  />
                </div>

                <div className="space-y-4">
                  <div className="flex justify-between items-end">
                    <label className="text-xs font-bold uppercase tracking-wider opacity-60">Maksimisyvyys</label>
                    <span className="text-sm font-mono font-bold">{maxDepth} m</span>
                  </div>
                  <input 
                    type="range" 
                    min="1" 
                    max="100" 
                    value={maxDepth} 
                    onChange={(e) => handleMaxDepthChange(parseInt(e.target.value))}
                    className="w-full h-1.5 bg-[#141414]/10 rounded-lg appearance-none cursor-pointer accent-[#141414]"
                  />
                </div>
              </div>

              {/* Sort Order */}
              <div className="space-y-3">
                <label className="text-xs font-bold uppercase tracking-wider opacity-60">Järjestys</label>
                <div className="grid grid-cols-2 gap-2 p-1 bg-[#141414]/5 rounded-xl">
                  <button 
                    onClick={() => setSortBy('depth')}
                    className={cn(
                      "py-2 px-3 rounded-lg text-xs font-bold transition-all",
                      sortBy === 'depth' ? "bg-white shadow-sm text-[#141414]" : "text-[#141414]/40 hover:text-[#141414]/60"
                    )}
                  >
                    Syvyys
                  </button>
                  <button 
                    onClick={() => setSortBy('distance')}
                    disabled={!userLocation}
                    className={cn(
                      "py-2 px-3 rounded-lg text-xs font-bold transition-all",
                      sortBy === 'distance' ? "bg-white shadow-sm text-[#141414]" : "text-[#141414]/40 hover:text-[#141414]/60",
                      !userLocation && "opacity-30 cursor-not-allowed"
                    )}
                  >
                    Etäisyys
                  </button>
                </div>
                {!userLocation && sortBy === 'distance' && (
                  <p className="text-[10px] text-red-500 font-bold text-center">Aseta sijainti järjestääksesi etäisyyden mukaan</p>
                )}
              </div>

              <button 
                onClick={() => fetchWrecks(userLocation?.lat, userLocation?.lng)}
                disabled={loading}
                className="w-full bg-[#141414] text-white py-4 rounded-xl font-bold flex items-center justify-center gap-2 hover:bg-[#141414]/90 transition-colors disabled:opacity-50"
              >
                {loading ? <Loader2 className="animate-spin" size={20} /> : "Päivitä tulokset"}
              </button>
            </div>
          </section>

          {/* Stats */}
          <section className="bg-[#141414] text-white rounded-2xl p-6 overflow-hidden relative">
            <div className="relative z-10">
              <h3 className="text-xs font-bold uppercase tracking-widest opacity-50 mb-1">Löytyneitä hylkyjä</h3>
              <p className="text-4xl font-bold font-mono">{wrecks.length}</p>
            </div>
            <Waves className="absolute -bottom-4 -right-4 opacity-10 w-32 h-32" />
          </section>
        </aside>

        {/* Results List */}
        <div className="lg:col-span-8 space-y-4">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-xs font-bold uppercase tracking-widest opacity-50">
              Hakutulokset (Järjestetty {sortBy === 'depth' ? 'syvyyden' : 'etäisyyden'} mukaan)
            </h2>
          </div>

          {loading && wrecks.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-[#141414]/30">
              <Loader2 className="animate-spin mb-4" size={48} />
              <p className="font-medium">Haetaan hylkyjä...</p>
            </div>
          ) : error ? (
            <div className="bg-red-50 border border-red-100 text-red-600 p-8 rounded-2xl text-center">
              <p className="font-bold mb-2">Hups!</p>
              <p className="text-sm">{error}</p>
            </div>
          ) : wrecks.length === 0 ? (
            <div className="bg-white border border-[#141414]/5 p-12 rounded-2xl text-center text-[#141414]/40">
              <Info className="mx-auto mb-4" size={32} />
              <p className="font-medium">Ei hylkyjä näillä hakuehdoilla.</p>
              <p className="text-xs mt-2">Kokeile kasvattaa etäisyyttä tai syvyyttä.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4">
              {wrecks.map((wreck, idx) => (
                <motion.div
                  key={wreck.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: idx * 0.03, duration: 0.3 }}
                  onClick={() => setSelectedWreck(wreck)}
                  className="group bg-white rounded-2xl p-5 border border-[#141414]/5 hover:border-[#141414]/20 hover:shadow-md transition-all cursor-pointer flex items-center gap-6"
                >
                  <div className="flex-shrink-0 w-16 h-16 bg-[#F5F5F0] rounded-xl flex flex-col items-center justify-center border border-[#141414]/5 group-hover:bg-blue-50 group-hover:border-blue-100 transition-colors">
                    <span className="text-xs font-bold uppercase tracking-tighter opacity-40">Syvyys</span>
                    <span className="text-xl font-bold font-mono">{wreck.depth}</span>
                    <span className="text-[10px] font-bold">m</span>
                  </div>
                  
                  <div className="flex-grow min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 bg-[#141414]/5 rounded text-[#141414]/60">
                        {wreck.source}
                      </span>
                    </div>
                    <h3 className="font-bold text-lg truncate group-hover:text-blue-600 transition-colors">{wreck.title}</h3>
                    <div className="flex items-center gap-4 mt-1">
                      {wreck.distance !== undefined && (
                        <div className="flex items-center gap-1 text-xs text-blue-600 font-bold">
                          <Navigation size={12} className="rotate-45" />
                          <span>{wreck.distance.toFixed(1)} km</span>
                        </div>
                      )}
                      <div className="flex items-center gap-1 text-xs text-[#141414]/50 font-medium">
                        <MapPin size={12} />
                        <span>{wreck.lat.toFixed(4)}, {wreck.lng.toFixed(4)}</span>
                      </div>
                      <div className="flex items-center gap-1 text-xs text-[#141414]/50 font-medium">
                        <Waves size={12} />
                        <span>{wreck.depthStr || "Ei tietoa"}</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                    <div className="bg-[#141414] text-white p-2 rounded-full">
                      <ChevronRight size={16} />
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          )}
        </div>
      </main>

      {/* Detail Modal */}
      <AnimatePresence>
        {selectedWreck && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 md:p-8">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setSelectedWreck(null)}
              className="absolute inset-0 bg-[#141414]/60 backdrop-blur-sm"
            />
            
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-3xl bg-white rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
            >
              {/* Modal Header */}
              <div className="p-6 md:p-8 border-b border-[#141414]/5 flex items-start justify-between bg-white sticky top-0 z-10">
                <div className="space-y-1">
                  <div className="flex items-center gap-2 text-blue-600">
                    <Anchor size={16} />
                    <span className="text-[10px] font-bold uppercase tracking-widest">Hylkykortti</span>
                  </div>
                  <h2 className="text-2xl md:text-3xl font-bold leading-tight">{selectedWreck.title}</h2>
                </div>
                <button 
                  onClick={() => setSelectedWreck(null)}
                  className="p-2 hover:bg-[#141414]/5 rounded-full transition-colors"
                >
                  <X size={24} />
                </button>
              </div>

              {/* Modal Content */}
              <div className="p-6 md:p-8 overflow-y-auto space-y-8">
                {/* Key Info Grid */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="bg-[#F5F5F0] p-4 rounded-2xl border border-[#141414]/5">
                    <p className="text-[10px] font-bold uppercase tracking-wider opacity-40 mb-1">Lähde</p>
                    <p className="text-sm font-bold truncate">{selectedWreck.source}</p>
                  </div>
                  <div className="bg-[#F5F5F0] p-4 rounded-2xl border border-[#141414]/5">
                    <p className="text-[10px] font-bold uppercase tracking-wider opacity-40 mb-1">Etäisyys</p>
                    <p className="text-xl font-bold font-mono">
                      {selectedWreck.distance !== undefined ? `${selectedWreck.distance.toFixed(1)} km` : "---"}
                    </p>
                  </div>
                  <div className="bg-[#F5F5F0] p-4 rounded-2xl border border-[#141414]/5">
                    <p className="text-[10px] font-bold uppercase tracking-wider opacity-40 mb-1">Syvyys</p>
                    <p className="text-xl font-bold font-mono">{selectedWreck.depth} m</p>
                  </div>
                  <div className="bg-[#F5F5F0] p-4 rounded-2xl border border-[#141414]/5">
                    <p className="text-[10px] font-bold uppercase tracking-wider opacity-40 mb-1">Koordinaatit</p>
                    <p className="text-xs font-bold font-mono">{selectedWreck.lat.toFixed(5)}<br/>{selectedWreck.lng.toFixed(5)}</p>
                  </div>
                  <div className="bg-[#F5F5F0] p-4 rounded-2xl border border-[#141414]/5">
                    <p className="text-[10px] font-bold uppercase tracking-wider opacity-40 mb-1">ID</p>
                    <p className="text-sm font-bold font-mono truncate">{selectedWreck.id}</p>
                  </div>
                </div>

                {/* Description */}
                <div className="space-y-4">
                  <h3 className="text-sm font-bold uppercase tracking-widest flex items-center gap-2">
                    <Info size={16} />
                    Kuvaus ja tiedot
                  </h3>
                  <div 
                    className="prose prose-sm max-w-none text-[#141414]/80 leading-relaxed"
                    dangerouslySetInnerHTML={{ __html: selectedWreck.description || "Ei kuvausta saatavilla." }}
                  />
                </div>

                {/* Actions */}
                <div className="pt-6 border-t border-[#141414]/5 flex flex-wrap gap-4">
                  <a 
                    href={`https://www.google.com/maps/search/?api=1&query=${selectedWreck.lat},${selectedWreck.lng}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex-grow md:flex-grow-0 flex items-center justify-center gap-2 bg-[#141414] text-white px-6 py-3 rounded-xl font-bold hover:bg-[#141414]/90 transition-colors"
                  >
                    <Navigation size={18} />
                    Avaa kartalla
                  </a>
                  <a 
                    href={selectedWreck.link}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex-grow md:flex-grow-0 flex items-center justify-center gap-2 bg-white border border-[#141414]/10 px-6 py-3 rounded-xl font-bold hover:border-[#141414]/30 transition-all"
                  >
                    <ExternalLink size={18} />
                    Katso alkuperäinen
                  </a>
                  <a 
                    href={`https://www.wrecksite.eu/wrecksite.aspx?${new URLSearchParams({ search: selectedWreck.title }).toString()}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex-grow md:flex-grow-0 flex items-center justify-center gap-2 bg-white border border-[#141414]/10 px-6 py-3 rounded-xl font-bold hover:border-[#141414]/30 transition-all"
                  >
                    <Search size={18} />
                    Wrecksite.eu
                  </a>
                  <a 
                    href={`https://shipwrecks.com/?s=${encodeURIComponent(selectedWreck.title)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex-grow md:flex-grow-0 flex items-center justify-center gap-2 bg-white border border-[#141414]/10 px-6 py-3 rounded-xl font-bold hover:border-[#141414]/30 transition-all"
                  >
                    <Search size={18} />
                    Shipwrecks.com
                  </a>
                  <a 
                    href={`https://ww2sunkenships.ca/?s=${encodeURIComponent(selectedWreck.title)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex-grow md:flex-grow-0 flex items-center justify-center gap-2 bg-white border border-[#141414]/10 px-6 py-3 rounded-xl font-bold hover:border-[#141414]/30 transition-all"
                  >
                    <Search size={18} />
                    WW2 Sunken Ships
                  </a>
                  <a 
                    href="https://nauticalcharts.noaa.gov/data/wrecks-and-obstructions.html"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex-grow md:flex-grow-0 flex items-center justify-center gap-2 bg-white border border-[#141414]/10 px-6 py-3 rounded-xl font-bold hover:border-[#141414]/30 transition-all"
                  >
                    <ExternalLink size={18} />
                    NOAA Database
                  </a>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Footer */}
      <footer className="bg-white border-t border-[#141414]/5 py-12 px-6 mt-12">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-8">
          <div className="flex items-center gap-3 opacity-40">
            <Anchor size={20} />
            <span className="font-bold tracking-tight">Lähihylky</span>
          </div>
          
          <p className="text-xs text-[#141414]/40 text-center md:text-right max-w-md">
            Tiedot haetaan reaaliajassa hylyt.net tietokannasta. Lähihylky on harrastajaprojekti hylkysukeltajille ja merihistoriasta kiinnostuneille.
          </p>
        </div>
      </footer>
    </div>
  );
}
