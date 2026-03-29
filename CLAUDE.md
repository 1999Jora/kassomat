# Kassomat — Claude Code Anweisungen

## WICHTIG: Kein lokaler Dev-Server

**Keinen lokalen Server starten.** Weder `pnpm dev`, noch `preview_start`, noch irgendwelche anderen Server-Befehle ausführen.

Änderungen werden direkt gepusht (`git push`) → Railway deployt automatisch die API, Vercel die Frontends.

Verifizierung von Änderungen erfolgt durch:
- TypeScript-Check: `pnpm --filter web exec tsc --noEmit`
- Code-Review der geänderten Dateien
- Railway Logs nach dem Push

---

## Projekt-Überblick

Österreichisches Cloud-Hybrid POS SaaS System. RKSV-konform. Multi-tenant.

**Live**: `https://kassomat-production.up.railway.app`
**Repo**: `C:\Users\jorad\Desktop\Claude\kassomat`

---

## Monorepo-Struktur

```
kassomat/
├── apps/
│   ├── api/          ← Fastify Backend (Railway, Port 3000)
│   ├── web/          ← React PWA Kassen-Frontend (Vercel, Port 5173 lokal)
│   └── dashboard/    ← React Admin Dashboard (Vercel, Port 5174 lokal)
├── packages/
│   ├── types/        ← Shared TypeScript Interfaces
│   ├── rksv/         ← RKSV Logik (Hash-Chaining, A-Trust, QR-Code, DEP)
│   ├── print/        ← ESC/POS Drucker + HTML Digital-Bon
│   └── ui/           ← Shared UI-Komponenten
```

**WICHTIG**: `packages/rksv/dist` und `packages/types/dist` sind ins Git committed (`.gitignore` Ausnahme) — Railway braucht sie beim Build. `packages/print` wird von Railway selbst gebaut.

---

## RKSV Signing Flow

**Datei**: `apps/api/src/lib/sign-receipt.ts`

1. Bon erstellt → status: `pending`
2. `signReceiptNow(receiptId, tenantId)` — synchron via `void` (fire-and-forget)
3. Signing-Anbieter:
   - A-Trust konfiguriert → `ATrustClient.signReceipt()`
   - fiskaltrust konfiguriert → `FiskaltrustClient.signReceipt()` (**funktioniert nicht auf Railway** — braucht lokalen Launcher → fällt immer auf Demo-Fallback zurück)
   - Sonst / Fehler → HMAC-SHA256 Demo-Signatur (`certSerial = 'AT0-DEMO'`)
4. QR-Code gebaut, Bon + DEPEntry in DB gespeichert → status: `signed`

**Demo erkennen**: `rksv_atCertificateSerial === 'AT0-DEMO'`

---

## Print Flow (Frontend)

```typescript
// IMMER dieses Pattern verwenden (aus PaymentPanel.tsx):
const mode = getPrintMode(); // 'printer' | 'pdf' | 'none'
let pdfWindow = null;
if (mode === 'pdf') pdfWindow = window.open('about:blank', '_blank', 'noopener'); // VOR await!
const receipt = await createReceipt(...);
await waitForRksvSignature(receipt.id); // pollt bis status=signed
if (mode === 'printer') await printReceiptById(receipt.id);
else if (mode === 'pdf') pdfWindow.location.href = getDigitalReceiptUrl(receipt.id);
```

API-Funktionen in `apps/web/src/lib/api.ts`:
- `waitForRksvSignature(receiptId, timeoutMs?)` — pollt bis signed
- `printReceiptById(receiptId)` — `GET /receipts/:id/print`
- `getDigitalReceiptUrl(receiptId)` — gibt URL zurück
- `getPrintMode()` — gibt `'printer' | 'pdf' | 'none'` aus localStorage

---

## API Endpoints

| Route | Auth | Beschreibung |
|-------|------|-------------|
| `POST /auth/login` | ❌ | Login → JWT |
| `POST /auth/refresh` | ❌ | Token erneuern |
| `GET/PUT /tenant` | ✅ | Tenant-Settings |
| `GET/POST /products` | ✅ | Produkte |
| `GET/POST /categories` | ✅ | Kategorien |
| `POST /receipts` | ✅ | Bon erstellen + signieren |
| `GET /receipts` | ✅ | Bon-Liste |
| `GET /receipts/:id` | ✅ | Bon-Details |
| `POST /receipts/:id/cancel` | ✅ | Stornieren |
| `GET /receipts/:id/print` | ✅ | ESC/POS drucken |
| `GET /receipts/:id/digital` | ❌ | HTML-Bon (öffentlich) |
| `POST /receipts/null` | ✅ | Nullbeleg |
| `POST /receipts/training` | ✅ | Trainingsbeleg |
| `POST /receipts/closing` | ✅ | Schlussbeleg |
| `GET/POST /orders` | ✅ | Lieferando/Wix Bestellungen |
| `POST /webhooks/lieferando` | ❌ | JET Webhook |
| `POST /webhooks/wix` | ❌ | Wix Webhook |
| `GET/POST /drivers` | ✅ | Fahrer |
| `GET /deliveries` | ✅ | Lieferungen |
| `POST /daily-closing` | ✅ | Tagesabschluss |
| `GET /health` | ❌ | Health Check |

---

## Frontend Seiten (Web App)

| Route | Seite | Beschreibung |
|-------|-------|-------------|
| `/login` | LoginPage | Login |
| `/signup` | SignupPage | Registrierung |
| `/` | HomeScreen | Menü-Kacheln |
| `/pos` | POSLayout | Kasse (Artikel, Warenkorb, Zahlung) |
| `/dispatcher` | DispatcherPage | Bestelleingang + Fahrer-Zuweisung |
| `/dashboard` | DashboardPage | Umsatzanalyse, Bon-Liste |
| `/settings` | SettingsPage | Konfiguration (A-Trust, Drucker, Lieferando, Wix, RKSV) |
| `/dep-export` | DepExportPage | DEP-Export für Finanzamt |
| `/drivers` | DriversPage | Fahrer verwalten |
| `/delivery/nav` | DriverNavPage | Fahrer GPS-Navigation (kein JWT, nur PIN) |

---

## Verschlüsselung

- **Passwörter**: Argon2
- **API-Keys in DB**: AES-256-GCM (`apps/api/src/lib/crypto.ts` → `encrypt()`/`decrypt()`)
- **Umsatzzähler**: AES-256-CTR, IV = SHA256(kassenId || belegnummer)[0:16]
- **JWT**: `{ sub: userId, tenantId }`
- **Webhooks**: HMAC-SHA256 (Lieferando + Wix), `timingSafeEqual()`

---

## Deployment

```bash
# Änderungen pushen → Railway deployt automatisch
git add <files> && git commit -m "..." && git push

# TypeScript prüfen (kein Server nötig)
pnpm --filter web exec tsc --noEmit
pnpm --filter api exec tsc --noEmit

# DB Migrations lokal
pnpm db:migrate

# Railway startet automatisch: prisma migrate deploy && node dist/...
```

---

## Offene Aufgaben

1. **Stornobeleg**: STO-Feld korrekt + Originalbeleg-Referenz auf Bon anzeigen
2. **Trainingsbeleg**: TRA-Marker im HTML-Bon sichtbar machen
3. **Schlussbeleg**: Kasse-außer-Betrieb Flow komplett
4. **Reparierbeleg**: Automatisch nach SEE-Ausfall erstellen
5. **MwSt 13%**: In DB-Schema, API und Frontend vollständig integrieren
6. **Tagesabschluss / Z-Bericht**: UI + Ausdruck
7. **DEP Quartals-Export UI**: Download als JSON/BMF-Format
8. **Jahresbeleg**: Automatische FinanzOnline-Einreichung
9. **fiskaltrust**: Funktioniert nicht auf Railway (braucht lokalen Launcher) — bleibt Demo-Fallback
