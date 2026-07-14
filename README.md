# Amazon Insight Hub — Backend

Node.js + Express + PostgreSQL + Prisma ORM

## Folder Structure

```
backend/
├── app.js                    # Entry point
├── prisma/
│   └── schema.prisma         # DB schema
├── config/
│   └── env.js                # Env validation (Zod)
├── db/
│   └── prisma.js             # Prisma client singleton
├── controllers/
│   ├── auth/authController.js
│   ├── keepa/keepaController.js
│   └── search/searchController.js
├── services/
│   ├── auth/authService.js
│   ├── keepa/keepaService.js
│   └── search/searchService.js
├── model/
│   ├── auth/authModel.js
│   └── search/searchModel.js
├── routes/
│   ├── index.js
│   ├── auth/authRoutes.js
│   ├── keepa/keepaRoutes.js
│   └── search/searchRoutes.js
├── middlewares/
│   ├── requireAuth.js
│   └── errorHandler.js
├── validations/
│   ├── auth/authValidation.js
│   ├── keepa/keepaValidation.js
│   └── search/searchValidation.js
└── utils/
    ├── response.js           # sendSuccess, sendError, AppError
    ├── jwt.js                # signToken, verifyToken
    └── keepa.js              # fee engine + Keepa helpers
```

## Security — secrets

**Never put a secret in source.** Not in a config file, not in a helper, not in a
comment, not "temporarily". Everything goes in `.env`, which is gitignored, and is
validated on boot by `config/env.js` — a missing or malformed variable exits the
process rather than starting half-configured.

`.env.example` lists every variable with placeholder values. Copy it, fill it in,
and never commit the result.

### What lives where

| Secret | Home | Never |
|---|---|---|
| `DATABASE_URL` | backend `.env` | Anywhere client-side |
| `JWT_SECRET`, `JWT_REFRESH_SECRET` | backend `.env` | Anywhere client-side |
| `KEEPA_API_KEY` | backend `.env` | Anywhere client-side |

The frontend is Vite. **Every variable prefixed `VITE_` is inlined into the
JavaScript bundle and is readable by anyone with View Source.** There is no such
thing as a secret `VITE_` variable. The only one this app uses is
`VITE_BACKEND_URL`, which is a public URL by definition — the browser has to know
where to send its requests.

If you ever need the browser to reach a keyed third-party API, proxy it through
the backend. That is why `KEEPA_API_KEY` is server-side and the frontend calls
`/api/*` instead of calling Keepa directly.

### Audit status (July 2026)

A full sweep of both repositories found **no secret ever committed** — 107 commits
scanned across frontend and backend, no `.env` in any tree, no credential in any
blob, and no secret in the production bundle.

Two things were fixed as a result:

- `setup-droplet.sh` wrote a production `.env` with `JWT_REFRESH_SECRET` missing
  entirely, so a freshly built droplet would have failed zod validation and
  refused to boot. It now generates both secrets (different from each other) and
  `chmod 600`s the file.
- `.gitignore` covered only the literal `.env`. A stray `.env.local` or
  `.env.production` would have been committed. It now covers `.env.*`, plus keys
  and certificates.

### If a secret is ever exposed

**Rotate it immediately — removing it from the code is not enough.** Git keeps
every version of every file forever, so a secret that was once committed is still
readable in history by anyone who can clone the repo. Deleting the line in a new
commit changes nothing.

1. Rotate the credential at the provider (new Keepa key, new DB password, new
   `openssl rand -hex 32` for the JWT secrets).
2. Deploy the new value.
3. Only then worry about scrubbing history (`git filter-repo`, or BFG) — and
   assume the old value is already compromised regardless.

Rotating `JWT_SECRET` or `JWT_REFRESH_SECRET` signs every user out. That is the
correct outcome: if the secret leaked, every existing token was forgeable.

## Setup

### 1. Install dependencies
```bash
npm install
```

### 2. Configure environment
```bash
cp .env.example .env
# Edit .env with your values -- see the Security section above.
# Generate the two JWT secrets with:  openssl rand -hex 32
```

### 3. Setup PostgreSQL
Make sure PostgreSQL is running, then:
```bash
npx prisma migrate dev --name init
# OR for a quick push without migrations:
npx prisma db push
```

### 4. Generate Prisma client
```bash
npm run db:generate
```

### 5. Run
```bash
npm run dev    # development (auto-restart)
npm start      # production
```

## API Endpoints

### Auth
| Method | Endpoint              | Auth | Description         |
|--------|-----------------------|------|---------------------|
| POST   | /api/auth/register    | No   | Create account      |
| POST   | /api/auth/login       | No   | Login               |
| GET    | /api/auth/me          | Yes  | Get profile         |

### Keepa
| Method | Endpoint              | Auth | Description         |
|--------|-----------------------|------|---------------------|
| POST   | /api/keepa/product    | No   | Fetch ASIN data     |

### Search History
| Method | Endpoint              | Auth | Description         |
|--------|-----------------------|------|---------------------|
| POST   | /api/search/save      | Yes  | Save search         |
| GET    | /api/search/history   | Yes  | Get history         |
| DELETE | /api/search/clear/all | Yes  | Clear all history   |
| DELETE | /api/search/:id       | Yes  | Delete one entry    |

## Response Format

### Success
```json
{ "success": true, "data": { ... }, "message": "optional" }
```

### Error
```json
{ "success": false, "error": "message", "code": "ERROR_CODE", "details": [...] }
```
