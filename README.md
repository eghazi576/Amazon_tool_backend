# Amazon Insight Hub — Complete Setup Guide

## Architecture

```
Frontend (React + Vite)
  ↓ Supabase Auth (login/signup)
  ↓ Express Backend (Keepa API + DB writes)
  ↓ Supabase DB (PostgreSQL — stores users + history)
```

---

## Step 1 — Create Supabase Project (free)

1. Go to https://supabase.com → **New Project**
2. Choose a name, set a database password, pick a region
3. Wait ~2 minutes for it to provision

### Step 1a — Run the database schema

1. In your Supabase project → **SQL Editor** → **New Query**
2. Open `backend/schema.sql` from this project
3. Paste the entire contents and click **Run**
4. You should see: `Success. No rows returned`

### Step 1b — Get your API keys

Go to **Settings → API** in your Supabase dashboard. You need:

| Key | Where to use |
|-----|-------------|
| **Project URL** | Both frontend `.env` and backend `.env` |
| **anon / public key** | Frontend `.env` AND backend `.env` |
| **service_role / secret key** | Backend `.env` ONLY — never in frontend! |

---

## Step 2 — Backend Setup

```bash
cd backend
npm install
cp .env.example .env
```

Edit `backend/.env`:
```env
KEEPA_API_KEY=your_keepa_api_key_here

SUPABASE_URL=https://your-project-ref.supabase.co
SUPABASE_ANON_KEY=eyJ...your-anon-key
SUPABASE_SERVICE_ROLE_KEY=eyJ...your-service-role-key

PORT=3001
CORS_ORIGIN=http://localhost:5173
```

Start the backend:
```bash
npm run dev     # development (auto-restarts)
npm start       # production
```

You should see:
```
✅  Amazon Insight Hub backend running on port 3001
   KEEPA_API_KEY:          ✓ set
   SUPABASE_URL:           ✓ set
   SUPABASE_SERVICE_ROLE:  ✓ set
   SUPABASE_ANON_KEY:      ✓ set
```

---

## Step 3 — Frontend Setup

```bash
cd frontend
npm install
cp .env.example .env
```

Edit `frontend/.env`:
```env
VITE_SUPABASE_URL=https://your-project-ref.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...your-anon-key

VITE_BACKEND_URL=http://localhost:3001
```

Start the frontend:
```bash
npm run dev
```

Open http://localhost:5173

---

## How it works

### Authentication
- Supabase handles all auth (email/password, magic link, Google OAuth)
- User signs up → Supabase creates user in `auth.users`
- Frontend gets a JWT token from Supabase
- That JWT is sent as `Authorization: Bearer <token>` to your backend
- Backend verifies it with Supabase before any DB operation

### Search History
- When user clicks "Calculate Score" on any ASIN:
  1. Score is calculated locally
  2. Full result (ASIN, price, profit, ROI, BSR, etc.) is saved to `asin_searches` table via backend
  3. History page loads from DB — works across devices and browsers

### Data Security
- Row Level Security (RLS) is enabled — users only see their own rows
- Backend uses service_role key to write to DB (bypasses RLS for server operations)
- Frontend never sees the service_role key

---

## Keepa API Key

Get your key at: https://keepa.com/#!api

- Free tier: 100 tokens/day (enough for ~20-50 lookups/day)
- Each product lookup costs ~2-5 tokens
- Paid plans from $19/month

---

## Deployment

### Backend (deploy to Railway / Render / Fly.io)
1. Push `backend/` folder to GitHub
2. Connect to Railway/Render
3. Set environment variables (same as `.env`)
4. Deploy

### Frontend (deploy to Vercel / Netlify)
1. Push `frontend/` folder to GitHub
2. Connect to Vercel/Netlify
3. Set environment variables:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
   - `VITE_BACKEND_URL` → your deployed backend URL
4. Build command: `npm run build`
5. Output directory: `dist`

### Update CORS after deployment
In `backend/.env` on your server:
```env
CORS_ORIGIN=https://your-frontend-domain.com
```
