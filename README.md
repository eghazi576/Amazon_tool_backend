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

## Setup

### 1. Install dependencies
```bash
npm install
```

### 2. Configure environment
```bash
cp .env.example .env
# Edit .env with your values
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
