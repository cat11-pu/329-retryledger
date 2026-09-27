import assert from "node:assert";
import { bumpFail, clearFail } from "../retry.js";
import { step, close } from "../retryrun.js";
import { render } from "../app.js";

const base = {
  budget: 1, limit: 2,
  state: { fails: [["t1", 0]], pending: [], dead: [], ledger: [], applied: [] },
  events: [{ id: 1, kind: "fail", task: "t1" }],
  task_error_code: "E_NO_TASK", dead_error_code: "E_DEAD",
  event_error_code: "E_BAD_EVENT"
};

let failed = 0;
function check(name, fn) {
  try { fn(); console.log("ok " + name); } catch (e) { failed += 1; console.log("FAIL " + name + " :: " + e.message); }
}

check("bumpFail returns rows", () => {
  assert.ok(Array.isArray(bumpFail([["z", 0]], "z")));
});

check("clearFail returns rows", () => {
  assert.ok(Array.isArray(clearFail([["z", 3]], "z")));
});

check("step returns a state", () => {
  assert.strictEqual(typeof step(base).state, "object");
});

check("close returns a state", () => {
  assert.strictEqual(typeof close(base).state, "object");
});

check("render counts events", () => {
  assert.strictEqual(typeof render(base).count, "number");
});

console.log("5 cases, " + failed + " failed");
process.exit(failed === 0 ? 0 : 1);
