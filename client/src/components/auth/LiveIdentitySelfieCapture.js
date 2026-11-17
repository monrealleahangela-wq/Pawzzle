import React, { useEffect, useRef, useState } from 'react';
import { Camera, RefreshCw, ShieldCheck } from 'lucide-react';

const LiveIdentitySelfieCapture = ({ value, onCapture }) => {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const [cameraActive, setCameraActive] = useState(false);
  const [previewUrl, setPreviewUrl] = useState('');
  const [error, setError] = useState('');

  const stopCamera = () => {
    streamRef.current?.getTracks().forEach(track => track.stop());
    streamRef.current = null;
    setCameraActive(false);
  };

  useEffect(() => () => stopCamera(), []);

  useEffect(() => {
    if (!value) {
      setPreviewUrl('');
      return undefined;
    }
    const url = URL.createObjectURL(value);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [value]);

  const startCamera = async () => {
    setError('');
    try {
      stopCamera();
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setCameraActive(true);
    } catch (_cameraError) {
      setError('Camera access is required. Allow camera permission and try again.');
    }
  };

  const capture = () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || !video.videoWidth || !video.videoHeight) {
      setError('The camera is still starting. Please try again.');
      return;
    }
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height);
    canvas.toBlob(blob => {
      if (!blob) return setError('The selfie could not be captured. Please try again.');
      onCapture(new File([blob], `identity-live-selfie-${Date.now()}.jpg`, { type: 'image/jpeg' }));
      stopCamera();
    }, 'image/jpeg', 0.9);
  };

  const retake = () => {
    onCapture(null);
    startCamera();
  };

  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
      <div className="flex items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary-100 text-primary-700"><Camera className="h-4 w-4" /></span>
        <div><p className="text-sm font-black text-slate-800">Live identity selfie <span className="text-rose-600">*</span></p><p className="mt-1 text-xs leading-5 text-slate-500">Use the camera now. Uploaded or saved selfie files are not accepted.</p></div>
      </div>
      <div className="mt-4 overflow-hidden rounded-xl bg-slate-950">
        {previewUrl ? <img src={previewUrl} alt="Captured identity selfie" className="aspect-video w-full object-contain" /> : <video ref={videoRef} muted playsInline className={`aspect-video w-full object-cover ${cameraActive ? 'block' : 'hidden'}`} />}
        {!previewUrl && !cameraActive && <div className="flex aspect-video items-center justify-center px-5 text-center text-xs font-semibold text-slate-300">Start the camera and keep one unobstructed face centered in clear lighting.</div>}
      </div>
      <canvas ref={canvasRef} className="hidden" />
      {error && <p role="alert" className="mt-3 text-xs font-bold text-rose-600">{error}</p>}
      <div className="mt-3 flex flex-wrap gap-2">
        {!cameraActive && !value && <button type="button" onClick={startCamera} className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-xs font-black text-white"><Camera className="h-4 w-4" /> Start camera</button>}
        {cameraActive && <button type="button" onClick={capture} className="inline-flex items-center gap-2 rounded-xl bg-primary-600 px-4 py-2.5 text-xs font-black text-white"><Camera className="h-4 w-4" /> Capture selfie</button>}
        {value && <button type="button" onClick={retake} className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-xs font-black text-slate-700"><RefreshCw className="h-4 w-4" /> Retake</button>}
        {value && <span className="inline-flex items-center gap-1.5 text-xs font-bold text-emerald-700"><ShieldCheck className="h-4 w-4" /> Captured live</span>}
      </div>
    </div>
  );
};

export default LiveIdentitySelfieCapture;
