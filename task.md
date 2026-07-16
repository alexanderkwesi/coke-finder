# Coke Zero Finder Migration Tasks

- `[x]` Clean up legacy folders and files
  - `[x]` Delete `frontend_backup/` directory
  - `[x]` Delete legacy static frontend files (`script.js`, `style.css`, `index.html` from `frontend/`)
- `[x]` Setup Python FastAPI backend
  - `[x]` Update `backend/requirements.txt`
  - `[x]` Update `backend/main.py` to use FastAPI
  - `[x]` Verify backend endpoints locally
- `[ ]` Setup React frontend with Vite
  - `[ ]` Initialize Vite React app in `frontend/`
  - `[ ]` Port dark styling to `src/index.css`
  - `[ ]` Implement `src/App.jsx` with Leaflet map, tabs, and stock reporting
  - `[ ]` Connect frontend to FastAPI backend
- `[ ]` Verification
  - `[ ]` Verify search and address geocoding
  - `[ ]` Verify stock reporting updates UI in real-time
  - `[ ]` Clean up any other non-essential files
