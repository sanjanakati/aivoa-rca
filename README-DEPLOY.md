# AIVOA RCA — final cleaned source

## Local run (Windows PowerShell)

### Backend
1. Open PowerShell in `AIVOA-RCA/backend`
2. Create/activate venv:
   `py -m venv venv`
   `.\venv\Scripts\Activate.ps1`
3. Install:
   `pip install -r requirements.txt`
4. Create `backend/.env` with:
   ```
   GROQ_API_KEY=YOUR_NEW_GROQ_KEY
   GROQ_MODEL=openai/gpt-oss-120b
   DATABASE_URL=postgresql+psycopg://USER:PASSWORD@localhost:5432/aivoa_rca
   ```
5. Run:
   `uvicorn app.main:app --reload --port 8000`

### Frontend (second terminal)
1. Open PowerShell in `AIVOA-RCA/frontend`
2. Run:
   `npm install`
   `npm run dev`
3. Open http://localhost:5173

## Deployment (Render)

1. Push this project to a GitHub repository and connect that repository to Render. Keep `.env` files out of Git; add secrets only in Render's environment-variable settings.
2. Create a Render PostgreSQL database. Copy its **Internal Database URL** if backend web service and DB are in Render same region; otherwise use External URL.
3. Create a Render **Web Service** for backend:
   - Root Directory: `backend`
   - Runtime: Python
   - Build Command: `pip install -r requirements.txt`
   - Start Command: `uvicorn app.main:app --host 0.0.0.0 --port $PORT`
   - Environment variables:
     - `GROQ_API_KEY` = newly generated Groq key
     - `GROQ_MODEL` = `openai/gpt-oss-120b`
     - `DATABASE_URL` = Render PostgreSQL URL, using the `postgresql+psycopg://` scheme (replace a leading `postgres://` or `postgresql://` if present).
     - `FRONTEND_ORIGINS` = the Render Static Site URL, such as `https://your-site.onrender.com` (no trailing slash). Add comma-separated origins if you also use a custom domain.
4. Create a Render **Static Site** for frontend:
   - Root Directory: `frontend`
   - Build Command: `npm install && npm run build`
   - Publish Directory: `dist`
   - Environment variable: `VITE_API_URL` = `https://YOUR-BACKEND.onrender.com` (no trailing slash). Set this before the first build; changing it requires a redeploy.
5. After the first frontend deploy, copy its `onrender.com` URL into the backend's `FRONTEND_ORIGINS` variable and redeploy the backend.
6. Verify backend `/api/health` and `/api/db-health`; then open the frontend and test a new text investigation, save, and refresh the register.

## Important
- The uploaded ZIP contained a live Groq API key. It has been removed from this cleaned package. Revoke that key in Groq Console and create a new one before deployment.
- Never commit `.env`, API keys, assignment materials, screenshots, or demo videos to a public Git repository.
- This app saves investigations as `Under Review`. It does not currently implement a qualified QA approval/closure workflow; do not claim that cases can be closed.
- Dashboard and register are intended for tracking saved investigations; the current app does not expose a close-case button.
