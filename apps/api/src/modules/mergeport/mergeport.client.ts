import { AppError } from '../../lib/errors';

// ---------------------------------------------------------------------------
// Mergeport API Types
// ---------------------------------------------------------------------------

export interface MergeportPrice {
  amount: number;  // in Cent
  currency: string; // ISO 4217 z.B. "EUR"
}

export interface MergeportOrderItem {
  orderId: string;
  internalId?: string;
  orderItemId?: string;
  orderItemName?: string;
  parentId?: string;
  providerId?: string;
  quantity: number;
  relativeQuantity?: number;
  singlePrice: MergeportPrice;
  rowTotal?: MergeportPrice;
  relativeRowTotal?: MergeportPrice;
  posItemId?: string;
  isNote?: boolean;
  course?: number;
  deposit?: number;
}

export interface MergeportPaymentInfo {
  referenceId: string;
  amount: MergeportPrice;
  multipleOrderPayment: boolean;
  brand?: string;
  paymentType: 'CASH' | 'CARD';
  payOnDelivery: boolean;
}

export interface MergeportDeliveryInfo {
  deliveryTime?: string;
  formatted?: string;
  firstName?: string;
  lastName?: string;
  middleName?: string;
  phone?: string;
  email?: string;
  street?: string;
  number?: string;
  apt?: string;
  floor?: string;
  entrance?: string;
  comment?: string;
  city?: string;
  zip?: string;
  country?: string;
  company?: string;
}

export interface MergeportPickupInfo {
  pickupTime?: string;
  firstName?: string;
  lastName?: string;
  phone?: string;
  email?: string;
  comment?: string;
}

export interface MergeportAdditionalCost {
  value: MergeportPrice;
  name: string;
  tip?: boolean;
}

export interface MergeportPossibleStateChange {
  state: string;
  timeChange?: boolean;
}

export type MergeportOrderStatus =
  | 'receivedByProvider'
  | 'fetchedByPOS'
  | 'canceledByProvider'
  | 'canceledByPOS'
  | 'rejectedByPOS'
  | 'acceptedByPOS'
  | 'preparing'
  | 'ready'
  | 'pickedUp'
  | 'inDelivery'
  | 'delivered';

export interface MergeportOrder {
  providerId: string;
  providerName?: string;
  id: string;
  orderId?: string;
  orderReference?: string;
  creationDate?: string;
  lastModifyDate: string;
  expiryDate?: string;
  status: MergeportOrderStatus;
  siteId?: string;
  paymentInfo?: MergeportPaymentInfo[];
  deliveryInfo?: MergeportDeliveryInfo;
  pickupInfo?: MergeportPickupInfo;
  notes?: string;
  amountToPay?: MergeportPrice;
  additionalCosts?: MergeportAdditionalCost[];
  possibleStateChanges?: MergeportPossibleStateChange[];
  items?: MergeportOrderItem[];
  preOrder?: boolean;
}

// POS Sync Types
export interface MergeportPosItemRest {
  id: string;
  price?: MergeportPrice | null;
  name?: Record<string, string | null> | null;
  description?: Record<string, string | null> | null;
  allergens?: string | null;
  reference?: string | null;
  parentIds?: string[] | null;
  imgUrl?: string | null;
  enabled?: boolean | null;
  categoryIds?: string[] | null;
  menuIds?: string[] | null;
  labels?: string[] | null;
  ean?: string | null;
  type?: 'product' | 'topping' | null;
  sort?: number | null;
}

export interface MergeportPosCategoryRest {
  id: string;
  name?: Record<string, string | null> | null;
  description?: Record<string, string | null> | null;
  imgUrl?: string | null;
  parentIds?: string[] | null;
  enabled?: boolean | null;
}

export interface MergeportPosMenuRest {
  id: string;
  name?: Record<string, string | null> | null;
  description?: Record<string, string | null> | null;
  imgUrl?: string | null;
  menuType?: ('pickup' | 'delivery' | 'inHouse')[] | null;
  enabled?: boolean | null;
}

export interface PosOrderStatePayload {
  state: MergeportOrderStatus;
  timeChange?: string | null;
  receipts?: unknown[] | null;
}

// ---------------------------------------------------------------------------
// Client
// ---------------------------------------------------------------------------

const DEFAULT_BASE_URL = 'https://ordering.mergeport.com/v4';

export class MergeportClient {
  private apiKey: string;
  private baseUrl: string;

  constructor(apiKey: string, baseUrl?: string) {
    this.apiKey = apiKey;
    this.baseUrl = (baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, '');
  }

  // ---- Orders ----

  /** Aktive Bestellungen abrufen */
  async getActiveOrders(): Promise<MergeportOrder[]> {
    return this.get<MergeportOrder[]>('/pos/orders/active');
  }

  /** Einzelne Bestellung abrufen */
  async getOrder(id: string): Promise<MergeportOrder> {
    return this.get<MergeportOrder>(`/pos/orders/${encodeURIComponent(id)}`);
  }

  /** Bestellstatus aktualisieren */
  async setOrderState(id: string, payload: PosOrderStatePayload): Promise<void> {
    await this.patch(`/pos/orders/${encodeURIComponent(id)}`, payload);
  }

  // ---- Menu Sync ----

  /** Artikel an Mergeport übertragen */
  async syncItems(items: MergeportPosItemRest[]): Promise<void> {
    await this.post('/pos/items', items);
  }

  /** Kategorien an Mergeport übertragen */
  async syncCategories(categories: MergeportPosCategoryRest[]): Promise<void> {
    await this.post('/pos/categories', categories);
  }

  /** Menüs an Mergeport übertragen */
  async syncMenus(menus: MergeportPosMenuRest[]): Promise<void> {
    await this.post('/pos/menus', menus);
  }

  // ---- HTTP Helpers ----

  private async get<T>(path: string): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    const response = await fetch(url, {
      method: 'GET',
      headers: this.headers(),
    });
    return this.handleResponse<T>(response, 'GET', path);
  }

  private async post(path: string, body: unknown): Promise<void> {
    const url = `${this.baseUrl}${path}`;
    const response = await fetch(url, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify(body),
    });
    await this.handleResponse(response, 'POST', path);
  }

  private async patch(path: string, body: unknown): Promise<void> {
    const url = `${this.baseUrl}${path}`;
    const response = await fetch(url, {
      method: 'PATCH',
      headers: this.headers(),
      body: JSON.stringify(body),
    });
    await this.handleResponse(response, 'PATCH', path);
  }

  private headers(): Record<string, string> {
    return {
      'Authorization': this.apiKey,
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    };
  }

  private async handleResponse<T = unknown>(
    response: Response,
    method: string,
    path: string,
  ): Promise<T> {
    if (!response.ok) {
      const body = await response.text().catch(() => '');
      throw new AppError(
        502,
        'MERGEPORT_API_ERROR',
        `Mergeport ${method} ${path} fehlgeschlagen: ${response.status} ${body}`,
      );
    }

    // Für POST/PATCH die kein JSON zurückgeben
    const contentType = response.headers.get('content-type') ?? '';
    if (!contentType.includes('application/json')) {
      return undefined as T;
    }

    return response.json() as Promise<T>;
  }
}
