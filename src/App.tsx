import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AlertCircle, Home, Loader2 } from 'lucide-react';
import type { BillDocument } from './types/bill';
import { subscribeToBill } from './services/storageService';
import { HomeView } from './components/HomeView';
import { BillView } from './components/BillView';

export const App: React.FC = () => {
  const [activeBillId, setActiveBillId] = useState<string | null>(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get('bill');
  });
  const [bill, setBill] = useState<BillDocument | null>(null);
  const [loadingBill, setLoadingBill] = useState<boolean>(Boolean(activeBillId));
  const [notFoundError, setNotFoundError] = useState<boolean>(false);
  const [openQrOnLoad, setOpenQrOnLoad] = useState<boolean>(false);

  // Ref to track pre-loaded bill when created locally so we don't show a spinner
  const preloadedBillIdRef = useRef<string | null>(null);

  const navigateHome = useCallback(() => {
    const url = new URL(window.location.href);
    url.searchParams.delete('bill');
    window.history.pushState({}, '', url.toString());
    preloadedBillIdRef.current = null;
    setOpenQrOnLoad(false);
    setNotFoundError(false);
    setLoadingBill(false);
    setBill(null);
    setActiveBillId(null);
  }, []);

  // Sync URL query param `?bill=<id>` with browser back/forward navigation
  useEffect(() => {
    const onPopState = () => {
      const params = new URLSearchParams(window.location.search);
      setOpenQrOnLoad(false);
      setActiveBillId(params.get('bill'));
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  useEffect(() => {
    if (!activeBillId) {
      setBill(null);
      setLoadingBill(false);
      setNotFoundError(false);
      return;
    }

    if (preloadedBillIdRef.current !== activeBillId) {
      setLoadingBill(true);
    }
    setNotFoundError(false);

    const unsubscribe = subscribeToBill(activeBillId, (docData) => {
      setLoadingBill(false);
      if (docData) {
        setBill(docData);
        setNotFoundError(false);
      } else {
        setBill(null);
        setNotFoundError(true);
      }
    });

    return () => unsubscribe();
  }, [activeBillId]);

  // When a bill is not found or expired, automatically redirect to the home page after 3.5 seconds
  useEffect(() => {
    if (!notFoundError) return;
    const timer = window.setTimeout(() => {
      navigateHome();
    }, 3500);
    return () => window.clearTimeout(timer);
  }, [notFoundError, navigateHome]);

  const handleBillCreated = (createdBill: BillDocument, openQr = true) => {
    const url = new URL(window.location.href);
    url.searchParams.set('bill', createdBill.id);
    window.history.pushState({}, '', url.toString());
    preloadedBillIdRef.current = createdBill.id;
    setBill(createdBill);
    setLoadingBill(false);
    setNotFoundError(false);
    setOpenQrOnLoad(openQr);
    setActiveBillId(createdBill.id);
  };

  if (activeBillId) {
    if (loadingBill) {
      return (
        <div className="min-h-dvh flex flex-col items-center justify-center bg-slate-50 p-6 text-center space-y-4">
          <Loader2 className="h-10 w-10 animate-spin text-teal-700" />
          <p className="text-base font-bold text-slate-800">טוען את החשבון השולחני...</p>
          <a
            href="/"
            onClick={(e) => {
              e.preventDefault();
              navigateHome();
            }}
            className="text-xs font-bold text-teal-700 hover:underline pt-2"
          >
            ביטול וחזרה לדף הבית
          </a>
        </div>
      );
    }

    if (notFoundError || !bill) {
      return (
        <div className="min-h-dvh flex flex-col items-center justify-center bg-slate-50 p-6 text-center">
          <div
            role="alert"
            className="rounded-3xl bg-white p-6 shadow-lg max-w-sm w-full space-y-4 border-2 border-red-200"
          >
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-red-50 text-red-600">
              <AlertCircle className="h-7 w-7" />
            </div>
            <div className="space-y-1.5">
              <h1 className="text-lg font-extrabold text-slate-900">
                החשבון לא נמצא ({activeBillId})
              </h1>
              <p className="text-xs text-slate-600 leading-relaxed">
                הקישור אינו תקין או שעברו 24 שעות ופג תוקף החשבון. מיד מועבר לדף הבית...
              </p>
            </div>
            <a
              href="/"
              onClick={(e) => {
                e.preventDefault();
                navigateHome();
              }}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-teal-700 py-3 text-sm font-bold text-white hover:bg-teal-800 transition-colors"
            >
              <Home className="h-4 w-4" />
              <span>חזרה לדף הבית עכשיו</span>
            </a>
          </div>
        </div>
      );
    }

    return (
      <BillView
        key={bill.id}
        bill={bill}
        onOptimisticBillChange={setBill}
        onBackHome={navigateHome}
        initialOpenQr={openQrOnLoad}
      />
    );
  }

  return (
    <HomeView
      onBillCreated={handleBillCreated}
    />
  );
};

export default App;
