import React, { useEffect, useState, useRef, useCallback } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import { X, QrCode, User, Calendar, Clock, AlertCircle, CheckCircle, RefreshCcw, Camera } from 'lucide-react';
import axios from 'axios';
import { toast } from 'react-toastify';

const QRScannerModal = ({ isOpen, onClose, onScanSuccess }) => {
  const [scanResult, setScanResult] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState(null);
  const [isScannerStarted, setIsScannerStarted] = useState(false);
  const [status, setStatus] = useState('Standby');
  const [debugInfo, setDebugInfo] = useState('');
  
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const scannerEngineRef = useRef(null);
  const streamRef = useRef(null);
  const scanTimerRef = useRef(null);

  const stopScanner = useCallback(async () => {
    if (scanTimerRef.current) {
      clearInterval(scanTimerRef.current);
      scanTimerRef.current = null;
    }

    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }

    if (scannerEngineRef.current) {
      try {
        await scannerEngineRef.current.clear();
      } catch (e) {}
      scannerEngineRef.current = null;
    }

    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }

    setIsScannerStarted(false);
  }, []);

  const handleDecodedText = useCallback(async (decodedText) => {
    if (isProcessing) return;
    
    try {
      setIsProcessing(true);
      setError(null);
      setStatus('Validating...');
      setDebugInfo('Protocol data synchronized. Syncing with mainframe...');
      
      await stopScanner();

      const response = await axios.post('/api/bookings/validate-qr', { bookingId: decodedText });
      setScanResult(response.data.booking);
      toast.success('Protocol Authenticated');
    } catch (err) {
      setError(err.response?.data?.message || 'Invalid or unregistered booking protocol');
      setStatus('System Lockout');
      setDebugInfo('Hardware/Credential mismatch detected.');
    } finally {
      setIsProcessing(false);
    }
  }, [isProcessing, stopScanner]);

  const startScanner = useCallback(async () => {
    setError(null);
    setStatus('Initializing Optics...');
    setDebugInfo('Opening secure hardware channel...');
    
    try {
      await stopScanner();

      const constraints = {
        video: { 
          facingMode: "environment",
          width: { ideal: 1280 },
          height: { ideal: 720 }
        }
      };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      streamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.onloadedmetadata = () => {
           videoRef.current.play();
           setIsScannerStarted(true);
           setStatus('Optics Online');
           setDebugInfo('Frame synchronization established.');
        };
      }

      const engine = new Html5Qrcode('qr-decoder-engine'); 
      scannerEngineRef.current = engine;

      scanTimerRef.current = setInterval(async () => {
        if (!videoRef.current || !canvasRef.current || !scannerEngineRef.current || isProcessing) return;

        try {
          const canvas = canvasRef.current;
          const video = videoRef.current;
          const context = canvas.getContext('2d');
          
          if (canvas.width !== video.videoWidth) canvas.width = video.videoWidth;
          if (canvas.height !== video.videoHeight) canvas.height = video.videoHeight;
          
          context.drawImage(video, 0, 0, canvas.width, canvas.height);
          
          canvas.toBlob(async (blob) => {
            if (!blob || !scannerEngineRef.current) return;
            try {
              const file = new File([blob], "frame.jpg", { type: "image/jpeg" });
              const result = await scannerEngineRef.current.scanFile(file, true);
              if (result) handleDecodedText(result);
            } catch (ignore) {
            }
          }, 'image/jpeg', 0.8);

        } catch (e) {
        }
      }, 200);

    } catch (err) {
      console.error('Critical Hardware Failure:', err);
      let errMsg = 'Optic Array Failed. Ensure HTTPS link and camera permissions are enabled.';
      if (err.name === 'NotAllowedError') errMsg = 'Camera permission denied. Please re-enable access.';
      if (err.name === 'NotFoundError') errMsg = 'No Rear-Facing camera found on this unit.';
      
      setError(errMsg);
      setStatus('System Shutdown');
      setDebugInfo(err.message);
    }
  }, [handleDecodedText, isProcessing, stopScanner]);

  useEffect(() => {
    if (isOpen) {
      const t = setTimeout(startScanner, 1000);
      return () => {
        clearTimeout(t);
        stopScanner();
      };
    }
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[1000] flex items-center justify-center p-0 sm:p-4 bg-black animate-fade-in pb-20 sm:pb-0 font-['Outfit']">
      <div className="bg-slate-950 w-full max-w-lg sm:rounded-[3rem] h-full sm:h-auto shadow-2xl flex flex-col overflow-hidden animate-scale-in border border-white/5">
        
        <div className="px-6 py-5 bg-black border-b border-white/5 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-primary-600 rounded-xl">
               <QrCode className="h-5 w-5 text-white" />
            </div>
            <div>
               <h3 className="text-[12px] font-black text-white uppercase tracking-tighter leading-none mb-1">Optical Protocol Hub</h3>
               <div className="flex items-center gap-2">
                  <div className={`w-1.5 h-1.5 rounded-full ${isScannerStarted ? 'bg-emerald-500 animate-pulse shadow-[0_0_8px_#10b981]' : 'bg-rose-500'}`} />
                  <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest">{status}</p>
               </div>
            </div>
          </div>
          <button onClick={onClose} className="p-3 hover:bg-white/10 rounded-2xl transition-all">
            <X className="h-6 w-6 text-white" />
          </button>
        </div>

        <div className="flex-1 p-6 flex flex-col items-center justify-center min-h-[450px]">
          
          <div className={`relative w-full aspect-square mx-auto max-w-[320px] mb-8 ${(scanResult || error || isProcessing) ? 'hidden' : 'block'}`}>
            <div className="w-full h-full rounded-[2.5rem] border-[6px] border-white/5 bg-black overflow-hidden shadow-2xl relative flex items-center justify-center ring-1 ring-white/10">
               
               <video
                 ref={videoRef}
                 autoPlay
                 playsInline
                 muted
                 className="w-full h-full object-cover"
               />

               {!isScannerStarted && !error && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-6 bg-slate-950 z-30">
                     <div className="w-20 h-20 border-4 border-slate-900 border-t-primary-600 animate-spin rounded-full" />
                     <p className="text-[10px] font-black text-white uppercase tracking-widest animate-pulse">{status}</p>
                  </div>
               )}
               
               {isScannerStarted && (
                  <div className="absolute inset-0 pointer-events-none z-20 flex items-center justify-center">
                    <div className="w-4/5 h-4/5 border-[45px] border-black/60 rounded-[2.5rem]" />
                    <div className="absolute inset-0 border border-white/10 rounded-[2.5rem]" />
                    <div className="absolute w-full h-[2px] bg-gradient-to-r from-transparent via-primary-500 to-transparent animate-scan-line shadow-[0_0_15px_#2563eb]" />
                    
                    <div className="absolute top-8 left-8 w-8 h-8 border-t-4 border-l-4 border-primary-500 rounded-tl-xl" />
                    <div className="absolute top-8 right-8 w-8 h-8 border-t-4 border-r-4 border-primary-500 rounded-tr-xl" />
                    <div className="absolute bottom-8 left-8 w-8 h-8 border-b-4 border-l-4 border-primary-500 rounded-bl-xl" />
                    <div className="absolute bottom-8 right-8 w-8 h-8 border-b-4 border-r-4 border-primary-500 rounded-br-xl" />
                  </div>
               )}
            </div>
          </div>

          {!scanResult && !error && !isProcessing && (
            <div className="text-center space-y-2 max-w-xs transition-opacity duration-1000">
               <p className="text-[11px] font-black text-white uppercase tracking-[0.4em]">Protocol Sync</p>
               <p className="text-[9px] font-bold text-slate-600 uppercase tracking-widest underline decoration-primary-500/30">Stable Optics Required</p>
            </div>
          )}

          {isProcessing && (
            <div className="flex flex-col items-center justify-center py-10 gap-10 text-center w-full min-h-[300px]">
               <div className="relative">
                  <div className="w-28 h-28 border-[12px] border-white/5 border-t-primary-600 rounded-full animate-spin" />
                  <div className="absolute inset-0 flex items-center justify-center">
                    <Lock className="h-10 w-10 text-primary-600 animate-pulse" />
                  </div>
               </div>
               <div className="space-y-4">
                  <h4 className="text-3xl font-black text-white uppercase tracking-tighter mb-2">Decrypting...</h4>
                  <p className="text-[10px] font-black text-slate-500 uppercase tracking-[0.4em] max-w-xs leading-relaxed">{debugInfo}</p>
               </div>
            </div>
          )}

          {scanResult && (
            <div className="bg-emerald-600 rounded-[3rem] p-10 w-full animate-fade-in shadow-2xl relative overflow-hidden group border border-emerald-500">
               <div className="absolute inset-0 bg-white/5 opacity-0 group-hover:opacity-100 transition-opacity" />
               <div className="flex flex-col items-center text-center space-y-10 relative z-10">
                  <div className="w-28 h-28 bg-white rounded-full flex items-center justify-center shadow-2xl shrink-0 border-[8px] border-white/10">
                    <CheckCircle className="h-14 w-14 text-emerald-600" />
                  </div>
                  <div className="space-y-8 w-full">
                    <div>
                      <h4 className="text-4xl font-black text-white uppercase tracking-tight leading-none mb-2">Verified</h4>
                      <p className="text-[12px] font-black text-emerald-100 uppercase tracking-[0.5em]">Protocol Identified</p>
                    </div>

                    <div className="bg-black/20 p-6 rounded-[2rem] border border-white/10 flex items-center gap-5">
                       <div className="w-12 h-12 bg-black/40 rounded-2xl flex items-center justify-center text-white">
                          <User className="h-6 w-6" />
                       </div>
                       <div className="text-left">
                          <p className="text-[14px] font-black text-white uppercase leading-none mb-1">{scanResult.customer?.firstName} {scanResult.customer?.lastName}</p>
                          <p className="text-[10px] font-bold text-white/50 uppercase tracking-widest leading-none">Authorized Holder</p>
                       </div>
                    </div>

                    <button 
                      onClick={() => { onScanSuccess(); onClose(); }}
                      className="w-full py-6 bg-white text-emerald-600 rounded-3xl text-[12px] font-black uppercase tracking-[0.4em] shadow-2xl hover:scale-105 active:scale-95 transition-all"
                    >
                      CONTINUE PROTOCOL
                    </button>
                  </div>
               </div>
            </div>
          )}

          {error && (
            <div className="bg-rose-600 rounded-[3rem] p-10 w-full animate-fade-in shadow-2xl relative group border border-rose-500">
               <div className="flex flex-col items-center text-center space-y-10 relative z-10">
                  <div className="w-28 h-28 bg-white rounded-full flex items-center justify-center shadow-2xl shrink-0">
                    <ShieldAlert className="h-14 w-14 text-rose-600 text-3xl" />
                  </div>
                  <div className="space-y-8 w-full">
                    <div>
                      <h4 className="text-3xl font-black text-white uppercase tracking-tight leading-none mb-2">Hardware Fail</h4>
                      <p className="text-[12px] font-black text-rose-200 uppercase tracking-[0.5em]">Internal Protocol Error</p>
                    </div>
                    <p className="text-[11px] font-bold text-white bg-black/10 py-5 px-6 rounded-2xl uppercase tracking-wide leading-relaxed border border-white/5">
                      {error}
                    </p>
                    <div className="grid grid-cols-1 gap-4">
                       <button onClick={startScanner} className="py-6 bg-white text-rose-600 rounded-3xl text-[11px] font-black uppercase tracking-widest active:scale-95 transition-all flex items-center justify-center gap-3 shadow-xl">
                          <RefreshCcw className="h-5 w-5" /> RE-ENGAGE OPTICS
                       </button>
                       <button onClick={onClose} className="py-4 text-white/60 text-[10px] font-black uppercase tracking-widest">EXIT TERMINAL</button>
                    </div>
                  </div>
               </div>
            </div>
          )}
        </div>

        <div id="qr-decoder-engine" className="hidden" />
        <canvas ref={canvasRef} className="hidden" />

        <div className="px-8 py-5 bg-black border-t border-white/5 flex items-center justify-between">
           <div className="flex items-center gap-3">
              <span className="flex h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
              <p className="text-[9px] font-black text-slate-700 uppercase tracking-[0.5em]">System.Link: Active</p>
           </div>
           <p className="text-[9px] font-black text-slate-800 uppercase tracking-widest underline underline-offset-4 decoration-slate-800">BUILD.PROTOCOL_V6.0.0_DIRECT_HW</p>
        </div>
      </div>
    </div>
  );
};

export default QRScannerModal;
