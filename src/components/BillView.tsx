import React, { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Home,
  Plus,
  QrCode,
  Sparkles,
} from 'lucide-react';
import type { BillDocument, Participant, TipMode } from '../types/bill';
import {
  calculateBillSummary,
  formatCurrency,
  getNextParticipantColor,
} from '../utils/calculations';
import { setUserNameCookie } from '../utils/cookies';
import { fetchReceiptImage, updateBill } from '../services/storageService';
import { ParticipantBar } from './ParticipantBar';
import { ItemRow } from './ItemRow';
import { SettleSection } from './SettleSection';
import { QrModal } from './QrModal';
import { AboutContactLinks } from './AboutContactModals';
import { APP_VERSION } from '../version';

interface BillViewProps {
  bill: BillDocument;
  onOptimisticBillChange: (updated: BillDocument) => void;
  onBackHome: () => void;
  initialOpenQr?: boolean;
}

const ACTIVE_PARTICIPANT_STORAGE_PREFIX = 'billsplit_active_participant_';

export const BillView: React.FC<BillViewProps> = ({
  bill,
  onOptimisticBillChange,
  onBackHome,
  initialOpenQr = false,
}) => {
  const [activeParticipantId, setActiveParticipantId] = useState<string | null>(() => {
    const savedId = localStorage.getItem(ACTIVE_PARTICIPANT_STORAGE_PREFIX + bill.id);
    if (savedId && bill.participants.some((p) => p.id === savedId)) {
      return savedId;
    }
    return null;
  });

  const [qrModalOpen, setQrModalOpen] = useState<boolean>(initialOpenQr);
  // If user hasn't joined THIS bill yet and the QR modal isn't open, immediately prompt for their name!
  const [joinModalOpen, setJoinModalOpen] = useState<boolean>(() => {
    const savedId = localStorage.getItem(ACTIVE_PARTICIPANT_STORAGE_PREFIX + bill.id);
    const hasValidParticipant = Boolean(
      savedId && bill.participants.some((p) => p.id === savedId)
    );
    return !initialOpenQr && !hasValidParticipant;
  });

  // Receipt image loaded and always shown at the top when available
  const [receiptImageUrl, setReceiptImageUrl] = useState<string | null>(null);

  // Add item form state
  const [isAddingItem, setIsAddingItem] = useState(false);
  const [newItemName, setNewItemName] = useState('');
  const [newItemPrice, setNewItemPrice] = useState('');

  // Edit discount / extra fee state
  const [isEditingAdjustments, setIsEditingAdjustments] = useState(false);
  const [discountInput, setDiscountInput] = useState(String(bill.discountAmount || 0));
  const [extraFeeInput, setExtraFeeInput] = useState(String(bill.extraFeeAmount || 0));
  const [extraFeeLabelInput, setExtraFeeLabelInput] = useState(bill.extraFeeLabel || 'אבטחה');

  const newItemNameId = useId();
  const newItemPriceId = useId();
  const discountInputId = useId();
  const extraFeeInputId = useId();
  const extraFeeLabelId = useId();

  const settleRef = useRef<HTMLDivElement>(null);

  // Automatically fetch receipt photo so it is always displayed at the top
  useEffect(() => {
    if (!bill.hasReceiptImage) {
      setReceiptImageUrl(null);
      return;
    }
    let active = true;
    fetchReceiptImage(bill.id).then((url) => {
      if (active) setReceiptImageUrl(url);
    });
    return () => {
      active = false;
    };
  }, [bill.id, bill.hasReceiptImage]);

  useEffect(() => {
    if (initialOpenQr) {
      setQrModalOpen(true);
    }
  }, [initialOpenQr]);

  // Keep activeParticipantId valid if participants list changes
  useEffect(() => {
    if (
      activeParticipantId &&
      !bill.participants.some((p) => p.id === activeParticipantId)
    ) {
      setActiveParticipantId(null);
    }
  }, [activeParticipantId, bill.participants]);

  const summary = useMemo(() => calculateBillSummary(bill), [bill]);

  const totalsByParticipant = useMemo(() => {
    const map = new Map<string, number>();
    for (const b of summary.participantBreakdowns) {
      map.set(b.participant.id, b.totalToPay);
    }
    return map;
  }, [summary]);

  const activeParticipant: Participant | null = useMemo(
    () => bill.participants.find((p) => p.id === activeParticipantId) || null,
    [bill.participants, activeParticipantId]
  );

  const shareUrl = useMemo(() => {
    const url = new URL(window.location.href);
    url.searchParams.set('bill', bill.id);
    return url.toString();
  }, [bill.id]);

  // Helper that applies an instant optimistic update to React state AND persists to backend
  const applyBillUpdate = useCallback(
    async (updater: (curr: BillDocument) => BillDocument) => {
      const optimisticNext = updater(bill);
      onOptimisticBillChange(optimisticNext);
      await updateBill(bill.id, updater);
    },
    [bill, onOptimisticBillChange]
  );

  const handleSelectParticipant = useCallback(
    (id: string) => {
      setActiveParticipantId(id);
      localStorage.setItem(ACTIVE_PARTICIPANT_STORAGE_PREFIX + bill.id, id);
      const found = bill.participants.find((p) => p.id === id);
      if (found) {
        setUserNameCookie(found.name);
      }
    },
    [bill.id, bill.participants]
  );

  const handleAddParticipant = useCallback(
    async (name: string, saveToCookie: boolean) => {
      const trimmed = name.trim();
      if (saveToCookie) {
        setUserNameCookie(trimmed);
      }

      // Check if participant with same name already exists in this bill
      const existing = bill.participants.find(
        (p) => p.name.trim().toLowerCase() === trimmed.toLowerCase()
      );
      if (existing) {
        handleSelectParticipant(existing.id);
        return;
      }

      const newParticipant: Participant = {
        id: `user-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        name: trimmed,
        color: getNextParticipantColor(bill.participants),
        createdAt: Date.now(),
      };

      setActiveParticipantId(newParticipant.id);
      localStorage.setItem(
        ACTIVE_PARTICIPANT_STORAGE_PREFIX + bill.id,
        newParticipant.id
      );

      await applyBillUpdate((curr) => ({
        ...curr,
        participants: [...curr.participants, newParticipant],
      }));
    },
    [applyBillUpdate, bill.id, bill.participants, handleSelectParticipant]
  );

  const handleRenameParticipant = useCallback(
    async (participantId: string, newName: string) => {
      const trimmed = newName.trim();
      if (!trimmed) return;
      await applyBillUpdate((curr) => ({
        ...curr,
        participants: curr.participants.map((p) =>
          p.id === participantId ? { ...p, name: trimmed } : p
        ),
      }));
    },
    [applyBillUpdate]
  );

  const handleToggleClaim = useCallback(
    async (itemId: string) => {
      if (!activeParticipant) {
        setJoinModalOpen(true);
        return;
      }

      const pid = activeParticipant.id;
      await applyBillUpdate((curr) => ({
        ...curr,
        items: curr.items.map((item) => {
          if (item.id !== itemId) return item;
          const alreadyClaimed = item.claimedBy.includes(pid);
          return {
            ...item,
            claimedBy: alreadyClaimed
              ? item.claimedBy.filter((id) => id !== pid)
              : [...item.claimedBy, pid],
          };
        }),
      }));
    },
    [activeParticipant, applyBillUpdate]
  );

  const handleUpdateItem = useCallback(
    async (itemId: string, updates: { name: string; price: number }) => {
      await applyBillUpdate((curr) => ({
        ...curr,
        items: curr.items.map((item) =>
          item.id === itemId
            ? { ...item, name: updates.name, price: updates.price, ocrUncertain: false }
            : item
        ),
      }));
    },
    [applyBillUpdate]
  );

  const handleDeleteItem = useCallback(
    async (itemId: string) => {
      await applyBillUpdate((curr) => ({
        ...curr,
        items: curr.items.filter((item) => item.id !== itemId),
      }));
    },
    [applyBillUpdate]
  );

  const handleAddNewItem = async (e: React.FormEvent) => {
    e.preventDefault();
    const price = parseFloat(newItemPrice);
    if (!newItemName.trim() || Number.isNaN(price) || price < 0) return;

    const newItem = {
      id: `item-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      name: newItemName.trim(),
      price: Math.round(price * 100) / 100,
      claimedBy: activeParticipant ? [activeParticipant.id] : [],
    };

    setNewItemName('');
    setNewItemPrice('');
    setIsAddingItem(false);

    await applyBillUpdate((curr) => ({
      ...curr,
      items: [...curr.items, newItem],
    }));
  };

  const handleSaveAdjustments = async (e: React.FormEvent) => {
    e.preventDefault();
    const discountAmount = Math.max(0, parseFloat(discountInput) || 0);
    const extraFeeAmount = Math.max(0, parseFloat(extraFeeInput) || 0);
    setIsEditingAdjustments(false);

    await applyBillUpdate((curr) => ({
      ...curr,
      discountAmount,
      extraFeeAmount,
      extraFeeLabel: extraFeeLabelInput.trim() || 'אבטחה',
    }));
  };

  const handleResolveInconsistency = async () => {
    await applyBillUpdate((curr) => ({
      ...curr,
      receiptTotal: summary.netBillBeforeTip,
      items: curr.items.map((item) => ({ ...item, ocrUncertain: false })),
    }));
  };

  const handleMoveToSettled = async () => {
    await applyBillUpdate((curr) => ({
      ...curr,
      phase: 'settled',
    }));
    setTimeout(() => {
      settleRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 100);
  };

  const handleUpdateTip = useCallback(
    async (tipMode: TipMode, tipPercent: number, tipCustomAmount: number) => {
      await applyBillUpdate((curr) => ({
        ...curr,
        tipMode,
        tipPercent,
        tipCustomAmount,
      }));
    },
    [applyBillUpdate]
  );

  const handleUpdatePayer = useCallback(
    async (payerName: string, payerPhone: string) => {
      await applyBillUpdate((curr) => ({
        ...curr,
        payerName,
        payerPhone,
      }));
    },
    [applyBillUpdate]
  );

  const handleCloseQrModal = useCallback(() => {
    setQrModalOpen(false);
    // Once the initiator closes the QR share popup, prompt them for their name if they haven't joined yet!
    if (!activeParticipantId) {
      setJoinModalOpen(true);
    }
  }, [activeParticipantId]);

  const handleCloseJoinModal = useCallback(() => {
    setJoinModalOpen(false);
  }, []);

  const activePersonBreakdown = summary.participantBreakdowns.find(
    (b) => b.participant.id === activeParticipantId
  );

  return (
    <div className="min-h-dvh pb-28 bg-slate-50">
      {/* Top sticky header */}
      <header className="sticky top-0 z-20 border-b border-slate-200/80 bg-white/95 backdrop-blur-md">
        <div className="mx-auto flex max-w-lg items-center justify-between gap-2 px-4 py-3">
          <a
            href="/"
            onClick={(e) => {
              e.preventDefault();
              onBackHome();
            }}
            aria-label="דף הבית — התחל חשבון חדש"
            className="inline-flex shrink-0 items-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-extrabold text-slate-700 hover:bg-teal-50 hover:border-teal-300 hover:text-teal-900 transition-colors"
          >
            <Home className="h-4 w-4 text-teal-700" />
            <span>דף הבית / חדש</span>
          </a>

          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={() => setQrModalOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-xl bg-teal-700 px-3 py-2 text-xs font-bold text-white shadow-xs hover:bg-teal-800 transition-colors"
            >
              <QrCode className="h-4 w-4" />
              <span>ברקוד QR</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="mx-auto max-w-lg px-3.5 pt-3.5 space-y-3.5">
        {/* Always show the receipt image at the top when available */}
        {receiptImageUrl && (
          <section
            aria-label="צילום החשבון"
            className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xs"
          >
            <img
              src={receiptImageUrl}
              alt="צילום החשבון המקורי"
              className="w-full h-auto max-h-96 object-contain bg-slate-900/5 mx-auto"
            />
          </section>
        )}

        {/* Inconsistency Warning Banner */}
        {summary.consistency.hasInconsistency && (
          <div
            role="alert"
            className="rounded-2xl border-2 border-amber-400 bg-amber-50 p-3.5 text-amber-950 shadow-xs space-y-2.5"
          >
            <div className="flex items-start gap-2.5">
              <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
              <div className="space-y-1 text-xs leading-relaxed">
                <p className="text-sm font-extrabold text-amber-900">
                  שימו לב: נמצאה אי-התאמה בסריקת החשבון
                </p>
                {Math.abs(summary.consistency.difference) >= 1 && (
                  <p>
                    סכום הפריטים שזוהו (<strong>{formatCurrency(summary.consistency.calculatedSubtotal)}</strong>){' '}
                    אינו תואם לסה״כ המודפס בקבלה (<strong>{formatCurrency(summary.consistency.receiptTotal)}</strong>) — הפרש של{' '}
                    <strong className="underline">
                      {formatCurrency(Math.abs(summary.consistency.difference))}
                    </strong>
                    .
                  </p>
                )}
                {summary.consistency.uncertainItemsCount > 0 && (
                  <p>
                    יש {summary.consistency.uncertainItemsCount === 1 ? 'שורה אחת שה-OCR סימן כמטושטשת' : `${summary.consistency.uncertainItemsCount} שורות שה-OCR סימן כמטושטשות`} (מסומנות ב-״לבדיקה״).
                  </p>
                )}
                <p className="text-amber-800">
                  כל אחד יכול לערוך מחיר של שורה (✏️) או להוסיף שורה חסרה.
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 pt-1">
              <button
                type="button"
                onClick={() => setIsAddingItem(true)}
                className="inline-flex items-center gap-1 rounded-xl bg-white border border-amber-300 px-3 py-1.5 text-xs font-bold text-amber-900 hover:bg-amber-100 transition-colors"
              >
                <Plus className="h-3.5 w-3.5" />
                <span>הוסף פריט חסר</span>
              </button>

              <button
                type="button"
                onClick={handleResolveInconsistency}
                className="inline-flex items-center gap-1 rounded-xl bg-white/70 px-2.5 py-1.5 text-xs font-semibold text-amber-800 hover:bg-white ms-auto transition-colors"
              >
                <CheckCircle2 className="h-3.5 w-3.5" />
                <span>הכל תקין, סגור התראה</span>
              </button>
            </div>
          </div>
        )}

        {/* Participant Selector & Add Bar */}
        <ParticipantBar
          participants={bill.participants}
          activeParticipantId={activeParticipantId}
          onSelectParticipant={handleSelectParticipant}
          onAddParticipant={handleAddParticipant}
          onRenameParticipant={handleRenameParticipant}
          totalsByParticipant={totalsByParticipant}
          forceJoinModalOpen={joinModalOpen}
          onCloseJoinModal={handleCloseJoinModal}
        />

        {/* Items List Section */}
        <section aria-label="רשימת מנות בחשבון" className="space-y-2">
          <div className="flex items-center justify-between px-1">
            <h2 className="text-sm font-extrabold text-slate-800">
              מנות ופריטים ({bill.items.length}) — לחצו על מה שאכלתם:
            </h2>
            <span className="text-xs font-bold text-slate-500">
              סה״כ מנות: {formatCurrency(summary.itemsTotal)}
            </span>
          </div>

          <div className="space-y-2">
            {bill.items.map((item) => (
              <ItemRow
                key={item.id}
                item={item}
                participants={bill.participants}
                activeParticipant={activeParticipant}
                phase={bill.phase}
                onToggleClaim={handleToggleClaim}
                onUpdateItem={handleUpdateItem}
                onDeleteItem={handleDeleteItem}
              />
            ))}
          </div>

          {/* Add new item inline form or button */}
          {isAddingItem ? (
            <form
              onSubmit={handleAddNewItem}
              className="rounded-2xl border-2 border-teal-500 bg-white p-3.5 shadow-sm space-y-3"
            >
              <h3 className="text-xs font-extrabold text-teal-800">הוספת פריט לחשבון</h3>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                <div className="sm:col-span-2">
                  <label htmlFor={newItemNameId} className="block text-xs font-bold text-slate-700 mb-1">
                    שם הפריט
                  </label>
                  <input
                    id={newItemNameId}
                    name="newItemName"
                    type="text"
                    required
                    placeholder="למשל: אספרסו כפול"
                    value={newItemName}
                    onChange={(e) => setNewItemName(e.target.value)}
                    className="w-full rounded-xl border border-slate-300 px-3 py-2 text-base"
                    autoFocus
                  />
                </div>
                <div>
                  <label htmlFor={newItemPriceId} className="block text-xs font-bold text-slate-700 mb-1">
                    מחיר (₪)
                  </label>
                  <input
                    id={newItemPriceId}
                    name="newItemPrice"
                    type="text"
                    inputMode="decimal"
                    required
                    placeholder="14"
                    value={newItemPrice}
                    onChange={(e) => setNewItemPrice(e.target.value)}
                    className="w-full rounded-xl border border-slate-300 px-3 py-2 text-base dir-ltr text-left"
                  />
                </div>
              </div>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsAddingItem(false)}
                  className="rounded-xl border border-slate-200 px-3.5 py-2 text-xs font-semibold text-slate-600"
                >
                  ביטול
                </button>
                <button
                  type="submit"
                  className="rounded-xl bg-teal-700 px-4 py-2 text-xs font-bold text-white"
                >
                  הוסף לחשבון
                </button>
              </div>
            </form>
          ) : (
            <div className="flex items-center justify-between gap-2 pt-1">
              <button
                type="button"
                onClick={() => setIsAddingItem(true)}
                className="inline-flex items-center gap-1.5 rounded-xl border border-dashed border-slate-300 bg-white px-3.5 py-2.5 text-xs font-bold text-slate-700 hover:border-teal-500 hover:text-teal-800 transition-colors"
              >
                <Plus className="h-4 w-4 text-teal-600" />
                <span>הוסף מנה / שורה</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setDiscountInput(String(bill.discountAmount || 0));
                  setExtraFeeInput(String(bill.extraFeeAmount || 0));
                  setExtraFeeLabelInput(bill.extraFeeLabel || 'אבטחה');
                  setIsEditingAdjustments((v) => !v);
                }}
                className="text-xs font-semibold text-slate-500 hover:text-slate-800 underline underline-offset-4 px-2 py-2"
              >
                {bill.discountAmount > 0 || bill.extraFeeAmount > 0
                  ? `הנחה: ₪${bill.discountAmount} · ${bill.extraFeeLabel || 'תוספת'}: ₪${bill.extraFeeAmount} (ערוך)`
                  : 'הוסף הנחה או אבטחה'}
              </button>
            </div>
          )}

          {/* Adjustments (Discount / Extra Fee) Form */}
          {isEditingAdjustments && (
            <form
              onSubmit={handleSaveAdjustments}
              className="rounded-2xl border border-slate-200 bg-white p-3.5 space-y-3 shadow-xs"
            >
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                <div>
                  <label htmlFor={discountInputId} className="block text-xs font-bold text-slate-700 mb-1">
                    סך הנחה בחשבון (₪)
                  </label>
                  <input
                    id={discountInputId}
                    name="discountAmount"
                    type="text"
                    inputMode="decimal"
                    value={discountInput}
                    onChange={(e) => setDiscountInput(e.target.value)}
                    className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm dir-ltr text-left"
                  />
                </div>
                <div>
                  <label htmlFor={extraFeeLabelId} className="block text-xs font-bold text-slate-700 mb-1">
                    תיאור תוספת (כגון אבטחה)
                  </label>
                  <input
                    id={extraFeeLabelId}
                    name="extraFeeLabel"
                    type="text"
                    value={extraFeeLabelInput}
                    onChange={(e) => setExtraFeeLabelInput(e.target.value)}
                    className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label htmlFor={extraFeeInputId} className="block text-xs font-bold text-slate-700 mb-1">
                    סכום תוספת (₪)
                  </label>
                  <input
                    id={extraFeeInputId}
                    name="extraFeeAmount"
                    type="text"
                    inputMode="decimal"
                    value={extraFeeInput}
                    onChange={(e) => setExtraFeeInput(e.target.value)}
                    className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm dir-ltr text-left"
                  />
                </div>
              </div>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsEditingAdjustments(false)}
                  className="rounded-xl border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600"
                >
                  ביטול
                </button>
                <button
                  type="submit"
                  className="rounded-xl bg-teal-700 px-3.5 py-1.5 text-xs font-bold text-white"
                >
                  עדכן
                </button>
              </div>
            </form>
          )}
        </section>

        {/* Settlement & Tip Section (Always visible in 'settled' phase, or triggered by button) */}
        <div ref={settleRef}>
          {bill.phase === 'settled' ? (
            <SettleSection
              bill={bill}
              summary={summary}
              activeParticipantId={activeParticipantId}
              shareUrl={shareUrl}
              onUpdateTip={handleUpdateTip}
              onUpdatePayer={handleUpdatePayer}
              onStartNewBill={onBackHome}
            />
          ) : (
            <div className="rounded-2xl border border-teal-200 bg-teal-50/60 p-4 text-center space-y-2.5">
              <p className="text-xs font-semibold text-teal-900">
                כולם סיימו לסמן את המנות שלהם?
                {summary.unclaimedItems.length > 0 &&
                  ` (נותרו ${summary.unclaimedItems.length} מנות שלא סומנו — הן יחולקו אוטומטית בין כולם עם סימון אזהרה)`}
              </p>
              <button
                type="button"
                onClick={handleMoveToSettled}
                className="inline-flex items-center justify-center gap-2 rounded-2xl bg-teal-700 px-6 py-3.5 text-sm font-extrabold text-white shadow-md hover:bg-teal-800 transition-colors w-full sm:w-auto"
              >
                <Sparkles className="h-4 w-4" />
                <span>סיימנו — לחשבון ובחירת טיפ!</span>
              </button>
            </div>
          )}
        </div>

        <footer className="pt-4 pb-2 text-center space-y-2">
          <AboutContactLinks variant="light" />
          <p className="text-[11px] text-slate-400">
            Bill Split · v{APP_VERSION}
          </p>
        </footer>
      </main>

      {/* Sticky Bottom Bar for immediate personal feedback + Settle trigger */}
      <div className="fixed bottom-0 inset-x-0 z-20 border-t border-slate-200 bg-white/95 backdrop-blur-md shadow-lg">
        <div className="mx-auto flex max-w-lg items-center justify-between gap-3 px-4 py-3">
          <div className="min-w-0">
            {activeParticipant && activePersonBreakdown ? (
              <div>
                <div className="flex items-center gap-1.5 text-xs text-slate-500">
                  <span>החלק של</span>
                  <strong style={{ color: activeParticipant.color }}>
                    {activeParticipant.name}
                  </strong>
                  <span>{bill.phase === 'settled' ? `(כולל טיפ ${bill.tipMode === 'percent' ? `${bill.tipPercent}%` : ''})` : '(לפני טיפ)'}:</span>
                </div>
                <div className="text-lg font-black text-slate-900">
                  {formatCurrency(
                    bill.phase === 'settled'
                      ? activePersonBreakdown.totalToPay
                      : activePersonBreakdown.netBeforeTip
                  )}
                </div>
              </div>
            ) : (
              <div>
                <div className="text-xs text-slate-500">סה״כ חשבון:</div>
                <div className="text-lg font-black text-slate-900">
                  {formatCurrency(
                    bill.phase === 'settled'
                      ? summary.grandTotalWithTip
                      : summary.netBillBeforeTip
                  )}
                </div>
              </div>
            )}
          </div>

          {bill.phase === 'selecting' ? (
            <button
              type="button"
              onClick={handleMoveToSettled}
              className="inline-flex items-center gap-2 rounded-2xl bg-teal-700 px-5 py-3 text-sm font-extrabold text-white shadow-sm hover:bg-teal-800 transition-colors shrink-0"
            >
              <Sparkles className="h-4 w-4" />
              <span>סיימנו — לחשבון!</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={() =>
                settleRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
              }
              className="inline-flex items-center gap-2 rounded-2xl bg-slate-900 px-4 py-3 text-xs font-extrabold text-white shadow-sm hover:bg-slate-800 transition-colors shrink-0"
            >
              <Sparkles className="h-4 w-4 text-teal-400" />
              <span>לפירוט התשלום והטיפ ↓</span>
            </button>
          )}
        </div>
      </div>

      {/* QR Modal */}
      <QrModal
        open={qrModalOpen}
        onClose={handleCloseQrModal}
        shareUrl={shareUrl}
        restaurantName={bill.restaurantName}
      />
    </div>
  );
};
