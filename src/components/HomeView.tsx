import React, { useRef, useState } from 'react';
import {
  AlertTriangle,
  Camera,
  FileSpreadsheet,
  Loader2,
  Receipt,
  Sparkles,
  Upload,
} from 'lucide-react';
import {
  compressReceiptImage,
  extractReceiptWithGemini,
  SAMPLE_RECEIPTS,
} from '../services/ocrService';
import { expandOcrItems } from '../utils/calculations';
import { generateBillId, saveBill } from '../services/storageService';
import type { BillDocument, RawOcrResult } from '../types/bill';
import { CameraModal } from './CameraModal';
import { AboutContactLinks } from './AboutContactModals';
import { APP_VERSION } from '../version';

interface HomeViewProps {
  onBillCreated: (bill: BillDocument, openQrImmediately: boolean) => void;
}

export const HomeView: React.FC<HomeViewProps> = ({
  onBillCreated,
}) => {
  const [isScanning, setIsScanning] = useState(false);
  const [scanStatusText, setScanStatusText] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [cameraModalOpen, setCameraModalOpen] = useState(false);

  const galleryInputRef = useRef<HTMLInputElement>(null);

  const createBillFromOcrResult = async (
    raw: RawOcrResult,
    receiptImageDataUrl?: string,
    openQr = true
  ) => {
    const now = Date.now();
    const billId = generateBillId();
    const expandedItems = expandOcrItems(raw.items);

    const newBill: BillDocument = {
      id: billId,
      restaurantName: (raw.restaurantName || '').trim() || 'חשבון מסעדה',
      createdAt: now,
      expiresAt: now + 24 * 60 * 60 * 1000, // 24 hours TTL
      phase: 'selecting',
      items: expandedItems,
      participants: [],
      discountAmount: Math.max(0, Number(raw.discountAmount) || 0),
      extraFeeAmount: Math.max(0, Number(raw.extraFeeAmount) || 0),
      extraFeeLabel: raw.extraFeeLabel || 'אבטחה',
      receiptTotal: Math.max(0, Number(raw.receiptTotal) || 0),
      tipMode: 'percent',
      tipPercent: 12,
      tipCustomAmount: 0,
      hasReceiptImage: Boolean(receiptImageDataUrl),
    };

    await saveBill(newBill, receiptImageDataUrl);
    onBillCreated(newBill, openQr);
  };

  const processReceiptFile = async (file: File) => {
    setErrorMessage(null);
    setIsScanning(true);

    try {
      setScanStatusText('דוחס תמונה (~100KB) לחיסכון בעלויות...');
      const compressed = await compressReceiptImage(file);

      setScanStatusText('מפענח מנות ומחירים בעברית עם Gemini 3.8 Flash...');
      const ocrResult = await extractReceiptWithGemini(
        compressed.base64,
        compressed.mimeType
      );

      setScanStatusText('יוצר שולחן משותף וברקוד QR...');
      await createBillFromOcrResult(ocrResult, compressed.dataUrl, true);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setErrorMessage(msg || 'אירעה שגיאה בפענוח החשבון. נסה שוב או טען חשבון לדוגמה.');
    } finally {
      setIsScanning(false);
      setScanStatusText('');
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      processReceiptFile(file);
    }
    e.target.value = '';
  };

  return (
    <div className="min-h-dvh bg-gradient-to-b from-teal-900 via-teal-800 to-slate-900 text-white flex flex-col justify-between p-4">
      <div className="mx-auto w-full max-w-md space-y-5 pt-4">
        {/* Hero Title */}
        <div className="text-center space-y-2 pt-2">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-3xl bg-teal-500/20 border border-teal-400/30 shadow-inner">
            <Receipt className="h-9 w-9 text-teal-300" />
          </div>
          <h1 className="text-3xl font-black tracking-tight text-white dir-ltr">
            Bill Split 🧾
          </h1>
          <p className="text-sm text-teal-100/90 max-w-xs mx-auto leading-relaxed">
            מצלמים את החשבון במסעדה, החברים סורקים ברקוד, כל אחד מסמן מה הוא אכל — ורואים בדיוק כמה לשלם!
          </p>
        </div>

        {/* Main Scanner Card */}
        <div className="rounded-3xl bg-white p-5 text-slate-900 shadow-2xl space-y-4">
          {isScanning ? (
            <div className="flex flex-col items-center justify-center py-10 text-center space-y-3">
              <Loader2 className="h-10 w-10 animate-spin text-teal-600" />
              <p className="text-base font-extrabold text-slate-800">
                סורק ומפענח את החשבון...
              </p>
              <p className="text-xs font-medium text-slate-500">{scanStatusText}</p>
            </div>
          ) : (
            <>
              <div className="space-y-2.5">
                {/* Hidden file input for Gallery / File upload */}
                <input
                  ref={galleryInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleFileChange}
                  className="visually-hidden"
                  tabIndex={-1}
                />

                <button
                  type="button"
                  onClick={() => setCameraModalOpen(true)}
                  className="flex w-full items-center justify-center gap-3 rounded-2xl bg-teal-700 px-5 py-4 text-base font-extrabold text-white shadow-md hover:bg-teal-800 transition-colors cursor-pointer"
                >
                  <Camera className="h-5 w-5" />
                  <span>צלם את החשבון עכשיו</span>
                </button>

                <button
                  type="button"
                  onClick={() => galleryInputRef.current?.click()}
                  className="flex w-full items-center justify-center gap-2.5 rounded-2xl border-2 border-slate-200 bg-slate-50 px-5 py-3.5 text-sm font-bold text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
                >
                  <Upload className="h-4 w-4 text-teal-700" />
                  <span>העלה תמונת חשבון מהמכשיר / גלריה</span>
                </button>
              </div>

              {errorMessage && (
                <div
                  role="alert"
                  className="rounded-xl border border-red-200 bg-red-50 p-3 text-xs font-semibold text-red-800"
                >
                  {errorMessage}
                </div>
              )}

              {/* Instant Demo Receipts Section */}
              <div className="border-t border-slate-100 pt-3.5 space-y-2">
                <p className="text-xs font-bold text-slate-500 text-center">
                  רוצה להתנסות מיד בלי לצלם קבלה?
                </p>
                <div className="grid grid-cols-1 gap-2">
                  <button
                    type="button"
                    onClick={() => createBillFromOcrResult(SAMPLE_RECEIPTS.standard, undefined, true)}
                    className="flex items-center justify-center gap-2 rounded-xl bg-teal-50 border border-teal-200 px-3.5 py-2.5 text-xs font-extrabold text-teal-900 hover:bg-teal-100 transition-colors"
                  >
                    <Sparkles className="h-4 w-4 text-teal-700 shrink-0" />
                    <span>טען חשבון לדוגמה (בראסרי — עם בירות וקינוח משותף)</span>
                  </button>

                  <button
                    type="button"
                    onClick={() =>
                      createBillFromOcrResult(SAMPLE_RECEIPTS.inconsistent, undefined, true)
                    }
                    className="flex items-center justify-center gap-2 rounded-xl bg-amber-50 border border-amber-200 px-3.5 py-2 text-xs font-bold text-amber-900 hover:bg-amber-100 transition-colors"
                  >
                    <AlertTriangle className="h-3.5 w-3.5 text-amber-600 shrink-0" />
                    <span>טען דוגמה עם אזהרת אי-התאמה ב-OCR</span>
                  </button>

                  <button
                    type="button"
                    onClick={() =>
                      createBillFromOcrResult(
                        {
                          restaurantName: 'חשבון חדש',
                          items: [{ name: 'מנה ראשונה', quantity: 1, totalPrice: 45 }],
                          discountAmount: 0,
                          extraFeeAmount: 0,
                          receiptTotal: 0,
                        },
                        undefined,
                        true
                      )
                    }
                    className="flex items-center justify-center gap-1.5 rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 transition-colors"
                  >
                    <FileSpreadsheet className="h-3.5 w-3.5" />
                    <span>פתח חשבון ריק להזנה ידנית</span>
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      <footer className="mx-auto max-w-md pt-6 pb-2 text-center space-y-3">
        <AboutContactLinks variant="dark" />
        <p className="text-[11px] text-teal-200/70">
          Bill Split · חלוקת חשבון חכמה במסעדה · v{APP_VERSION}
        </p>
      </footer>

      <CameraModal
        open={cameraModalOpen}
        onClose={() => setCameraModalOpen(false)}
        onCaptureFile={(file) => processReceiptFile(file)}
        onFallbackToFileInput={() => galleryInputRef.current?.click()}
      />
    </div>
  );
};
