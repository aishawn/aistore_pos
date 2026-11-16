export type RegisterSwitchState = {
  busy: boolean;
  checkoutRecovery: boolean;
  openAttemptPending: boolean;
  refundBusy: boolean;
  refundRecovery: boolean;
  refundOpen: boolean;
};

export function isRegisterSwitchDisabled(state: RegisterSwitchState): boolean {
  return state.busy
    || state.checkoutRecovery
    || state.openAttemptPending
    || state.refundBusy
    || state.refundRecovery
    || state.refundOpen;
}
