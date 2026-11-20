const restoreSubscriptionAccess = store => {
  store.subscriptionAccessStatus = store.subscriptionBillingInterval === 'trial' ? 'trial' : 'active';
  store.subscriptionSuspendedAt = undefined;
  store.subscriptionSuspensionReason = undefined;
  if (store.subscriptionLifecycle) {
    store.subscriptionLifecycle.suspensionNoticeSentAt = undefined;
  }
  if (store.vacationMode?.source === 'subscription') {
    store.vacationMode = {
      isActive: false,
      source: undefined,
      reason: undefined,
      startedAt: store.vacationMode.startedAt,
      endedAt: new Date()
    };
  }
  return store;
};

module.exports = { restoreSubscriptionAccess };
