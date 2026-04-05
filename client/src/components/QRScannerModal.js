import React, { useEffect, useState } from 'react';
import { Html5QrcodeScanner } from 'html5-qrcode';
import { X, QrCode, User, Dog, Calendar, Clock, AlertCircle, CheckCircle } from 'lucide-react';
import axios from 'axios';
import { toast } from 'react-toastify';

const QRScannerModal = ({ isOpen, onClose, onScanSuccess }) => {
  const [scanResult, setScanResult] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!isOpen) return;

    const scanner = new Html5QrcodeScanner('qr-reader', {
      fps: 10,
      qrbox: { width: 250, height: 250 },
    });

    const onScan = async (decodedText) => {
      try {
        scanner.clear();
        setIsProcessing(true);
        setError(null);

        // Expecting decodedText to be the booking ID
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

    scanner.render(onScan, (err) => {
        // Only log critical errors to console to avoid spam
        if (err?.includes('NotFoundException')) return;
    });

    return () => {
      scanner.clear().catch(e => console.log('Clean error:', e));
    };
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
      <div className="bg-white w-full max-w-md rounded-[2.5rem] shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-300">
        {/* Header */}
        <div className="px-8 py-6 bg-slate-900 text-white flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-primary-500 rounded-xl">
              <QrCode className="h-5 w-5 text-white" />
            </div>
            <div>
              <h3 className="text-lg font-black uppercase tracking-tight leading-none mb-1">Service Scan</h3>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest italic">Booking Validator v1.0</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-xl transition-colors">
            <X className="h-6 w-6" />
          </button>
        </div>

        <div className="p-8">
          {!scanResult && !error && (
            <div className="space-y-6">
              <div id="qr-reader" className="overflow-hidden rounded-2xl border-2 border-dashed border-slate-200"></div>
              <div className="text-center">
                <p className="text-xs font-bold text-slate-500 uppercase tracking-widest">Position QR Code within the frame</p>
                <p className="text-[10px] text-slate-400 mt-1">Scanner will auto-detect and validate your booking.</p>
              </div>
            </div>
          )}

          {isProcessing && (
            <div className="flex flex-col items-center justify-center py-12 gap-4">
              <div className="w-12 h-12 border-4 border-primary-500 border-t-transparent rounded-full animate-spin"></div>
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 animate-pulse">Verifying Credentials...</p>
            </div>
          )}

          {scanResult && (
            <div className="space-y-6 animate-in slide-in-from-bottom-4 duration-500">
              <div className="bg-emerald-50 border border-emerald-100 p-6 rounded-3xl flex flex-col items-center text-center gap-4">
                <div className="w-16 h-16 bg-emerald-500 rounded-full flex items-center justify-center shadow-lg shadow-emerald-200">
                  <CheckCircle className="h-8 w-8 text-white" />
                </div>
                <div>
                  <h4 className="text-lg font-black text-emerald-900 uppercase tracking-tight">Approved!</h4>
                  <p className="text-[10px] font-bold text-emerald-600 uppercase tracking-widest">Scanned within 30-min window.</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <InfoCard icon={<User className="h-4 w-4" />} label="Customer" value={scanResult.customerName} />
                <InfoCard icon={<Dog className="h-4 w-4" />} label="Pet Name" value={scanResult.petName} />
                <InfoCard icon={<Calendar className="h-4 w-4" />} label="Service" value={scanResult.service} />
                <InfoCard icon={<Clock className="h-4 w-4" />} label="Scheduled" value={scanResult.time} />
              </div>

              <button 
                onClick={() => {
                  setScanResult(null);
                  onClose();
                }} 
                className="w-full py-4 bg-slate-900 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-primary-600 transition-all shadow-xl active:scale-95"
              >
                Done & Continue
              </button>
            </div>
          )}

          {error && (
            <div className="space-y-6 animate-in shake duration-500">
              <div className="bg-rose-50 border border-rose-100 p-8 rounded-3xl flex flex-col items-center text-center gap-4">
                <div className="w-16 h-16 bg-rose-500 rounded-full flex items-center justify-center shadow-lg shadow-rose-200">
                  <AlertCircle className="h-8 w-8 text-white" />
                </div>
                <div>
                  <h4 className="text-lg font-black text-rose-900 uppercase tracking-tight">Access Denied</h4>
                  <p className="text-[11px] font-bold text-rose-600 uppercase tracking-widest">{error}</p>
                </div>
              </div>
              <button 
                onClick={() => {
                    setError(null);
                    setScanResult(null);
                    // Force re-render of scanner by closing/opening or similar
                }} 
                className="w-full py-4 bg-slate-100 text-slate-600 rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-slate-200 transition-all active:scale-95"
              >
                Try Again
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
