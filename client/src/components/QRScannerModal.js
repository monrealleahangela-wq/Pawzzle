import React, { useEffect, useState, useRef } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import { X, QrCode, User, Calendar, Clock, AlertCircle, CheckCircle, RefreshCcw } from 'lucide-react';
import axios from 'axios';
import { toast } from 'react-toastify';

const QRScannerModal = ({ isOpen, onClose, onScanSuccess }) => {
  const [scanResult, setScanResult] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState(null);
  const [isScannerStarted, setIsScannerStarted] = useState(false);
  const scannerRef = useRef(null);
  const readerId = 'qr-reader';

  useEffect(() => {
    let html5QrCode = null;
    let isMounted = true;

    const startScannerAsync = async () => {
      if (!isOpen) return;

      // Small delay for DOM to settle and modal animation to finish
      await new Promise(r => setTimeout(r, 600));
      if (!isMounted) return;

      try {
        const container = document.getElementById(readerId);
        if (!container) throw new Error('Scanner container not found');
        container.innerHTML = ''; // Clear contents

        html5QrCode = new Html5Qrcode(readerId);
        scannerRef.current = html5QrCode;

        const config = { 
          fps: 10, 
          qrbox: (viewWidth, viewHeight) => {
            const minSize = Math.min(viewWidth, viewHeight);
            const qrSize = Math.round(minSize * 0.7);
            return { width: qrSize, height: qrSize };
          },
          aspectRatio: 1.0,
          disableFlip: false
        };

        await html5QrCode.start(
          { facingMode: "environment" }, 
          config,
          (decodedText) => {
             if (isMounted) handleInternalScan(decodedText);
          },
          (errorMessage) => {
            // Silence noise
          }
        );
        
        if (isMounted) {
          setIsScannerStarted(true);
          setError(null);
          console.log("Scanner started successfully on environment camera");
        }
      } catch (err) {
        console.error('QR Scanner Start Error:', err);
        if (isMounted) {
          setIsScannerStarted(false);
          setError('Camera failure. Please ensure you are not using the camera in another app and have granted browser permissions.');
        }
      }
    };

    startScannerAsync();

    return () => {
      isMounted = false;
      if (html5QrCode && html5QrCode.isScanning) {
        html5QrCode.stop().catch(err => console.error('Cleanup Stop Error:', err));
      }
      scannerRef.current = null;
    };
  }, [isOpen]);

  const handleInternalScan = async (decodedText) => {
    if (isProcessing) return;
    
    try {
      setIsProcessing(true);
      setError(null);

      // Stop scanner before processing to free resources
      if (scannerRef.current && scannerRef.current.isScanning) {
        await scannerRef.current.stop();
        setIsScannerStarted(false);
      }

      const response = await axios.post('/api/bookings/validate-qr', { bookingId: decodedText });
      setScanResult(response.data.booking);
      toast.success('Protocol Validated');
    } catch (err) {
      console.error('Validation Error:', err);
      setError(err.response?.data?.message || 'Invalid or unregistered booking protocol');
      setIsProcessing(false);
    }
  };

  const handleReset = () => {
    setScanResult(null);
    setIsProcessing(false);
    setError(null);
    setIsScannerStarted(false);
    // Modal will re-trigger start via useEffect if isOpen
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[999] flex items-center justify-center p-4 bg-slate-900/90 animate-fade-in pb-20">
      <div className="bg-white w-full max-w-md rounded-[2.5rem] shadow-[0_30px_60px_-15px_rgba(0,0,0,0.5)] overflow-hidden animate-scale-in border border-white/20">
        {/* Header */}
        <div className="px-6 py-5 bg-slate-900 text-white flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-primary-600 rounded-xl shadow-lg ring-4 ring-primary-600/20">
              <QrCode className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-base font-black uppercase tracking-tight leading-none mb-1">Optical Scan</h3>
              <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest leading-none">
                {isScannerStarted ? 'SYSTEM LIVE' : 'INITIALIZING...'}
              </p>
            </div>
          </div>
          <button 
            onClick={onClose} 
            className="p-2 hover:bg-white/10 rounded-xl transition-colors active:scale-90"
          >
            <X className="h-6 w-6 text-white" />
          </button>
        </div>

        <div className="p-6">
          {/* Main Scanner Section */}
          {!scanResult && !error && !isProcessing && (
            <div className="space-y-6">
              <div className="relative">
                 <div 
                   id={readerId} 
                   className="overflow-hidden rounded-[2rem] border-4 border-slate-100 bg-slate-50 relative aspect-square shadow-inner min-h-[250px]"
                 >
                  {!isScannerStarted && (
                     <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-white z-20">
                        <div className="w-10 h-10 border-4 border-slate-200 border-t-primary-600 rounded-full animate-spin" />
                        <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-900">Activating Lens...</p>
                     </div>
                  )}
                </div>
                
                {isScannerStarted && (
                  <div className="absolute inset-0 pointer-events-none z-10 border-[20px] border-black/10 rounded-[2rem]">
                     <div className="w-full h-full border-2 border-white/20 rounded-2xl relative">
                        <div className="absolute top-0 left-0 w-full h-0.5 bg-gradient-to-r from-transparent via-primary-500 to-transparent animate-scan-line" />
                     </div>
                  </div>
                )}
              </div>
              
              <div className="text-center pb-4">
                <p className="text-[10px] font-black text-slate-900 uppercase tracking-widest opacity-80 leading-relaxed max-w-[220px] mx-auto">Align the QR code within the frame for real-time validation.</p>
              </div>
            </div>
          )}

          {/* Processing Hub */}
          {isProcessing && !scanResult && !error && (
            <div className="flex flex-col items-center justify-center py-16 gap-8 animate-pulse text-center">
              <div className="relative">
                <div className="w-24 h-24 border-8 border-slate-100 border-t-primary-600 rounded-full animate-spin" />
                <div className="absolute inset-0 flex items-center justify-center">
                  <RefreshCcw className="h-8 w-8 text-primary-600 animate-spin-slow" />
                </div>
              </div>
              <div>
                <p className="text-xl font-black text-slate-900 uppercase tracking-tighter mb-2">Decrypting Protocol</p>
                <div className="flex items-center gap-2 justify-center">
                  <div className="w-2 h-2 rounded-full bg-primary-600 animate-bounce" />
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Validating with server...</p>
                </div>
              </div>
            </div>
          )}

          {/* Result Card: Success */}
          {scanResult && (
            <div className="bg-emerald-50 rounded-[2.5rem] p-8 border border-emerald-100 animate-fade-in">
              <div className="flex flex-col items-center text-center space-y-6">
                <div className="w-20 h-20 bg-white rounded-full flex items-center justify-center shadow-xl shadow-emerald-900/10 scale-110 animate-bounce">
                  <CheckCircle className="h-10 w-10 text-emerald-500" />
                </div>
                <div className="space-y-4 w-full">
                  <div>
                    <h4 className="text-2xl font-black text-slate-900 uppercase tracking-tight leading-none mb-1">Scan Verified</h4>
                    <p className="text-[10px] font-black text-emerald-600 uppercase tracking-[0.3em]">Protocol Authorized</p>
                  </div>
                  
                  <div className="space-y-3 bg-white p-6 rounded-3xl border border-emerald-100/50 shadow-sm">
                    <div className="flex items-center gap-4 text-left">
                       <div className="w-10 h-10 bg-slate-50 rounded-xl flex items-center justify-center">
                          <User className="h-5 w-5 text-slate-400" />
                       </div>
                       <div className="min-w-0">
                          <p className="text-[12px] font-black text-slate-900 uppercase truncate">{scanResult.customer?.firstName} {scanResult.customer?.lastName}</p>
                          <p className="text-[9px] font-bold text-slate-400 uppercase">Lead Client</p>
                       </div>
                    </div>
                    <div className="h-px bg-slate-50 w-full" />
                    <div className="flex justify-between items-center text-[10px] font-black uppercase tracking-tight">
                       <div className="flex items-center gap-2 text-slate-500"><Calendar className="h-3.5 w-3.5" /> Date</div>
                       <div className="text-slate-900">{new Date(scanResult.bookingDate).toLocaleDateString()}</div>
                    </div>
                  </div>

                  <button 
                    onClick={() => {
                      onScanSuccess();
                      onClose();
                    }}
                    className="w-full py-4 bg-slate-900 text-white rounded-2xl text-[10px] font-black uppercase tracking-[0.2em] shadow-2xl hover:bg-emerald-600 transition-all flex items-center justify-center gap-3 active:scale-95"
                  >
                    CONTINUE TO PROTOCOL <RefreshCcw className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Result Card: Error */}
          {error && (
            <div className="bg-rose-50 rounded-[2.5rem] p-8 border border-rose-100 animate-fade-in">
              <div className="flex flex-col items-center text-center space-y-6">
                <div className="w-20 h-20 bg-white rounded-full flex items-center justify-center shadow-xl shadow-rose-900/10">
                  <AlertCircle className="h-10 w-10 text-rose-500" />
                </div>
                <div className="space-y-6">
                  <div>
                    <h4 className="text-2xl font-black text-slate-900 uppercase tracking-tight leading-none mb-1">Scan Failure</h4>
                    <p className="text-[10px] font-black text-rose-600 uppercase tracking-[0.3em]">Protocol Rejection</p>
                  </div>
                  <p className="text-[11px] font-bold text-slate-500 uppercase leading-relaxed max-w-[240px] mx-auto italic opacity-80">"{error}"</p>
                  
                  <div className="flex gap-3">
                    <button 
                      onClick={handleReset}
                      className="flex-1 py-4 bg-white border-2 border-rose-200 text-rose-600 rounded-2xl text-[10px] font-black uppercase tracking-[0.2em] hover:bg-rose-50 transition-all active:scale-95 flex items-center justify-center gap-2"
                    >
                      RETRY SCAN
                    </button>
                    <button 
                      onClick={onClose}
                      className="flex-1 py-4 bg-slate-900 text-white rounded-2xl text-[10px] font-black uppercase tracking-[0.2em] hover:bg-slate-800 transition-all active:scale-95"
                    >
                      EXIT HUD
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default QRScannerModal;
