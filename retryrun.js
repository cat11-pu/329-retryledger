// retryrun.js：按处理预算处理事件并留账，收尾不限预算把账处理完
import { bumpFail, clearFail } from "./retry.js";

function makeError(code, message) {
  const error = new Error(message || code);
  error.code = code;
  return error;
}

function validateEvent(event, badCode) {
  if (!event || typeof event !== "object" || Array.isArray(event)) {
    throw makeError(badCode, "事件必须是对象");
  }
  if (event.kind !== "fail" && event.kind !== "ok") {
    throw makeError(badCode, "事件 kind 必须是 fail 或 ok");
  }
  if (typeof event.task !== "string" || event.task === "") {
    throw makeError(badCode, "事件必须带任务名 task");
  }
}

function cloneState(state) {
  return {
    fails: (state.fails || []).map(function (row) { return [row[0], row[1]]; }),
    pending: (state.pending || []).slice(),
    dead: (state.dead || []).slice(),
    ledger: (state.ledger || []).map(function (row) {
      return [row[0], row[1], row[2] === undefined ? pairKey(row[0], row[1]) : row[2]];
    }),
    applied: (state.applied || []).slice()
  };
}

function transition(state, kind, task, limit) {
  if (kind === "fail") {
    state.fails = bumpFail(state.fails, task);
    state.fails.sort(function (a, b) { return a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0; });
    const count = state.fails.find(function (row) { return row[0] === task; })[1];
    if (count >= limit) {
      if (state.pending.indexOf(task) >= 0) {
        state.pending = state.pending.filter(function (name) { return name !== task; });
      }
      if (state.dead.indexOf(task) < 0) {
        state.dead.push(task);
      }
    } else if (state.pending.indexOf(task) < 0) {
      state.pending.push(task);
    }
    return;
  }
  state.fails = clearFail(state.fails, task);
  state.pending = state.pending.filter(function (name) { return name !== task; });
}

function guard(state, kind, task, codes) {
  if (state.dead.indexOf(task) >= 0) {
    throw makeError(codes.dead || "E_DEAD", "任务已判死：" + task);
  }
  if (!state.fails.some(function (row) { return row[0] === task; })) {
    throw makeError(codes.task || "E_NO_TASK", "任务不在册：" + task);
  }
}

function pairKey(kind, task) {
  return "p\u0000" + kind + "\u0000" + task;
}

function eventKey(event) {
  if (event.id !== undefined && event.id !== null) {
    return "i\u0000" + String(event.id);
  }
  return pairKey(event.kind, event.task);
}

export function step(spec) {
  const state = cloneState(spec.state || {});
  const events = spec.events || [];
  const budget = spec.budget == null ? 0 : spec.budget;
  const limit = spec.limit;
  const codes = {
    task: spec.task_error_code || "E_NO_TASK",
    dead: spec.dead_error_code || "E_DEAD",
    bad: spec.event_error_code || "E_BAD_EVENT"
  };

  // 先做结构校验，与预算无关：任何一条事件不合法都直接抛 E_BAD_EVENT。
  events.forEach(function (event) { validateEvent(event, codes.bad); });

  const applied = state.applied.slice();
  const queue = state.ledger.map(function (row) {
    return { kind: row[0], task: row[1], key: row[2] || pairKey(row[0], row[1]) };
  }).concat(events.map(function (event) {
    return { kind: event.kind, task: event.task, key: eventKey(event) };
  }));
  const bound = queue.length;

  let remaining = budget;
  let served = 0;
  const nextLedger = [];

  for (let i = 0; i < queue.length; i += 1) {
    const item = queue[i];
    if (applied.indexOf(item.key) >= 0) {
      continue; // 已处理过（重放）：不花预算、不再入账。
    }
    if (remaining <= 0) {
      nextLedger.push([item.kind, item.task, item.key]); // 预算用尽：连着载压账带出下一轮。
      continue;
    }
    guard(state, item.kind, item.task, codes);
    transition(state, item.kind, item.task, limit);
    applied.push(item.key);
    remaining -= 1;
    served += 1;
  }

  state.ledger = nextLedger;
  state.applied = applied;

  return {
    state: state,
    served: served,
    ledger_before: nextLedger.length,
    ledger: state.ledger.map(function (row) { return [row[0], row[1]]; }),
    judged: served,
    judged_bound: bound
  };
}

export function close(spec) {
  const state = cloneState(spec.state || {});
  const limit = spec.limit;
  const codes = {
    task: spec.task_error_code || "E_NO_TASK",
    dead: spec.dead_error_code || "E_DEAD"
  };
  const applied = state.applied.slice();
  let catchup = 0;

  while (state.ledger.length > 0) {
    const row = state.ledger.shift();
    const kind = row[0];
    const task = row[1];
    const key = row[2] || pairKey(kind, task);
    if (applied.indexOf(key) >= 0) {
      continue;
    }
    guard(state, kind, task, codes);
    transition(state, kind, task, limit);
    applied.push(key);
    catchup += 1;
  }

  state.applied = applied;
  return { state: state, catchup: catchup };
}
