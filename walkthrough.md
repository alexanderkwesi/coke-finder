# Walkthrough - Coke Finder HERE Geocoding Integration

We have successfully integrated the **HERE Geocoding API** into the backend geocoding resolver chain, using the user's HERE developer API Key.

---

## Changes Implemented

### 1. Environment Configuration ([backend/.env](file:///C:/Users/user/Documents/coke-finder/backend/.env))
Added the HERE developer API Key:
`HERE_API_KEY="5Tm44TCXX1VeOttuDuJ3f-_7k3weT0mVRf2XqqDNfKo"`

### 2. Backend Resolver Chain ([backend/main.py](file:///C:/Users/user/Documents/coke-finder/backend/main.py))
- **[geocode_here Helper:](file:///C:/Users/user/Documents/coke-finder/backend/main.py#L253-L274)** Added a helper function to call the HERE Geocoding API endpoint (`https://geocode.search.hereapi.com/v1/geocode`), retrieving the coordinates (`position.lat` / `position.lng`) and the formatted label.
- **Geocoding Chain Fallback:** Updated [geocode_address](file:///C:/Users/user/Documents/coke-finder/backend/main.py#L285-L330) to attempt:
  1. Google Geocoding (Exact Address)
  2. **HERE Geocoding (Exact Address)**
  3. Google Geocoding (Similar Postcode Fallback)
  4. **HERE Geocoding (Similar Postcode Fallback)**
  5. Nominatim geocoding fallbacks and predefined UK boroughs.
This guarantees that if the Google Maps key restricts or disables Geocoding access, the HERE API Key resolves the coordinates successfully.

---

## Verification Results

### 1. Build Verification
- Both servers restarted cleanly and are running concurrently:
  *   **Vite React Frontend:** [http://localhost:5173](http://localhost:5173)
  *   **FastAPI Python Backend:** [http://localhost:8000](http://localhost:8000)
- The test suite verified that `/api/geocode` resolves correctly and all integrations succeed.
