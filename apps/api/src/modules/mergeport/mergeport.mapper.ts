import type {
  MergeportOrder,
  MergeportOrderItem,
  MergeportOrderStatus,
} from './mergeport.client';

// ---------------------------------------------------------------------------
// Kassomat-interne Typen für die Mapper-Ausgabe
// ---------------------------------------------------------------------------

export interface MappedOrderItem {
  externalId: string;
  name: string;
  quantity: number;
  unitPrice: number;  // Cent
  totalPrice: number; // Cent
  options: string[];   // Modifier-/Topping-Namen
}

export interface MappedOrder {
  /** Mergeport-interne UUID */
  mergeportId: string;
  /** Provider-Referenz-ID (z.B. Lieferando Token) */
  externalId: string;
  /** Menschenlesbare Referenznummer */
  orderReference: string | null;
  /** Name der Plattform (Lieferando, Wolt, Uber Eats, etc.) */
  providerName: string;
  /** Mergeport-Status */
  mergeportStatus: MergeportOrderStatus;
  /** Kassomat IncomingOrderStatus */
  status: 'pending' | 'accepted' | 'in_progress' | 'completed' | 'cancelled';
  /** Erlaubte nächste Status-Übergänge */
  possibleStateChanges: Array<{ state: string; timeChange?: boolean }>;
  /** Bestellpositionen (flache Liste, Toppings als options auf Parent) */
  items: MappedOrderItem[];
  /** Kundenname */
  customerName: string | null;
  customerPhone: string | null;
  customerEmail: string | null;
  /** Lieferadresse */
  deliveryStreet: string | null;
  deliveryCity: string | null;
  deliveryZip: string | null;
  deliveryComment: string | null;
  /** Abholinfo */
  pickupTime: string | null;
  /** Zahlungsart */
  paymentMethod: 'cash_on_delivery' | 'online_paid';
  /** Gesamtbetrag in Cent */
  totalAmount: number;
  /** Trinkgeld in Cent */
  tip: number;
  /** Liefergebühr in Cent */
  deliveryFee: number;
  /** Bestellnotizen */
  notes: string | null;
  /** Bestellzeitpunkt */
  createdAt: string | null;
  /** Rohdaten für Debugging */
  rawOrder: MergeportOrder;
}

// ---------------------------------------------------------------------------
// Status-Mapping: Mergeport → Kassomat IncomingOrderStatus
// ---------------------------------------------------------------------------

export function mapMergeportStatus(
  status: MergeportOrderStatus,
): 'pending' | 'accepted' | 'in_progress' | 'completed' | 'cancelled' {
  switch (status) {
    case 'receivedByProvider':
    case 'fetchedByPOS':
      return 'pending';
    case 'acceptedByPOS':
      return 'accepted';
    case 'preparing':
    case 'ready':
    case 'pickedUp':
    case 'inDelivery':
      return 'in_progress';
    case 'delivered':
      return 'completed';
    case 'canceledByProvider':
    case 'canceledByPOS':
    case 'rejectedByPOS':
      return 'cancelled';
    default:
      return 'pending';
  }
}

// ---------------------------------------------------------------------------
// Items-Mapping: Flache Liste mit parentId → Kassomat-Struktur
//
// Mergeport liefert Artikel als flache Liste. Parent-Items haben keine
// parentId, Toppings/Varianten verweisen via parentId auf ihren Parent.
// Wir gruppieren Toppings als "options" auf dem Parent-Artikel.
// ---------------------------------------------------------------------------

function mapItems(items: MergeportOrderItem[] | undefined): MappedOrderItem[] {
  if (!items || items.length === 0) return [];

  // Trenne Root-Items (kein parentId) von Child-Items (mit parentId)
  const rootItems: MergeportOrderItem[] = [];
  const childrenByParent = new Map<string, MergeportOrderItem[]>();

  for (const item of items) {
    if (item.parentId) {
      const siblings = childrenByParent.get(item.parentId) ?? [];
      siblings.push(item);
      childrenByParent.set(item.parentId, siblings);
    } else {
      rootItems.push(item);
    }
  }

  return rootItems.map((item) => {
    const children = childrenByParent.get(item.internalId ?? '') ?? [];
    const options = children
      .filter((c) => c.orderItemName)
      .map((c) => {
        const priceStr = c.singlePrice?.amount
          ? ` (+${(c.singlePrice.amount / 100).toFixed(2)}€)`
          : '';
        return `${c.quantity > 1 ? `${c.quantity}x ` : ''}${c.orderItemName}${priceStr}`;
      });

    return {
      externalId: item.posItemId ?? item.orderItemId ?? item.internalId ?? '',
      name: item.orderItemName ?? 'Unbekannter Artikel',
      quantity: item.quantity,
      unitPrice: item.singlePrice?.amount ?? 0,
      totalPrice: item.rowTotal?.amount ?? (item.singlePrice?.amount ?? 0) * item.quantity,
      options,
    };
  });
}

// ---------------------------------------------------------------------------
// Haupt-Mapper
// ---------------------------------------------------------------------------

export function mapMergeportOrder(order: MergeportOrder): MappedOrder {
  // Zahlungsart: CASH + payOnDelivery → Bar bei Lieferung, sonst Online
  const paymentInfo = order.paymentInfo?.[0];
  const paymentMethod: 'cash_on_delivery' | 'online_paid' =
    paymentInfo?.paymentType === 'CASH' && paymentInfo?.payOnDelivery
      ? 'cash_on_delivery'
      : 'online_paid';

  // Trinkgeld und Liefergebühr aus additionalCosts extrahieren
  let tip = 0;
  let deliveryFee = 0;
  if (order.additionalCosts) {
    for (const cost of order.additionalCosts) {
      if (cost.tip) {
        tip += cost.value?.amount ?? 0;
      } else if (cost.name?.toLowerCase().includes('deliver') || cost.name?.toLowerCase().includes('liefer')) {
        deliveryFee += cost.value?.amount ?? 0;
      }
    }
  }

  // Kundeninformationen: aus deliveryInfo oder pickupInfo
  const delivery = order.deliveryInfo;
  const pickup = order.pickupInfo;

  const firstName = delivery?.firstName ?? pickup?.firstName ?? '';
  const lastName = delivery?.lastName ?? pickup?.lastName ?? '';
  const customerName = [firstName, lastName].filter(Boolean).join(' ') || null;

  return {
    mergeportId: order.id,
    externalId: order.orderId ?? order.id,
    orderReference: order.orderReference ?? null,
    providerName: order.providerName ?? 'Unbekannt',
    mergeportStatus: order.status,
    status: mapMergeportStatus(order.status),
    possibleStateChanges: order.possibleStateChanges ?? [],
    items: mapItems(order.items),
    customerName,
    customerPhone: delivery?.phone ?? pickup?.phone ?? null,
    customerEmail: delivery?.email ?? pickup?.email ?? null,
    deliveryStreet: delivery
      ? [delivery.street, delivery.number].filter(Boolean).join(' ') || null
      : null,
    deliveryCity: delivery?.city ?? null,
    deliveryZip: delivery?.zip ?? null,
    deliveryComment: delivery?.comment ?? null,
    pickupTime: pickup?.pickupTime ?? null,
    paymentMethod,
    totalAmount: order.amountToPay?.amount ?? 0,
    tip,
    deliveryFee,
    notes: order.notes ?? null,
    createdAt: order.creationDate ?? null,
    rawOrder: order,
  };
}

// ---------------------------------------------------------------------------
// Kassomat IncomingOrderStatus → Mergeport Status Mapping (Rückrichtung)
// ---------------------------------------------------------------------------

export function mapKassomatStatusToMergeport(
  kassomatStatus: string,
): MergeportOrderStatus | null {
  switch (kassomatStatus) {
    case 'accepted':
      return 'acceptedByPOS';
    case 'in_progress':
      return 'preparing';
    case 'completed':
      return 'delivered';
    case 'cancelled':
      return 'canceledByPOS';
    default:
      return null;
  }
}
