import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Camera, Loader2, RefreshCw } from 'lucide-react';
import { ModalDialog } from './ModalDialog';

interface CameraModalProps {
  open: boolean;
  onClose: () => void;
  onCaptureFile: (file: File) => void;
  onFallbackToFileInput: () => void;
}

export const CameraModal: React.FC<CameraModalProps> = ({
  open,
  onClose,
  onCaptureFile,
  onFallbackToFileInput,
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment');
  const [loadingCamera, setLoadingCamera] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);

  const stopStream = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
  }, []);

  const startCamera = useCallback(
    async (mode: 'environment' | 'user') => {
      stopStream();
      setLoadingCamera(true);
      setCameraError(null);

      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        setLoadingCamera(false);
        onClose();
        onFallbackToFileInput();
        return;
      }

      try {
        let stream: MediaStream;
        try {
          stream = await navigator.mediaDevices.getUserMedia({
            video: {
              facingMode: { ideal: mode },
              width: { ideal: 1920 },
              height: { ideal: 1080 },
            },
            audio: false,
          });
        } catch {
          // Fallback to any available video camera (e.g. Mac webcam)
          stream = await navigator.mediaDevices.getUserMedia({
            video: true,
            audio: false,
          });
        }

        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }
      } catch (err) {
        console.warn('Camera access error:', err);
        setCameraError(
          'לא ניתן לגשת למצלמה (ייתכן שלא אושרה הרשאה בדפדפן). ניתן להעלות קובץ במקום.'
        );
      } finally {
        setLoadingCamera(false);
      }
    },
    [onClose, onFallbackToFileInput, stopStream]
  );

  useEffect(() => {
    if (open) {
      startCamera(facingMode);
    } else {
      stopStream();
    }
    return () => {
      stopStream();
    };
  }, [open, facingMode, startCamera, stopStream]);

  const handleCapture = () => {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return;

    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    canvas.toBlob(
      (blob) => {
        if (!blob) return;
        const file = new File([blob], `receipt-${Date.now()}.jpg`, {
          type: 'image/jpeg',
        });
        stopStream();
        onClose();
        onCaptureFile(file);
      },
      'image/jpeg',
      0.9
    );
  };

  const toggleFacingMode = () => {
    setFacingMode((prev) => (prev === 'environment' ? 'user' : 'environment'));
  };

  return (
    <ModalDialog open={open} onClose={onClose} title="צילום החשבון מהמצלמה">
      <div className="space-y-4">
        {cameraError ? (
          <div className="space-y-3 text-center py-4">
            <p className="text-xs font-semibold text-red-700 bg-red-50 border border-red-200 rounded-xl p-3">
              {cameraError}
            </p>
            <button
              type="button"
              onClick={() => {
                onClose();
                onFallbackToFileInput();
              }}
              className="w-full rounded-xl bg-teal-700 py-3 text-sm font-bold text-white hover:bg-teal-800 transition-colors"
            >
              בחר תמונה מהמכשיר במקום
            </button>
          </div>
        ) : (
          <>
            <div className="relative overflow-hidden rounded-2xl bg-slate-950 aspect-[3/4] max-h-[60dvh] w-full flex items-center justify-center">
              {loadingCamera && (
                <div className="absolute inset-0 flex flex-col items-center justify-center text-white/80 z-10 bg-slate-950/60">
                  <Loader2 className="h-8 w-8 animate-spin text-teal-400 mb-2" />
                  <span className="text-xs font-medium">מפעיל מצלמה...</span>
                </div>
              )}
              <video
                ref={videoRef}
                playsInline
                muted
                autoPlay
                className="h-full w-full object-cover"
              />
            </div>

            <div className="flex items-center justify-between gap-2.5">
              <button
                type="button"
                onClick={toggleFacingMode}
                className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-3 text-xs font-bold text-slate-700 hover:bg-slate-100 transition-colors"
              >
                <RefreshCw className="h-4 w-4" />
                <span>החלף מצלמה</span>
              </button>

              <button
                type="button"
                onClick={handleCapture}
                disabled={loadingCamera}
                className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-teal-700 py-3.5 text-base font-extrabold text-white shadow-md hover:bg-teal-800 disabled:opacity-50 transition-colors"
              >
                <Camera className="h-5 w-5" />
                <span>צלם עכשיו</span>
              </button>
            </div>
          </>
        )}
      </div>
    </ModalDialog>
  );
};
