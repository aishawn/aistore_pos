import assert from "node:assert/strict";
import test from "node:test";
import { isRegisterSwitchDisabled } from "./register-switch.ts";

const idle = {
  busy: false,
  checkoutRecovery: false,
  openAttemptPending: false,
  refundBusy: false,
  refundRecovery: false,
  refundOpen: false,
};

test("register selection is available when no sale or refund work is active", () => {
  assert.equal(isRegisterSwitchDisabled(idle), false);
});

test("register selection is blocked while a refund is pending or being edited", () => {
  assert.equal(isRegisterSwitchDisabled({ ...idle, refundBusy: true }), true);
  assert.equal(isRegisterSwitchDisabled({ ...idle, refundRecovery: true }), true);
  assert.equal(isRegisterSwitchDisabled({ ...idle, refundOpen: true }), true);
});

test("register selection is blocked while checkout or register open is unresolved", () => {
  assert.equal(isRegisterSwitchDisabled({ ...idle, checkoutRecovery: true }), true);
  assert.equal(isRegisterSwitchDisabled({ ...idle, openAttemptPending: true }), true);
  assert.equal(isRegisterSwitchDisabled({ ...idle, busy: true }), true);
});
