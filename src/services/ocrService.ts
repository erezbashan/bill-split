import { getGenerativeModel, Schema } from 'firebase/ai';
import { ai, ensureAnonymousAuth } from './firebaseConfig';
import type { RawOcrResult } from '../types/bill';

const GEMINI_MODEL = 'gemini-3.8-flash';

export function getSavedGeminiApiKey(): string {
  return ((import.meta.env.VITE_GEMINI_API_KEY as string | undefined) || '').trim();
}

/**
 * Compresses an image file on the client device to ~80-120KB JPEG data URL
 * so it is fast for mobile upload, cheap for Gemini tokens, and fits easily in a Firestore doc.
 */
export async function compressReceiptImage(
  file: File,
  maxDimension = 1150,
  quality = 0.72
): Promise<{ dataUrl: string; base64: string; mimeType: string; sizeKB: number }> {
  const bitmapUrl = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = (e) => reject(e);
      el.src = bitmapUrl;
    });

    let { width, height } = img;
    if (width > maxDimension || height > maxDimension) {
      if (width > height) {
        height = Math.round((height * maxDimension) / width);
        width = maxDimension;
      } else {
        width = Math.round((width * maxDimension) / height);
        height = maxDimension;
      }
    }

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('לא ניתן ליצור הקשר גרפי לדחיסת התמונה');

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(img, 0, 0, width, height);

    const mimeType = 'image/jpeg';
    let dataUrl = canvas.toDataURL(mimeType, quality);
    let base64 = dataUrl.split(',')[1] || '';
    let sizeKB = Math.round((base64.length * 3) / 4 / 1024);

    // If still larger than 180KB, step down quality slightly
    if (sizeKB > 180) {
      dataUrl = canvas.toDataURL(mimeType, 0.55);
      base64 = dataUrl.split(',')[1] || '';
      sizeKB = Math.round((base64.length * 3) / 4 / 1024);
    }

    return { dataUrl, base64, mimeType, sizeKB };
  } finally {
    URL.revokeObjectURL(bitmapUrl);
  }
}

const OCR_SYSTEM_PROMPT = `אתה מומחה לפענוח חשבונות וקבלות של מסעדות ובתי קפה בישראל (בעברית).
חלץ את כל הפריטים מהקבלה בצורה מדויקת:
1. לכל שורת פריט בעלת מחיר חיובי, חלץ את שם המנה (name), הכמות (quantity - ברירת מחדל 1), והמחיר הכולל של השורה (totalPrice) בש"ח.
2. התעלם משורות תיאור/תוספות שמחירן 0.00 (כגון "מידת עשייה מדיום", "ללא בצל", "בצד"). אם לתוספת יש מחיר חיובי, כלול אותה כפריט.
3. אם מופיעה הנחה כללית בחשבון (כגון "הנחת מועדון", "הנחת צהריים" או שורה במינוס), סכם את סך ההנחות כמספר חיובי בשדה discountAmount.
4. אם מופיע חיוב כללי שאינו מנה (כגון "אבטחה", "דמי שירות"), רשום אותו בשדה extraFeeAmount ואת תיאורו ב-extraFeeLabel.
5. חלץ את הסכום הסופי לתשלום שמופיע בתחתית הקבלה (לפני טיפ אם הטיפ לא כלול בחשבון) לשדה receiptTotal.
6. אם שורה מסוימת מטושטשת או שאתה לא בטוח במחיר שלה, סמן uncertain: true עבורה.
החזר אך ורק JSON תקני לפי הסכמה.`;

/**
 * Extracts receipt items using either Firebase AI Logic (Gemini 2.5 Flash)
 * or direct Gemini Developer API key if configured.
 */
export async function extractReceiptWithGemini(
  base64Image: string,
  mimeType: string
): Promise<RawOcrResult> {
  // 1. Use direct Gemini API key if available (fastest, works on Spark free tier)
  const apiKey = getSavedGeminiApiKey();
  if (apiKey) {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${encodeURIComponent(apiKey)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                { text: OCR_SYSTEM_PROMPT },
                { inlineData: { mimeType, data: base64Image } },
              ],
            },
          ],
          generationConfig: {
            temperature: 0.1,
            thinkingConfig: {
              thinkingBudget: 0,
            },
            responseMimeType: 'application/json',
            responseSchema: {
              type: 'OBJECT',
              properties: {
                restaurantName: { type: 'STRING' },
                date: { type: 'STRING' },
                items: {
                  type: 'ARRAY',
                  items: {
                    type: 'OBJECT',
                    properties: {
                      name: { type: 'STRING' },
                      quantity: { type: 'NUMBER' },
                      totalPrice: { type: 'NUMBER' },
                      uncertain: { type: 'BOOLEAN' },
                    },
                    required: ['name', 'quantity', 'totalPrice'],
                  },
                },
                discountAmount: { type: 'NUMBER' },
                extraFeeAmount: { type: 'NUMBER' },
                extraFeeLabel: { type: 'STRING' },
                receiptTotal: { type: 'NUMBER' },
              },
              required: ['restaurantName', 'items', 'discountAmount', 'extraFeeAmount', 'receiptTotal'],
            },
          },
        }),
      }
    );

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`שגיאה בקריאה ל-Gemini API (${response.status}): ${errText}`);
    }

    const data = await response.json();
    const jsonText = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!jsonText) {
      throw new Error('לא התקבל פלט תקין ממודל ה-OCR');
    }
    return JSON.parse(jsonText) as RawOcrResult;
  }

  // 2. Fallback to Firebase AI Logic if configured
  if (ai) {
    await ensureAnonymousAuth();
    const receiptSchema = Schema.object({
      properties: {
        restaurantName: Schema.string({ description: 'שם המסעדה או בית הקפה' }),
        date: Schema.string({ description: 'תאריך הקבלה אם מופיע' }),
        items: Schema.array({
          items: Schema.object({
            properties: {
              name: Schema.string({ description: 'שם הפריט בעברית' }),
              quantity: Schema.number({ description: 'כמות הפריטים בשורה (ברירת מחדל 1)' }),
              totalPrice: Schema.number({ description: 'המחיר הכולל של השורה בשקלים' }),
              uncertain: Schema.boolean({ description: 'האם הקריאה של השורה או המחיר היתה מטושטשת/בספק' }),
            },
            optionalProperties: ['uncertain'],
          }),
        }),
        discountAmount: Schema.number({ description: 'סך הנחות בשקלים כמספר חיובי (0 אם אין)' }),
        extraFeeAmount: Schema.number({ description: 'תוספת קבועה כגון אבטחה בשקלים (0 אם אין)' }),
        extraFeeLabel: Schema.string({ description: 'שם התוספת הקבועה אם יש' }),
        receiptTotal: Schema.number({ description: 'סה"כ לתשלום המודפס בתחתית החשבון' }),
      },
      optionalProperties: ['date', 'extraFeeLabel'],
    });

    const model = getGenerativeModel(ai, {
      model: GEMINI_MODEL,
      generationConfig: {
        responseMimeType: 'application/json',
        responseSchema: receiptSchema,
        temperature: 0.1,
      },
    });

    const result = await model.generateContent([
      OCR_SYSTEM_PROMPT,
      {
        inlineData: {
          data: base64Image,
          mimeType,
        },
      },
    ]);

    return JSON.parse(result.response.text()) as RawOcrResult;
  }

  throw new Error('MISSING_GEMINI_CONFIG');
}

export const SAMPLE_RECEIPTS: Record<'standard' | 'inconsistent', RawOcrResult> = {
  standard: {
    restaurantName: 'בראסרי תל אביב',
    date: '07/11/2026',
    items: [
      { name: 'פוקאצ׳ה הבית ומטבלים', quantity: 1, totalPrice: 34 },
      { name: 'סלט קיסר עוף', quantity: 1, totalPrice: 68 },
      { name: 'המבורגר קלאסי + צ׳יפס', quantity: 2, totalPrice: 176 },
      { name: 'פסטה כמהין ופטריות', quantity: 1, totalPrice: 84 },
      { name: 'חצי בירה מהחבית', quantity: 3, totalPrice: 108 },
      { name: 'קולה זירו', quantity: 2, totalPrice: 32 },
      { name: 'סופלה שוקולד חם (משותף)', quantity: 1, totalPrice: 52 },
    ],
    discountAmount: 0,
    extraFeeAmount: 8,
    extraFeeLabel: 'אבטחה',
    receiptTotal: 562,
  },
  inconsistent: {
    restaurantName: 'קפה שכונתי (דוגמה עם אזהרת אי-התאמה)',
    date: '07/11/2026',
    items: [
      { name: 'פיצה מרגריטה מהטאבון', quantity: 1, totalPrice: 64 },
      { name: 'ניוקי ערמונים', quantity: 1, totalPrice: 78, uncertain: true },
      { name: 'כוס יין לבן', quantity: 2, totalPrice: 88 },
      { name: 'טירמיסו', quantity: 1, totalPrice: 46 },
    ],
    discountAmount: 0,
    extraFeeAmount: 0,
    receiptTotal: 294, // Sum of items is 276, so there is an ₪18 discrepancy to demonstrate the warning banner!
  },
};
