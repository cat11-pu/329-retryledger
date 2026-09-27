// retry.js：失败计数（纯函数，返回新表，不改入参）
export function bumpFail(fails, task) {
  const rows = (fails || []).map(function (row) { return [row[0], row[1]]; });
  const hit = rows.find(function (row) { return row[0] === task; });
  if (hit) { hit[1] += 1; } else { rows.push([task, 1]); }
  return rows;
}

export function clearFail(fails, task) {
  return (fails || []).map(function (row) {
    return row[0] === task ? [row[0], 0] : [row[0], row[1]];
  });
}
