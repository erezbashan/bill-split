import type {
  BillDocument,
  BillItem,
  BillSummary,
  Participant,
  ParticipantBreakdown,
  ParticipantShareItem,
  RawOcrItem,
} from '../types/bill';

export const PARTICIPANT_COLORS = [
  '#0d9488', // teal-600
  '#2563eb', // blue-600
  '#7c3aed', // violet-600
  '#db2777', // pink-600
  '#ea580c', // orange-600
  '#16a34a', // green-600
  '#0284c7', // sky-600
  '#9333ea', // purple-600
  '#dc2626', // red-600
  '#ca8a04', // yellow-600
];

export function getNextParticipantColor(existingParticipants: Participant[]): string {
  const used = new Set(existingParticipants.map((p) => p.color));
  for (const color of PARTICIPANT_COLORS) {
    if (!used.has(color)) return color;
  }
  return PARTICIPANT_COLORS[existingParticipants.length % PARTICIPANT_COLORS.length];
}

export function roundAgorot(amount: number): number {
  return Math.round((amount + Number.EPSILON) * 100) / 100;
}

/**
 * Expands multi-quantity OCR items into individual clickable rows
 * e.g. { name: 'חצי בירה', quantity: 3, totalPrice: 99 } -> 3 rows of ₪33 each
 */
export function expandOcrItems(rawItems: RawOcrItem[]): BillItem[] {
  const expanded: BillItem[] = [];
  let counter = 1;

  for (const raw of rawItems) {
    const qty = Math.max(1, Math.round(raw.quantity || 1));
    const total = Number(raw.totalPrice) || 0;

    // Skip 0-price modifier lines if any slipped through
    if (total === 0 && !raw.name?.trim()) {
      continue;
    }

    if (qty === 1 || qty > 25) {
      expanded.push({
        id: `item-${Date.now()}-${counter++}`,
        name: raw.name.trim(),
        price: roundAgorot(total),
        originalQuantity: 1,
        claimedBy: [],
        ocrUncertain: Boolean(raw.uncertain),
      });
    } else {
      const baseUnitPrice = Math.floor((total / qty) * 100) / 100;
      let remainder = roundAgorot(total - baseUnitPrice * qty);

      for (let i = 1; i <= qty; i++) {
        const extraAgora = remainder > 0 ? roundAgorot(remainder) : 0;
        const unitPrice = roundAgorot(baseUnitPrice + (i === 1 ? extraAgora : 0));
        if (i === 1) remainder = 0;

        expanded.push({
          id: `item-${Date.now()}-${counter++}`,
          name: raw.name.trim(),
          price: unitPrice,
          originalQuantity: qty,
          unitIndex: i,
          claimedBy: [],
          ocrUncertain: Boolean(raw.uncertain),
        });
      }
    }
  }

  return expanded;
}

/**
 * Computes full live breakdown, consistency check, and per-person shares.
 * When `bill.phase === 'settled'`, any unclaimed items are automatically split
 * equally among all participants and flagged with `isUnclaimedAutoSplit: true`.
 */
export function calculateBillSummary(bill: BillDocument): BillSummary {
  const itemsTotal = roundAgorot(bill.items.reduce((sum, item) => sum + (Number(item.price) || 0), 0));
  const discount = Math.max(0, Number(bill.discountAmount) || 0);
  const extraFee = Math.max(0, Number(bill.extraFeeAmount) || 0);
  const netBillBeforeTip = Math.max(0, roundAgorot(itemsTotal - discount + extraFee));

  const receiptTotal = Number(bill.receiptTotal) || 0;
  const difference = receiptTotal > 0 ? roundAgorot(netBillBeforeTip - receiptTotal) : 0;
  const uncertainItemsCount = bill.items.filter((i) => i.ocrUncertain).length;
  const hasInconsistency =
    (receiptTotal > 0 && Math.abs(difference) >= 1) || uncertainItemsCount > 0;

  const unclaimedItems = bill.items.filter((item) => item.claimedBy.length === 0 && item.price > 0);
  const unclaimedTotal = roundAgorot(unclaimedItems.reduce((sum, item) => sum + item.price, 0));
  const claimedItemsTotal = roundAgorot(itemsTotal - unclaimedTotal);

  const totalTipAmount =
    bill.tipMode === 'amount'
      ? Math.max(0, roundAgorot(Number(bill.tipCustomAmount) || 0))
      : roundAgorot(netBillBeforeTip * (Math.max(0, Number(bill.tipPercent) || 0) / 100));

  const grandTotalWithTip = roundAgorot(netBillBeforeTip + totalTipAmount);

  const participantCount = bill.participants.length;
  const autoSplitUnclaimed = bill.phase === 'settled' && participantCount > 0;

  const rawSubtotals = new Map<string, number>();
  const claimedByParticipant = new Map<string, ParticipantShareItem[]>();
  const unclaimedByParticipant = new Map<string, ParticipantShareItem[]>();

  for (const p of bill.participants) {
    rawSubtotals.set(p.id, 0);
    claimedByParticipant.set(p.id, []);
    unclaimedByParticipant.set(p.id, []);
  }

  for (const item of bill.items) {
    const validClaimers = item.claimedBy.filter((id) => rawSubtotals.has(id));
    if (validClaimers.length > 0) {
      const share = item.price / validClaimers.length;
      for (const pid of validClaimers) {
        rawSubtotals.set(pid, (rawSubtotals.get(pid) || 0) + share);
        claimedByParticipant.get(pid)?.push({
          itemId: item.id,
          name: item.originalQuantity && item.originalQuantity > 1
            ? `${item.name} (${item.unitIndex}/${item.originalQuantity})`
            : item.name,
          fullPrice: item.price,
          sharePrice: roundAgorot(share),
          splitCount: validClaimers.length,
          isUnclaimedAutoSplit: false,
        });
      }
    } else if (autoSplitUnclaimed && item.price > 0) {
      const share = item.price / participantCount;
      for (const p of bill.participants) {
        rawSubtotals.set(p.id, (rawSubtotals.get(p.id) || 0) + share);
        unclaimedByParticipant.get(p.id)?.push({
          itemId: item.id,
          name: item.originalQuantity && item.originalQuantity > 1
            ? `${item.name} (${item.unitIndex}/${item.originalQuantity})`
            : item.name,
          fullPrice: item.price,
          sharePrice: roundAgorot(share),
          splitCount: participantCount,
          isUnclaimedAutoSplit: true,
        });
      }
    }
  }

  const totalAssignedItemsSubtotal = Array.from(rawSubtotals.values()).reduce((a, b) => a + b, 0);

  const participantBreakdowns: ParticipantBreakdown[] = bill.participants.map((participant) => {
    const itemsSubtotalRaw = rawSubtotals.get(participant.id) || 0;
    const weight =
      totalAssignedItemsSubtotal > 0
        ? itemsSubtotalRaw / totalAssignedItemsSubtotal
        : participantCount > 0
          ? 1 / participantCount
          : 0;

    const discountShare = roundAgorot(discount * weight);
    const extraFeeShare = roundAgorot(extraFee * weight);
    const netBeforeTip = Math.max(0, roundAgorot(itemsSubtotalRaw - discountShare + extraFeeShare));

    // Tip is proportional to each person's share of the bill
    const tipShare = roundAgorot(totalTipAmount * weight);
    const totalToPay = roundAgorot(netBeforeTip + tipShare);

    return {
      participant,
      claimedItems: claimedByParticipant.get(participant.id) || [],
      unclaimedAutoSplitItems: unclaimedByParticipant.get(participant.id) || [],
      itemsSubtotal: roundAgorot(itemsSubtotalRaw),
      discountShare,
      extraFeeShare,
      netBeforeTip,
      tipShare,
      totalToPay,
    };
  });

  return {
    consistency: {
      hasInconsistency,
      calculatedSubtotal: netBillBeforeTip,
      receiptTotal,
      difference,
      uncertainItemsCount,
    },
    itemsTotal,
    claimedItemsTotal,
    unclaimedItems,
    unclaimedTotal,
    netBillBeforeTip,
    totalTipAmount,
    grandTotalWithTip,
    participantBreakdowns,
  };
}

export function formatCurrency(amount: number): string {
  const rounded = roundAgorot(amount);
  const isWhole = Math.abs(rounded - Math.round(rounded)) < 0.005;
  return `₪${isWhole ? Math.round(rounded) : rounded.toFixed(2)}`;
}

export function buildWhatsAppSummaryText(bill: BillDocument, summary: BillSummary, shareUrl: string): string {
  const lines: string[] = [];
  lines.push(`🧾 *סיכום חשבון — ${bill.restaurantName || 'מסעדה'}*`);
  lines.push('');

  for (const b of summary.participantBreakdowns) {
    if (b.totalToPay <= 0 && b.claimedItems.length === 0) continue;
    const itemNames = [
      ...b.claimedItems.map((i) => (i.splitCount > 1 ? `${i.name} (1/${i.splitCount})` : i.name)),
      ...b.unclaimedAutoSplitItems.map((i) => `⚠️ ${i.name} (חולק אוטומטית)`),
    ].join(', ');
    lines.push(`👤 *${b.participant.name}*: *${formatCurrency(b.totalToPay)}*`);
    if (itemNames) {
      lines.push(`   (${itemNames}${b.tipShare > 0 ? ` + טיפ ${formatCurrency(b.tipShare)}` : ''})`);
    }
  }

  lines.push('');
  lines.push(`💰 סה״כ ארוחה: ${formatCurrency(summary.netBillBeforeTip)}`);
  if (summary.totalTipAmount > 0) {
    lines.push(
      `✨ טיפ (${bill.tipMode === 'percent' ? `${bill.tipPercent}%` : 'סכום קבוע'}): ${formatCurrency(summary.totalTipAmount)}`
    );
  }
  lines.push(`💳 *סה״כ כולל טיפ: ${formatCurrency(summary.grandTotalWithTip)}*`);

  if (bill.payerName) {
    lines.push(`📲 להעביר בביט/פייבוקס ל: *${bill.payerName}*${bill.payerPhone ? ` (${bill.payerPhone})` : ''}`);
  }

  lines.push('');
  lines.push(`🔗 קישור לחשבון החי: ${shareUrl}`);
  return lines.join('\n');
}
