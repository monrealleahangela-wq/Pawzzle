// Private Mongoose middleware capability used only by the activation service.
// Ordinary policy update calls cannot transition a draft to active.
module.exports = Object.freeze({
  localKey: Symbol('leave-policy-activation-service'),
  optionName: '__pawzzleLeavePolicyActivation',
  token: Symbol('authorized-leave-policy-activation')
});
