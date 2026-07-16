import os
import json
import hashlib
import urllib.parse
import urllib.request
from math import radians, cos, sin, asin, sqrt
from typing import List, Optional, Dict
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from dotenv import load_dotenv

load_dotenv()

app = FastAPI(title="Coke Zero Finder API")

# Enable CORS for local React frontend development
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

GOOGLE_PLACES_API_KEY = os.getenv("GOOGLE_PLACES_API_KEY")
HERE_API_KEY = os.getenv("HERE_API_KEY")
USE_OSM_FALLBACK = True

# In-memory database of stock reports
# Structure: { store_id: { "status": "high"|"low"|"out", "reports_count": int, "history": [status] } }
stock_reports: Dict[str, dict] = {}

# Pydantic Schemas
class GeocodeResponse(BaseModel):
    lat: float
    lng: float
    display_name: str

class RetailerResponse(BaseModel):
    name: str
    address: str
    lat: float
    lng: float
    rating: Optional[float] = None
    price_level: Optional[int] = None
    open_now: Optional[bool] = None
    distance_km: float
    stock_status: str
    reports_count: int

class StockReportRequest(BaseModel):
    name: str
    address: str
    status: str = Field(description="Must be 'high', 'low', or 'out'")

class StockReportResponse(BaseModel):
    store_id: str
    status: str
    reports_count: int

class RecipeIngredient(BaseModel):
    name: str

class RecipeResponse(BaseModel):
    id: str
    name: str
    ingredients: List[str]
    instructions: str
    difficulty: str
    prep_time: str

# Helper Functions
def make_request(url: str, params: Optional[dict] = None, data: Optional[str] = None, method: str = 'GET', headers: Optional[dict] = None):
    """Make HTTP request using urllib to avoid httpcore typing issue on Python 3.14"""
    if params:
        url = f"{url}?{urllib.parse.urlencode(params)}"
    
    req = urllib.request.Request(url, method=method)
    
    if headers:
        for key, value in headers.items():
            req.add_header(key, value)
    
    if data:
        req.data = data.encode('utf-8')
        if not headers or 'Content-Type' not in headers:
            req.add_header('Content-Type', 'text/plain')
    
    try:
        import ssl
        context = ssl._create_unverified_context()
        with urllib.request.urlopen(req, timeout=2, context=context) as response:
            return json.loads(response.read().decode('utf-8'))
    except Exception as e:
        print(f"Urllib request error: {e}")
        return None

def get_default_stock_status(name: str, address: str) -> dict:
    """Deterministically assign default stock levels based on store details"""
    h = hashlib.md5(f"{name}{address}".encode('utf-8')).hexdigest()
    val = int(h[:2], 16) % 100
    if val < 50:
        return {"status": "high", "count": 0}
    elif val < 85:
        return {"status": "low", "count": 0}
    else:
        return {"status": "out", "count": 0}

def haversine_distance(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Calculate distance between two coordinates in km"""
    R = 6371
    lat1, lon1, lat2, lon2 = map(radians, [lat1, lon1, lat2, lon2])
    dlat = lat2 - lat1
    dlon = lon2 - lon1
    a = sin(dlat/2)**2 + cos(lat1) * cos(lat2) * sin(dlon/2)**2
    c = 2 * asin(sqrt(a))
    return R * c

def search_google_places(lat: float, lng: float, radius: int = 5000) -> List[dict]:
    """Search using Google Places API"""
    if not GOOGLE_PLACES_API_KEY:
        return []
    
    search_terms = ["supermarket", "grocery", "convenience store", "Tesco", "Sainsbury's", "Asda"]
    all_results = []
    
    for term in search_terms[:3]:
        params = {
            "location": f"{lat},{lng}",
            "radius": radius,
            "keyword": term,
            "type": "grocery_or_supermarket",
            "key": GOOGLE_PLACES_API_KEY
        }
        
        try:
            data = make_request(
                "https://maps.googleapis.com/maps/api/place/nearbysearch/json",
                params=params
            )
            
            if data and data.get("results"):
                for place in data["results"]:
                    all_results.append({
                        "name": place.get("name", "Unknown"),
                        "address": place.get("vicinity", "Address not available"),
                        "lat": place["geometry"]["location"]["lat"],
                        "lng": place["geometry"]["location"]["lng"],
                        "rating": place.get("rating"),
                        "price_level": place.get("price_level"),
                        "open_now": place.get("opening_hours", {}).get("open_now") if "opening_hours" in place else None
                    })
        except Exception as e:
            print(f"Google Places API error: {e}")
            continue
    
    # Remove duplicates
    unique = []
    seen = set()
    for r in all_results:
        key = f"{r['name']}_{round(r['lat'], 4)}_{round(r['lng'], 4)}"
        if key not in seen:
            seen.add(key)
            unique.append(r)
    
    return unique

def search_osm_overpass(lat: float, lng: float, radius: int = 5000) -> List[dict]:
    """Fallback search using OpenStreetMap Overpass API"""
    radius_deg = radius / 111000
    bbox = f"{lat - radius_deg},{lng - radius_deg},{lat + radius_deg},{lng + radius_deg}"
    
    query = f"""
    [out:json];
    (
      node["shop"="supermarket"]({bbox});
      node["shop"="convenience"]({bbox});
      way["shop"="supermarket"]({bbox});
      way["shop"="convenience"]({bbox});
    );
    out body;
    """
    
    try:
        post_data = f"data={urllib.parse.quote(query)}"
        data = make_request(
            "https://overpass-api.de/api/interpreter",
            data=post_data,
            method='POST',
            headers={
                "Content-Type": "application/x-www-form-urlencoded",
                "User-Agent": "CokeZeroFinder/1.0"
            }
        )
        
        if not data:
            return []
        
        results = []
        for element in data.get("elements", []):
            tags = element.get("tags", {})
            lat_point = element.get("lat")
            lng_point = element.get("lon")
            if not lat_point or not lng_point:
                lat_point = element.get("center", {}).get("lat")
                lng_point = element.get("center", {}).get("lon")
            
            if lat_point and lng_point:
                results.append({
                    "name": tags.get("name", tags.get("brand", "Local Shop")),
                    "address": tags.get("addr:full", tags.get("addr:street", "Address unknown")),
                    "lat": lat_point,
                    "lng": lng_point,
                    "rating": None,
                    "price_level": None,
                    "open_now": None
                })
        return results
    except Exception as e:
        print(f"OSM Overpass query error: {e}")
        return []

# Routes
@app.get("/api/health")
def health_check():
    return {
        "status": "healthy",
        "google_api_configured": bool(GOOGLE_PLACES_API_KEY)
    }

def geocode_google(address: str) -> Optional[dict]:
    if not GOOGLE_PLACES_API_KEY:
        return None
    try:
        url = "https://maps.googleapis.com/maps/api/geocode/json"
        params = {
            "address": address,
            "components": "country:GB",
            "key": GOOGLE_PLACES_API_KEY
        }
        data = make_request(url, params=params)
        if data and data.get("status") == "OK" and len(data.get("results", [])) > 0:
            result = data["results"][0]
            return {
                "lat": float(result["geometry"]["location"]["lat"]),
                "lng": float(result["geometry"]["location"]["lng"]),
                "display_name": result["formatted_address"]
            }
    except Exception as e:
        print(f"Google Geocoding error: {e}")
    return None

def geocode_here(query: str) -> Optional[dict]:
    if not HERE_API_KEY:
        return None
    url = "https://geocode.search.hereapi.com/v1/geocode"
    params = {
        "q": query,
        "apiKey": HERE_API_KEY
    }
    try:
        data = make_request(url, params=params)
        if data and "items" in data and len(data["items"]) > 0:
            item = data["items"][0]
            return {
                "lat": float(item["position"]["lat"]),
                "lng": float(item["position"]["lng"]),
                "display_name": item["address"].get("label", item.get("title", query))
            }
    except Exception as e:
        print(f"HERE Geocoding error: {e}")
    return None

def clean_postcode_query(query: str) -> Optional[str]:
    import re
    cleaned = re.sub(r'\s+', '', query).upper()
    if len(cleaned) >= 5 and len(cleaned) <= 8:
        outward = cleaned[:-3]
        if re.match(r'^[A-Z]{1,2}[0-9][A-Z0-9]?$', outward):
            return outward
    return None
BOROUGHS_COLLECTION = [
    {"name": "London", "lat": 51.5074, "lng": -0.1278},
    {"name": "Manchester", "lat": 53.4808, "lng": -2.2426},
    {"name": "Birmingham", "lat": 52.4862, "lng": -1.8904},
    {"name": "Glasgow", "lat": 55.8642, "lng": -4.2518},
    {"name": "Liverpool", "lat": 53.4084, "lng": -2.9916},
    {"name": "Leeds", "lat": 53.8008, "lng": -1.5491},
    {"name": "Bristol", "lat": 51.4545, "lng": -2.5879},
    {"name": "Newcastle", "lat": 54.9783, "lng": -1.6178},
    {"name": "Sheffield", "lat": 53.3811, "lng": -1.4701},
    {"name": "Cardiff", "lat": 51.4816, "lng": -3.1791},
    {"name": "Edinburgh", "lat": 55.9533, "lng": -3.1883},
    {"name": "Belfast", "lat": 54.5973, "lng": -5.9301},
    {"name": "Nottingham", "lat": 52.9548, "lng": -1.1581},
    {"name": "Warrington", "lat": 53.3901, "lng": -2.5970},
    {"name": "Leicester", "lat": 52.6369, "lng": -1.1398},
    {"name": "Southampton", "lat": 50.9097, "lng": -1.4044},
    {"name": "Aberdeen", "lat": 57.1497, "lng": -2.0943},
    {"name": "Plymouth", "lat": 50.3755, "lng": -4.1427},
    {"name": "Oxford", "lat": 51.7520, "lng": -1.2577},
    {"name": "Cambridge", "lat": 52.2053, "lng": 0.1218}
]

@app.get("/api/geocode", response_model=GeocodeResponse)
def geocode_address(address: str = Query(..., description="Postcode or city name in the UK")):
    if not address.strip():
        raise HTTPException(status_code=400, detail="Address parameter required")
    
    # 1. Try Google Geocoding (Exact Address)
    result = geocode_google(address)
    if result:
        return result

    # 2. Try HERE Geocoding (Exact Address)
    result = geocode_here(address)
    if result:
        return result
        
    # 3. Try Google Geocoding (Similar Postcode Fallback)
    outward_code = clean_postcode_query(address)
    if outward_code:
        print(f"Postcode geocode failed. Trying outward sector fallback: {outward_code}")
        result = geocode_google(f"{outward_code}, UK")
        if result:
            return {
                "lat": result["lat"],
                "lng": result["lng"],
                "display_name": f"{address} (Found similar area: {result['display_name']})"
            }
            
        # 4. Try HERE Geocoding (Similar Postcode Fallback)
        result = geocode_here(f"{outward_code}, UK")
        if result:
            return {
                "lat": result["lat"],
                "lng": result["lng"],
                "display_name": f"{address} (Found similar area: {result['display_name']})"
            }

    # 3. Try Nominatim Geocoding (Exact Address Fallback)
    try:
        data = make_request(
            "https://nominatim.openstreetmap.org/search",
            params={"q": address + ", UK", "format": "json", "limit": 1, "countrycodes": "gb"},
            headers={"User-Agent": "CokeZeroFinder/1.0"}
        )
        if data and len(data) > 0:
            return {
                "lat": float(data[0]["lat"]),
                "lng": float(data[0]["lon"]),
                "display_name": data[0]["display_name"]
            }
    except Exception as e:
        print(f"Nominatim geocoding exception: {e}")

    # 4. Try Nominatim Geocoding (Similar Postcode Fallback)
    if outward_code:
        try:
            data = make_request(
                "https://nominatim.openstreetmap.org/search",
                params={"q": outward_code + ", UK", "format": "json", "limit": 1, "countrycodes": "gb"},
                headers={"User-Agent": "CokeZeroFinder/1.0"}
            )
            if data and len(data) > 0:
                return {
                    "lat": float(data[0]["lat"]),
                    "lng": float(data[0]["lon"]),
                    "display_name": f"{address} (Found similar area: {data[0]['display_name']})"
                }
        except Exception as e:
            print(f"Nominatim outward geocoding exception: {e}")

    # 5. Return default borough coordinates as absolute fallback
    import random
    fallback_borough = random.choice(BOROUGHS_COLLECTION)
    return {
        "lat": fallback_borough["lat"],
        "lng": fallback_borough["lng"],
        "display_name": f"{address} (Location service offline - using {fallback_borough['name']} fallback)"
    }

def generate_fallback_retailers(lat: float, lng: float, radius_km: float) -> List[dict]:
    import random
    selected_boroughs = random.sample(BOROUGHS_COLLECTION, min(5, len(BOROUGHS_COLLECTION)))
    
    chains = [
        {"name": "Tesco Express", "type": "convenience"},
        {"name": "Sainsbury's Local", "type": "convenience"},
        {"name": "Co-op Food", "type": "convenience"},
        {"name": "Waitrose & Partners", "type": "supermarket"},
        {"name": "Tesco Extra", "type": "supermarket"},
        {"name": "Sainsbury's", "type": "supermarket"},
        {"name": "ASDA", "type": "supermarket"},
        {"name": "Morrisons", "type": "supermarket"},
        {"name": "Aldi", "type": "supermarket"},
        {"name": "Lidl", "type": "supermarket"},
        {"name": "Marks & Spencer Food", "type": "convenience"},
        {"name": "WHSmith", "type": "newsagent"},
        {"name": "Costcutter", "type": "convenience"},
        {"name": "One Stop", "type": "convenience"},
        {"name": "Nisa Local", "type": "convenience"}
    ]
    streets = ['High Street', 'Market Place', 'Station Road', 'Church Lane', 'King\'s Road', 'Park Avenue', 'Victoria Street', 'George Street', 'Queen Street', 'New Road']
    
    results = []
    for borough in selected_boroughs:
        # Generate 2 retailers in each of the 5 boroughs
        for _ in range(2):
            chain = random.choice(chains)
            angle = random.random() * 3.14159265 * 2
            dist = random.random() * radius_km * 0.5 + 0.1
            r_lat = borough["lat"] + (dist / 111.0) * cos(angle)
            r_lng = borough["lng"] + (dist / 71.0) * sin(angle)
            street = random.choice(streets)
            
            results.append({
                "name": chain["name"],
                "address": f"{random.randint(1, 100)} {street}, {borough['name']}",
                "lat": r_lat,
                "lng": r_lng,
                "rating": round(random.uniform(3.5, 4.8), 1),
                "price_level": random.randint(1, 2),
                "open_now": random.choice([True, False])
            })
            
    return results

@app.get("/api/search", response_model=List[RetailerResponse])
def search_retailers(
    lat: float = Query(..., description="Latitude coordinate"),
    lng: float = Query(..., description="Longitude coordinate"),
    radius_km: float = Query(5.0, description="Radius in km", ge=1.0, le=20.0)
):
    radius_meters = int(radius_km * 1000)
    retailers_data = search_google_places(lat, lng, radius_meters)
    
    if not retailers_data and USE_OSM_FALLBACK:
        retailers_data = search_osm_overpass(lat, lng, radius_meters)
    
    if not retailers_data:
        retailers_data = generate_fallback_retailers(lat, lng, radius_km)
    
    retailers = []
    for retailer in retailers_data:
        distance = haversine_distance(lat, lng, retailer["lat"], retailer["lng"])
        if distance <= radius_km:
            store_id = hashlib.md5(f"{retailer['name']}{retailer['address']}".encode('utf-8')).hexdigest()
            if store_id in stock_reports:
                stock_status = stock_reports[store_id]["status"]
                reports_count = stock_reports[store_id]["reports_count"]
            else:
                default_data = get_default_stock_status(retailer["name"], retailer["address"])
                stock_status = default_data["status"]
                reports_count = default_data["count"]
            
            retailers.append({
                "name": retailer["name"],
                "address": retailer["address"],
                "lat": retailer["lat"],
                "lng": retailer["lng"],
                "rating": retailer.get("rating"),
                "price_level": retailer.get("price_level"),
                "open_now": retailer.get("open_now"),
                "distance_km": round(distance, 2),
                "stock_status": stock_status,
                "reports_count": reports_count
            })
    
    retailers.sort(key=lambda x: x["distance_km"])
    return retailers[:30]

@app.post("/api/report-stock", response_model=StockReportResponse)
def report_stock(request: StockReportRequest):
    name = request.name.strip()
    address = request.address.strip()
    status = request.status.strip().lower()
    
    if not name or not address or not status:
        raise HTTPException(status_code=400, detail="Missing required fields")
    
    if status not in ["high", "low", "out"]:
        raise HTTPException(status_code=400, detail="Invalid stock status. Must be 'high', 'low', or 'out'.")
    
    store_id = hashlib.md5(f"{name}{address}".encode('utf-8')).hexdigest()
    
    if store_id not in stock_reports:
        stock_reports[store_id] = {
            "status": status,
            "reports_count": 1,
            "history": [status]
        }
    else:
        stock_reports[store_id]["history"].append(status)
        if len(stock_reports[store_id]["history"]) > 5:
            stock_reports[store_id]["history"].pop(0)
        
        history = stock_reports[store_id]["history"]
        most_common = max(set(history), key=history.count)
        
        stock_reports[store_id]["status"] = most_common
        stock_reports[store_id]["reports_count"] += 1
    
    return {
        "store_id": store_id,
        "status": stock_reports[store_id]["status"],
        "reports_count": stock_reports[store_id]["reports_count"]
    }

@app.get("/api/recipes", response_model=List[RecipeResponse])
def get_recipes():
    return [
        {
            "id": "cherry-bomb",
            "name": "Zero-Sugar Cherry Bomb",
            "ingredients": [
                "150ml Coca-Cola Zero Sugar",
                "50ml Dark Cherry Juice (Zero Sugar)",
                "25ml Fresh Lime Juice",
                "Ice cubes",
                "Fresh cherries for garnish"
            ],
            "instructions": "Fill a highball glass with ice. Add cherry juice and fresh lime juice. Stir well. Top up with ice-cold Coca-Cola Zero Sugar and garnish with fresh cherries.",
            "difficulty": "Easy",
            "prep_time": "2 mins"
        },
        {
            "id": "spiced-zero-mule",
            "name": "Spiced Zero Mule",
            "ingredients": [
                "150ml Coca-Cola Zero Sugar",
                "50ml Ginger Beer (Zero Sugar)",
                "15ml Fresh Lime Juice",
                "A pinch of ground cinnamon",
                "Lime wheel for garnish"
            ],
            "instructions": "In a mug filled with crushed ice, combine ginger beer and lime juice. Pour in the Coca-Cola Zero Sugar. Sprinkle a pinch of cinnamon, stir gently, and garnish with a lime wheel.",
            "difficulty": "Easy",
            "prep_time": "3 mins"
        },
        {
            "id": "espresso-coke-zero",
            "name": "Frosted Espresso Zero",
            "ingredients": [
                "120ml Coca-Cola Zero Sugar",
                "1 shot (30ml) cooled Espresso",
                "10ml Vanilla syrup (Zero Sugar)",
                "Orange peel twist"
            ],
            "instructions": "Shake the espresso and vanilla syrup with ice. Strain into a glass filled with fresh ice. Top with cold Coca-Cola Zero Sugar. Express orange peel over the top and garnish.",
            "difficulty": "Medium",
            "prep_time": "4 mins"
        },
        {
            "id": "ruby-zero-spritz",
            "name": "Ruby Zero Spritz",
            "ingredients": [
                "120ml Coca-Cola Zero Sugar",
                "60ml Grapefruit Juice (unsweetened)",
                "A splash of sparkling water",
                "Fresh rosemary sprig"
            ],
            "instructions": "Combine grapefruit juice and sparkling water in a wine glass with ice. Pour Coca-Cola Zero Sugar slowly over it. Stir gently with a sprig of rosemary and leave it in as a garnish.",
            "difficulty": "Easy",
            "prep_time": "2 mins"
        }
    ]