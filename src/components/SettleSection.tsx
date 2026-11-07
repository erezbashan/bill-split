import React, { useId, useState } from 'react';
import {
  AlertTriangle,
  Check,
  Copy,
  CreditCard,
  Home,
  Percent,
  Share2,
  Smartphone,
  Sparkles,
} from 'lucide-react';
import type { BillDocument, BillSummary, TipMode } from '../types/bill';
import { buildWhatsAppSummaryText, formatCurrency } from '../utils/calculations';

interface SettleSectionProps {
  bill: BillDocument;
  summary: BillSummary;
  activeParticipantId: string | null;
  shareUrl: string;
  onUpdateTip: (tipMode: TipMode, tipPercent: number, tipCustomAmount: number) => void;
  onUpdatePayer: (payerName: string, payerPhone: string) => void;
  onStartNewBill: () => void;
}

const PRESET_TIPS = [0, 10, 12, 15];

export const SettleSection: React.FC<SettleSectionProps> = ({
  bill,
  summary,
  activeParticipantId,
  shareUrl,
  onUpdateTip,
  onUpdatePayer,
  onStartNewBill,
}) => {
  const [copiedSummary, setCopiedSummary] = useState(false);
  const [copiedAmountFor, setCopiedAmountFor] = useState<string | null>(null);
  const [editingPayer, setEditingPayer] = useState(false);
  const [payerNameInput, setPayerNameInput] = useState(bill.payerName || '');
  const [payerPhoneInput, setPayerPhoneInput] = useState(bill.payerPhone || '');

  const customTipInputId = useId();
  const payerNameId = useId();
  const payerPhoneId = useId();

  const sortedBreakdowns = [...summary.participantBreakdowns].sort((a, b) => {
    if (a.participant.id === activeParticipantId) return -1;
    if (b.participant.id === activeParticipantId) return 1;
    return b.totalToPay - a.totalToPay;
  });

  const handleCopyWhatsAppText = async () => {
    const text = buildWhatsAppSummaryText(bill, summary, shareUrl);
    try {
      await navigator.clipboard.writeText(text);
      setCopiedSummary(true);
      setTimeout(() => setCopiedSummary(false), 2500);
    } catch {
      // ignore
    }
  };

  const handleShareWhatsApp = () => {
    const text = buildWhatsAppSummaryText(bill, summary, shareUrl);
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank', 'noopener,noreferrer');
  };

  const handleCopyPersonalAmount = async (participantId: string, amount: number) => {
    try {
      await navigator.clipboard.writeText(String(Math.round(amount * 100) / 100));
      setCopiedAmountFor(participantId);
      setTimeout(() => setCopiedAmountFor(null), 2000);
    } catch {
      // ignore
    }
  };

  const handleSavePayer = (e: React.FormEvent) => {
    e.preventDefault();
    onUpdatePayer(payerNameInput.trim(), payerPhoneInput.trim());
    setEditingPayer(false);
  };

  return (
    <section
      aria-label="סיכום חשבון ותשלום"
      className="space-y-4 rounded-3xl border-2 border-teal-600/30 bg-gradient-to-b from-teal-50/70 to-white p-4 shadow-md"
    >
      <div className="flex items-center justify-between border-b border-teal-100 pb-3">
        <div className="flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-teal-700 text-white">
            <Sparkles className="h-4 w-4" />
          </span>
          <div>
            <h2 className="text-lg font-extrabold text-slate-900">
              סיכום חשבון וחלוקה לתשלום
            </h2>
            <p className="text-xs text-slate-600">
              עדיין אפשר לערוך ולסמן מנות למעלה — הכל מתעדכן אוטומטית!
            </p>
          </div>
        </div>
      </div>

      {/* Warning if any items were left unclaimed */}
      {summary.unclaimedItems.length > 0 && (
        <div
          role="status"
          className="rounded-2xl border-2 border-amber-400 bg-amber-50 p-3.5 text-amber-950 shadow-2xs"
        >
          <div className="flex items-start gap-2.5">
            <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
            <div className="space-y-1 text-xs leading-relaxed">
              <p className="font-extrabold text-sm text-amber-900">
                שים לב: {summary.unclaimedItems.length === 1 ? 'מנה אחת לא סומנה' : `${summary.unclaimedItems.length} מנות לא סומנו`} ({formatCurrency(summary.unclaimedTotal)})
              </p>
              <p className="text-amber-800">
                מאחר שאף אחד לא סימן אותן, הן <strong>חולקו אוטומטית שווה בשווה בין כל המשתתפים</strong>:
              </p>
              <ul className="list-disc list-inside font-bold text-amber-900 pt-0.5">
                {summary.unclaimedItems.map((item) => (
                  <li key={item.id}>
                    {item.name} ({formatCurrency(item.price)})
                  </li>
                ))}
              </ul>
              <p className="text-[11px] text-amber-700 pt-1">
                אם מישהו אכל מהן, פשוט לחצו על המנה ברשימה למעלה כדי לשייך אותה.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Tip Selector */}
      <div className="rounded-2xl border border-slate-200 bg-white p-3.5 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <Percent className="h-4 w-4 text-teal-700" />
            <h3 className="text-sm font-extrabold text-slate-900">
              כמה טיפ להוסיף לחשבון?
            </h3>
          </div>
          <span className="text-xs font-bold text-teal-800 bg-teal-50 px-2.5 py-1 rounded-lg">
            סה״כ טיפ: {formatCurrency(summary.totalTipAmount)}
          </span>
        </div>

        {/* Preset percentage buttons */}
        <div className="grid grid-cols-5 gap-1.5">
          {PRESET_TIPS.map((pct) => {
            const isSelected = bill.tipMode === 'percent' && bill.tipPercent === pct;
            return (
              <button
                key={pct}
                type="button"
                onClick={() => onUpdateTip('percent', pct, bill.tipCustomAmount)}
                aria-pressed={isSelected}
                className={`rounded-xl py-2.5 text-sm font-extrabold transition border ${
                  isSelected
                    ? 'bg-teal-700 text-white border-teal-700 shadow-xs'
                    : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                }`}
              >
                {pct}%
              </button>
            );
          })}

          <button
            type="button"
            onClick={() =>
              onUpdateTip(
                'amount',
                bill.tipPercent,
                bill.tipCustomAmount || Math.round(summary.netBillBeforeTip * 0.12)
              )
            }
            aria-pressed={bill.tipMode === 'amount'}
            className={`rounded-xl py-2.5 text-xs font-extrabold transition border ${
              bill.tipMode === 'amount'
                ? 'bg-teal-700 text-white border-teal-700 shadow-xs'
                : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
            }`}
          >
            סכום ₪
          </button>
        </div>

        {/* Custom % or ₪ input */}
        <div className="flex items-center justify-between gap-3 pt-1">
          <label htmlFor={customTipInputId} className="text-xs font-semibold text-slate-600">
            {bill.tipMode === 'percent' ? 'אחוז טיפ מותאם אישית (%):' : 'סכום טיפ קבוע לכל השולחן (₪):'}
          </label>
          <input
            id={customTipInputId}
            name="customTip"
            type="text"
            inputMode="decimal"
            value={bill.tipMode === 'percent' ? bill.tipPercent : bill.tipCustomAmount}
            onChange={(e) => {
              const val = Math.max(0, parseFloat(e.target.value) || 0);
              if (bill.tipMode === 'percent') {
                onUpdateTip('percent', val, bill.tipCustomAmount);
              } else {
                onUpdateTip('amount', bill.tipPercent, val);
              }
            }}
            className="w-24 rounded-xl border border-slate-300 px-3 py-1.5 text-center text-sm font-extrabold text-slate-900 dir-ltr"
          />
        </div>
      </div>

      {/* Who pays the restaurant (for Bit / PayBox transfers) */}
      <div className="rounded-2xl border border-slate-200 bg-white p-3.5">
        {!editingPayer ? (
          <div className="flex items-center justify-between gap-2">
            <div className="text-xs text-slate-600">
              <span className="font-bold text-slate-800">למי מעבירים בביט / פייבוקס? </span>
              {bill.payerName ? (
                <span className="font-bold text-teal-800">
                  {bill.payerName} {bill.payerPhone ? `(${bill.payerPhone})` : ''}
                </span>
              ) : (
                <span className="text-slate-400">לא הוגדר (אופציונלי)</span>
              )}
            </div>
            <button
              type="button"
              onClick={() => {
                setPayerNameInput(bill.payerName || '');
                setPayerPhoneInput(bill.payerPhone || '');
                setEditingPayer(true);
              }}
              className="rounded-lg bg-slate-100 px-2.5 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-200 transition shrink-0"
            >
              {bill.payerName ? 'ערוך משלם' : '+ הגדר משלם'}
            </button>
          </div>
        ) : (
          <form onSubmit={handleSavePayer} className="space-y-2.5">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <div>
                <label htmlFor={payerNameId} className="block text-xs font-bold text-slate-700 mb-1">
                  שם מי שמשלם באשראי למסעדה
                </label>
                <input
                  id={payerNameId}
                  name="payerName"
                  type="text"
                  placeholder="למשל: ארז"
                  value={payerNameInput}
                  onChange={(e) => setPayerNameInput(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label htmlFor={payerPhoneId} className="block text-xs font-bold text-slate-700 mb-1">
                  טלפון להעברה בביט/פייבוקס
                </label>
                <input
                  id={payerPhoneId}
                  name="payerPhone"
                  type="tel"
                  inputMode="tel"
                  autoComplete="tel"
                  placeholder="050-0000000"
                  value={payerPhoneInput}
                  onChange={(e) => setPayerPhoneInput(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm dir-ltr text-left"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setEditingPayer(false)}
                className="rounded-xl border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600"
              >
                ביטול
              </button>
              <button
                type="submit"
                className="rounded-xl bg-teal-700 px-3.5 py-1.5 text-xs font-bold text-white"
              >
                שמור
              </button>
            </div>
          </form>
        )}
      </div>

      {/* Per-Participant Breakdown Cards */}
      <div className="space-y-3">
        <h3 className="text-sm font-extrabold text-slate-800 px-1">
          כמה כל אחד משלם ({bill.participants.length} משתתפים):
        </h3>

        {bill.participants.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-6 text-center text-sm text-slate-500">
            עדיין לא נוספו סועדים לחשבון. הוסיפו את שמכם למעלה!
          </div>
        ) : (
          sortedBreakdowns.map((b) => {
            const isMe = b.participant.id === activeParticipantId;
            return (
              <div
                key={b.participant.id}
                className={`rounded-2xl border p-4 transition ${
                  isMe
                    ? 'border-2 border-teal-600 bg-white shadow-sm'
                    : 'border-slate-200 bg-white/90'
                }`}
              >
                <div className="flex items-center justify-between gap-2 border-b border-slate-100 pb-2.5 mb-2.5">
                  <div className="flex items-center gap-2">
                    <span
                      className="flex h-7 w-7 items-center justify-center rounded-full text-xs font-extrabold text-white"
                      style={{ backgroundColor: b.participant.color }}
                    >
                      {b.participant.name.slice(0, 1)}
                    </span>
                    <div>
                      <div className="flex items-center gap-1.5">
                        <span className="text-base font-extrabold text-slate-900">
                          {b.participant.name}
                        </span>
                        {isMe && (
                          <span className="rounded-md bg-teal-100 px-1.5 py-0.5 text-[11px] font-bold text-teal-800">
                            את/ה
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="text-left">
                    <div className="text-xl font-black text-teal-800">
                      {formatCurrency(b.totalToPay)}
                    </div>
                    <div className="text-[11px] text-slate-500">כולל טיפ</div>
                  </div>
                </div>

                {/* Itemized lines for this person */}
                <div className="space-y-1 text-xs text-slate-600">
                  {b.claimedItems.map((ci) => (
                    <div key={ci.itemId} className="flex items-center justify-between">
                      <span>
                        • {ci.name}{' '}
                        {ci.splitCount > 1 && (
                          <span className="text-slate-400 font-medium">
                            (חלק 1/{ci.splitCount} מתוך {formatCurrency(ci.fullPrice)})
                          </span>
                        )}
                      </span>
                      <span className="font-semibold text-slate-800">
                        {formatCurrency(ci.sharePrice)}
                      </span>
                    </div>
                  ))}

                  {b.unclaimedAutoSplitItems.map((ui) => (
                    <div
                      key={ui.itemId}
                      className="flex items-center justify-between text-amber-800 font-semibold bg-amber-50/80 px-2 py-0.5 rounded-md"
                    >
                      <span>
                        ⚠️ {ui.name} (לא סומן — 1/{ui.splitCount})
                      </span>
                      <span>{formatCurrency(ui.sharePrice)}</span>
                    </div>
                  ))}

                  {b.discountShare > 0 && (
                    <div className="flex items-center justify-between text-emerald-700 font-medium">
                      <span>הנחה יחסית</span>
                      <span>-{formatCurrency(b.discountShare)}</span>
                    </div>
                  )}

                  {b.extraFeeShare > 0 && (
                    <div className="flex items-center justify-between text-slate-500">
                      <span>{bill.extraFeeLabel || 'תוספת/אבטחה'} (יחסי)</span>
                      <span>+{formatCurrency(b.extraFeeShare)}</span>
                    </div>
                  )}

                  {b.tipShare > 0 && (
                    <div className="flex items-center justify-between text-slate-500 pt-1 border-t border-slate-100">
                      <span>
                        טיפ ({bill.tipMode === 'percent' ? `${bill.tipPercent}%` : 'יחסי'})
                      </span>
                      <span className="font-semibold text-slate-700">
                        +{formatCurrency(b.tipShare)}
                      </span>
                    </div>
                  )}
                </div>

                {/* Payment Quick Actions on active user's card (or any card) */}
                {b.totalToPay > 0 && (
                  <div className="mt-3 pt-2.5 border-t border-slate-100 flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => handleCopyPersonalAmount(b.participant.id, b.totalToPay)}
                      className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-100 transition"
                    >
                      {copiedAmountFor === b.participant.id ? (
                        <>
                          <Check className="h-3.5 w-3.5 text-emerald-600" />
                          <span className="text-emerald-700">הסכום הועתק!</span>
                        </>
                      ) : (
                        <>
                          <Copy className="h-3.5 w-3.5" />
                          <span>העתק {formatCurrency(b.totalToPay)}</span>
                        </>
                      )}
                    </button>

                    <a
                      href="https://www.bitpay.co.il/"
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={() => handleCopyPersonalAmount(b.participant.id, b.totalToPay)}
                      className="inline-flex items-center gap-1.5 rounded-xl bg-sky-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-sky-700 transition"
                    >
                      <Smartphone className="h-3.5 w-3.5" />
                      <span>שלם ב-Bit</span>
                    </a>

                    <a
                      href="https://www.payboxapp.com/"
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={() => handleCopyPersonalAmount(b.participant.id, b.totalToPay)}
                      className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-indigo-700 transition"
                    >
                      <CreditCard className="h-3.5 w-3.5" />
                      <span>PayBox</span>
                    </a>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Grand Total Footer & WhatsApp Share */}
      <div className="rounded-2xl bg-slate-900 p-4 text-white space-y-3">
        <div className="flex items-center justify-between text-xs text-slate-300">
          <span>סה״כ ארוחה (לפני טיפ):</span>
          <span className="font-bold text-white">{formatCurrency(summary.netBillBeforeTip)}</span>
        </div>
        <div className="flex items-center justify-between text-xs text-slate-300">
          <span>סה״כ טיפ שולחני:</span>
          <span className="font-bold text-teal-300">+{formatCurrency(summary.totalTipAmount)}</span>
        </div>
        <div className="flex items-center justify-between border-t border-slate-700 pt-2.5 text-base font-black">
          <span>סה״כ לתשלום במסעדה:</span>
          <span className="text-xl text-teal-300">{formatCurrency(summary.grandTotalWithTip)}</span>
        </div>

        <div className="grid grid-cols-2 gap-2 pt-2">
          <button
            type="button"
            onClick={handleShareWhatsApp}
            className="flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-3 py-3 text-xs sm:text-sm font-extrabold text-white shadow-sm hover:bg-emerald-500 active:scale-[0.99] transition"
          >
            <Share2 className="h-4 w-4 shrink-0" />
            <span>שתף סיכום לוואטסאפ</span>
          </button>

          <button
            type="button"
            onClick={handleCopyWhatsAppText}
            className="flex items-center justify-center gap-2 rounded-xl bg-slate-800 border border-slate-700 px-3 py-3 text-xs sm:text-sm font-bold text-slate-100 hover:bg-slate-700 active:scale-[0.99] transition"
          >
            {copiedSummary ? (
              <>
                <Check className="h-4 w-4 text-emerald-400 shrink-0" />
                <span className="text-emerald-300">הסיכום הועתק!</span>
              </>
            ) : (
              <>
                <Copy className="h-4 w-4 shrink-0" />
                <span>העתק סיכום טקסט</span>
              </>
            )}
          </button>
        </div>

        <div className="border-t border-slate-800 pt-2.5">
          <a
            href="/"
            onClick={(e) => {
              e.preventDefault();
              onStartNewBill();
            }}
            className="flex w-full items-center justify-center gap-2 rounded-xl border border-slate-700 bg-slate-800/60 py-2.5 text-xs font-bold text-slate-300 hover:bg-slate-800 hover:text-white transition"
          >
            <Home className="h-4 w-4 text-teal-400" />
            <span>חזרה לדף הבית / סריקת חשבון חדש</span>
          </a>
        </div>
      </div>
    </section>
  );
};
