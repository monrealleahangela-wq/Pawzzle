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
  const scannerRef = useRef(null);
  const readerId = 'qr-reader-v2'; // Changed ID to avoid any stale DOM cache

  const stopScanner = useCallback(async () => {
    if (scannerRef.current && scannerRef.current.isScanning) {
      try {
        await scannerRef.current.stop();
        console.log("Scanner stopped successfully");
      } catch (err) {
        console.error('Failed to stop scanner:', err);
      }
    }
    scannerRef.current = null;
    setIsScannerStarted(false);
  }, []);

  const handleInternalScan = useCallback(async (decodedText) => {
    if (isProcessing) return;
    
    try {
      setIsProcessing(true);
      setError(null);
      setStatus('Validating...');
      
      // Stop ASAP to free camera
      await stopScanner();

      const response = await axios.post('/api/bookings/validate-qr', { bookingId: decodedText });
      setScanResult(response.data.booking);
      toast.success('Protocol Validated');
    } catch (err) {
      console.error('Validation Error:', err);
      setError(err.response?.data?.message || 'Invalid or unregistered booking protocol');
      setIsProcessing(false);
      setStatus('Error');
    }
  }, [isProcessing, stopScanner]);

  const startScanner = useCallback(async () => {
    if (scannerRef.current) await stopScanner();
    
    setStatus('Initializing Camera...');
    setError(null);

    try {
      const html5QrCode = new Html5Qrcode(readerId);
      scannerRef.current = html5QrCode;

      const qrConfig = {
        fps: 10,
        qrbox: (viewWidth, viewHeight) => {
           const min = Math.min(viewWidth, viewHeight);
           return { width: min * 0.7, height: min * 0.7 };
        },
        aspectRatio: 1.0,
        disableFlip: false,
      };

      await html5QrCode.start(
        { facingMode: "environment" },
        qrConfig,
        (text) => handleInternalScan(text),
        () => {} // Silent failures
      );

      setIsScannerStarted(true);
      setStatus('Scanning Live');
      console.log("Camera stream established and bound to DOM");
    } catch (err) {
      console.error('QR Start Error:', err);
      setError('System could not establish camera link. Ensure you are on HTTPS and have granted permissions.');
      setStatus('Failed');
    }
  }, [handleInternalScan, stopScanner]);

  useEffect(() => {
    let isMounted = true;
    
    if (isOpen) {
      // Short delay to ensure modal animation is complete and DOM is stable
      const timer = setTimeout(() => {
        if (isMounted) startScanner();
      }, 500);

      return () => {
        isMounted = false;
        clearTimeout(timer);
        stopScanner();
      };
    } else {
      stopScanner();
    }
  }, [isOpen, startScanner, stopScanner]);

  const handleReset = () => {
    setScanResult(null);
    setIsProcessing(false);
    setError(null);
    startScanner();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[1000] flex items-center justify-center p-0 sm:p-4 bg-slate-950/95 transition-all animate-fade-in pb-20 sm:pb-0">
      <div className="bg-white dark:bg-slate-900 w-full max-w-lg sm:rounded-[3rem] h-full sm:h-auto shadow-2xl flex flex-col overflow-hidden animate-scale-in border border-white/10">
        
        {/* Header - Compact High-Density */}
        <div className="px-6 py-4 bg-slate-900 border-b border-white/5 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-primary-600 rounded-xl shadow-glow-amber">
               <QrCode className="h-5 w-5 text-white" />
            </div>
            <div>
               <h3 className="text-[12px] font-black text-white uppercase tracking-tighter leading-none mb-1">Optical Hub</h3>
               <div className="flex items-center gap-2">
                  <div className={`w-1.5 h-1.5 rounded-full ${isScannerStarted ? 'bg-emerald-500 animate-pulse' : 'bg-slate-600'}`} />
                  <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">{status}</p>
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

        {/* Content Area */}
        <div className="flex-1 p-6 overflow-y-auto no-scrollbar">
          
          {/* Default Scanning View */}
          {!scanResult && !error && !isProcessing && (
            <div className="space-y-6 flex flex-col h-full animate-fade-in">
              <div className="relative aspect-square w-full mx-auto max-w-[320px]">
                 {/* Injected HTML5 QR DOM Container */}
                 <div 
                   id={readerId} 
                   className="w-full h-full rounded-[2rem] border-4 border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 overflow-hidden shadow-inner relative"
                 >
                    {/* Placeholder while camera loads */}
                    {!isScannerStarted && (
                       <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-slate-50 dark:bg-slate-900 z-10">
                          <div className="relative">
                            <div className="w-16 h-16 border-4 border-slate-200 dark:border-slate-700 border-t-primary-600 rounded-full animate-spin" />
                            <Camera className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 h-6 w-6 text-slate-300 dark:text-slate-600" />
                          </div>
                          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Activating Optics...</p>
                       </div>
                    )}
                 </div>

                 {/* Focus Overlay UI */}
                 {isScannerStarted && (
                   <div className="absolute inset-0 pointer-events-none z-20 flex items-center justify-center">
                      <div className="w-4/5 h-4/5 border-[40px] border-black/40 rounded-[2rem]" />
                      <div className="absolute w-full h-full border border-white/20 rounded-[2rem]">
                         <div className="absolute top-0 left-0 w-full h-0.5 bg-gradient-to-r from-transparent via-primary-500 to-transparent animate-scan-line" />
                      </div>
                      
                      {/* Corner Accents */}
                      <div className="absolute top-8 left-8 w-6 h-6 border-t-4 border-l-4 border-primary-500 rounded-tl-xl shadow-glow-amber" />
                      <div className="absolute top-8 right-8 w-6 h-6 border-t-4 border-r-4 border-primary-500 rounded-tr-xl shadow-glow-amber" />
                      <div className="absolute bottom-8 left-8 w-6 h-6 border-b-4 border-l-4 border-primary-500 rounded-bl-xl shadow-glow-amber" />
                      <div className="absolute bottom-8 right-8 w-6 h-6 border-b-4 border-r-4 border-primary-500 rounded-br-xl shadow-glow-amber" />
                   </div>
                 )}
              </div>

              <div className="bg-slate-50 dark:bg-slate-800/50 p-6 rounded-[2rem] border border-slate-100 dark:border-slate-800 text-center">
                 <p className="text-[11px] font-black text-slate-600 dark:text-slate-200 uppercase tracking-widest leading-relaxed mb-1">System Instructions</p>
                 <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase">Center the protocol within the frame for automated decryption.</p>
              </div>

              {/* Redundant Force Restart for Safari Bugs */}
              {!isScannerStarted && status === 'Failed' && (
                <button 
                  onClick={startScanner}
                  className="w-full py-4 bg-slate-900 dark:bg-slate-800 text-white rounded-2xl text-[10px] font-black uppercase tracking-[0.2em] flex items-center justify-center gap-3 active:scale-95 transition-all"
                >
                  <RefreshCcw className="h-4 w-4 text-emerald-500" /> RE-INIT OPTICS
                </button>
              )}
            </div>
          )}

          {/* Validation Hub */}
          {isProcessing && !scanResult && !error && (
            <div className="flex flex-col items-center justify-center py-20 gap-8 animate-pulse text-center">
               <div className="relative">
                  <div className="w-24 h-24 border-8 border-slate-100 dark:border-slate-800 border-t-primary-600 rounded-full animate-spin shadow-2xl" />
                  <div className="absolute inset-0 flex items-center justify-center">
                    <RefreshCcw className="h-10 w-10 text-primary-600 animate-spin-slow" />
                  </div>
               </div>
               <div>
                  <h4 className="text-2xl font-black text-slate-900 dark:text-white uppercase tracking-tight mb-2">Syncing Protocol</h4>
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.4em]">Querying Mainframe...</p>
               </div>
            </div>
          )}

          {/* Result Card: SUCCESS */}
          {scanResult && (
            <div className="bg-emerald-50 dark:bg-emerald-950/20 rounded-[2.5rem] p-8 border border-emerald-100 dark:border-emerald-900/30 animate-fade-in shadow-xl">
               <div className="flex flex-col items-center text-center space-y-8">
                  <div className="w-24 h-24 bg-white dark:bg-slate-900 rounded-full flex items-center justify-center shadow-emerald-500/20 shadow-2xl border-4 border-emerald-500">
                    <CheckCircle className="h-12 w-12 text-emerald-500" />
                  </div>
                  <div className="space-y-4 w-full">
                    <div>
                      <h4 className="text-3xl font-black text-slate-900 dark:text-white uppercase tracking-tight leading-none mb-1">Verified</h4>
                      <p className="text-[11px] font-black text-emerald-600 uppercase tracking-[0.4em]">Authorization Confirmed</p>
                    </div>

                    <div className="bg-white dark:bg-slate-900 p-6 rounded-[2rem] border border-emerald-100 dark:border-emerald-900/50 space-y-4 shadow-sm text-left">
                       <div className="flex items-center gap-4">
                          <div className="w-10 h-10 bg-slate-50 dark:bg-slate-800 rounded-xl flex items-center justify-center">
                             <User className="h-5 w-5 text-slate-400" />
                          </div>
                          <div>
                             <p className="text-[12px] font-black text-slate-900 dark:text-white uppercase leading-none mb-1">{scanResult.customer?.firstName} {scanResult.customer?.lastName}</p>
                             <p className="text-[9px] font-bold text-slate-400 uppercase">Protocol Holder</p>
                          </div>
                       </div>
                       <div className="h-px bg-slate-100 dark:bg-slate-800 w-full" />
                       <div className="flex justify-between items-center text-[10px] font-black uppercase">
                          <span className="text-slate-400">Date Log</span>
                          <span className="text-slate-900 dark:text-white">{new Date(scanResult.bookingDate).toLocaleDateString()}</span>
                       </div>
                    </div>

                    <button 
                      onClick={() => { onScanSuccess(); onClose(); }}
                      className="w-full py-5 bg-slate-900 dark:bg-emerald-600 text-white rounded-2xl text-[11px] font-black uppercase tracking-[0.3em] shadow-xl hover:bg-emerald-500 active:scale-95 transition-all"
                    >
                      CONTINUE SYSTEM <RefreshCcw className="h-4 w-4 ml-2 inline-block" />
                    </button>
                  </div>
               </div>
            </div>
          )}

          {/* Result Card: ERROR */}
          {error && (
            <div className="bg-rose-50 dark:bg-rose-950/20 rounded-[3rem] p-10 border border-rose-100 dark:border-rose-900/30 animate-fade-in shadow-2xl">
               <div className="flex flex-col items-center text-center space-y-8">
                  <div className="w-24 h-24 bg-white dark:bg-slate-900 rounded-full flex items-center justify-center shadow-rose-500/20 shadow-2xl">
                    <AlertCircle className="h-12 w-12 text-rose-500" />
                  </div>
                  <div className="space-y-8 w-full">
                    <div>
                      <h4 className="text-3xl font-black text-slate-900 dark:text-white uppercase tracking-tight leading-none mb-1">Rejection</h4>
                      <p className="text-[11px] font-black text-rose-600 uppercase tracking-[0.4em]">Protocol Invalid</p>
                    </div>
                    <p className="text-[11px] font-bold text-slate-500 dark:text-slate-400 border-y border-rose-100 dark:border-rose-900/30 py-6 uppercase leading-relaxed tracking-wider">
                      "{error}"
                    </p>
                    <div className="grid grid-cols-2 gap-4">
                       <button onClick={handleReset} className="py-5 bg-white dark:bg-slate-800 border-2 border-rose-200 dark:border-rose-900 text-rose-600 rounded-2xl text-[10px] font-black uppercase tracking-widest active:scale-95 transition-all">RETRY HUB</button>
                       <button onClick={onClose} className="py-5 bg-slate-900 dark:bg-slate-700 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest active:scale-95 transition-all">EXIT HUD</button>
                    </div>
                  </div>
               </div>
            </div>
          )}
        </div>
        
        {/* Footer info - Status Bar */}
        <div className="px-6 py-3 bg-slate-50 dark:bg-slate-950 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
           <p className="text-[8px] font-black text-slate-400 uppercase tracking-[0.5em]">Optical Scan Protocol v3.0</p>
           <div className="flex gap-1.5">
              <div className="w-1 h-1 rounded-full bg-primary-600" />
              <div className="w-1 h-1 rounded-full bg-primary-600/50" />
              <div className="w-1 h-1 rounded-full bg-primary-600/20" />
           </div>
        </div>
      </div>

      <style dangerouslySetInnerHTML={{ __html: `
        #${readerId} video {
          object-fit: cover !important;
          width: 100% !important;
          height: 100% !important;
          border-radius: 1.8rem !important;
        }
        #${readerId} {
          position: relative !important;
        }
      `}} />
    </div>
  );
};

export default QRScannerModal;
