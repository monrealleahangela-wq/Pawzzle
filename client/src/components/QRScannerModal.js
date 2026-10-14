import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import { X, QrCode, ShieldCheck, Camera, Loader2 } from 'lucide-react';
import { toast } from 'react-toastify';
import { adminBookingService, api } from '../services/apiService';

const BACKUP_CODE_PATTERN = /^(?:[A-HJ-NP-Z2-9]{4}-?){3}[A-HJ-NP-Z2-9]{4}$/i;

const QRScannerModal = ({ isOpen, onClose, onScanSuccess }) => {
  const [credential, setCredential] = useState('');
  const [method, setMethod] = useState('qr');
  const [backupInput, setBackupInput] = useState('');
  const [verification, setVerification] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [cameraState, setCameraState] = useState('idle');
  const scannerRef = useRef(null);
  const mountedRef = useRef(false);
  const scanLockRef = useRef(false);

  const stopCamera = useCallback(async () => {
    const scanner = scannerRef.current;
    scannerRef.current = null;
    if (!scanner) return;
    try {
      if (scanner.isScanning) await scanner.stop();
    } catch (stopError) { /* stream may already have stopped */ }
    try { scanner.clear(); } catch (clearError) { /* detached DOM is already clear */ }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; stopCamera(); };
  }, [stopCamera]);

  useEffect(() => {
    if (!isOpen) {
      stopCamera();
      setVerification(null);
      setCredential('');
      setBackupInput('');
      setError('');
      setCameraState('idle');
      scanLockRef.current = false;
    }
  }, [isOpen, stopCamera]);

  const verify = useCallback(async (value, credentialMethod) => {
    if (busy || scanLockRef.current) return;
    const normalized = credentialMethod === 'backup_code'
      ? value.toUpperCase().replace(/[^A-Z0-9]/g, '')
      : value.trim();
    if (credentialMethod === 'backup_code' && !BACKUP_CODE_PATTERN.test(value.trim())) {
      setError('Enter the 16-character backup code shown on the customer reservation.');
      return;
    }
    scanLockRef.current = true;
    setBusy(true);
    setError('');
    setVerification(null);
    await stopCamera();
    try {
      let response;
      if (credentialMethod === 'order') {
        response = await api.post('/orders/validate-qr', { orderId: normalized });
        if (mountedRef.current) {
          setMethod('order');
          setCredential(normalized);
          setVerification({ order: response.data.order, legacyOrderFlow: true });
        }
      } else {
        response = await adminBookingService.verifyReservation(normalized, credentialMethod);
        if (mountedRef.current) {
          setMethod(credentialMethod);
          setCredential(normalized);
          setVerification(response.data.verification);
        }
      }
    } catch (requestError) {
      if (mountedRef.current) {
        setError(requestError.response?.data?.message || 'The code could not be verified. Try again.');
        setCameraState('idle');
      }
      scanLockRef.current = false;
    } finally {
      if (mountedRef.current) setBusy(false);
    }
  }, [busy, stopCamera]);

  const startCamera = useCallback(async () => {
    setError('');
    setCameraState('starting');
    try {
      await stopCamera();
      const scanner = new Html5Qrcode('reservation-qr-reader', { verbose: false });
      scannerRef.current = scanner;
      await scanner.start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: { width: 240, height: 240 }, aspectRatio: 1 },
        decoded => {
          if (scanLockRef.current) return;
          const order = decoded.startsWith('ORD-');
          verify(decoded, order ? 'order' : 'qr');
        },
        () => {}
      );
      setCameraState('ready');
    } catch (cameraError) {
      await stopCamera();
      setCameraState('error');
      if (cameraError?.name === 'NotAllowedError') setError('Camera access was denied. Allow camera access or enter the backup code.');
      else if (cameraError?.name === 'NotFoundError') setError('No camera is available on this device. Enter the backup code instead.');
      else setError('Could not start the camera. Use HTTPS or localhost, check permission, or enter the backup code.');
    }
  }, [stopCamera, verify]);

  const confirm = async () => {
    if (verification?.legacyOrderFlow) {
      onScanSuccess?.(verification.order);
      onClose();
      return;
    }
    setBusy(true);
    setError('');
    try {
      const response = await adminBookingService.checkIn(verification.bookingId, credential, method);
      toast.success(response.data.message || 'Pet checked in.');
      onScanSuccess?.(response.data);
      onClose();
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'Check-in could not be recorded. Verify the code again.');
      setVerification(null);
      setCredential('');
      setCameraState('idle');
      scanLockRef.current = false;
    } finally {
      setBusy(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-950/80 p-3" role="presentation">
      <section role="dialog" aria-modal="true" aria-labelledby="reservation-scanner-title" className="flex max-h-[calc(100dvh-1.5rem)] w-full max-w-lg flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        <header className="flex shrink-0 items-center justify-between border-b p-4">
          <div className="flex items-center gap-3"><QrCode className="h-6 w-6 text-primary-700" /><div><h2 id="reservation-scanner-title" className="font-black text-slate-900">Reservation check-in</h2><p className="text-xs text-slate-500">Verification does not check in the pet until confirmed.</p></div></div>
          <button type="button" aria-label="Close reservation scanner" onClick={onClose} className="grid h-10 w-10 place-items-center rounded-lg hover:bg-slate-100"><X /></button>
        </header>
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
          {!verification && <>
            <div id="reservation-qr-reader" className="mx-auto min-h-20 w-full max-w-sm overflow-hidden rounded-xl bg-slate-950" aria-label="QR camera preview" />
            {cameraState !== 'ready' && <button type="button" onClick={startCamera} disabled={busy || cameraState === 'starting'} className="flex w-full items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 py-3 font-bold text-white disabled:opacity-60"><Camera className="h-4 w-4" />{cameraState === 'starting' ? 'Starting camera…' : 'Start camera'}</button>}
            {busy && <p role="status" className="flex items-center justify-center gap-2 text-sm text-slate-600"><Loader2 className="h-4 w-4 animate-spin" />Verifying credential…</p>}
            <form onSubmit={event => { event.preventDefault(); verify(backupInput, 'backup_code'); }} className="space-y-2 border-t pt-4">
              <label htmlFor="reservation-backup-code" className="text-sm font-bold text-slate-800">Or enter the customer’s backup code</label>
              <input id="reservation-backup-code" autoComplete="off" inputMode="text" maxLength={19} value={backupInput} onChange={event => setBackupInput(event.target.value.toUpperCase())} placeholder="ABCD-EFGH-JKLM-NPQR" className="w-full rounded-xl border border-slate-300 px-3 py-3 font-mono tracking-widest" />
              <button type="submit" disabled={busy} className="w-full rounded-xl border border-slate-300 px-4 py-3 font-bold text-slate-800 disabled:opacity-50">Verify backup code</button>
            </form>
          </>}
          {verification && <div className="space-y-4 rounded-xl border border-emerald-200 bg-emerald-50 p-4">
            <div className="flex items-center gap-2 font-black text-emerald-800"><ShieldCheck className="h-5 w-5" />Credential verified</div>
            {verification.legacyOrderFlow ? <p className="text-sm text-emerald-900">Order QR validated using the existing workflow.</p> : <dl className="grid grid-cols-2 gap-3 text-sm">
              <div><dt className="text-xs text-slate-500">Booking</dt><dd className="font-bold">#{verification.reference}</dd></div>
              <div><dt className="text-xs text-slate-500">Pet</dt><dd className="font-bold">{verification.pet}</dd></div>
              <div><dt className="text-xs text-slate-500">Service</dt><dd className="font-bold">{verification.service}</dd></div>
              <div><dt className="text-xs text-slate-500">Time</dt><dd className="font-bold">{verification.startTime}–{verification.endTime}</dd></div>
              <div className="col-span-2"><dt className="text-xs text-slate-500">Store</dt><dd className="font-bold">{verification.store}</dd></div>
            </dl>}
            <button type="button" disabled={busy} onClick={confirm} className="w-full rounded-xl bg-emerald-700 px-4 py-3 font-black text-white disabled:opacity-50">{busy ? 'Confirming…' : verification.legacyOrderFlow ? 'Continue' : 'Confirm check-in'}</button>
            <button type="button" disabled={busy} onClick={() => { setVerification(null); setCredential(''); setBackupInput(''); scanLockRef.current = false; }} className="w-full rounded-xl border border-emerald-300 px-4 py-2 text-sm font-bold text-emerald-900">Scan another reservation</button>
          </div>}
          {error && <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">{error}</p>}
        </div>
      </section>
    </div>
  );
};

export default QRScannerModal;
