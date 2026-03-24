# Kassomat

**Österreichisches Cloud-Hybrid POS SaaS System**

RKSV-konform · Lieferando POS API · Wix Integration · A-Trust Cloud-Signatur

---

## Überblick

Kassomat ist ein Kassensystem-SaaS für österreichische Gastro- und Einzelhandelsbetriebe mit:

- **RKSV-konformer Registrierkasse** (Registrierkassensicherheitsverordnung)
- **Lieferando POS API Integration** (Just Eat Takeaway)
- **Wix Webshop Integration** via REST API + Webhooks
- **A-Trust Cloud-Signatur** für jeden Bon
- **Hybrid Offline-Betrieb** (läuft lokal ohne Internet, synced zur Cloud)
- **Multi-Tenant SaaS** (jedes Restaurant = eigener Tenant)

## Monorepo Struktur

```
kassomat/
├── apps/
│   ├── api/          Fastify Backend (Node.js + TypeScript)
│   ├── web/          React Kassen-Frontend (PWA)
│   └── dashboard/    React Admin-Dashboard
├── packages/
│   ├── types/        Gemeinsame TypeScript Types
│   ├── rksv/         RKSV Logik (Hash-Chaining, A-Trust, DEP)
│   ├── ui/           Gemeinsame UI-Komponenten
│   └── print/        ESC/POS Bondruck
├── package.json      Workspace root (pnpm)
└── turbo.json        Turborepo Config
```

## Voraussetzungen

- Node.js >= 20.0.0
- pnpm >= 8.0.0
- PostgreSQL (lokal oder Supabase)
- Redis (lokal oder Railway)

## Setup

### 1. Repository klonen und Dependencies installieren

```bash
git clone https://github.com/kassomat/kassomat.git
cd kassomat
pnpm install
```

### 2. Environment Variables konfigurieren

```bash
cp .env.example apps/api/.env
# .env Datei ausfüllen (Datenbank, Redis, etc.)
```

### 3. Datenbank einrichten

```bash
pnpm db:migrate
pnpm db:generate
```

### 4. Development Server starten

```bash
# Alle Apps parallel starten
pnpm dev

# Nur API starten
pnpm --filter api dev

# Nur Frontend starten
pnpm --filter web dev

# Nur Dashboard starten
pnpm --filter dashboard dev
```

Die Apps laufen dann auf:
- **API:** http://localhost:3001
- **Kassen-Frontend:** http://localhost:5173
- **Admin-Dashboard:** http://localhost:5174
- **API Docs (OpenAPI):** http://localhost:3001/docs

## Build

```bash
pnpm build
```

## Tests

```bash
pnpm test
```

## Deployment

### Railway (Backend)

1. Railway Account erstellen: https://railway.app
2. Neues Projekt erstellen, GitHub Repo verbinden
3. Für `apps/api` Service erstellen
4. Environment Variables aus `.env.example` setzen
5. PostgreSQL und Redis Services hinzufügen

### Vercel (Frontend + Dashboard)

```bash
# Frontend deployen
vercel --cwd apps/web

# Dashboard deployen
vercel --cwd apps/dashboard
```

### Supabase (PostgreSQL)

1. Supabase Projekt erstellen: https://supabase.com
2. `DATABASE_URL` und `DIRECT_URL` aus Supabase Connection String
3. Migrations ausführen: `pnpm db:migrate`

## Tech Stack

| Bereich | Technologie |
|---------|-------------|
| Backend | Node.js + Fastify + TypeScript |
| Frontend | React + TypeScript + Tailwind CSS |
| Datenbank | PostgreSQL via Prisma ORM |
| Cache/Queue | Redis + BullMQ |
| Realtime | Socket.io |
| Auth | JWT + Refresh Tokens |
| Bondruck | ESC/POS Protokoll |
| Offline | Service Worker + IndexedDB (Dexie.js) |
| RKSV | A-Trust Cloud HSM + SHA-256 Hash-Chaining |

## Abo-Pläne

| Plan | Preis | Features |
|------|-------|---------|
| Starter | €29/Monat | 1 Kasse, RKSV, Grundfunktionen |
| Pro | €59/Monat | 3 Kassen, Lieferando + Wix |
| Business | €99/Monat | Unbegrenzte Kassen, alle Features |

## Gesetzliche Anforderungen (Österreich)

- **RKSV** (BGBl. II Nr. 410/2015): Hash-Chaining, A-Trust Signatur, DEP-Export
- **§ 132 BAO**: 7 Jahre Aufbewahrungspflicht für DEP
- **FinanzOnline**: Kassen-Registrierung und Startbeleg-Einreichung
- **Registrierkassenpflicht** ab €15.000 Jahresumsatz (§ 131b BAO)

## Lizenz

Proprietär — Alle Rechte vorbehalten.
