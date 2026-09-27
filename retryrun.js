// retryrun.js：按处理预算处理并留账
import { bumpFail, clearFail } from "./retry.js";

function errCodes(spec) {
  return {
    noTask: spec.task_error_code || "E_NO_TASK",
    dead: spec.dead_error_code || "E_DEAD",
    badEvent: spec.event_error_code || "E_BAD_EVENT"
  };
}

function raise(code, message) {
  const error = new Error(message);
  error.code = code;
  throw error;
}

function validEvent(event) {
  return !!event && typeof event === "object"
    && (event.kind === "fail" || event.kind === "ok")
    && typeof event.task === "string" && event.task.length > 0;
}

function normalizeLedger(ledger) {
  return (ledger || []).map(function (entry) {
    return Array.isArray(entry)
      ? { kind: entry[0], task: entry[1] }
      : { id: entry.id, kind: entry.kind, task: entry.task };
  });
}

function cloneState(state) {
  const src = state || {};
  return {
    fails: (src.fails || []).map(function (row) { return [row[0], row[1]]; }),
    pending: (src.pending || []).slice(),
    dead: (src.dead || []).slice(),
    ledger: normalizeLedger(src.ledger),
    applied: (src.applied || []).slice()
  };
}

function applyEvent(state, event, spec, codes) {
  const inBook = state.fails.some(function (row) { return row[0] === event.task; });
  if (!inBook) { raise(codes.noTask, "task not registered: " + event.task); }
  if (state.dead.indexOf(event.task) >= 0) { raise(codes.dead, "task already dead: " + event.task); }
  if (event.kind === "fail") {
    state.fails = bumpFail(state.fails, event.task);
    const count = state.fails.find(function (row) { return row[0] === event.task; })[1];
    if (count >= spec.limit) {
      state.dead.push(event.task);
      state.pending = state.pending.filter(function (task) { return task !== event.task; });
    } else if (state.pending.indexOf(event.task) < 0) {
      state.pending.push(event.task);
    }
  } else {
    state.fails = clearFail(state.fails, event.task);
    state.pending = state.pending.filter(function (task) { return task !== event.task; });
  }
  if (event.id !== undefined && state.applied.indexOf(event.id) < 0) {
    state.applied.push(event.id);
  }
}

export function step(spec) {
  const codes = errCodes(spec);
  const events = spec.events || [];
  events.forEach(function (event) {
    if (!validEvent(event)) { raise(codes.badEvent, "bad event: " + JSON.stringify(event)); }
  });
  const state = cloneState(spec.state);
  const carried = state.ledger.length;
  const queue = state.ledger.concat(events.filter(function (event) {
    return event.id === undefined || state.applied.indexOf(event.id) < 0;
  }));
  state.ledger = [];
  let budget = Math.max(0, spec.budget || 0);
  let served = 0;
  queue.forEach(function (event) {
    if (served >= budget) { state.ledger.push(event); return; }
    applyEvent(state, event, spec, codes);
    served += 1;
  });
  return {
    state: state,
    served: served,
    ledger_before: state.ledger.length,
    ledger: state.ledger.map(function (event) { return [event.kind, event.task]; }),
    judged: served,
    judged_bound: carried + events.length
  };
}

export function close(spec) {
  const codes = errCodes(spec);
  const state = cloneState(spec.state);
  const queue = state.ledger;
  state.ledger = [];
  let catchup = 0;
  queue.forEach(function (event) {
    if (!validEvent(event)) { raise(codes.badEvent, "bad event: " + JSON.stringify(event)); }
    applyEvent(state, event, spec, codes);
    catchup += 1;
  });
  return { state: state, catchup: catchup };
}
