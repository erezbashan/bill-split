import {
  doc,
  getDoc,
  onSnapshot,
  setDoc,
  Timestamp,
} from 'firebase/firestore';
import { db, ensureAnonymousAuth, isFirebaseConfigured } from './firebaseConfig';
import type { BillDocument } from '../types/bill';

export function generateBillId(): string {
  const chars = 'abcdefghjkmnpqrstuvwxyz23456789';
  let id = '';
  for (let i = 0; i < 6; i++) {
    id += chars[Math.floor(Math.random() * chars.length)];
  }
  return id;
}

/**
 * Saves a BillDocument and its optional compressed receipt image on the backend:
 * - Production: Google Cloud Firestore (`bills/{id}` and `bills/{id}/media/receipt`)
 * - Local Dev Server: Node HTTP API (`PUT /api/bills/:id` persisted to `os.tmpdir()`)
 */
export async function saveBill(bill: BillDocument, receiptImageDataUrl?: string): Promise<void> {
  if (isFirebaseConfigured && db) {
    await ensureAnonymousAuth();
    const expiresAtTimestamp = Timestamp.fromMillis(bill.expiresAt);
    const billRef = doc(db, 'bills', bill.id);
    await setDoc(billRef, {
      ...bill,
      expiresAtTimestamp,
    });

    if (receiptImageDataUrl) {
      const mediaRef = doc(db, 'bills', bill.id, 'media', 'receipt');
      await setDoc(mediaRef, {
        dataUrl: receiptImageDataUrl,
        createdAt: bill.createdAt,
        expiresAtTimestamp,
      });
    }
    return;
  }

  const res = await fetch(`/api/bills/${encodeURIComponent(bill.id)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(bill),
  });
  if (!res.ok) {
    throw new Error(`Failed to save bill on backend (${res.status})`);
  }

  if (receiptImageDataUrl) {
    await fetch(`/api/bills/${encodeURIComponent(bill.id)}/receipt`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ dataUrl: receiptImageDataUrl }),
    });
  }
}

export async function updateBill(
  billId: string,
  updater: (current: BillDocument) => BillDocument
): Promise<BillDocument | null> {
  if (isFirebaseConfigured && db) {
    await ensureAnonymousAuth();
    const billRef = doc(db, 'bills', billId);
    const snap = await getDoc(billRef);
    if (!snap.exists()) return null;
    const current = snap.data() as BillDocument;
    const updated = updater(current);
    await setDoc(billRef, {
      ...updated,
      expiresAtTimestamp: Timestamp.fromMillis(updated.expiresAt),
    });
    return updated;
  }

  const getRes = await fetch(`/api/bills/${encodeURIComponent(billId)}`, {
    cache: 'no-store',
  });
  if (!getRes.ok) return null;
  const current = (await getRes.json()) as BillDocument | null;
  if (!current || !current.id) return null;

  const updated = updater(current);
  const putRes = await fetch(`/api/bills/${encodeURIComponent(billId)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(updated),
  });
  if (!putRes.ok) return null;

  return updated;
}

export function subscribeToBill(
  billId: string,
  callback: (bill: BillDocument | null) => void
): () => void {
  if (isFirebaseConfigured && db) {
    let unsubFirestore: (() => void) | null = null;
    let cancelled = false;

    ensureAnonymousAuth().then(() => {
      if (cancelled || !db) return;
      const billRef = doc(db, 'bills', billId);
      unsubFirestore = onSnapshot(
        billRef,
        (snap) => {
          if (snap.exists()) {
            const data = snap.data() as BillDocument;
            if (typeof data.expiresAt === 'number' && Date.now() > data.expiresAt) {
              callback(null);
            } else {
              callback(data);
            }
          } else {
            callback(null);
          }
        },
        (err) => {
          console.error('Firestore subscription error:', err);
          callback(null);
        }
      );
    });

    return () => {
      cancelled = true;
      unsubFirestore?.();
    };
  }

  // Stateless short HTTP polling (zero persistent sockets held open, never stalls HTTP/1.1 connection pool)
  let cancelled = false;
  let lastJson = '__INITIAL__';
  let inFlight = false;

  const deliver = (data: BillDocument | null) => {
    if (cancelled) return;
    const nextJson = JSON.stringify(data);
    if (nextJson !== lastJson) {
      lastJson = nextJson;
      callback(data);
    }
  };

  const fetchLatest = async () => {
    if (cancelled || inFlight) return;
    inFlight = true;
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), 4000);

    try {
      const res = await fetch(`/api/bills/${encodeURIComponent(billId)}`, {
        cache: 'no-store',
        signal: controller.signal,
      });

      if (res.status === 404) {
        deliver(null);
        return;
      }

      if (!res.ok) {
        deliver(null);
        return;
      }

      const data = (await res.json()) as BillDocument | null;
      if (!data || !data.id) {
        deliver(null);
        return;
      }

      deliver(data);
    } catch (err) {
      console.error('Error fetching bill:', err);
      if (lastJson === '__INITIAL__') {
        deliver(null);
      }
    } finally {
      window.clearTimeout(timeoutId);
      inFlight = false;
    }
  };

  // Fetch immediately on mount
  fetchLatest();

  // Poll every 1 second when tab is visible
  const pollInterval = window.setInterval(() => {
    if (document.visibilityState === 'visible') {
      fetchLatest();
    }
  }, 1000);

  const onVisibilityChange = () => {
    if (document.visibilityState === 'visible') {
      fetchLatest();
    }
  };
  document.addEventListener('visibilitychange', onVisibilityChange);

  return () => {
    cancelled = true;
    window.clearInterval(pollInterval);
    document.removeEventListener('visibilitychange', onVisibilityChange);
  };
}

export async function fetchReceiptImage(billId: string): Promise<string | null> {
  if (isFirebaseConfigured && db) {
    await ensureAnonymousAuth();
    const mediaRef = doc(db, 'bills', billId, 'media', 'receipt');
    const snap = await getDoc(mediaRef);
    if (snap.exists()) {
      return (snap.data() as { dataUrl?: string }).dataUrl || null;
    }
    return null;
  }

  const res = await fetch(`/api/bills/${encodeURIComponent(billId)}/receipt`, {
    cache: 'no-store',
  });
  if (!res.ok) return null;
  const json = (await res.json()) as { dataUrl?: string | null };
  return json.dataUrl || null;
}
