import React, { useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { Check, Copy, Share2 } from 'lucide-react';
import { ModalDialog } from './ModalDialog';

interface QrModalProps {
  open: boolean;
  onClose: () => void;
  shareUrl: string;
  restaurantName: string;
}

export const QrModal: React.FC<QrModalProps> = ({
  open,
  onClose,
  shareUrl,
  restaurantName,
}) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // ignore
    }
  };

  const handleWhatsAppShare = () => {
    const text = `הצטרפו לחלוקת החשבון ב-${restaurantName || 'מסעדה'} 🧾👇\n${shareUrl}`;
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank', 'noopener,noreferrer');
  };

  return (
    <ModalDialog open={open} onClose={onClose} title="סרקו להצטרפות לחשבון">
      <div className="flex flex-col items-center text-center space-y-4">
        <p className="text-sm text-slate-600">
          כל אחד בשולחן סורק את הברקוד מהטלפון שלו, מזין את שמו ומסמן את המנות שהוא אכל:
        </p>

        <div className="rounded-2xl border-2 border-teal-100 bg-white p-4 shadow-sm">
          <QRCodeSVG
            value={shareUrl}
            size={210}
            level="M"
            includeMargin={false}
          />
        </div>

        <p className="text-xs font-medium text-slate-500 break-all px-2 dir-ltr">
          {shareUrl}
        </p>

        <div className="grid grid-cols-2 gap-2.5 w-full pt-2">
          <button
            type="button"
            onClick={handleWhatsAppShare}
            className="flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-3 text-sm font-bold text-white shadow-sm hover:bg-emerald-700 transition-colors"
          >
            <Share2 className="h-4 w-4" />
            <span>שלח בוואטסאפ</span>
          </button>

          <button
            type="button"
            onClick={handleCopy}
            className="flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-100 transition-colors"
          >
            {copied ? (
              <>
                <Check className="h-4 w-4 text-emerald-600" />
                <span className="text-emerald-700">הקישור הועתק!</span>
              </>
            ) : (
              <>
                <Copy className="h-4 w-4" />
                <span>העתק קישור</span>
              </>
            )}
          </button>
        </div>
      </div>
    </ModalDialog>
  );
};
