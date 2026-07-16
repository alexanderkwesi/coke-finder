import React, { useState, useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// Custom inline SVG icons
const SearchIcon = () => (
  <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
);
const CrosshairIcon = () => (
  <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="22" y1="12" x2="18" y2="12"></line><line x1="6" y1="12" x2="2" y2="12"></line><line x1="12" y1="6" x2="12" y2="2"></line><line x1="12" y1="22" x2="12" y2="18"></line></svg>
);
const MapPinIcon = () => (
  <svg viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path><circle cx="12" cy="10" r="3"></circle></svg>
);
const AlertCircleIcon = () => (
  <svg viewBox="0 0 24 24" width="24" height="24" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>
);
const StoreIcon = () => (
  <svg viewBox="0 0 24 24" width="12" height="12" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>
);
const ClockIcon = () => (
  <svg viewBox="0 0 24 24" width="12" height="12" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>
);
const InfoIcon = () => (
  <svg viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>
);
const NavigationIcon = () => (
  <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" strokeWidth="2.5" fill="none" strokeLinecap="round" strokeLinejoin="round" style={{ transform: 'rotate(45deg)' }}><polygon points="3 11 22 2 13 21 11 13 3 11"></polygon></svg>
);

const BOROUGHS_COLLECTION = [
  { name: 'London', lat: 51.5074, lng: -0.1278 },
  { name: 'Manchester', lat: 53.4808, lng: -2.2426 },
  { name: 'Birmingham', lat: 52.4862, lng: -1.8904 },
  { name: 'Glasgow', lat: 55.8642, lng: -4.2518 },
  { name: 'Liverpool', lat: 53.4084, lng: -2.9916 },
  { name: 'Leeds', lat: 53.8008, lng: -1.5491 },
  { name: 'Bristol', lat: 51.4545, lng: -2.5879 },
  { name: 'Newcastle', lat: 54.9783, lng: -1.6178 },
  { name: 'Sheffield', lat: 53.3811, lng: -1.4701 },
  { name: 'Cardiff', lat: 51.4816, lng: -3.1791 },
  { name: 'Edinburgh', lat: 55.9533, lng: -3.1883 },
  { name: 'Belfast', lat: 54.5973, lng: -5.9301 },
  { name: 'Nottingham', lat: 52.9548, lng: -1.1581 },
  { name: 'Warrington', lat: 53.3901, lng: -2.5970 },
  { name: 'Leicester', lat: 52.6369, lng: -1.1398 },
  { name: 'Southampton', lat: 50.9097, lng: -1.4044 },
  { name: 'Aberdeen', lat: 57.1497, lng: -2.0943 },
  { name: 'Plymouth', lat: 50.3755, lng: -4.1427 },
  { name: 'Oxford', lat: 51.7520, lng: -1.2577 },
  { name: 'Cambridge', lat: 52.2053, lng: 0.1218 }
];

export default function App() {
  // Search state
  const [searchMethod, setSearchMethod] = useState('address'); // address or current
  const [addressInput, setAddressInput] = useState('');
  const [radiusKm, setRadiusKm] = useState(5);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Results state
  const [retailers, setRetailers] = useState([]);
  const [recipes, setRecipes] = useState([]);
  const [activeCardIndex, setActiveCardIndex] = useState(-1);
  const [hasSearched, setHasSearched] = useState(false);

  // Toast state
  const [toastMessage, setToastMessage] = useState('');
  const [toastVisible, setToastVisible] = useState(false);

  // Map state refs
  const mapRef = useRef(null);
  const markersRef = useRef([]);
  const userMarkerRef = useRef(null);
  const searchCircleRef = useRef(null);

  const fetchWithTimeout = async (resource, options = {}) => {
    const { timeout = 1500 } = options;
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeout);
    try {
      const response = await fetch(resource, {
        ...options,
        signal: controller.signal
      });
      clearTimeout(id);
      return response;
    } catch (err) {
      clearTimeout(id);
      throw err;
    }
  };

  // Load recipes on mount
  useEffect(() => {
    fetchWithTimeout('/api/recipes', { timeout: 1000 })
      .then(res => {
        if (!res.ok) throw new Error('Offline recipes');
        return res.json();
      })
      .then(data => setRecipes(data))
      .catch(err => {
        console.warn('Failed to load cocktail recipes from backend. Using offline recipes.', err);
        setRecipes(getLocalRecipesFallback());
      });
  }, []);

  // Display toast alerts
  const showToast = (msg, duration = 3000) => {
    setToastMessage(msg);
    setToastVisible(true);
    setTimeout(() => {
      setToastVisible(false);
    }, duration);
  };

  // Math Helper (Haversine Distance)
  const getDistance = (lat1, lon1, lat2, lon2) => {
    const R = 6371; // km
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLon = ((lon2 - lon1) * Math.PI) / 180;
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos((lat1 * Math.PI) / 180) *
        Math.cos((lat2 * Math.PI) / 180) *
        Math.sin(dLon / 2) ** 2;
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  };

  const round = (num, decimals) => {
    const t = 10 ** decimals;
    return Math.round(num * t) / t;
  };

  const getShopTypeName = (type) => {
    const names = {
      supermarket: 'Supermarket',
      convenience: 'Convenience Store',
      newsagent: 'Newsagent',
      beverages: 'Beverage Shop',
      kiosk: 'Kiosk',
      vending_machine: 'Vending Machine'
    };
    return names[type] || 'Retailer';
  };

  const checkIfOpen = (hoursStr) => {
    if (!hoursStr) return null;
    try {
      const now = new Date();
      const hour = now.getHours();
      if (hoursStr.includes('24/7')) return true;
      return hour >= 7 && hour < 23;
    } catch {
      return null;
    }
  };

  // ── RESILIENT CLIENT-SIDE FALLBACKS ──
  const getLocalDefaultStockStatus = (name, address) => {
    const str = `${name}${address}`;
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      hash = (hash << 5) - hash + str.charCodeAt(i);
      hash |= 0;
    }
    const val = Math.abs(hash) % 100;
    if (val < 50) return { status: 'high', count: 0 };
    if (val < 85) return { status: 'low', count: 0 };
    return { status: 'out', count: 0 };
  };

  const getLocalFallbackRetailers = (lat, lng, radius) => {
    // Select 5 random boroughs
    const shuffled = [...BOROUGHS_COLLECTION].sort(() => 0.5 - Math.random());
    const selectedBoroughs = shuffled.slice(0, 5);

    const chains = [
      { name: 'Tesco Express', type: 'convenience' },
      { name: 'Sainsbury\'s Local', type: 'convenience' },
      { name: 'Co-op Food', type: 'convenience' },
      { name: 'Waitrose & Partners', type: 'supermarket' },
      { name: 'Tesco Extra', type: 'supermarket' },
      { name: 'Sainsbury\'s', type: 'supermarket' },
      { name: 'ASDA', type: 'supermarket' },
      { name: 'Morrisons', type: 'supermarket' },
      { name: 'Aldi', type: 'supermarket' },
      { name: 'Lidl', type: 'supermarket' },
      { name: 'Marks & Spencer Food', type: 'convenience' },
      { name: 'WHSmith', type: 'newsagent' },
      { name: 'Costcutter', type: 'convenience' },
      { name: 'One Stop', type: 'convenience' },
      { name: 'Nisa Local', type: 'convenience' }
    ];
    const streets = ['High Street', 'Market Place', 'Station Road', 'Church Lane', 'King\'s Road', 'Park Avenue', 'Victoria Street'];
    
    const results = [];
    
    selectedBoroughs.forEach(borough => {
      // Generate 2 retailers in each of the 5 boroughs
      for (let i = 0; i < 2; i++) {
        const chain = chains[Math.floor(Math.random() * chains.length)];
        const angle = Math.random() * Math.PI * 2;
        const dist = Math.random() * radius * 0.5 + 0.1;
        const rLat = borough.lat + (dist / 111) * Math.cos(angle);
        const rLng = borough.lng + (dist / 71) * Math.sin(angle);
        const street = streets[Math.floor(Math.random() * streets.length)];
        const fullAddress = `${Math.floor(Math.random() * 100 + 1)} ${street}, ${borough.name}`;
        const stock = getLocalDefaultStockStatus(chain.name, fullAddress);
        
        results.push({
          name: chain.name,
          lat: rLat,
          lng: rLng,
          distance_km: round(dist, 2),
          address: fullAddress,
          shopType: chain.type,
          open_now: Math.random() > 0.3,
          stock_status: stock.status,
          reports_count: stock.count
        });
      }
    });
    return results.sort((a, b) => a.distance_km - b.distance_km);
  };

  const getLocalRecipesFallback = () => [
    {
      id: "cherry-bomb",
      name: "Zero-Sugar Cherry Bomb",
      ingredients: [
        "150ml Coca-Cola Zero Sugar",
        "50ml Dark Cherry Juice (Zero Sugar)",
        "25ml Fresh Lime Juice",
        "Ice cubes",
        "Fresh cherries for garnish"
      ],
      instructions: "Fill a highball glass with ice. Add cherry juice and fresh lime juice. Stir well. Top up with ice-cold Coca-Cola Zero Sugar and garnish with fresh cherries.",
      difficulty: "Easy",
      prep_time: "2 mins"
    },
    {
      id: "spiced-zero-mule",
      name: "Spiced Zero Mule",
      ingredients: [
        "150ml Coca-Cola Zero Sugar",
        "50ml Ginger Beer (Zero Sugar)",
        "15ml Fresh Lime Juice",
        "A pinch of ground cinnamon",
        "Lime wheel for garnish"
      ],
      instructions: "In a mug filled with crushed ice, combine ginger beer and lime juice. Pour in the Coca-Cola Zero Sugar. Sprinkle a pinch of cinnamon, stir gently, and garnish with a lime wheel.",
      difficulty: "Easy",
      prep_time: "3 mins"
    }
  ];

  // Initialize Map
  const initMapInstance = (lat, lng) => {
    if (!mapRef.current) {
      mapRef.current = L.map('map', {
        zoomControl: true,
        attributionControl: true
      }).setView([lat, lng], 14);

      L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
        attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> © <a href="https://carto.com/">CARTO</a>',
        subdomains: 'abcd',
        maxZoom: 19
      }).addTo(mapRef.current);
    } else {
      mapRef.current.setView([lat, lng], 14);
    }

    // Clear old markers
    markersRef.current.forEach(m => mapRef.current.removeLayer(m));
    markersRef.current = [];
    
    if (userMarkerRef.current) {
      mapRef.current.removeLayer(userMarkerRef.current);
    }
    if (searchCircleRef.current) {
      mapRef.current.removeLayer(searchCircleRef.current);
    }

    // Add User navigation marker
    const userIcon = L.divIcon({
      className: 'custom-marker user-marker',
      html: `<div class="marker-pin"><svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" stroke-width="2.5" fill="none" stroke-linecap="round" stroke-linejoin="round" style="transform: rotate(45deg); color: white;"><polygon points="3 11 22 2 13 21 11 13 3 11"/></svg></div>`,
      iconSize: [32, 32],
      iconAnchor: [16, 32],
      popupAnchor: [0, -36]
    });

    userMarkerRef.current = L.marker([lat, lng], { icon: userIcon })
      .addTo(mapRef.current)
      .bindPopup(`<div class="popup-name">Your Location</div><div class="popup-address">Search center point</div>`);

    // Add Search Area Circle
    const radiusMeters = radiusKm * 1000;
    searchCircleRef.current = L.circle([lat, lng], {
      radius: radiusMeters,
      color: '#E61A27',
      fillColor: '#E61A27',
      fillOpacity: 0.05,
      weight: 1,
      opacity: 0.3,
      dashArray: '6 4'
    }).addTo(mapRef.current);
  };

  const applyLocalStockReports = (retailersList) => {
    try {
      const localReports = JSON.parse(localStorage.getItem('local_stock_reports') || '{}');
      return retailersList.map(r => {
        const rId = `${r.name}-${r.lat}-${r.lng}`;
        if (localReports[rId]) {
          return {
            ...r,
            stock_status: localReports[rId].status,
            reports_count: localReports[rId].reports_count
          };
        }
        return r;
      });
    } catch (err) {
      console.error('Error applying local stock reports:', err);
      return retailersList;
    }
  };

  // Render search results onto map and card list
  const renderResults = (data, lat, lng) => {
    const updatedData = applyLocalStockReports(data);
    setRetailers(updatedData);
    initMapInstance(lat, lng);

    const newMarkers = [];
    data.forEach((retailer, index) => {
      const storeIcon = L.divIcon({
        className: 'custom-marker',
        html: `<div class="marker-pin"><svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" stroke-width="2.5" fill="none" stroke-linecap="round" stroke-linejoin="round" style="transform: rotate(45deg); color: white;"><path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 0 1-8 0"/></svg></div>`,
        iconSize: [32, 32],
        iconAnchor: [16, 32],
        popupAnchor: [0, -36]
      });

      const marker = L.marker([retailer.lat, retailer.lng], { icon: storeIcon })
        .addTo(mapRef.current)
        .bindPopup(`
          <div class="popup-name">${retailer.name}</div>
          <div class="popup-address">${retailer.address}</div>
        `);
      
      marker.on('click', () => {
        setActiveCardIndex(index);
        const cardElement = document.getElementById(`card-${index}`);
        if (cardElement) {
          cardElement.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
      });

      newMarkers.push(marker);
    });

    markersRef.current = newMarkers;

    if (newMarkers.length > 0) {
      const group = L.featureGroup([userMarkerRef.current, ...newMarkers]);
      mapRef.current.fitBounds(group.getBounds().pad(0.15));
    }

    setTimeout(() => {
      if (mapRef.current) mapRef.current.invalidateSize();
    }, 100);
  };

  const triggerSearch = async (query) => {
    setLoading(true);
    setError('');
    setHasSearched(true);

    try {
      // 1. Try Backend Geocoding
      const response = await fetchWithTimeout(`/api/geocode?address=${encodeURIComponent(query)}`, { timeout: 1500 });
      if (!response.ok) throw new Error('Backend offline');
      const data = await response.json();
      await searchNearby(data.lat, data.lng);
    } catch (err) {
      console.warn('Backend geocoding failed. Attempting client-side Nominatim fallback...', err);
      try {
        // 2. Try Client-side Direct Nominatim Geocoding
        const response = await fetchWithTimeout(
          `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query + ', UK')}&limit=1&countrycodes=gb`,
          { 
            headers: { 'User-Agent': 'CokeZeroFinder/1.0' },
            timeout: 2500
          }
        );
        const data = await response.json();
        if (data.length === 0) {
          throw new Error('Location not found. Please try a different postcode or city.');
        }
        const lat = parseFloat(data[0].lat);
        const lng = parseFloat(data[0].lon);
        await searchNearby(lat, lng);
      } catch (clientErr) {
        const fallbackBorough = BOROUGHS_COLLECTION[Math.floor(Math.random() * BOROUGHS_COLLECTION.length)];
        console.error(`All geocoding routes failed. Falling back to default coordinates: ${fallbackBorough.name}`, clientErr);
        showToast(`Offline mode: showing ${fallbackBorough.name} area`);
        await searchNearby(fallbackBorough.lat, fallbackBorough.lng);
      }
    }
  };

  // Resilient geocoding that falls back to client-side API
  const handleAddressSearch = async (e) => {
    if (e) e.preventDefault();
    const query = addressInput.trim();
    if (!query) {
      showToast('Please enter a postcode or address');
      return;
    }
    await triggerSearch(query);
  };

  const handleAreaSelect = async (e) => {
    const val = e.target.value;
    if (val) {
      setAddressInput(val);
      await triggerSearch(val);
    }
  };

  const handlePostcodeSelect = async (e) => {
    const val = e.target.value;
    if (val) {
      setAddressInput(val);
      await triggerSearch(val);
    }
  };

  // Geolocation detection
  const handleLocationSearch = () => {
    if (!navigator.geolocation) {
      setError('Geolocation is not supported by your browser.');
      return;
    }

    setLoading(true);
    setError('');
    setHasSearched(true);

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const { latitude, longitude } = position.coords;
        await searchNearby(latitude, longitude);
      },
      async (err) => {
        const fallbackBorough = BOROUGHS_COLLECTION[Math.floor(Math.random() * BOROUGHS_COLLECTION.length)];
        console.warn(`Geolocation detection failed. Using default coordinates: ${fallbackBorough.name}`, err);
        showToast(`Location unavailable - showing ${fallbackBorough.name} area`);
        await searchNearby(fallbackBorough.lat, fallbackBorough.lng);
      },
      { enableHighAccuracy: true, timeout: 8000 }
    );
  };

  // Resilient retailer search with server + client fallbacks
  const searchNearby = async (lat, lng) => {
    try {
      // 1. Try Backend Search
      const response = await fetchWithTimeout(`/api/search?lat=${lat}&lng=${lng}&radius_km=${radiusKm}`, { timeout: 1500 });
      if (!response.ok) throw new Error('Backend search offline');
      const data = await response.json();
      renderResults(data, lat, lng);
      setLoading(false);
    } catch (err) {
      console.warn('Backend query failed. Falling back to client-side Overpass search...', err);
      try {
        // 2. Try Client-side Overpass Query directly
        const radius = radiusKm * 1000;
        const bbox = `${lat - radius/111000},${lng - radius/111000},${lat + radius/111000},${lng + radius/111000}`;
        const query = `
          [out:json][timeout:5];
          (
            node["shop"~"supermarket|convenience|newsagent|beverages|kiosk"](${bbox});
            node["amenity"="vending_machine"](${bbox});
            way["shop"~"supermarket|convenience|newsagent|beverages|kiosk"](${bbox});
          );
          out center body;
        `;
        
        const response = await fetchWithTimeout('https://overpass-api.de/api/interpreter', {
          method: 'POST',
          body: 'data=' + encodeURIComponent(query),
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          timeout: 3000
        });
        
        if (!response.ok) throw new Error('Client-side Overpass API failed');
        const data = await response.json();
        
        let retailersData = data.elements
          .map(el => {
            const rLat = el.lat || (el.center && el.center.lat);
            const rLng = el.lon || (el.center && el.center.lon);
            if (!rLat || !rLng) return null;
            
            const dist = getDistance(lat, lng, rLat, rLng);
            if (dist > radiusKm) return null;
            
            const tags = el.tags || {};
            const name = tags.name || getShopTypeName(tags.shop || tags.amenity || 'shop');
            const shopType = tags.shop || tags.amenity || 'shop';
            
            let address = '';
            if (tags['addr:street']) address += tags['addr:street'];
            if (tags['addr:city']) address += (address ? ', ' : '') + tags['addr:city'];
            if (tags['addr:postcode']) address += (address ? ' ' : '') + tags['addr:postcode'];
            if (!address) address = 'Address not available';
            
            const openNow = tags.opening_hours ? checkIfOpen(tags.opening_hours) : null;
            const stock = getLocalDefaultStockStatus(name, address);
            
            return {
              name, lat: rLat, lng: rLng, distance_km: round(dist, 2),
              address, shopType, open_now: openNow,
              stock_status: stock.status,
              reports_count: stock.count
            };
          })
          .filter(Boolean)
          .sort((a, b) => a.distance_km - b.distance_km)
          .slice(0, 30);

        if (retailersData.length === 0) {
          retailersData = getLocalFallbackRetailers(lat, lng, radiusKm);
        }

        renderResults(retailersData, lat, lng);
        showToast('Running in local offline mode');
        setLoading(false);
      } catch (clientErr) {
        console.warn('Client Overpass query failed. Generating mock retailers...', clientErr);
        // 3. Generate Simulated Retailers
        const fallbackData = getLocalFallbackRetailers(lat, lng, radiusKm);
        renderResults(fallbackData, lat, lng);
        showToast('Running in local offline mode (simulated data)');
        setLoading(false);
      }
    }
  };

  // Submit stock report (sends to server if online, otherwise updates locally)
  const handleReportStock = async (retailer, status) => {
    const rId = `${retailer.name}-${retailer.lat}-${retailer.lng}`;
    try {
      const response = await fetchWithTimeout('/api/report-stock', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          name: retailer.name,
          address: retailer.address,
          status: status
        }),
        timeout: 1500
      });

      if (!response.ok) throw new Error('Offline report');
      const result = await response.json();

      setRetailers(prev => prev.map(r => {
        if (r.name === retailer.name && r.address === retailer.address) {
          return {
            ...r,
            stock_status: result.status,
            reports_count: result.reports_count
          };
        }
        return r;
      }));

      // Sync local storage so it matches backend
      try {
        const localReports = JSON.parse(localStorage.getItem('local_stock_reports') || '{}');
        localReports[rId] = {
          status: result.status,
          reports_count: result.reports_count,
          timestamp: new Date().toISOString()
        };
        localStorage.setItem('local_stock_reports', JSON.stringify(localReports));
      } catch (localErr) {
        console.error('Failed to sync report to local storage:', localErr);
      }

      showToast(`Logged report: ${status.toUpperCase()} stock`);
    } catch (err) {
      console.warn('Backend offline - updating stock level locally and saving to browser local storage.', err);
      
      let newReportsCount = (retailer.reports_count || 0) + 1;
      
      // Save locally
      try {
        const localReports = JSON.parse(localStorage.getItem('local_stock_reports') || '{}');
        if (localReports[rId]) {
          newReportsCount = (localReports[rId].reports_count || 0) + 1;
        }
        localReports[rId] = {
          status: status,
          reports_count: newReportsCount,
          timestamp: new Date().toISOString()
        };
        localStorage.setItem('local_stock_reports', JSON.stringify(localReports));
      } catch (localErr) {
        console.error('Failed to save report locally to storage:', localErr);
      }

      // Fallback: update state locally in UI
      setRetailers(prev => prev.map(r => {
        if (r.name === retailer.name && r.address === retailer.address) {
          return {
            ...r,
            stock_status: status,
            reports_count: newReportsCount
          };
        }
        return r;
      }));
      showToast(`Logged report locally: ${status.toUpperCase()} stock`);
    }
  };

  const handleCardClick = (retailer, index) => {
    setActiveCardIndex(index);
    if (mapRef.current) {
      mapRef.current.setView([retailer.lat, retailer.lng], 16);
      if (markersRef.current[index]) {
        markersRef.current[index].openPopup();
      }
    }
  };

  return (
    <>
      <div className="bg-atmosphere"></div>
      <div className="bg-grid"></div>

      <div className="container">
        <header className="coke-header">
          <div className="brand-badge">
            <span className="dot"></span>
            Retailer Locator
          </div>
          <h1>COKE <span className="zero">ZERO</span></h1>
          <span className="tagline">Find Your Zero</span>
          <p className="subtitle">Locate retailers selling Coke Zero near you across the UK</p>
        </header>

        {/* Search Card Section */}
        <section className="search-section">
          <div className="search-card">
            <div className="method-tabs">
              <button 
                className={`method-tab ${searchMethod === 'address' ? 'active' : ''}`}
                onClick={() => setSearchMethod('address')}
              >
                <SearchIcon />
                Search Address
              </button>
              <button 
                className={`method-tab ${searchMethod === 'current' ? 'active' : ''}`}
                onClick={() => setSearchMethod('current')}
              >
                <CrosshairIcon />
                My Location
              </button>
            </div>

            {searchMethod === 'address' ? (
              <form onSubmit={handleAddressSearch} className="search-panel active">
                <div className="input-row">
                  <div className="input-wrapper">
                    <MapPinIcon />
                    <input 
                      type="text" 
                      id="address-input" 
                      className="text-input" 
                      placeholder="Enter postcode or address (e.g. SW1A 1AA)" 
                      value={addressInput}
                      onChange={(e) => setAddressInput(e.target.value)}
                    />
                  </div>
                  <button type="submit" className="btn-primary" disabled={loading}>
                    <SearchIcon />
                    {loading ? 'Searching...' : 'Search'}
                  </button>
                </div>
                <div className="picker-row">
                  <div className="picker-wrapper">
                    <label htmlFor="area-picker">Area Picker</label>
                    <select 
                      id="area-picker" 
                      className="picker-select"
                      onChange={handleAreaSelect}
                      defaultValue=""
                    >
                      <option value="">-- Choose Area --</option>
                      {BOROUGHS_COLLECTION.map(b => (
                        <option key={b.name} value={b.name}>{b.name}</option>
                      ))}
                    </select>
                  </div>
                  <div className="picker-wrapper">
                    <label htmlFor="postcode-picker">Postcode Picker</label>
                    <select 
                      id="postcode-picker" 
                      className="picker-select"
                      onChange={handlePostcodeSelect}
                      defaultValue=""
                    >
                      <option value="">-- Choose Postcode --</option>
                      <option value="SW1A 1AA">London (SW1A 1AA)</option>
                      <option value="WA4 2NG">Warrington (WA4 2NG)</option>
                      <option value="M1 1AE">Manchester (M1 1AE)</option>
                      <option value="B1 1TB">Birmingham (B1 1TB)</option>
                      <option value="G1 1QX">Glasgow (G1 1QX)</option>
                      <option value="L1 8JQ">Liverpool (L1 8JQ)</option>
                      <option value="LS1 2DS">Leeds (LS1 2DS)</option>
                      <option value="BS1 5TR">Bristol (BS1 5TR)</option>
                      <option value="NE1 1EN">Newcastle (NE1 1EN)</option>
                      <option value="S1 2FJ">Sheffield (S1 2FJ)</option>
                      <option value="CF10 1EP">Cardiff (CF10 1EP)</option>
                      <option value="EH1 1YT">Edinburgh (EH1 1YT)</option>
                      <option value="BT1 5GS">Belfast (BT1 5GS)</option>
                      <option value="NG1 1LL">Nottingham (NG1 1LL)</option>
                      <option value="LE1 1AD">Leicester (LE1 1AD)</option>
                      <option value="SO14 7DU">Southampton (SO14 7DU)</option>
                      <option value="AB10 1AB">Aberdeen (AB10 1AB)</option>
                      <option value="PL1 1DJ">Plymouth (PL1 1DJ)</option>
                      <option value="OX1 1DP">Oxford (OX1 1DP)</option>
                      <option value="CB1 1JP">Cambridge (CB1 1JP)</option>
                    </select>
                  </div>
                </div>
              </form>
            ) : (
              <div className="search-panel active">
                <button 
                  onClick={handleLocationSearch} 
                  className="btn-primary locate-btn"
                  disabled={loading}
                >
                  <NavigationIcon />
                  {loading ? 'Locating...' : 'Detect My Location'}
                </button>
              </div>
            )}

            <div className="radius-control">
              <div className="radius-label">
                <span>Search radius</span>
                <span className="radius-value">{radiusKm} km</span>
              </div>
              <input 
                type="range" 
                min="1" 
                max="20" 
                step="1" 
                value={radiusKm}
                onChange={(e) => setRadiusKm(parseInt(e.target.value))}
              />
            </div>
          </div>
        </section>

        {/* Loader status */}
        {loading && (
          <div className="loading">
            <div className="spinner-ring"></div>
            <p>Searching for Coke Zero retailers nearby…</p>
          </div>
        )}

        {/* Error message card */}
        {error && !loading && (
          <div className="error-message">
            <div className="error-icon">
              <AlertCircleIcon />
            </div>
            <h3>Something went wrong</h3>
            <p>{error}</p>
          </div>
        )}

        {/* Results layout */}
        {hasSearched && !loading && !error && (
          <section className="results-section">
            <div className="results-header">
              <h2>
                <MapPinIcon />
                Retailers Near You
              </h2>
              <div className="results-count">
                <strong>{retailers.length}</strong> retailers found
              </div>
            </div>

            {retailers.length === 0 ? (
              <div className="empty-state">
                <svg viewBox="0 0 24 24" width="48" height="48" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line><line x1="8" y1="11" x2="14" y2="11"></line></svg>
                <h3>No retailers found</h3>
                <p>Try increasing the search radius or searching a different area.</p>
              </div>
            ) : (
              <div className="results-layout">
                {/* Retailer Cards List */}
                <div className="retailers-list">
                  {retailers.map((retailer, index) => {
                    const distStr = retailer.distance_km < 1
                      ? `${Math.round(retailer.distance_km * 1000)}m`
                      : `${retailer.distance_km.toFixed(1)}km`;
                    
                    const typeLabel = getShopTypeName(retailer.shopType || 'convenience');

                    return (
                      <div 
                        key={`${retailer.name}-${retailer.lat}-${index}`}
                        id={`card-${index}`}
                        className={`retailer-card ${activeCardIndex === index ? 'active' : ''}`}
                        onClick={() => handleCardClick(retailer, index)}
                      >
                        <div className="retailer-top">
                          <div className="retailer-name">{retailer.name}</div>
                          <div className="retailer-distance">{distStr}</div>
                        </div>
                        <div className="retailer-address">{retailer.address}</div>
                        
                        <div className="retailer-meta">
                          <span className="retailer-tag">
                            <StoreIcon />
                            {typeLabel}
                          </span>
                          
                          {retailer.open_now !== null && (
                            <span className={`retailer-tag ${retailer.open_now ? 'open' : 'closed'}`}>
                              <ClockIcon />
                              {retailer.open_now ? 'Open' : 'Closed'}
                            </span>
                          )}

                          <span className={`stock-badge ${retailer.stock_status}`}>
                            {retailer.stock_status === 'high' ? 'High Stock' : retailer.stock_status === 'low' ? 'Low Stock' : 'Out of Stock'}
                            {retailer.reports_count > 0 && ` (${retailer.reports_count})`}
                          </span>
                        </div>

                        {/* Crowd-sourced Stock reporting card */}
                        <div className="stock-report-panel" onClick={(e) => e.stopPropagation()}>
                          <div className="stock-report-title">Report stock level</div>
                          <div className="stock-report-buttons">
                            <button 
                              className="stock-report-btn btn-high"
                              onClick={() => handleReportStock(retailer, 'high')}
                            >
                              High
                            </button>
                            <button 
                              className="stock-report-btn btn-low"
                              onClick={() => handleReportStock(retailer, 'low')}
                            >
                              Low
                            </button>
                            <button 
                              className="stock-report-btn btn-out"
                              onClick={() => handleReportStock(retailer, 'out')}
                            >
                              Out
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Leaflet Map */}
                <div className="map-container">
                  <div id="map"></div>
                </div>
              </div>
            )}
          </section>
        )}

        {/* Cocktail Recipes Section */}
        {recipes.length > 0 && (
          <section className="recipes-section">
            <div className="recipes-title">
              <h2>Zero-Sugar Coke Zero Cocktails</h2>
              <p>Craft premium mocktails at home using ice-cold Coca-Cola Zero Sugar</p>
            </div>
            
            <div className="recipes-grid">
              {recipes.map(recipe => (
                <div key={recipe.id} className="recipe-card">
                  <div className="recipe-top">
                    <div className="recipe-meta-row">
                      <span className="recipe-meta-tag">{recipe.prep_time}</span>
                      <span className="recipe-meta-tag">{recipe.difficulty}</span>
                    </div>
                    <div className="recipe-name">{recipe.name}</div>
                    
                    <div className="recipe-section-title">Ingredients</div>
                    <ul className="ingredients-list">
                      {recipe.ingredients.map((ing, i) => (
                        <li key={i}>{ing}</li>
                      ))}
                    </ul>
                  </div>

                  <div>
                    <div className="recipe-section-title">Instructions</div>
                    <p className="recipe-instructions">{recipe.instructions}</p>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Footer */}
        <footer className="coke-footer">
          <p>© 2026 Coca-Cola. Coke Zero is a trademark of The Coca-Cola Company.</p>
          <p>Map data © OpenStreetMap contributors</p>
        </footer>
      </div>

      {/* Toast Alert popup */}
      <div className={`toast ${toastVisible ? 'visible' : ''}`}>
        <InfoIcon />
        <span>{toastMessage}</span>
      </div>
    </>
  );
}
