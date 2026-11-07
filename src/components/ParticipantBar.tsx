import React, { useEffect, useId, useState } from 'react';
import { UserPlus, Check, Users, Edit2 } from 'lucide-react';
import type { Participant } from '../types/bill';
import { formatCurrency } from '../utils/calculations';
import { getUserNameCookie, setUserNameCookie } from '../utils/cookies';
import { ModalDialog } from './ModalDialog';

interface ParticipantBarProps {
  participants: Participant[];
  activeParticipantId: string | null;
  onSelectParticipant: (id: string) => void;
  onAddParticipant: (name: string, saveToCookie: boolean) => void;
  onRenameParticipant: (id: string, newName: string) => void;
  totalsByParticipant: Map<string, number>;
  forceJoinModalOpen: boolean;
  onCloseJoinModal: () => void;
}

type ModalMode = 'join' | 'add_friend' | 'rename';

export const ParticipantBar: React.FC<ParticipantBarProps> = ({
  participants,
  activeParticipantId,
  onSelectParticipant,
  onAddParticipant,
  onRenameParticipant,
  totalsByParticipant,
  forceJoinModalOpen,
  onCloseJoinModal,
}) => {
  const [customModalMode, setCustomModalMode] = useState<ModalMode | null>(null);
  const [nameInput, setNameInput] = useState(() => getUserNameCookie());
  const [errorMsg, setErrorMsg] = useState('');
  const nameInputId = useId();
  const errorId = useId();

  const activeParticipant = participants.find((p) => p.id === activeParticipantId) || null;
  const effectiveMode: ModalMode | null = customModalMode ?? (forceJoinModalOpen ? 'join' : null);
  const modalOpen = effectiveMode !== null;

  // Whenever the modal opens, pre-fill the input appropriately:
  // - 'join': pre-fill from the long-term cookie so returning users just hit Enter/Continue (or edit it)
  // - 'rename': pre-fill with current activeParticipant name
  // - 'add_friend': start blank so you can type a friend's name
  useEffect(() => {
    if (!effectiveMode) return;
    setErrorMsg('');
    if (effectiveMode === 'join') {
      setNameInput(getUserNameCookie());
    } else if (effectiveMode === 'rename' && activeParticipant) {
      setNameInput(activeParticipant.name);
    } else if (effectiveMode === 'add_friend') {
      setNameInput('');
    }
  }, [effectiveMode, activeParticipant]);

  const handleClose = () => {
    setCustomModalMode(null);
    onCloseJoinModal();
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if ((e.nativeEvent as SubmitEvent & { isComposing?: boolean }).isComposing) return;

    const trimmed = nameInput.trim();
    if (!trimmed) {
      setErrorMsg('נא להזין שם כדי להמשיך');
      return;
    }

    if (effectiveMode === 'rename' && activeParticipant) {
      setUserNameCookie(trimmed);
      onRenameParticipant(activeParticipant.id, trimmed);
    } else if (effectiveMode === 'add_friend') {
      // Adding another friend on the same phone; only save cookie if this phone had no user yet
      const shouldSaveCookie = !activeParticipantId;
      onAddParticipant(trimmed, shouldSaveCookie);
    } else {
      // 'join' mode: save in long-term cookie as default for future bills!
      setUserNameCookie(trimmed);
      onAddParticipant(trimmed, true);
    }

    setErrorMsg('');
    handleClose();
  };

  const dialogTitle =
    effectiveMode === 'rename'
      ? 'שינוי השם שלך'
      : effectiveMode === 'add_friend'
        ? 'הוספת סועד נוסף לשולחן'
        : 'איך קוראים לך?';

  return (
    <>
      <section
        aria-label="משתתפים בשולחן"
        className="rounded-2xl border border-slate-200 bg-white p-3.5 shadow-xs"
      >
        <div className="flex items-center justify-between gap-2 mb-2.5">
          <div className="flex items-center flex-wrap gap-1.5 text-xs font-semibold text-slate-600">
            <Users className="h-4 w-4 text-teal-600 shrink-0" />
            {activeParticipant ? (
              <>
                <span>מסמן עכשיו עבור:</span>
                <strong
                  className="font-bold underline decoration-2 underline-offset-4"
                  style={{ color: activeParticipant.color }}
                >
                  {activeParticipant.name}
                </strong>
                <button
                  type="button"
                  onClick={() => setCustomModalMode('rename')}
                  aria-label="ערוך את השם שלך"
                  className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-1.5 py-0.5 text-[11px] font-bold text-slate-600 hover:bg-slate-200 transition"
                >
                  <Edit2 className="h-3 w-3" />
                  <span>שנה שם</span>
                </button>
              </>
            ) : (
              <span className="text-amber-700 font-bold">
                בחר את שמך או הוסף את עצמך כדי לסמן מנות:
              </span>
            )}
          </div>

          <button
            type="button"
            onClick={() => setCustomModalMode('add_friend')}
            className="inline-flex items-center gap-1 rounded-lg bg-teal-50 px-2.5 py-1.5 text-xs font-bold text-teal-800 hover:bg-teal-100 transition shrink-0"
          >
            <UserPlus className="h-3.5 w-3.5" />
            <span>+ סועד נוסף</span>
          </button>
        </div>

        <div className="flex items-center gap-2 overflow-x-auto pb-1 no-scrollbar">
          {participants.map((p) => {
            const isSelected = p.id === activeParticipantId;
            const personTotal = totalsByParticipant.get(p.id) || 0;

            return (
              <button
                key={p.id}
                type="button"
                onClick={() => onSelectParticipant(p.id)}
                aria-pressed={isSelected}
                className={`group relative flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold transition-colors shrink-0 border ${
                  isSelected
                    ? 'text-white shadow-xs'
                    : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                }`}
                style={
                  isSelected
                    ? { backgroundColor: p.color, borderColor: p.color }
                    : undefined
                }
              >
                <span
                  className={`flex h-5 w-5 items-center justify-center rounded-full text-xs font-bold ${
                    isSelected ? 'bg-white/25 text-white' : 'text-white'
                  }`}
                  style={!isSelected ? { backgroundColor: p.color } : undefined}
                >
                  {isSelected ? <Check className="h-3.5 w-3.5" /> : p.name.slice(0, 1)}
                </span>
                <span>{p.name}</span>
                <span
                  className={`text-xs font-bold rounded-md px-1.5 py-0.5 ${
                    isSelected
                      ? 'bg-black/20 text-white'
                      : 'bg-slate-200/80 text-slate-700'
                  }`}
                >
                  {formatCurrency(personTotal)}
                </span>
              </button>
            );
          })}

          {participants.length === 0 && (
            <button
              type="button"
              onClick={() => setCustomModalMode('join')}
              className="w-full rounded-xl border-2 border-dashed border-teal-300 bg-teal-50/50 py-3 text-center text-sm font-bold text-teal-800 hover:bg-teal-50 transition"
            >
              👋 לחץ כאן להזנת שמך ולהתחלת סימון המנות
            </button>
          )}
        </div>
      </section>

      <ModalDialog
        open={modalOpen}
        onClose={handleClose}
        title={dialogTitle}
        allowLightDismiss={Boolean(activeParticipant)}
      >
        <form onSubmit={handleSubmit} noValidate className="space-y-4">
          <div>
            <label
              htmlFor={nameInputId}
              className="block text-sm font-bold text-slate-800 mb-1.5"
            >
              {effectiveMode === 'add_friend' ? 'שם החבר/ה להוספה:' : 'השם שלך:'}
            </label>
            <input
              id={nameInputId}
              name="participantName"
              type="text"
              required
              autoComplete="given-name"
              enterKeyHint="done"
              placeholder="למשל: ארז, נועה, דני..."
              value={nameInput}
              aria-describedby={errorMsg ? errorId : undefined}
              onChange={(e) => {
                setNameInput(e.target.value);
                if (errorMsg) setErrorMsg('');
              }}
              onBlur={() => {
                if (nameInput.length > 0 && !nameInput.trim()) {
                  setErrorMsg('נא להזין שם תקין');
                }
              }}
              className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-3 text-base text-slate-900 placeholder:text-slate-400 focus:border-teal-600"
              autoFocus
            />
            {errorMsg && (
              <p id={errorId} aria-live="polite" className="mt-1.5 text-xs font-semibold text-red-600">
                {errorMsg}
              </p>
            )}
          </div>

          {effectiveMode !== 'rename' && participants.length > 0 && (
            <div className="rounded-xl bg-slate-50 p-3 border border-slate-200">
              <p className="text-xs font-medium text-slate-600 mb-2">
                או בחר את שמך מתוך מי שכבר רשום בשולחן:
              </p>
              <div className="flex flex-wrap gap-1.5">
                {participants.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => {
                      setUserNameCookie(p.name);
                      onSelectParticipant(p.id);
                      handleClose();
                    }}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-bold text-slate-800 hover:bg-slate-100"
                  >
                    <span
                      className="h-2.5 w-2.5 rounded-full"
                      style={{ backgroundColor: p.color }}
                    />
                    <span>{p.name}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          <button
            type="submit"
            className="w-full rounded-xl bg-teal-700 py-3.5 text-base font-bold text-white shadow-sm hover:bg-teal-800 transition"
          >
            {effectiveMode === 'rename' ? 'שמור שם מעודכן' : 'המשך לסימון מנות'}
          </button>
        </form>
      </ModalDialog>
    </>
  );
};
