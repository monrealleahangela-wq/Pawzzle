import { useEffect, useState } from 'react';
import {
  getPwaInstallState,
  initializePwaInstall,
  requestPwaInstall,
  subscribePwaInstall
} from '../pwa/installPrompt';

export default function usePwaInstall() {
  const [installState, setInstallState] = useState(getPwaInstallState);

  useEffect(() => {
    initializePwaInstall();
    setInstallState(getPwaInstallState());
    return subscribePwaInstall(setInstallState);
  }, []);

  return { ...installState, promptInstall: requestPwaInstall };
}
