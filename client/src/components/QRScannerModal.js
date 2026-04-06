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
  const isProcessingRef = useRef(false);
  
  const scannerRef = useRef(null);
  const isInitializingRef = useRef(false);
  const readerId = 'qr-optical-hub-final-v5';
  const startAttemptRef = useRef(0);

  const stopScanner = useCallback(async () => {
    if (scannerRef.current) {
      try {
        if (scannerRef.current.isScanning) {
          await scannerRef.current.stop();
        }
        try {
          await scannerRef.current.clear();
        } catch(e) {}
      } catch (err) {
        console.warn('Scanner closure warning:', err);
      } finally {
        scannerRef.current = null;
        setIsScannerStarted(false);
        isInitializingRef.current = false;
      }
    }
  }, []);

  const handleInternalScan = useCallback(async (decodedText) => {
    if (isProcessingRef.current) return;
    
    try {
      isProcessingRef.current = true;
      setIsProcessing(true);
      setError(null);
      setDebugInfo('Payload detected. Validating core...');
      setStatus('Validating...');
      
      await stopScanner();

      const response = await axios.post('/api/bookings/validate-qr', { bookingId: decodedText });
      setScanResult(response.data.booking);
      toast.success('Protocol Validated');
    } catch (err) {
      console.error('Validation Error:', err);
      setError(err.response?.data?.message || 'Invalid or unregistered booking protocol');
      setStatus('Terminal Error');
    } finally {
      isProcessingRef.current = false;
      setIsProcessing(false);
    }
  }, [stopScanner]);

  const startScanner = useCallback(async () => {
    if (isInitializingRef.current) return;
    isInitializingRef.current = true;
    
    startAttemptRef.current += 1;
    const currentAttempt = startAttemptRef.current;

    setStatus('Probing Optical Array...');
    setDebugInfo('Initializing hardware handshake...');
    setError(null);

    try {
      await stopScanner();
      
      let container = document.getElementById(readerId);
      for (let i = 0; i < 15; i++) {
        if (container) break;
        await new Promise(r => setTimeout(r, 100));
        container = document.getElementById(readerId);
      }

      if (!container) throw new Error('Visual hub failed to mount in DOM');
      if (currentAttempt !== startAttemptRef.current) return;

      const scannerInstance = new Html5Qrcode(readerId);
      scannerRef.current = scannerInstance;

      const config = {
        fps: 24,
        qrbox: (w, h) => {
           const size = Math.floor(Math.min(w, h) * 0.72);
           return { width: size, height: size };
        },
        aspectRatio: 1.0,
        videoConstraints: {
           facingMode: { exact: "environment" },
           width: { min: 640, ideal: 1280 },
           height: { min: 480, ideal: 720 }
        }
      };

      await scannerInstance.start(
        { facingMode: "environment" },
        config,
        (text) => handleInternalScan(text),
        () => {}
      );

      const videoElement = container.querySelector('video');
      if (videoElement) {
        videoElement.setAttribute('autoplay', 'true');
        videoElement.setAttribute('muted', 'true');
        videoElement.setAttribute('playsinline', 'true');
        videoElement.style.objectFit = 'cover';
        videoElement.style.width = '100%';
        videoElement.style.height = '100%';
        setDebugInfo('Hardware link synchronized at 24fps');
      }

      if (currentAttempt === startAttemptRef.current) {
        setIsScannerStarted(true);
        setStatus('Live Stream Active');
      }
    } catch (err) {
      console.error('Critical Scanner Failure:', err);
      if (currentAttempt === startAttemptRef.current) {
        const msg = err?.toString() || '';
        let userError = 'Camera failed to load. Ensure you are on HTTPS and hardware is available.';
        
        if (msg.includes('NotAllowedError') || msg.includes('Permission')) {
          userError = 'Camera access denied. Please re-enable browser permissions for the camera.';
        } else if (msg.includes('NotFound') || msg.includes('Overconstrained')) {
          setDebugInfo('Rear optic fallback engaged...');
          try {
             await scannerRef.current.start(
                { facingMode: "environment" },
                { fps: 20, qrbox: { width: 250, height: 250 } },
                (text) => handleInternalScan(text)
             );
             setIsScannerStarted(true);
             setStatus('Live Stream Active (Legacy Mode)');
             return;
          } catch(e) {
             userError = 'No rear-facing camera detected on this hardware unit.';
          }
        }
        
        setError(userError);
        setStatus('Hub Lockdown');
      }
    } finally {
      if (currentAttempt === startAttemptRef.current) {
        isInitializingRef.current = false;
      }
    }
  }, [handleInternalScan, stopScanner]);

  useEffect(() => {
    let active = true;
    if (isOpen) {
      const run = async () => {
        await new Promise(r => setTimeout(r, 1000));
        if (active) startScanner();
      };
      run();
    }
    return () => {
      active = false;
      stopScanner();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[1000] flex items-center justify-center p-0 sm:p-4 bg-black transition-all animate-fade-in pb-20 sm:pb-0 font-['Outfit']">
      <div className="bg-slate-950 w-full max-w-lg sm:rounded-[3rem] h-full sm:h-auto shadow-[0_0_100px_rgba(0,0,0,0.8)] flex flex-col overflow-hidden animate-scale-in border border-white/5">
        
        <div className="px-6 py-5 bg-black border-b border-white/5 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-primary-600 rounded-xl">
               <QrCode className="h-5 w-5 text-white" />
            </div>
            <div>
               <h3 className="text-[12px] font-black text-white uppercase tracking-tighter leading-none mb-1">Optical Calibration Hub</h3>
               <div className="flex items-center gap-2">
                  <div className={`w-1.5 h-1.5 rounded-full ${isScannerStarted ? 'bg-emerald-500 animate-pulse' : 'bg-rose-500'}`} />
                  <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest">{status}</p>
               </div>
            </div>
          </div>
          <button 
            onClick={onClose} 
            className="p-3 hover:bg-white/10 rounded-2xl transition-colors active:scale-90"
          >
            <X className="h-6 w-6 text-white" />
          </button>
        </div>

        <div className="flex-1 p-6 flex flex-col items-center justify-center min-h-[450px]">
          
          <div className={`relative w-full aspect-square mx-auto max-w-[320px] mb-8 ${(scanResult || error || isProcessing) ? 'hidden' : 'block'}`}>
            <div 
              id={readerId} 
              className="w-full h-full rounded-[2.5rem] border-[6px] border-white/5 bg-black overflow-hidden shadow-2xl relative flex items-center justify-center"
              style={{ minHeight: '300px' }}
            >
               {!isScannerStarted && !error && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-6 bg-slate-950 z-10 w-full h-full">
                     <div className="relative">
                        <div className="w-16 h-16 border-4 border-slate-800 border-t-primary-600 animate-spin rounded-full" />
                        <Camera className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 h-6 w-6 text-slate-700" />
                     </div>
                     <div className="text-center space-y-1">
                        <p className="text-[10px] font-black text-white uppercase tracking-widest leading-none">{status}</p>
                        <p className="text-[8px] font-bold text-slate-500 uppercase tracking-widest">{debugInfo}</p>
                     </div>
                  </div>
               )}
            </div>

            {isScannerStarted && (
              <div className="absolute inset-0 pointer-events-none z-20 flex items-center justify-center">
                 <div className="w-4/5 h-4/5 border-[45px] border-black/60 rounded-[2.5rem]" />
                 <div className="absolute w-full h-full border border-white/10 rounded-[2.5rem] overflow-hidden">
                    <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-primary-500 to-transparent animate-scan-line shadow-[0_0_15px_rgba(37,99,235,0.8)]" />
                 </div>
                 
                 <div className="absolute top-10 left-10 w-6 h-6 border-t-4 border-l-4 border-primary-500 rounded-tl-xl" />
                 <div className="absolute top-10 right-10 w-6 h-6 border-t-4 border-r-4 border-primary-500 rounded-tr-xl" />
                 <div className="absolute bottom-10 left-10 w-6 h-6 border-b-4 border-l-4 border-primary-500 rounded-bl-xl" />
                 <div className="absolute bottom-10 right-10 w-6 h-6 border-b-4 border-r-4 border-primary-500 rounded-br-xl" />
              </div>
            )}
          </div>

          {!scanResult && !error && !isProcessing && (
            <div className="text-center space-y-2 max-w-xs animate-fade-in">
               <p className="text-[11px] font-black text-white uppercase tracking-[0.3em]">Align Protocol</p>
               <p className="text-[9px] font-bold text-slate-500 uppercase tracking-widest underline decoration-primary-500/30">Secure Environment Scanning Active</p>
            </div>
          )}

          {isProcessing && (
            <div className="flex flex-col items-center justify-center py-10 gap-8 text-center w-full min-h-[300px]">
               <div className="relative">
                  <div className="w-24 h-24 border-[10px] border-white/5 border-t-primary-600 rounded-full animate-spin" />
                  <div className="absolute inset-0 flex items-center justify-center">
                    <RefreshCcw className="h-8 w-8 text-primary-600 animate-spin-slow" />
                  </div>
               </div>
               <div>
                  <h4 className="text-2xl font-black text-white uppercase tracking-tighter mb-2">Syncing Matrix</h4>
                  <p className="text-[10px] font-black text-slate-500 uppercase tracking-[0.4em]">{debugInfo}</p>
               </div>
            </div>
          )}

          {scanResult && (
            <div className="bg-emerald-500 rounded-[3rem] p-10 w-full animate-fade-in shadow-2xl relative overflow-hidden group">
               <div className="absolute inset-0 bg-white/5 opacity-0 group-hover:opacity-100 transition-opacity" />
               <div className="flex flex-col items-center text-center space-y-8 relative z-10">
                  <div className="w-24 h-24 bg-white rounded-full flex items-center justify-center shadow-2xl border-4 border-white/10 shrink-0">
                    <CheckCircle className="h-12 w-12 text-emerald-500" />
                  </div>
                  <div className="space-y-6 w-full">
                    <div>
                      <h4 className="text-3xl font-black text-white uppercase tracking-tight leading-none mb-1">Authenticated</h4>
                      <p className="text-[10px] font-black text-emerald-100 uppercase tracking-[0.5em]">Protocol Registered</p>
                    </div>

                    <div className="bg-black/20 p-6 rounded-[2rem] border border-white/10 space-y-4 text-left">
                       <div className="flex items-center gap-4">
                          <div className="w-10 h-10 bg-black/40 rounded-xl flex items-center justify-center text-white">
                             <User className="h-5 w-5" />
                          </div>
                          <div>
                             <p className="text-[12px] font-black text-white uppercase leading-none mb-1">{scanResult.customer?.firstName} {scanResult.customer?.lastName}</p>
                             <p className="text-[9px] font-bold text-white/40 uppercase">Authorized Holder</p>
                          </div>
                       </div>
                    </div>

                    <button 
                      onClick={() => { onScanSuccess(); onClose(); }}
                      className="w-full py-5 bg-white text-emerald-600 rounded-2xl text-[11px] font-black uppercase tracking-[0.3em] shadow-2xl hover:scale-105 active:scale-95 transition-all"
                    >
                      CONTINUE PROTOCOL
                    </button>
                  </div>
               </div>
            </div>
          )}

          {error && (
            <div className="bg-rose-600 rounded-[3rem] p-10 w-full animate-fade-in shadow-2xl overflow-hidden relative group">
               <div className="absolute top-0 right-0 w-32 h-32 bg-white/5 rounded-full blur-2xl" />
               <div className="flex flex-col items-center text-center space-y-8 relative z-10">
                  <div className="w-24 h-24 bg-white rounded-full flex items-center justify-center shadow-2xl shrink-0">
                    <AlertCircle className="h-12 w-12 text-rose-600" />
                  </div>
                  <div className="space-y-6 w-full">
                    <div>
                      <h4 className="text-2xl font-black text-white uppercase tracking-tight leading-none mb-1">Calibration Error</h4>
                      <p className="text-[11px] font-black text-rose-200 uppercase tracking-[0.4em]">Hardware Lock</p>
                    </div>
                    <p className="text-[11px] font-bold text-white py-4 border-y border-white/10 uppercase tracking-wide leading-relaxed">
                      {error}
                    </p>
                    <div className="grid grid-cols-1 gap-3">
                       <button onClick={startScanner} className="py-5 bg-white text-rose-600 rounded-2xl text-[10px] font-black uppercase tracking-widest active:scale-95 transition-all flex items-center justify-center gap-3 shadow-xl">
                          <RefreshCcw className="h-4 w-4" /> RE-ENGAGE OPTICS
                       </button>
                       <button onClick={onClose} className="py-4 text-white/60 text-[10px] font-black uppercase tracking-widest hover:text-white transition-colors">EXIT TERMINAL</button>
                    </div>
                  </div>
               </div>
            </div>
          )}
        </div>
        
        <div className="px-6 py-4 bg-black border-t border-white/5 flex items-center justify-between">
           <div className="flex items-center gap-3">
              <span className="flex h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
              <p className="text-[8px] font-black text-slate-500 uppercase tracking-[0.5em]">System.Link : Active</p>
           </div>
           <p className="text-[8px] font-black text-slate-700 uppercase tracking-widest">BUILD.PROTOCOL_V5.1.0_MOBILE</p>
        </div>
      </div>

      <style dangerouslySetInnerHTML={{ __html: `
        #${readerId} video {
          object-fit: cover !important;
          width: 100% !important;
          height: 100% !important;
          border-radius: 2rem !important;
          display: block !important;
          background: #000 !important;
        }
        #${readerId} {
          position: relative !important;
          background: #000 !important;
        }
        #${readerId}__scan_region { border-radius: 2rem !important; }
        #${readerId} img { display: none !important; }
        #${readerId} button { display: none !important; }
      `}} />
    </div>
  );
};

export default QRScannerModal;
