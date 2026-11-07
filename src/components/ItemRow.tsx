import React, { useId, useState } from 'react';
import { AlertTriangle, Check, Edit2, Trash2, Users } from 'lucide-react';
import type { BillItem, BillPhase, Participant } from '../types/bill';
import { formatCurrency } from '../utils/calculations';

interface ItemRowProps {
  item: BillItem;
  participants: Participant[];
  activeParticipant: Participant | null;
  phase: BillPhase;
  onToggleClaim: (itemId: string) => void;
  onUpdateItem: (itemId: string, updates: { name: string; price: number }) => void;
  onDeleteItem: (itemId: string) => void;
}

export const ItemRow: React.FC<ItemRowProps> = ({
  item,
  participants,
  activeParticipant,
  phase,
  onToggleClaim,
  onUpdateItem,
  onDeleteItem,
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState(item.name);
  const [editPrice, setEditPrice] = useState(String(item.price));
  const nameId = useId();
  const priceId = useId();

  const participantMap = new Map(participants.map((p) => [p.id, p]));
  const claimers = item.claimedBy
    .map((id) => participantMap.get(id))
    .filter((p): p is Participant => Boolean(p));

  const isClaimedByActive = activeParticipant
    ? item.claimedBy.includes(activeParticipant.id)
    : false;

  const isUnclaimedInSettled =
    phase === 'settled' && claimers.length === 0 && item.price > 0;

  const handleSaveEdit = (e: React.FormEvent) => {
    e.preventDefault();
    const parsedPrice = parseFloat(editPrice);
    if (!editName.trim() || Number.isNaN(parsedPrice) || parsedPrice < 0) return;
    onUpdateItem(item.id, {
      name: editName.trim(),
      price: Math.round(parsedPrice * 100) / 100,
    });
    setIsEditing(false);
  };

  if (isEditing) {
    return (
      <form
        onSubmit={handleSaveEdit}
        className="rounded-2xl border-2 border-teal-500 bg-white p-3.5 shadow-sm space-y-3"
      >
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
          <div className="sm:col-span-2">
            <label htmlFor={nameId} className="block text-xs font-bold text-slate-700 mb-1">
              שם המנה / הפריט
            </label>
            <input
              id={nameId}
              name="itemName"
              type="text"
              required
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              className="w-full rounded-xl border border-slate-300 px-3 py-2 text-base font-medium text-slate-900"
              autoFocus
            />
          </div>
          <div>
            <label htmlFor={priceId} className="block text-xs font-bold text-slate-700 mb-1">
              מחיר (₪)
            </label>
            <input
              id={priceId}
              name="itemPrice"
              type="text"
              inputMode="decimal"
              required
              value={editPrice}
              onChange={(e) => setEditPrice(e.target.value)}
              className="w-full rounded-xl border border-slate-300 px-3 py-2 text-base font-bold text-slate-900 dir-ltr text-left"
            />
          </div>
        </div>

        <div className="flex items-center justify-between pt-1">
          <button
            type="button"
            onClick={() => onDeleteItem(item.id)}
            className="inline-flex items-center gap-1.5 rounded-xl bg-red-50 px-3 py-2 text-xs font-bold text-red-700 hover:bg-red-100"
          >
            <Trash2 className="h-4 w-4" />
            <span>מחק שורה</span>
          </button>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                setEditName(item.name);
                setEditPrice(String(item.price));
                setIsEditing(false);
              }}
              className="rounded-xl border border-slate-200 px-3.5 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50"
            >
              ביטול
            </button>
            <button
              type="submit"
              className="rounded-xl bg-teal-700 px-4 py-2 text-xs font-bold text-white hover:bg-teal-800"
            >
              שמור
            </button>
          </div>
        </div>
      </form>
    );
  }

  const sharePerPerson = claimers.length > 0 ? item.price / claimers.length : item.price;

  return (
    <div
      className={`relative rounded-2xl border transition-colors ${
        isClaimedByActive
          ? 'border-teal-500 bg-teal-50/40 shadow-2xs'
          : isUnclaimedInSettled
            ? 'border-amber-400 bg-amber-50/60'
            : item.ocrUncertain
              ? 'border-amber-300 bg-white'
              : 'border-slate-200 bg-white hover:border-slate-300'
      }`}
    >
      <div className="flex items-stretch">
        {/* Main tappable area to claim/unclaim item */}
        <button
          type="button"
          onClick={() => onToggleClaim(item.id)}
          aria-pressed={isClaimedByActive}
          className="flex flex-1 items-center justify-between gap-3 p-3.5 text-right select-none cursor-pointer"
        >
          <div className="flex items-start gap-3 min-w-0">
            {/* Checkbox indicator for active user */}
            <div
              className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-lg border-2 transition-colors ${
                isClaimedByActive
                  ? 'border-teal-600 bg-teal-600 text-white'
                  : 'border-slate-300 bg-white text-transparent'
              }`}
              style={
                isClaimedByActive && activeParticipant
                  ? {
                      backgroundColor: activeParticipant.color,
                      borderColor: activeParticipant.color,
                    }
                  : undefined
              }
            >
              <Check className="h-4 w-4 stroke-[3]" />
            </div>

            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-base font-bold text-slate-900 leading-snug break-words">
                  {item.name}
                </span>

                {item.originalQuantity && item.originalQuantity > 1 && (
                  <span className="inline-flex items-center rounded-md bg-slate-100 px-1.5 py-0.5 text-[11px] font-bold text-slate-600">
                    יח׳ {item.unitIndex}/{item.originalQuantity}
                  </span>
                )}

                {item.ocrUncertain && (
                  <span className="inline-flex items-center gap-1 rounded-md bg-amber-100 px-1.5 py-0.5 text-[11px] font-bold text-amber-800">
                    <AlertTriangle className="h-3 w-3" />
                    לבדיקה
                  </span>
                )}
              </div>

              {/* Fixed min-height container prevents vertical layout shift when toggling claims */}
              <div className="mt-1.5 min-h-[24px] flex flex-wrap items-center gap-1.5">
                {claimers.length > 0 ? (
                  <>
                    {claimers.map((p) => (
                      <span
                        key={p.id}
                        className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-bold text-white"
                        style={{ backgroundColor: p.color }}
                      >
                        <span>{p.name}</span>
                      </span>
                    ))}
                    {claimers.length > 1 && (
                      <span className="inline-flex items-center gap-1 text-xs font-semibold text-slate-600 ms-1">
                        <Users className="h-3.5 w-3.5 text-slate-400" />
                        <span>{formatCurrency(sharePerPerson)} כ״א</span>
                      </span>
                    )}
                  </>
                ) : isUnclaimedInSettled ? (
                  <span className="inline-flex items-center gap-1.5 rounded-lg bg-amber-100/90 px-2 py-0.5 text-xs font-bold text-amber-900">
                    <AlertTriangle className="h-3.5 w-3.5 text-amber-700 shrink-0" />
                    <span>לא סומן — מחולק אוטומטית בין כולם (לחץ לשיוך אליך)</span>
                  </span>
                ) : (
                  <span className="text-xs text-slate-400">
                    טרם סומן — לחץ אם אכלת מהמנה
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="text-left shrink-0">
            <span className="text-base font-extrabold text-slate-900">
              {formatCurrency(item.price)}
            </span>
          </div>
        </button>

        {/* Inline Edit button */}
        <div className="flex items-center border-s border-slate-100 pe-2 ps-1">
          <button
            type="button"
            onClick={() => {
              setEditName(item.name);
              setEditPrice(String(item.price));
              setIsEditing(true);
            }}
            aria-label={`ערוך את ${item.name}`}
            className="flex h-10 w-10 items-center justify-center rounded-xl text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition-colors"
          >
            <Edit2 className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
};
