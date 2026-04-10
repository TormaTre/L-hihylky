
import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import axios from "axios";

const app = express();
const PORT = 3000;

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

let wrecksCache: Wreck[] = [];
let lastFetch = 0;
const CACHE_DURATION = 1000 * 60 * 60; // 1 hour

async function fetchHylytNet() {
  console.log("Fetching wrecks from hylyt.net...");
  let allItems: any[] = [];
  let page = 1;
  const perPage = 50;
  let totalPages = 1;

  try {
    const fetchPage = async (p: number, retries = 3): Promise<any[]> => {
      try {
        const response = await axios.get(`https://cms.hylyt.net/wp-json/wp/v2/ait-dir-item`, {
          params: { per_page: perPage, page: p },
          headers: { 'User-Agent': 'Lähihylky/1.0' },
          timeout: 15000
        });
        if (p === 1) totalPages = parseInt(response.headers['x-wp-totalpages'] || "1");
        return response.data;
      } catch (error: any) {
        if (retries > 0 && (error.response?.status === 502 || error.code === 'ECONNABORTED')) {
          await new Promise(resolve => setTimeout(resolve, 2000));
          return fetchPage(p, retries - 1);
        }
        throw error;
      }
    };

    while (page <= totalPages) {
      const data = await fetchPage(page);
      allItems = allItems.concat(data);
      page++;
      if (page > 100) break;
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    return allItems.map(item => {
      const lat = parseFloat(item.meta?.gpsLatitude?.[0] || "0");
      const lng = parseFloat(item.meta?.gpsLongitude?.[0] || "0");
      const depthStr = item.meta?.Kohde_Hylky_Osa_pohjansyvyys?.[0] || "";
      const depthMatch = depthStr.match(/\d+/);
      const depth = depthMatch ? parseInt(depthMatch[0]) : 999;

      return {
        id: `hylyt-${item.id}`,
        title: item.title?.rendered || "Nimetön hylky",
        lat,
        lng,
        depth,
        depthStr,
        description: item.content?.rendered || "",
        link: item.link || "",
        source: "Hylyt.net (Suomi)"
      };
    }).filter(w => w.lat !== 0 && w.lng !== 0);
  } catch (error) {
    console.error("Error fetching hylyt.net:", error);
    return [];
  }
}

async function fetchInfomar() {
  console.log("Fetching wrecks from Infomar (Ireland)...");
  try {
    const response = await axios.get('https://maps.marine.ie/arcgis/rest/services/Infomar/Shipwrecks/MapServer/0/query', {
      params: {
        where: '1=1',
        outFields: '*',
        f: 'json',
        resultRecordCount: 1000
      },
      timeout: 15000
    });

    if (!response.data.features) return [];

    return response.data.features.map((f: any) => {
      const attr = f.attributes;
      const depth = parseFloat(attr.WATER_DEPT) || 999;
      return {
        id: `infomar-${attr.OBJECTID}`,
        title: attr.VESSEL_NAM?.trim() || "Unknown Vessel",
        lat: attr.LAT_DD_WGS,
        lng: attr.LONG_DD_WG,
        depth: Math.round(depth),
        depthStr: `${depth.toFixed(1)} m`,
        description: `Type: ${attr.VESSEL_TYP || 'Unknown'}<br/>Comments: ${attr.COMMENTS || 'None'}`,
        link: attr.IMAGE || "https://www.infomar.ie/",
        source: "Infomar (Irlanti)"
      };
    });
  } catch (error) {
    console.error("Error fetching Infomar:", error);
    return [];
  }
}

async function fetchAllWrecks() {
  if (Date.now() - lastFetch < CACHE_DURATION && wrecksCache.length > 0) {
    return wrecksCache;
  }

  const [hylyt, infomar] = await Promise.all([
    fetchHylytNet(),
    fetchInfomar()
  ]);

  wrecksCache = [...hylyt, ...infomar];
  lastFetch = Date.now();
  console.log(`Total wrecks cached: ${wrecksCache.length}`);
  return wrecksCache;
}

// Haversine formula
function getDistance(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 6371; // km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = 
    Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
    Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
}

app.get("/api/wrecks", async (req, res) => {
  const { lat, lng, maxDist, maxDepth, minDepth, sortBy } = req.query;
  
  const wrecks = await fetchAllWrecks();
  
  let filtered: (Wreck & { distance?: number })[] = wrecks.map(w => ({ ...w }));
  const uLat = lat ? parseFloat(lat as string) : null;
  const uLng = lng ? parseFloat(lng as string) : null;

  if (uLat !== null && uLng !== null) {
    filtered.forEach(w => {
      w.distance = getDistance(uLat, uLng, w.lat, w.lng);
    });

    if (maxDist) {
      const uDist = parseFloat(maxDist as string);
      filtered = filtered.filter(w => w.distance! <= uDist);
    }
  }

  if (maxDepth) {
    const uDepth = parseInt(maxDepth as string);
    filtered = filtered.filter(w => w.depth <= uDepth);
  }

  if (minDepth) {
    const uMinDepth = parseInt(minDepth as string);
    filtered = filtered.filter(w => w.depth >= uMinDepth);
  }

  // Sort logic
  if (sortBy === 'distance' && uLat !== null && uLng !== null) {
    filtered.sort((a, b) => (a.distance || 0) - (b.distance || 0));
  } else {
    // Default: Sort by depth
    filtered.sort((a, b) => a.depth - b.depth);
  }

  res.json(filtered);
});

async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
    // Pre-fetch wrecks
    fetchAllWrecks();
  });
}

startServer();
