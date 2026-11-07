import React, { useId, useState } from 'react';
import { CheckCircle2, Info, Loader2, Mail, Send } from 'lucide-react';
import { ModalDialog } from './ModalDialog';
import { getUserNameCookie } from '../utils/cookies';
import { APP_VERSION } from '../version';

interface AboutContactLinksProps {
  variant?: 'dark' | 'light';
}

export const AboutContactLinks: React.FC<AboutContactLinksProps> = ({
  variant = 'dark',
}) => {
  const [aboutOpen, setAboutOpen] = useState(false);
  const [contactOpen, setContactOpen] = useState(false);

  const [senderName, setSenderName] = useState(() => getUserNameCookie());
  const [replyTo, setReplyTo] = useState('');
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [sentSuccess, setSentSuccess] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const nameId = useId();
  const replyToId = useId();
  const messageId = useId();

  const handleOpenContact = () => {
    setSenderName(getUserNameCookie());
    setSentSuccess(false);
    setErrorMsg(null);
    setContactOpen(true);
  };

  const handleSendContact = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!message.trim()) {
      setErrorMsg('נא לכתוב תוכן להודעה');
      return;
    }

    setSending(true);
    setErrorMsg(null);

    try {
      const res = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: senderName.trim() || 'משתמש אנונימי',
          replyTo: replyTo.trim(),
          message: message.trim(),
        }),
      });

      if (res.ok) {
        setSentSuccess(true);
        setMessage('');
      } else {
        // Fallback to mailto if backend endpoint is unavailable
        const subject = encodeURIComponent(
          `פנייה מאפליקציית Bill Split מאת ${senderName.trim() || 'משתמש'}`
        );
        const body = encodeURIComponent(
          `${message.trim()}\n\n---\nמאת: ${senderName.trim()}\nלחזרה: ${replyTo.trim()}`
        );
        window.location.href = `mailto:erez.bashan@gmail.com?subject=${subject}&body=${body}`;
        setSentSuccess(true);
      }
    } catch {
      const subject = encodeURIComponent(
        `פנייה מאפליקציית Bill Split מאת ${senderName.trim() || 'משתמש'}`
      );
      const body = encodeURIComponent(
        `${message.trim()}\n\n---\nמאת: ${senderName.trim()}\nלחזרה: ${replyTo.trim()}`
      );
      window.location.href = `mailto:erez.bashan@gmail.com?subject=${subject}&body=${body}`;
      setSentSuccess(true);
    } finally {
      setSending(false);
    }
  };

  const linkClass =
    variant === 'dark'
      ? 'inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3.5 py-1.5 text-xs font-bold text-teal-100 hover:bg-white/20 transition-colors cursor-pointer'
      : 'inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3.5 py-1.5 text-xs font-bold text-slate-600 hover:bg-slate-100 hover:text-slate-900 transition-colors cursor-pointer';

  return (
    <>
      <div className="flex items-center justify-center gap-3">
        <button
          type="button"
          onClick={() => setAboutOpen(true)}
          className={linkClass}
        >
          <Info className="h-3.5 w-3.5" />
          <span>אודות</span>
        </button>

        <button
          type="button"
          onClick={handleOpenContact}
          className={linkClass}
        >
          <Mail className="h-3.5 w-3.5" />
          <span>צור קשר</span>
        </button>
      </div>

      {/* About Modal */}
      <ModalDialog
        open={aboutOpen}
        onClose={() => setAboutOpen(false)}
        title={`אודות Bill Split 🧾 (v${APP_VERSION})`}
      >
        <div className="space-y-4 text-sm leading-relaxed text-slate-700">
          <p className="font-semibold text-slate-900">
            Bill Split נוצרה כדי לפתור את הרגע המתיש בסוף כל ארוחה משותפת במסעדה: מי אכל מה וכמה כל אחד צריך לשלם.
          </p>

          <div className="space-y-2.5 rounded-2xl bg-slate-50 p-4 border border-slate-200 text-xs">
            <h3 className="font-extrabold text-slate-900 text-sm">איך זה עובד?</h3>
            <ol className="list-decimal list-inside space-y-1.5 text-slate-700">
              <li>
                <strong>מצלמים או מעלים את החשבון:</strong> המערכת מפענחת אוטומטית את כל המנות והמחירים בעברית בעזרת בינה מלאכותית.
              </li>
              <li>
                <strong>סורקים ברקוד (QR):</strong> כל החברים בשולחן סורקים את הברקוד מהטלפון שלהם ומצטרפים לאותו חשבון בזמן אמת.
              </li>
              <li>
                <strong>מסמנים בלחיצה:</strong> כל אחד לוחץ על המנות שהוא אכל. חלקתם מנה ראשונה או קינוח? כמה אנשים יכולים לסמן את אותה מנה והמחיר שלה יתחלק ביניהם אוטומטית!
              </li>
              <li>
                <strong>סוגרים חשבון וטיפ:</strong> לוחצים על ״סיימנו — לחשבון!״, בוחרים אחוז טיפ, וכל אחד רואה בדיוק כמה להעביר ב-Bit או ב-PayBox ואפשר לשתף סיכום מסודר לוואטסאפ.
              </li>
            </ol>
          </div>

          <div className="flex items-center justify-between pt-2 border-t border-slate-100 text-xs text-slate-500">
            <span>פותח ע״י ארז בשן · v{APP_VERSION}</span>
            <button
              type="button"
              onClick={() => {
                setAboutOpen(false);
                handleOpenContact();
              }}
              className="font-bold text-teal-700 hover:underline"
            >
              שלח משוב או הצעה ←
            </button>
          </div>
        </div>
      </ModalDialog>

      {/* Contact Modal */}
      <ModalDialog
        open={contactOpen}
        onClose={() => setContactOpen(false)}
        title="צור קשר / שליחת משוב"
      >
        {sentSuccess ? (
          <div className="py-6 text-center space-y-3">
            <CheckCircle2 className="h-12 w-12 text-emerald-600 mx-auto" />
            <h3 className="text-base font-extrabold text-slate-900">
              ההודעה נשלחה בהצלחה!
            </h3>
            <p className="text-xs text-slate-600">
              תודה על הפנייה, האימייל נשלח אל ארז.
            </p>
            <button
              type="button"
              onClick={() => setContactOpen(false)}
              className="mt-2 rounded-xl bg-teal-700 px-6 py-2.5 text-xs font-bold text-white hover:bg-teal-800 transition-colors"
            >
              סגור
            </button>
          </div>
        ) : (
          <form onSubmit={handleSendContact} className="space-y-3.5">
            <p className="text-xs text-slate-600">
              יש לך הצעה לשיפור, שאלה או דיווח על תקלה? שלח הודעה ישירות למייל:
            </p>

            <div>
              <label htmlFor={nameId} className="block text-xs font-bold text-slate-800 mb-1">
                השם שלך:
              </label>
              <input
                id={nameId}
                name="senderName"
                type="text"
                autoComplete="name"
                placeholder="למשל: ארז"
                value={senderName}
                onChange={(e) => setSenderName(e.target.value)}
                className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
              />
            </div>

            <div>
              <label htmlFor={replyToId} className="block text-xs font-bold text-slate-800 mb-1">
                אימייל או טלפון לחזרה (אופציונלי):
              </label>
              <input
                id={replyToId}
                name="replyTo"
                type="text"
                autoComplete="email"
                placeholder="name@example.com / 050-0000000"
                value={replyTo}
                onChange={(e) => setReplyTo(e.target.value)}
                className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm dir-ltr text-left"
              />
            </div>

            <div>
              <label htmlFor={messageId} className="block text-xs font-bold text-slate-800 mb-1">
                תוכן ההודעה:
              </label>
              <textarea
                id={messageId}
                name="message"
                rows={4}
                required
                placeholder="כתוב כאן את ההודעה..."
                value={message}
                onChange={(e) => {
                  setMessage(e.target.value);
                  if (errorMsg) setErrorMsg(null);
                }}
                className="w-full rounded-xl border border-slate-300 p-3 text-sm"
              />
            </div>

            {errorMsg && (
              <p role="alert" className="text-xs font-bold text-red-600">
                {errorMsg}
              </p>
            )}

            <div className="flex items-center justify-between pt-1">
              <a
                href="mailto:erez.bashan@gmail.com"
                className="text-xs font-semibold text-slate-500 hover:text-teal-700 hover:underline"
              >
                erez.bashan@gmail.com
              </a>

              <button
                type="submit"
                disabled={sending}
                className="inline-flex items-center gap-2 rounded-xl bg-teal-700 px-5 py-2.5 text-sm font-bold text-white shadow-xs hover:bg-teal-800 disabled:opacity-50 transition-colors"
              >
                {sending ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span>שולח...</span>
                  </>
                ) : (
                  <>
                    <Send className="h-4 w-4" />
                    <span>שלח אימייל</span>
                  </>
                )}
              </button>
            </div>
          </form>
        )}
      </ModalDialog>
    </>
  );
};
