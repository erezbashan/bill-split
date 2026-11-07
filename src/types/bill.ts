export type BillPhase = 'selecting' | 'settled';

export type TipMode = 'percent' | 'amount';

export interface Participant {
  id: string;
  name: string;
  color: string;
  createdAt: number;
}

export interface BillItem {
  id: string;
  name: string;
  price: number; // Price for this single row (after expanding quantities)
  originalQuantity?: number;
  unitIndex?: number; // e.g., 1 of 3 when expanded from qty=3
  claimedBy: string[]; // Array of Participant IDs who tapped this item
  ocrUncertain?: boolean; // Flagged by OCR if text/price was blurry
}

export interface RawOcrItem {
  name: string;
  quantity: number;
  totalPrice: number;
  uncertain?: boolean;
}

export interface RawOcrResult {
  restaurantName: string;
  date?: string;
  items: RawOcrItem[];
  discountAmount: number; // Positive number representing total bill-level discount
  extraFeeAmount: number; // Positive number representing non-itemized fees (e.g. אבטחה / משלוח)
  extraFeeLabel?: string;
  receiptTotal: number; // Final total printed at the bottom of the receipt (before tip)
  notes?: string;
}

export interface BillDocument {
  id: string;
  restaurantName: string;
  createdAt: number;
  expiresAt: number; // 24h TTL timestamp
  phase: BillPhase;
  items: BillItem[];
  participants: Participant[];
  discountAmount: number; // General discount in ₪
  extraFeeAmount: number; // General fee in ₪ (e.g. אבטחה)
  extraFeeLabel?: string;
  receiptTotal: number; // Total extracted from bottom of receipt for consistency check
  tipMode: TipMode;
  tipPercent: number; // e.g. 12 for 12%
  tipCustomAmount: number; // Used when tipMode === 'amount'
  hasReceiptImage: boolean;
  payerName?: string; // Optional name/phone of the person who paid the restaurant
  payerPhone?: string;
}

export interface ParticipantShareItem {
  itemId: string;
  name: string;
  fullPrice: number;
  sharePrice: number;
  splitCount: number;
  isUnclaimedAutoSplit: boolean;
}

export interface ParticipantBreakdown {
  participant: Participant;
  claimedItems: ParticipantShareItem[];
  unclaimedAutoSplitItems: ParticipantShareItem[];
  itemsSubtotal: number; // Claimed + auto-split unclaimed
  discountShare: number; // Proportional discount (subtracted)
  extraFeeShare: number; // Proportional extra fee (added)
  netBeforeTip: number;
  tipShare: number;
  totalToPay: number;
}

export interface BillConsistencyCheck {
  hasInconsistency: boolean;
  calculatedSubtotal: number; // Sum of items - discount + extraFee
  receiptTotal: number;
  difference: number; // calculatedSubtotal - receiptTotal
  uncertainItemsCount: number;
}

export interface BillSummary {
  consistency: BillConsistencyCheck;
  itemsTotal: number;
  claimedItemsTotal: number;
  unclaimedItems: BillItem[];
  unclaimedTotal: number;
  netBillBeforeTip: number;
  totalTipAmount: number;
  grandTotalWithTip: number;
  participantBreakdowns: ParticipantBreakdown[];
}
