/**
 * @kassomat/types
 * Gemeinsame TypeScript Interfaces für das gesamte Kassomat System
 *
 * WICHTIG: Alle Geldbeträge sind in Cent (Integer) gespeichert.
 * Beispiel: €2,50 = 250
 */

// ============================================================
// TENANT (= 1 Restaurant / Betrieb)
// ============================================================

/** Subscription-Plan des Tenants */
export type TenantPlan = 'starter' | 'pro' | 'business';

/** Aktivitätsstatus des Tenants */
export type TenantStatus = 'active' | 'suspended' | 'trial';

/** Ein Kassomat-Tenant (Restaurant, Spätis, Kiosk etc.) */
export interface Tenant {
  /** UUID */
  id: string;
  /** Anzeigename z.B. "Spätii Innsbruck" */
  name: string;
  /** URL-Slug z.B. "spaetii-innsbruck" */
  slug: string;
  plan: TenantPlan;
  status: TenantStatus;
  /** Null wenn kein Trial oder Trial abgelaufen */
  trialEndsAt: Date | null;
  createdAt: Date;
  settings: TenantSettings;
}

/** Konfigurierbare Einstellungen eines Tenants */
export interface TenantSettings {
  /** ISO 4217 Währungscode, Standard "EUR" */
  currency: string;
  /** IANA Timezone, Standard "Europe/Vienna" */
  timezone: string;
  /** Straße und Hausnummer */
  address: string | null;
  /** PLZ und Ort */
  city: string | null;
  /** Österreichische Umsatzsteuer-Identifikationsnummer (UID) */
  vatNumber: string | null;
  /** Fußzeile auf Bons (z.B. "Vielen Dank für Ihren Besuch!") */
  receiptFooter: string | null;
  /** IP-Adresse des Netzwerkdruckers */
  printerIp: string | null;
  /** Port des Netzwerkdruckers (Standard: 9100) */
  printerPort: number | null;
  /** Ob RKSV aktiv ist (Pflicht für Bargeldumsätze ≥ €15.000/Jahr) */
  rksvEnabled: boolean;
  /** A-Trust Konfiguration für Cloud-Signatur */
  atrust: ATrustConfig | null;
  /** Lieferando POS API Konfiguration */
  lieferando: LieferandoConfig | null;
  /** Wix Integration Konfiguration */
  wix: WixConfig | null;
  /** myPOS Kartenzahlungs-Terminal Konfiguration */
  mypos: MyPOSConfig | null;
  /** fiskaltrust RKSV Signatur-Service Konfiguration (Demo/Sandbox) */
  fiskaltrust: FiskaltrustConfig | null;
}

// ============================================================
// USER
// ============================================================

/** Benutzerrollen im System */
export type UserRole = 'owner' | 'admin' | 'cashier';

/** Ein Kassomat-Benutzer */
export interface User {
  /** UUID */
  id: string;
  tenantId: string;
  email: string;
  /** Argon2-gehashtes Passwort — niemals im API-Response zurückgeben */
  passwordHash: string;
  role: UserRole;
  name: string;
  /** 4-stellige PIN für Kassensperrung (gehashed) */
  pin: string | null;
  createdAt: Date;
  lastLoginAt: Date | null;
}

/** Öffentliche User-Daten ohne sensitive Felder */
export type PublicUser = Omit<User, 'passwordHash' | 'pin'>;

// ============================================================
// ARTIKEL & KATEGORIEN
// ============================================================

/** Österreichische MwSt-Sätze */
export type VatRate = 0 | 10 | 13 | 20;

/** Ein Verkaufsartikel */
export interface Product {
  /** UUID */
  id: string;
  tenantId: string;
  name: string;
  /** Preis in Cent (z.B. 250 = €2,50) */
  price: number;
  /** Österreichischer MwSt-Satz */
  vatRate: VatRate;
  categoryId: string;
  /** PLU-Code für Schnellzugriff via Numpad */
  pluCode: string | null;
  barcode: string | null;
  /** Hex-Farbe für Kachel (z.B. "#1D9E75") */
  color: string | null;
  isActive: boolean;
  /** Lieferando Artikel-ID für automatisches Mapping */
  lieferandoExternalId: string | null;
  /** Wix Produkt-ID für Sync */
  wixProductId: string | null;
  createdAt: Date;
  /** Soft-Delete Timestamp — null wenn aktiv */
  deletedAt: Date | null;
}

/** Eine Artikelkategorie */
export interface Category {
  /** UUID */
  id: string;
  tenantId: string;
  name: string;
  /** Hex-Farbe für Kategorie-Tab */
  color: string;
  /** Sortierreihenfolge (aufsteigend) */
  sortOrder: number;
}

// ============================================================
// BON / BELEG
// ============================================================

/** Typ des Belegs nach RKSV */
export type ReceiptType =
  | 'sale'
  | 'cancellation'
  | 'training'
  | 'null_receipt'
  | 'start_receipt'
  | 'month_receipt'
  | 'year_receipt'
  | 'closing_receipt';

/** Status des Belegs im Signatur-Workflow */
export type ReceiptStatus = 'pending' | 'signed' | 'printed' | 'cancelled' | 'offline_pending';

/** Vertriebskanal */
export type SalesChannel = 'direct' | 'lieferando' | 'wix';

/** Ein Kassenbon / Beleg */
export interface Receipt {
  /** UUID */
  id: string;
  tenantId: string;
  /** Fortlaufende Belegnummer z.B. "2024-000042" */
  receiptNumber: string;
  /** Kassen-ID für FinanzOnline (z.B. "KASSE-01") */
  cashRegisterId: string;
  type: ReceiptType;
  status: ReceiptStatus;
  createdAt: Date;
  /** User-ID des Kassierers */
  cashierId: string;
  channel: SalesChannel;
  /** Bestell-ID von Lieferando oder Wix */
  externalOrderId: string | null;
  items: ReceiptItem[];
  payment: Payment;
  rksv: RKSVData;
  totals: ReceiptTotals;
}

/** Eine Bon-Position */
export interface ReceiptItem {
  /** UUID */
  id: string;
  receiptId: string;
  productId: string;
  /** Snapshot des Produktnamens zum Zeitpunkt des Kaufs */
  productName: string;
  quantity: number;
  /** Einzelpreis in Cent */
  unitPrice: number;
  vatRate: VatRate;
  /** Rabatt in Cent (0 wenn kein Rabatt) */
  discount: number;
  /** Nettobetrag in Cent */
  totalNet: number;
  /** MwSt-Betrag in Cent */
  totalVat: number;
  /** Bruttobetrag in Cent */
  totalGross: number;
}

/** Zahlungsart */
export type PaymentMethod = 'cash' | 'card' | 'online';

/** Zahlungsdaten */
export interface Payment {
  method: PaymentMethod;
  /** Tatsächlich bezahlter Betrag in Cent */
  amountPaid: number;
  /** Wechselgeld in Cent (nur bei Barzahlung relevant) */
  change: number;
  /** Trinkgeld in Cent */
  tip: number;
}

/** Bon-Summen mit MwSt-Aufschlüsselung */
export interface ReceiptTotals {
  /** Netto-Gesamtbetrag in Cent */
  subtotalNet: number;
  /** MwSt-Betrag 0% in Cent */
  vat0: number;
  /** MwSt-Betrag 10% in Cent */
  vat10: number;
  /** MwSt-Betrag 13% in Cent (Gastronomie-Sondersatz) */
  vat13: number;
  /** MwSt-Betrag 20% in Cent */
  vat20: number;
  /** Gesamter MwSt-Betrag in Cent */
  totalVat: number;
  /** Brutto-Gesamtbetrag in Cent */
  totalGross: number;
}

// ============================================================
// RKSV DATA (Registrierkassensicherheitsverordnung)
// ============================================================

/**
 * RKSV-Pflichtdaten für jeden Bon
 * Gemäß Registrierkassensicherheitsverordnung (BGBl. II Nr. 410/2015)
 */
export interface RKSVData {
  /** Bei FinanzOnline angemeldete Kassen-ID */
  registrierkasseId: string;
  /** Fortlaufende Belegnummer (tenant-spezifisch, beginnt bei 1) */
  belegnummer: string;
  /**
   * Kumulierte Barumsatzsumme in Cent (nicht verschlüsselt, intern)
   */
  barumsatzSumme: number;
  /**
   * AES-256-ICM verschlüsselter Umsatzzähler (Base64)
   * Pflichtfeld im QR-Code und DEP nach RKSV Spec
   */
  umsatzzaehlerEncrypted?: string;
  /** SHA-256 Hash des vorherigen Bons (Hash-Chaining) */
  previousReceiptHash: string;
  /** SHA-256 Hash dieses Bons */
  receiptHash: string;
  /** A-Trust Signatur des Bons (Base64) */
  signature: string;
  /** Kompakter QR-Code String nach RKSV-Format */
  qrCodeData: string;
  /** Zeitstempel der Signierung durch A-Trust */
  signedAt: Date | null;
  /** Seriennummer des A-Trust Zertifikats */
  atCertificateSerial: string;
}

// ============================================================
// DEP (Datenerfassungsprotokoll)
// ============================================================

/**
 * Ein Eintrag im Datenerfassungsprotokoll
 * 7 Jahre Aufbewahrungspflicht (§ 132 BAO)
 */
export interface DEPEntry {
  /** UUID */
  id: string;
  tenantId: string;
  receiptId: string;
  belegnummer: string;
  /** Belegtyp nach RKSV-Bezeichnung */
  belegtyp: string;
  timestamp: Date;
  rksv_hash: string;
  signature: string;
  /** Vollständige RKSV JSON-Struktur nach BMF-Spec */
  rawData: Record<string, unknown>;
}

/** DEP-Export Struktur nach BMF-Spezifikation */
export interface DEPExport {
  'Belege-Gruppe': DEPBelegeGruppe[];
}

/** Gruppe von Belegen mit gleichem Signaturzertifikat */
export interface DEPBelegeGruppe {
  Signaturzertifikat: string;
  Zertifizierungsstellen: string[];
  'Belege-kompakt': string[];
}

// ============================================================
// EINGEHENDE BESTELLUNGEN (Lieferando / Wix)
// ============================================================

/** Zahlungsart bei Lieferbestellungen */
export type DeliveryPaymentMethod = 'cash_on_delivery' | 'online_paid';

/** Status einer eingehenden Bestellung */
export type IncomingOrderStatus =
  | 'pending'
  | 'accepted'
  | 'in_progress'
  | 'completed'
  | 'cancelled';

/** Eine eingehende Bestellung von Lieferando oder Wix */
export interface IncomingOrder {
  /** UUID */
  id: string;
  tenantId: string;
  source: 'lieferando' | 'wix';
  /** Externe Bestell-ID vom jeweiligen System */
  externalId: string;
  /** Kurze, fortlaufende Auftragsnummer (z.B. 42) */
  orderNumber: number;
  status: IncomingOrderStatus;
  receivedAt: Date;
  items: IncomingOrderItem[];
  customer: OrderCustomer | null;
  deliveryAddress: DeliveryAddress | null;
  paymentMethod: DeliveryPaymentMethod;
  /** Gesamtbetrag in Cent */
  totalAmount: number;
  notes: string | null;
  /** Gesetzt wenn ein Bon für diese Order erstellt wurde */
  receiptId: string | null;
}

/** Eine Position in einer eingehenden Bestellung */
export interface IncomingOrderItem {
  /** Externe Artikel-ID */
  externalId: string;
  name: string;
  quantity: number;
  /** Einzelpreis in Cent */
  unitPrice: number;
  /** Gesamtpreis in Cent */
  totalPrice: number;
  /** Zusatzoptionen z.B. ["ohne Zwiebeln", "extra scharf"] */
  options: string[];
}

/** Kundendaten bei einer Bestellung */
export interface OrderCustomer {
  name: string;
  phone: string | null;
  email: string | null;
}

/** Lieferadresse */
export interface DeliveryAddress {
  street: string;
  city: string;
  zip: string;
  notes: string | null;
}

// ============================================================
// SCHICHT
// ============================================================

/** Eine Kassier-Schicht */
export interface Shift {
  /** UUID */
  id: string;
  tenantId: string;
  cashierId: string;
  startedAt: Date;
  endedAt: Date | null;
  /** Kassenbestand bei Schichtstart in Cent */
  openingFloat: number;
  /** Gezählter Kassenbestand bei Schichtende in Cent */
  closingFloat: number | null;
  /** Gesamtumsatz der Schicht in Cent */
  totalRevenue: number;
  receiptCount: number;
}

// ============================================================
// TAGESABSCHLUSS
// ============================================================

/** Ein Tagesabschluss */
export interface DailyClosing {
  /** UUID */
  id: string;
  tenantId: string;
  /** Datum des Abschlusses im Format "YYYY-MM-DD" */
  date: string;
  /** User-ID des Kassierers der den Abschluss durchgeführt hat */
  closedBy: string;
  closedAt: Date;
  /** Gesamter Barumsatz in Cent */
  totalCash: number;
  /** Gesamter Kartenumsatz in Cent */
  totalCard: number;
  /** Gesamter Online-Umsatz in Cent */
  totalOnline: number;
  /** Gesamtumsatz in Cent */
  totalRevenue: number;
  receiptCount: number;
  cancellationCount: number;
  /** Pfad zur DEP-Export-Datei auf dem Speicher */
  depExportPath: string | null;
}

// ============================================================
// KONFIGURATIONEN
// ============================================================

/** A-Trust Cloud HSM Konfiguration */
export interface ATrustConfig {
  certificateSerial: string;
  configured: boolean;
  apiKeyHint: string | null;
  environment: 'test' | 'production' | null;
}

/** Lieferando / Just Eat Takeaway POS API Konfiguration */
export interface LieferandoConfig {
  restaurantId: string;
  configured: boolean;
  apiKeyHint: string | null;
  isActive: boolean;
}

/** Wix Integration Konfiguration */
export interface WixConfig {
  siteId: string;
  configured: boolean;
  apiKeyHint: string | null;
  isActive: boolean;
  defaultDeliveryPayment: 'cash' | 'online';
}

/** myPOS Kartenzahlungs-Terminal Konfiguration */
export interface MyPOSConfig {
  storeId: string;
  configured: boolean;
  apiKeyHint: string | null;
  terminalSerial: string | null;
}

/** fiskaltrust RKSV Signatur-Service Konfiguration */
export interface FiskaltrustConfig {
  cashboxId: string;
  configured: boolean;
  accessTokenHint: string | null;
  environment: 'sandbox' | 'production';
}

// ============================================================
// AUTH
// ============================================================

/** JWT Payload — iat/exp werden automatisch von der JWT-Bibliothek hinzugefügt */
export interface JWTPayload {
  sub: string; // userId
  tenantId: string;
  role: UserRole;
  iat?: number;
  exp?: number;
}

/** Auth Response bei Login/Refresh */
export interface AuthResponse {
  accessToken: string;
  refreshToken: string;
  user: PublicUser;
  tenant: Omit<Tenant, 'settings'>;
}

// ============================================================
// API RESPONSE TYPEN
// ============================================================

/** Standard API Erfolgs-Response */
export interface ApiSuccess<T> {
  success: true;
  data: T;
}

/** Standard API Fehler-Response */
export interface ApiError {
  success: false;
  error: {
    code: string;
    message: string;
    details?: Record<string, string[]>;
  };
}

/** Paginierter API Response */
export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
}

// ============================================================
// ANALYTICS
// ============================================================

/** Analytics für heute / Zeitraum */
export interface AnalyticsData {
  totalRevenue: number; // in Cent
  receiptCount: number;
  averageReceiptValue: number; // in Cent
  revenueByChannel: {
    direct: number;
    lieferando: number;
    wix: number;
  };
  revenueByPayment: {
    cash: number;
    card: number;
    online: number;
  };
  vatBreakdown: {
    vat0: number;
    vat10: number;
    vat13: number;
    vat20: number;
  };
  topProducts: Array<{
    productId: string;
    productName: string;
    quantity: number;
    revenue: number;
  }>;
  hourlyRevenue: Array<{
    hour: number;
    revenue: number;
  }>;
}

// ============================================================
// WEBSOCKET EVENTS
// ============================================================

/** WebSocket Event-Types */
export type WebSocketEventType =
  | 'order:new'
  | 'order:update'
  | 'receipt:signed'
  | 'receipt:print_ready'
  | 'shift:locked'
  | 'shift:unlocked'
  | 'connection:status'
  | 'payment:confirmed'
  | 'payment:declined';

/** WebSocket Event Payload */
export interface WebSocketEvent<T = unknown> {
  type: WebSocketEventType;
  tenantId: string;
  payload: T;
  timestamp: Date;
}

// ============================================================
// FAHRER & LIEFERUNGEN
// ============================================================

export interface Driver {
  id: string;
  name: string;
  pin: string;
  color: string;
  isActive: boolean;
  sortOrder: number;
}

export interface Delivery {
  id: string;
  orderId: string;
  driverId: string | null;
  status: 'pending' | 'picked_up' | 'en_route' | 'delivered' | 'cancelled';
  position: number;
  geocodedLat?: number | null;
  geocodedLng?: number | null;
  assignedAt?: string | null;
  pickedUpAt?: string | null;
  deliveredAt?: string | null;
  driver?: Driver | null;
  order?: IncomingOrder;
}

export interface DriverGpsEvent {
  driverId: string;
  lat: number;
  lng: number;
  heading?: number;
  speed?: number;
}

// ============================================================
// DRUCKER
// ============================================================

/** Druckerverbindungstyp */
export type PrinterConnectionType = 'network' | 'usb';

/** Druckerstatus */
export interface PrinterStatus {
  connected: boolean;
  connectionType: PrinterConnectionType;
  model: string | null;
  paperLow: boolean;
  error: string | null;
}

/** Druckjob */
export interface PrintJob {
  id: string;
  tenantId: string;
  receiptId: string;
  status: 'pending' | 'printing' | 'done' | 'error';
  createdAt: Date;
  completedAt: Date | null;
  errorMessage: string | null;
}
