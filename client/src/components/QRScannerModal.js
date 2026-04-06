import React, { useEffect, useState, useRef } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import { X, QrCode, User, Dog, Calendar, Clock, AlertCircle, CheckCircle, RefreshCcw } from 'lucide-react';
import axios from 'axios';
import { toast } from 'react-toastify';

const QRScannerModal = ({ isOpen, onClose, onScanSuccess }) => {
  const [scanResult, setScanResult] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState(null);
  const [isScannerStarted, setIsScannerStarted] = useState(false);
  const scannerRef = useRef(null);
  const readerId = 'qr-reader';

  const startScanner = async () => {
    try {
      if (scannerRef.current) {
        await stopScanner();
      }

      const html5QrCode = new Html5Qrcode(readerId);
      scannerRef.current = html5QrCode;

      const config = { 
        fps: 10, 
        qrbox: { width: 250, height: 250 } 
      };

      await html5QrCode.start(
        { facingMode: "environment" }, 
        config,
        onScan
      );
      setIsScannerStarted(true);
      setError(null);
    } catch (err) {
      console.error('Failed to start scanner:', err);
      setError('Camera access denied or device not found');
    }
  };

  const stopScanner = async () => {
    if (scannerRef.current && scannerRef.current.isScanning) {
      try {
        await scannerRef.current.stop();
        scannerRef.current = null;
        setIsScannerStarted(false);
      } catch (err) {
        console.error('Failed to stop scanner:', err);
      }
    }
  };

  const onScan = async (decodedText) => {
    try {
      await stopScanner();
      setIsProcessing(true);
      setError(null);

      const response = await axios.post('/api/bookings/validate-qr', { bookingId: decodedText });
      setScanResult(response.data.bookingInfo);
      toast.success('Check-in Successful!');
      if (onScanSuccess) onScanSuccess();
    } catch (err) {
      console.error('Scan Error:', err);
      setError(err.response?.data?.message || 'Invalid or Expired QR Code');
    } finally {
      setIsProcessing(false);
    }
  };

  useEffect(() => {
    let scanInstance = null;

    const init = async () => {
      if (isOpen) {
        // Small delay to ensure DOM is ready and previous instances are fully cleaned up
        await new Promise(r => setTimeout(r, 400));
        
        try {
          // Initialize scanner instance
          const html5QrCode = new Html5Qrcode(readerId);
          scannerRef.current = html5QrCode;
          scanInstance = html5QrCode;

          const config = { 
            fps: 15, 
            qrbox: { width: 250, height: 250 },
            aspectRatio: 1.0
          };

          await html5QrCode.start(
            { facingMode: "environment" }, 
            config,
            onScan
          );
          setIsScannerStarted(true);
          setError(null);
        } catch (err) {
          console.error('Failed to start scanner:', err);
          setIsScannerStarted(false);
          setError('Camera access denied or device not found. Please ensure you have granted permission.');
        }
      }
    };

    init();

    return () => {
      if (scanInstance && scanInstance.isScanning) {
        scanInstance.stop().then(() => {
          setIsScannerStarted(false);
          scannerRef.current = null;
        }).catch(err => console.error('Cleanup error:', err));
      }
    };
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-md animate-fade-in">
      <div className="bg-white w-full max-w-md rounded-[2.5rem] shadow-[0_20px_50px_rgba(0,0,0,0.2)] overflow-hidden animate-scale-in border border-slate-100/50">
        {/* Header */}
        <div className="px-8 py-6 bg-slate-900 text-white flex items-center justify-between relative overflow-hidden">
          <div className="absolute top-0 right-0 w-32 h-32 bg-primary-500/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2" />
          <div className="flex items-center gap-3 relative z-10">
            <div className="p-2 bg-primary-500 rounded-xl shadow-lg shadow-primary-500/20 ring-4 ring-primary-500/10">
              <QrCode className="h-5 w-5 text-white" />
            </div>
            <div>
              <h3 className="text-lg font-black uppercase tracking-tight leading-none mb-1">Service Scan</h3>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest leading-none">Booking Validator v2.1</p>
            </div>
          </div>
          <button 
            onClick={onClose} 
            className="p-2 hover:bg-white/10 rounded-xl transition-colors relative z-10 active:scale-90"
          >
            <X className="h-6 w-6" />
          </button>
        </div>

        <div className="p-8">
          {/* CRITICAL: The scanner container MUST be always present in the DOM when open to avoid "White Screen" or "Lost Target" errors */}
          <div className={`space-y-6 ${(scanResult || error || isProcessing) ? 'hidden' : 'block'}`}>
            <div className="relative group">
               {/* Decorative border */}
               <div id={readerId} className="overflow-hidden rounded-[2.2rem] border-4 border-slate-100 bg-slate-50 relative aspect-square shadow-inner transition-all group-hover:border-primary-500/20 lg:min-h-[300px]">
                {!isScannerStarted && (
                   <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-slate-50/50 backdrop-blur-sm z-10">
                      <div className="relative">
                        <div className="w-12 h-12 border-4 border-slate-200 border-t-primary-500 rounded-full animate-spin" />
                        <div className="absolute inset-0 flex items-center justify-center">
                           <QrCode className="h-5 w-5 text-primary-500/50" />
                        </div>
                      </div>
                      <div className="text-center">
                        <p className="text-[10px] font-black uppercase tracking-widest text-slate-900">Activating Optical Lens</p>
                        <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mt-1">Please Wait...</p>
                      </div>
                   </div>
                )}
              </div>
              
              {/* Scan Overlay UI */}
              {isScannerStarted && (
                <div className="absolute inset-0 pointer-events-none z-10 border-[30px] border-black/20 rounded-[2.2rem]">
                  <div className="w-full h-full border-2 border-white/50 rounded-2xl relative">
                    {/* Corner corners */}
                    <div className="absolute -top-1 -left-1 w-6 h-6 border-t-4 border-l-4 border-primary-500 rounded-tl-lg" />
                    <div className="absolute -top-1 -right-1 w-6 h-6 border-t-4 border-r-4 border-primary-500 rounded-tr-lg" />
                    <div className="absolute -bottom-1 -left-1 w-6 h-6 border-b-4 border-l-4 border-primary-500 rounded-bl-lg" />
                    <div className="absolute -bottom-1 -right-1 w-6 h-6 border-b-4 border-r-4 border-primary-500 rounded-br-lg" />
                    
                    {/* Scanning animation line */}
                    <div className="absolute top-0 left-0 w-full h-0.5 bg-gradient-to-r from-transparent via-primary-500 to-transparent animate-scan-line" />
                  </div>
                </div>
              )}
            </div>
            
            <div className="text-center">
              <p className="text-xs font-black text-slate-900 uppercase tracking-widest mb-1.5 flex items-center justify-center gap-2">
                <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" /> Position QR Code
              </p>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest leading-relaxed max-w-[200px] mx-auto opacity-70">Detection is fully automated. Keep the code within the frame.</p>
            </div>
          </div>

          {isProcessing && (
            <div className="flex flex-col items-center justify-center py-16 gap-8 animate-in fade-in zoom-in-95 duration-300">
              <div className="relative">
                <div className="w-20 h-20 border-8 border-slate-100 border-t-primary-500 rounded-full animate-spin" />
                <div className="absolute inset-0 flex items-center justify-center">
                  <RefreshCcw className="h-6 w-6 text-primary-500 animate-pulse" />
                </div>
              </div>
              <p className="text-[11px] font-black uppercase tracking-[0.3em] text-slate-900 animate-pulse">Verifying Credentials</p>
            </div>
          )}

          {scanResult && (
            <div className="space-y-6 animate-slide-up">
              <div className="bg-emerald-50 border border-emerald-100 p-8 rounded-[2rem] flex flex-col items-center text-center gap-4 shadow-sm">
                <div className="w-20 h-20 bg-emerald-500 rounded-[2rem] flex items-center justify-center shadow-xl shadow-emerald-500/20 transform rotate-3">
                  <CheckCircle className="h-10 w-10 text-white" />
                </div>
                <div>
                  <h4 className="text-2xl font-black text-emerald-900 uppercase tracking-tighter mb-1">Approved</h4>
                  <p className="text-[10px] font-bold text-emerald-600 uppercase tracking-widest">Client Authenticated Successfully</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <InfoCard icon={<User className="h-3.5 w-3.5" />} label="Customer" value={scanResult.customerName} />
                <InfoCard icon={<Dog className="h-3.5 w-3.5" />} label="Pet Name" value={scanResult.petName} />
                <InfoCard icon={<Calendar className="h-3.5 w-3.5" />} label="Service" value={scanResult.service} />
                <InfoCard icon={<Clock className="h-3.5 w-3.5" />} label="Scheduled" value={scanResult.time} />
              </div>

              <button 
                onClick={() => {
                  setScanResult(null);
                  onClose();
                }} 
                className="w-full py-5 bg-slate-900 text-white rounded-[1.5rem] text-[10px] font-black uppercase tracking-[0.2em] hover:bg-primary-600 transition-all shadow-xl shadow-slate-900/10 active:scale-[0.98]"
              >
                Done & Continue
              </button>
            </div>
          )}

          {error && !isProcessing && (
            <div className="space-y-6 animate-slide-up">
              <div className="bg-rose-50 border border-rose-100 p-8 rounded-[2rem] flex flex-col items-center text-center gap-4 shadow-sm">
                <div className="w-20 h-20 bg-rose-500 rounded-[2rem] flex items-center justify-center shadow-xl shadow-rose-500/20 transform -rotate-3">
                  <AlertCircle className="h-10 w-10 text-white" />
                </div>
                <div>
                  <h4 className="text-2xl font-black text-rose-900 uppercase tracking-tighter mb-1">Access Denied</h4>
                  <p className="text-[10px] font-black text-rose-600 uppercase tracking-widest opacity-80 leading-relaxed max-w-[200px]">{error}</p>
                </div>
              </div>
              <button 
                onClick={() => {
                    setError(null);
                    setScanResult(null);
                    startScanner();
                }} 
                className="w-full py-5 bg-slate-100 text-slate-800 rounded-[1.5rem] text-[10px] font-black uppercase tracking-[0.2em] hover:bg-slate-200 transition-all flex items-center justify-center gap-3 active:scale-[0.98]"
              >
                <RefreshCcw className="h-4 w-4" /> Try Again
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

const InfoCard = ({ icon, label, value }) => (
  <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100 space-y-1">
    <div className="flex items-center gap-2 text-slate-400">
      {icon}
      <span className="text-[8px] font-black uppercase tracking-widest">{label}</span>
    </div>
    <p className="text-[11px] font-bold text-slate-800 break-words">{value}</p>
  </div>
);

export default QRScannerModal;
