import React from 'react';
import { CheckCircle2, Download, Globe2, MoreVertical, Share2, Smartphone } from 'lucide-react';
import usePwaInstall from '../../hooks/usePwaInstall';
import { manualInstallInstructions } from '../../pwa/installPrompt';
import '../../styles/PwaInstallSection.css';

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
            <p className="landing-eyebrow">Pawzzle on your home screen</p>
            <h2 id="landing-install-title">Download the Pawzzle App</h2>
            <p className="landing-install-intro">Install Pawzzle directly from this website for an app-like experience. There is no APK to download, and updates arrive through the shared Pawzzle web link.</p>

            <div className="landing-install-benefits" aria-label="Pawzzle web app benefits">
              <span><Globe2 aria-hidden="true" /> Uses pawzzle.io</span>
              <span><Smartphone aria-hidden="true" /> Adds a home-screen icon</span>
              <span><CheckCircle2 aria-hidden="true" /> No APK required</span>
            </div>

            <div className="landing-install-action" aria-live="polite">
              {installed ? (
                <div className="landing-install-success"><CheckCircle2 aria-hidden="true" /><span><strong>Pawzzle is installed</strong><small>Open it from your device home screen or app launcher.</small></span></div>
              ) : canPrompt ? (
                <button type="button" onClick={promptInstall} disabled={isPrompting} className="landing-install-button">
                  <Download aria-hidden="true" /> {isPrompting ? 'Opening install prompt…' : 'Install Pawzzle'}
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
    </section>
  );
};

export default PwaInstallSection;
