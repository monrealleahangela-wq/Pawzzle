import React, { useEffect, useRef, useState } from 'react';
import ReCAPTCHA from 'react-google-recaptcha';
import { AlertCircle, Loader2 } from 'lucide-react';
import { api } from '../services/apiService';

const GOOGLE_TEST_SITE_KEY = '6LeIxAcTAAAAAJcZVRqyHh71UMIEGNQ_MXjiZKhI';

const usableSiteKey = (key) => Boolean(key) && (
  process.env.NODE_ENV !== 'production' || key !== GOOGLE_TEST_SITE_KEY
);

const PremiumCaptcha = ({ onVerify, theme = 'light', resetKey = 0 }) => {
  const captchaRef = useRef(null);
  const configuredKey = process.env.REACT_APP_RECAPTCHA_SITE_KEY;
  const initialSiteKey = usableSiteKey(configuredKey)
    ? configuredKey
    : (process.env.NODE_ENV === 'production' ? null : GOOGLE_TEST_SITE_KEY);
  const [siteKey, setSiteKey] = useState(initialSiteKey);
  const [configState, setConfigState] = useState(initialSiteKey ? 'ready' : 'loading');

  useEffect(() => {
    if (initialSiteKey) return undefined;

    let active = true;
    api.get('/public/captcha-config')
      .then(({ data }) => {
        if (!active) return;
        if (data?.configured && usableSiteKey(data.siteKey)) {
          setSiteKey(data.siteKey);
          setConfigState('ready');
        } else {
          setConfigState('unavailable');
          onVerify?.(null);
        }
      })
      .catch(() => {
        if (!active) return;
        setConfigState('unavailable');
        onVerify?.(null);
      });

    return () => { active = false; };
  }, [initialSiteKey, onVerify]);

  useEffect(() => {
    captchaRef.current?.reset();
  }, [resetKey]);

  if (configState === 'loading') {
    return (
      <div className="w-full max-w-[304px] min-h-[64px] rounded-xl border border-stone-200 bg-white px-3 py-2.5 flex items-center gap-2 text-stone-600">
        <Loader2 className="h-4 w-4 shrink-0 animate-spin" />
        <p className="text-[10px] font-bold leading-snug">Loading security verification...</p>
      </div>
    );
  }

  if (configState === 'unavailable' || !siteKey) {
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
