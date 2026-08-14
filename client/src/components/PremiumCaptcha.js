import React, { useEffect, useRef } from 'react';
import ReCAPTCHA from 'react-google-recaptcha';
import { AlertCircle } from 'lucide-react';

const GOOGLE_TEST_SITE_KEY = '6LeIxAcTAAAAAJcZVRqyHh71UMIEGNQ_MXjiZKhI';

const PremiumCaptcha = ({ onVerify, theme = 'light', resetKey = 0 }) => {
  const captchaRef = useRef(null);
  const configuredKey = process.env.REACT_APP_RECAPTCHA_SITE_KEY;
  const siteKey = process.env.NODE_ENV === 'production'
    ? configuredKey
    : (configuredKey || GOOGLE_TEST_SITE_KEY);
  const securelyConfigured = Boolean(siteKey) && (
    process.env.NODE_ENV !== 'production' || siteKey !== GOOGLE_TEST_SITE_KEY
  );

  useEffect(() => {
    captchaRef.current?.reset();
  }, [resetKey]);

  if (!securelyConfigured) {
    return (
      <div className="w-full max-w-[304px] min-h-[64px] rounded-xl border border-rose-200 bg-rose-50 px-3 py-2.5 flex items-center gap-2 text-rose-700">
        <AlertCircle className="h-4 w-4 shrink-0" />
        <p className="text-[10px] font-bold leading-snug">Security verification is not configured. Please contact support.</p>
      </div>
    );
  }

  return (
    <div className="w-full max-w-[304px] overflow-hidden rounded-lg">
      <ReCAPTCHA
        ref={captchaRef}
        sitekey={siteKey}
        theme={theme === 'dark' ? 'dark' : 'light'}
        onChange={token => onVerify?.(token || null)}
        onExpired={() => onVerify?.(null)}
        onErrored={() => onVerify?.(null)}
      />
    </div>
  );
};

export default PremiumCaptcha;
