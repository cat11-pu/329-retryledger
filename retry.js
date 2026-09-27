// retry.js：失败计数（基线：一律原样返回）
export function bumpFail(fails, task) {
  return fails;
}

export function clearFail(fails, task) {
  return fails;
}
