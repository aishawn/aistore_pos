import assert from "node:assert/strict";
import test from "node:test";
import {
  clearPendingRegisterOpen,
  readPendingRegisterOpen,
  savePendingRegisterOpen,
  type PendingRegisterOpenAttempt,
} from "./register-open-attempt.ts";

function createStorage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
  };
}

const attempt: PendingRegisterOpenAttempt = {
  key: "attempt-1",
  userId: "user-1",
  outletId: 87,
  registerId: 12,
  openingFloat: 150,
};

test("pending register open restores only for the same user and outlet", () => {
  const storage = createStorage();
  savePendingRegisterOpen(storage, attempt);
  assert.deepEqual(readPendingRegisterOpen(storage, "user-1", 87), attempt);
  assert.equal(readPendingRegisterOpen(storage, "user-1", 1), null);
  assert.equal(storage.getItem("orithos.native-register-open.pending.v1"), null);
});

test("malformed pending register open data is cleared", () => {
  const storage = createStorage();
  storage.setItem("orithos.native-register-open.pending.v1", JSON.stringify({ ...attempt, registerId: 0 }));
  assert.equal(readPendingRegisterOpen(storage, "user-1", 87), null);
  assert.equal(storage.getItem("orithos.native-register-open.pending.v1"), null);
});

test("clearing a pending register open removes the saved attempt", () => {
  const storage = createStorage();
  savePendingRegisterOpen(storage, attempt);
  clearPendingRegisterOpen(storage);
  assert.equal(readPendingRegisterOpen(storage, "user-1", 87), null);
});
