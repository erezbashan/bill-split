import { describe, expect, it } from 'vitest';
import {
  calculateBillSummary,
  expandOcrItems,
} from './calculations';
import type { BillDocument } from '../types/bill';

describe('Bill Split Calculations', () => {
  it('expands multi-quantity OCR items into individual rows with accurate prices', () => {
    const raw = [
      { name: 'חצי בירה', quantity: 3, totalPrice: 99 },
      { name: 'סלט קיסר', quantity: 1, totalPrice: 68 },
    ];
    const expanded = expandOcrItems(raw);
    expect(expanded).toHaveLength(4);
    expect(expanded.filter((i) => i.name === 'חצי בירה').map((i) => i.price)).toEqual([
      33, 33, 33,
    ]);
    expect(expanded[0].originalQuantity).toBe(3);
    expect(expanded[0].unitIndex).toBe(1);
  });

  it('detects inconsistency when sum of items does not match receiptTotal', () => {
    const bill: BillDocument = {
      id: 'test1',
      restaurantName: 'קפה בדיקה',
      createdAt: Date.now(),
      expiresAt: Date.now() + 86400000,
      phase: 'selecting',
      items: [
        { id: '1', name: 'פיצה', price: 60, claimedBy: ['u1'] },
        { id: '2', name: 'פסטה', price: 70, claimedBy: ['u2'] },
      ],
      participants: [
        { id: 'u1', name: 'ארז', color: '#0d9488', createdAt: 1 },
        { id: 'u2', name: 'נועה', color: '#2563eb', createdAt: 2 },
      ],
      discountAmount: 0,
      extraFeeAmount: 0,
      receiptTotal: 150, // 20 NIS difference
      tipMode: 'percent',
      tipPercent: 10,
      tipCustomAmount: 0,
      hasReceiptImage: false,
    };

    const summary = calculateBillSummary(bill);
    expect(summary.consistency.hasInconsistency).toBe(true);
    expect(summary.consistency.difference).toBe(-20);
  });

  it('splits shared items and auto-splits unclaimed items in settled phase with warning flag', () => {
    const bill: BillDocument = {
      id: 'test2',
      restaurantName: 'בראסרי',
      createdAt: Date.now(),
      expiresAt: Date.now() + 86400000,
      phase: 'settled',
      items: [
        { id: '1', name: 'המבורגר', price: 80, claimedBy: ['u1'] },
        { id: '2', name: 'קינוח משותף', price: 40, claimedBy: ['u1', 'u2'] },
        { id: '3', name: 'צ׳יפס שלא סומן', price: 20, claimedBy: [] }, // unclaimed!
      ],
      participants: [
        { id: 'u1', name: 'ארז', color: '#0d9488', createdAt: 1 },
        { id: 'u2', name: 'נועה', color: '#2563eb', createdAt: 2 },
      ],
      discountAmount: 0,
      extraFeeAmount: 0,
      receiptTotal: 140,
      tipMode: 'percent',
      tipPercent: 10,
      tipCustomAmount: 0,
      hasReceiptImage: false,
    };

    const summary = calculateBillSummary(bill);
    expect(summary.unclaimedItems).toHaveLength(1);
    expect(summary.unclaimedTotal).toBe(20);

    const u1 = summary.participantBreakdowns.find((b) => b.participant.id === 'u1')!;
    const u2 = summary.participantBreakdowns.find((b) => b.participant.id === 'u2')!;

    // u1: 80 (burger) + 20 (half dessert) + 10 (half unclaimed fries) = 110 + 10% tip (11) = 121
    expect(u1.itemsSubtotal).toBe(110);
    expect(u1.unclaimedAutoSplitItems).toHaveLength(1);
    expect(u1.unclaimedAutoSplitItems[0].isUnclaimedAutoSplit).toBe(true);
    expect(u1.tipShare).toBe(11);
    expect(u1.totalToPay).toBe(121);

    // u2: 20 (half dessert) + 10 (half unclaimed fries) = 30 + 10% tip (3) = 33
    expect(u2.itemsSubtotal).toBe(30);
    expect(u2.tipShare).toBe(3);
    expect(u2.totalToPay).toBe(33);
  });
});
