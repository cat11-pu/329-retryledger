// retry.js：失败计数（不可变更新，返回新表）
export function bumpFail(fails, task) {
  const next = fails.map(function (row) {
    return [row[0], row[0] === task ? row[1] + 1 : row[1]];
  });
  if (!next.some(function (row) { return row[0] === task; })) {
    next.push([task, 1]);
  }
  return next;
}

export function clearFail(fails, task) {
  const next = fails.map(function (row) {
    return [row[0], row[0] === task ? 0 : row[1]];
  });
  if (!next.some(function (row) { return row[0] === task; })) {
    next.push([task, 0]);
  }
  return next;
}
