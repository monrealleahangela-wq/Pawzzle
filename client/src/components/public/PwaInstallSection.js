import React from 'react';
import { CheckCircle2, Download, Globe2, MoreVertical, Share2, Smartphone } from 'lucide-react';
import usePwaInstall from '../../hooks/usePwaInstall';
import { manualInstallInstructions } from '../../pwa/installPrompt';
import '../../styles/PwaInstallSection.css';

export const PAWZZLE_ANDROID_APK_PATH = '/downloads/Pawzzle-Android.apk';

const PwaInstallSection = () => {
  const { canPrompt, installed, isPrompting, lastOutcome, platform, promptInstall } = usePwaInstall();
  const instructions = manualInstallInstructions(platform);
  const showManualInstructions = !installed && !canPrompt && lastOutcome !== 'accepted';

  return (
    <section className="landing-install-section" aria-labelledby="landing-install-title">
      <div className="landing-shell">
        <div className="landing-install-card">
          <div className="landing-install-visual" aria-hidden="true">
            <span className="landing-install-orbit landing-install-orbit-one" />
            <span className="landing-install-orbit landing-install-orbit-two" />
            <div className="landing-install-phone">
              <span className="landing-install-phone-speaker" />
              <img src="/images/logo.png" alt="" />
              <strong>Pawzzle</strong>
              <small>Pet life, connected.</small>
            </div>
          </div>

          <div className="landing-install-copy">
            <p className="landing-eyebrow">Pawzzle for Android</p>
            <h2 id="landing-install-title">Download the Pawzzle Android App</h2>
            <p className="landing-install-intro">
              Download Pawzzle directly from this website and install it on an Android phone or tablet.
              The browser version remains available if you prefer not to install the APK.
            </p>

            <div className="landing-install-benefits" aria-label="Pawzzle Android app details">
              <span><Smartphone aria-hidden="true" /> Android 7.0 or newer</span>
              <span><Download aria-hidden="true" /> Direct APK download</span>
              <span><CheckCircle2 aria-hidden="true" /> 12.9 MB beta</span>
            </div>

            <div className="landing-install-action" aria-live="polite">
              <a
                href={PAWZZLE_ANDROID_APK_PATH}
                download="Pawzzle-Android.apk"
                className="landing-install-button landing-install-apk-button"
                aria-label="Download Pawzzle Android APK"
              >
                <Download aria-hidden="true" /> Download Android APK
              </a>
              <p className="landing-install-apk-note">
                Android may ask you to allow installs from your browser. For your security, only install the
                Pawzzle APK downloaded from pawzzle.io.
              </p>

              <div className="landing-install-browser-option">
                <div className="landing-install-browser-heading">
                  <Globe2 aria-hidden="true" />
                  <span>
                    <strong>Prefer the browser version?</strong>
                    <small>Add Pawzzle to your home screen without downloading the APK.</small>
                  </span>
                </div>

                {installed ? (
                  <div className="landing-install-success"><CheckCircle2 aria-hidden="true" /><span><strong>Pawzzle is installed</strong><small>Open it from your device home screen or app launcher.</small></span></div>
                ) : canPrompt ? (
                  <button type="button" onClick={promptInstall} disabled={isPrompting} className="landing-install-button landing-install-button-secondary">
                    <Smartphone aria-hidden="true" /> {isPrompting ? 'Opening install prompt...' : 'Add Pawzzle to home screen'}
                  </button>
                ) : lastOutcome === 'accepted' ? (
                  <div className="landing-install-success"><CheckCircle2 aria-hidden="true" /><span><strong>Installation started</strong><small>Finish the browser confirmation to add Pawzzle.</small></span></div>
                ) : null}

                {showManualInstructions && (
                  <div className="landing-install-manual">
                    <div className="landing-install-manual-heading">
                      {platform === 'ios' ? <Share2 aria-hidden="true" /> : <MoreVertical aria-hidden="true" />}
                      <span><strong>Install from your browser menu</strong><small>The automatic prompt is not available in this browser right now.</small></span>
                    </div>
                    <ol>{instructions.map(instruction => <li key={instruction}>{instruction}</li>)}</ol>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default PwaInstallSection;
