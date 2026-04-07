import React, { useEffect, useState, useRef, useCallback } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import { api, getImageUrl } from '../services/apiService';
import { X, QrCode, User, Calendar, Clock, AlertCircle, CheckCircle, RefreshCcw, Camera, Lock, ShieldAlert } from 'lucide-react';
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
  const isProcessingRef = useRef(false);

  const stopScanner = useCallback(async () => {
    isProcessingRef.current = false;
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
    if (isProcessingRef.current) return;
    
    try {
      isProcessingRef.current = true;
      setIsProcessing(true);
      setError(null);
      setStatus('Validating...');
      setDebugInfo('Protocol data synchronized. Syncing with mainframe...');
      
      await stopScanner();

      // Determine validation endpoint based on protocol or context
      const endpoint = decodedText.startsWith('ORD-') || decodedText.length > 20 ? '/orders/validate-qr' : '/bookings/validate-qr';
      const payload = decodedText.startsWith('ORD-') ? { orderId: decodedText } : { bookingId: decodedText };

      const response = await api.post(endpoint, payload);
      setScanResult(response.data.order || response.data.booking);
      toast.success('Protocol Authenticated');
    } catch (err) {
      setError(err.response?.data?.message || 'Invalid or unregistered protocol identifier');
      setStatus('System Lockout');
      setDebugInfo('Hardware/Credential mismatch detected.');
    } finally {
      setIsProcessing(false);
      isProcessingRef.current = false;
    }
  }, [stopScanner]);

  const startScanner = useCallback(async () => {
    setError(null);
    setStatus('Initializing Optics...');
    setDebugInfo('Opening secure hardware channel...');
    
    try {
      await stopScanner();

      const constraints = {
        video: { 
          facingMode: { exact: "environment" }, // Prioritize rear camera
          width: { ideal: 1920 },
          height: { ideal: 1080 }
        }
      };

      let stream;
      try {
        stream = await navigator.mediaDevices.getUserMedia(constraints);
      } catch (e) {
        // Fallback for desktop or non-standard hardware
        stream = await navigator.mediaDevices.getUserMedia({ video: true });
      }

      streamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.setAttribute('autoplay', '');
        videoRef.current.setAttribute('muted', '');
        videoRef.current.setAttribute('playsinline', '');
        
        // Force play and ensure it's not hidden
        await videoRef.current.play();
        
        setIsScannerStarted(true);
        setStatus('Optics Online');
        setDebugInfo('High-speed synchronization established.');
      }

      const engine = new Html5Qrcode('qr-decoder-engine'); 
      scannerEngineRef.current = engine;

      scanTimerRef.current = setInterval(async () => {
        if (!videoRef.current || !canvasRef.current || !scannerEngineRef.current || isProcessing) return;

        try {
          const video = videoRef.current;
          const canvas = canvasRef.current;
          const context = canvas.getContext('2d', { alpha: false });
          
          if (video.readyState < 2) return; // Wait for metadata

          if (canvas.width !== video.videoWidth) canvas.width = video.videoWidth;
          if (canvas.height !== video.videoHeight) canvas.height = video.videoHeight;
          
          context.drawImage(video, 0, 0, canvas.width, canvas.height);
          
          canvas.toBlob(async (blob) => {
            if (!blob || !scannerEngineRef.current || isProcessing) return;
            try {
              const file = new File([blob], "frame.jpg", { type: "image/jpeg" });
              const result = await scannerEngineRef.current.scanFile(file, true);
              if (result && !isProcessing) handleDecodedText(result);
            } catch (ignore) {}
          }, 'image/jpeg', 0.5); // Lower quality for speed

        } catch (e) {}
      }, 300);

    } catch (err) {
      console.error('Critical Hardware Failure:', err);
      let errMsg = 'Hardware Link Failed. Ensure HTTPS and camera permissions are active.';
      if (err.name === 'NotAllowedError') errMsg = 'Camera permission denied. Access is required for sync.';
      if (err.name === 'NotFoundError') errMsg = 'No supported camera found on this hardware.';
      
      setError(errMsg);
      setStatus('System Offline');
      setDebugInfo(err.message);
    }
  }, [handleDecodedText, stopScanner]);

  useEffect(() => {
    if (isOpen && !scanResult && !error) {
      const wait = setTimeout(startScanner, 800);
      return () => {
        clearTimeout(wait);
        stopScanner();
      };
    } else if (!isOpen) {
        stopScanner();
    }
  }, [isOpen, scanResult, error, startScanner, stopScanner]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-0 sm:p-4 bg-slate-950/95 backdrop-blur-xl animate-fade-in font-['Outfit']">
      <div className="bg-black w-full max-w-lg sm:rounded-[3rem] h-[100dvh] sm:h-auto shadow-2xl flex flex-col overflow-hidden animate-scale-in border border-white/10">
        
        <div className="px-8 py-6 bg-black border-b border-white/5 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-4">
            <div className="p-2.5 bg-rose-600 rounded-2xl shadow-lg shadow-rose-500/20">
               <QrCode className="h-6 w-6 text-white" />
            </div>
            <div>
               <h3 className="text-[14px] font-black text-white uppercase tracking-tighter leading-none mb-1.5 text-rose-500">Optic-IV Terminal</h3>
               <div className="flex items-center gap-2.5">
                  <div className={`w-2 h-2 rounded-full ${isScannerStarted ? 'bg-emerald-500 animate-pulse shadow-[0_0_12px_#10b981]' : 'bg-rose-500 shadow-[0_0_12px_#f43f5e]'}`} />
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{status}</p>
               </div>
            </div>
          </div>
          <button onClick={onClose} className="p-4 hover:bg-white/10 rounded-2xl transition-all group">
            <X className="h-6 w-6 text-white group-hover:rotate-90 transition-transform" />
          </button>
        </div>

        <div className="flex-1 p-8 flex flex-col items-center justify-center">
          
          <div className={`relative w-full aspect-square mx-auto max-w-[340px] mb-10 ${(scanResult || error || isProcessing) ? 'hidden' : 'block'}`}>
            <div className="w-full h-full rounded-[3rem] border-[8px] border-white/5 bg-black overflow-hidden shadow-2xl relative flex items-center justify-center ring-2 ring-white/10">
               
               <video
                 ref={videoRef}
                 autoPlay
                 playsInline
                 muted
                 className="w-full h-full object-cover rounded-[2.5rem]"
                 style={{ minHeight: '100%', minWidth: '100%' }}
               />

               {!isScannerStarted && !error && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-8 bg-slate-950 z-30">
                     <div className="w-24 h-24 border-b-4 border-rose-600 animate-spin rounded-full" />
                     <p className="text-[11px] font-black text-white uppercase tracking-[0.4em] animate-pulse">{status}</p>
                  </div>
               )}
               
               {isScannerStarted && (
                  <div className="absolute inset-0 pointer-events-none z-20 flex items-center justify-center">
                    <div className="w-full h-full border-[60px] border-black/70" />
                    <div className="absolute inset-[60px] border-2 border-white/20 rounded-3xl" />
                    <div className="absolute w-full h-[3px] bg-gradient-to-r from-transparent via-rose-500 to-transparent animate-scan-line shadow-[0_0_20px_#f43f5e]" />
                    
                    <div className="absolute top-[68px] left-[68px] w-10 h-10 border-t-4 border-l-4 border-rose-500 rounded-tl-2xl shadow-[-4px_-4px_10px_rgba(244,63,94,0.3)]" />
                    <div className="absolute top-[68px] right-[68px] w-10 h-10 border-t-4 border-r-4 border-rose-500 rounded-tr-2xl shadow-[4px_-4px_10px_rgba(244,63,94,0.3)]" />
                    <div className="absolute bottom-[68px] left-[68px] w-10 h-10 border-b-4 border-l-4 border-rose-500 rounded-bl-2xl shadow-[-4px_4px_10px_rgba(244,63,94,0.3)]" />
                    <div className="absolute bottom-[68px] right-[68px] w-10 h-10 border-b-4 border-r-4 border-rose-500 rounded-br-2xl shadow-[4px_4px_10px_rgba(244,63,94,0.3)]" />
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
                      onClick={() => { setScanResult(null); startScanner(); }}
                      className="flex-1 w-full flex items-center justify-center gap-3 px-8 py-5 bg-white text-emerald-600 rounded-[2rem] font-black text-[12px] uppercase tracking-widest hover:bg-emerald-50 active:scale-95 transition-all shadow-xl shadow-emerald-900/10"
                    >
                      <RefreshCcw className="h-5 w-5" /> RE-ENGAGE OPTICS
                    </button>
                    <button 
                      onClick={() => { onScanSuccess(); onClose(); }}
                      className="flex-1 w-full flex items-center justify-center gap-3 px-8 py-5 bg-emerald-900 text-white rounded-[2rem] font-black text-[12px] uppercase tracking-widest hover:bg-emerald-800 active:scale-95 transition-all shadow-xl shadow-emerald-900/20"
                    >
                      <Lock className="h-5 w-5" /> CONTINUE PROTOCOL
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
