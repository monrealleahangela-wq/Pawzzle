let activeHost = null;
let requestId = 0;
const pendingRequests = [];

export const registerPawzzleDialogHost = handler => {
  activeHost = handler;
  pendingRequests.splice(0).forEach(request => handler(request));

  return () => {
    if (activeHost === handler) activeHost = null;
  };
};

const requestDialog = config => new Promise(resolve => {
  const request = { ...config, id: ++requestId, resolve };
  if (activeHost) activeHost(request);
  else pendingRequests.push(request);
});

export const pawzzleAlert = (message, options = {}) => requestDialog({
  ...options,
  kind: 'alert',
  message
});

export const pawzzleConfirm = (message, options = {}) => requestDialog({
  ...options,
  kind: 'confirm',
  message
});

export const pawzzlePrompt = (message, options = {}) => requestDialog({
  ...options,
  kind: 'prompt',
  message
});

export const resetPawzzleDialogsForTests = () => {
  activeHost = null;
  pendingRequests.splice(0).forEach(request => request.resolve(
    request.kind === 'confirm' ? false : request.kind === 'prompt' ? null : undefined
  ));
};
