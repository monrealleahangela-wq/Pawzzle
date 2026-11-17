import React, { useEffect, useRef, useState } from 'react';
import { Camera, CheckCircle2, RefreshCw, Video } from 'lucide-react';

const stopMediaStream = (stream) => {
  stream?.getTracks?.().forEach(track => track.stop());
};

const cameraMessage = (error) => {
  if (error?.name === 'NotAllowedError' || error?.name === 'SecurityError') {
    return 'Camera permission was blocked. Allow camera access in your browser settings, then try again.';
  }
  if (error?.name === 'NotFoundError' || error?.name === 'OverconstrainedError') {
    return 'No usable camera was found. Open Pawzzle on a camera-enabled device.';
  }
  return 'The live camera could not be opened. Check camera access and try again.';
};

const canvasBlob = (canvas) => new Promise((resolve, reject) => {
  canvas.toBlob(
    blob => blob ? resolve(blob) : reject(new Error('The camera frame could not be captured.')),
    'image/jpeg',
    0.9
  );
});

export default function LiveCameraProofCapture({ photo, capturedAt, disabled = false, onCapture, onClear }) {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const [state, setState] = useState(photo ? 'captured' : 'idle');
  const [cameraReady, setCameraReady] = useState(false);
  const [error, setError] = useState('');

  const stopCamera = () => {
    stopMediaStream(streamRef.current);
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setCameraReady(false);
  };

  useEffect(() => () => stopMediaStream(streamRef.current), []);

  useEffect(() => {
    if (photo) setState('captured');
  }, [photo]);

  useEffect(() => {
    if (!streamRef.current || !videoRef.current || !['starting', 'ready', 'uploading'].includes(state)) return;
    videoRef.current.srcObject = streamRef.current;
    videoRef.current.play().catch(() => setError('Tap the live preview to start the camera.'));
  }, [state]);

  const startCamera = async () => {
    setError('');
    setCameraReady(false);
    stopCamera();
    if (!navigator.mediaDevices?.getUserMedia) {
      setState('error');
      setError('Live camera access is unavailable. Use a supported browser over a secure connection.');
      return;
    }
    setState('starting');
    try {
      streamRef.current = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          facingMode: { ideal: 'environment' },
          width: { ideal: 1280 },
          height: { ideal: 960 }
        }
      });
      setState('ready');
    } catch (cameraError) {
      stopCamera();
      setState('error');
      setError(cameraMessage(cameraError));
    }
  };

  const captureFrame = async () => {
    const video = videoRef.current;
    if (!video || !cameraReady || !video.videoWidth || !video.videoHeight) {
      setError('Wait for the live camera preview before taking the photo.');
      return;
    }
    setError('');
    setState('uploading');
    try {
      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height);
      const blob = await canvasBlob(canvas);
      const file = new File([blob], `delivery-live-proof-${Date.now()}.jpg`, {
        type: 'image/jpeg',
        lastModified: Date.now()
      });
      await onCapture(file);
      stopCamera();
      setState('captured');
    } catch (captureError) {
      setState('ready');
      setError(captureError?.message || 'The live photo could not be saved. Try again.');
    }
  };

  const retake = async () => {
    stopCamera();
    await onClear?.();
    setState('idle');
    setError('');
  };

  if (state === 'captured' && photo) {
    return <section className="overflow-hidden rounded-xl border border-emerald-200 bg-emerald-50" aria-label="Live delivery photo captured">
      <img src={photo} alt="Live delivery evidence preview" className="h-48 w-full object-cover" />
      <div className="flex items-center justify-between gap-3 p-3">
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 text-xs font-black text-emerald-800"><CheckCircle2 size={16}/> Live photo captured</p>
          {capturedAt && <p className="mt-0.5 text-[10px] text-emerald-700">Captured {new Date(capturedAt).toLocaleString()}</p>}
        </div>
        <button type="button" disabled={disabled} onClick={retake} className="flex h-10 shrink-0 items-center gap-1.5 rounded-lg border border-emerald-300 bg-white px-3 text-xs font-bold text-emerald-800 disabled:opacity-50">
          <RefreshCw size={15}/> Retake
        </button>
      </div>
    </section>;
  }

  return <section className="rounded-xl border bg-slate-50 p-3" aria-label="Live camera delivery proof">
    <div className="mb-3 flex items-start gap-2">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-700"><Video size={18}/></span>
      <div>
        <p className="text-xs font-black text-slate-900">Live delivery photo required</p>
        <p className="mt-0.5 text-[10px] leading-4 text-slate-600">Take the photo now using this device. Gallery uploads are not accepted for delivery confirmation.</p>
      </div>
    </div>

    {['starting', 'ready', 'uploading'].includes(state) && <div className="overflow-hidden rounded-lg bg-black">
      <video ref={videoRef} muted playsInline aria-label="Live camera preview" onCanPlay={() => setCameraReady(true)} className="aspect-[4/3] w-full object-cover" />
    </div>}

    {error && <p role="alert" className="mt-2 rounded-lg bg-rose-50 px-3 py-2 text-[11px] font-medium text-rose-700">{error}</p>}

    <div className="mt-3">
      {['idle', 'error'].includes(state) && <button type="button" disabled={disabled} onClick={startCamera} className="flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-slate-900 text-xs font-black text-white disabled:opacity-50">
        <Camera size={17}/> {state === 'error' ? 'Retry live camera' : 'Open live camera'}
      </button>}
      {['starting', 'ready', 'uploading'].includes(state) && <button type="button" disabled={disabled || state !== 'ready' || !cameraReady} onClick={captureFrame} className="flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-emerald-600 text-xs font-black text-white disabled:opacity-50">
        <Camera size={17}/> {state === 'uploading' ? 'Saving live photo…' : state === 'starting' ? 'Opening camera…' : 'Capture delivery photo'}
      </button>}
    </div>
  </section>;
}

export { cameraMessage, stopMediaStream };
