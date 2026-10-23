// Permission prompts and SDK connections can remain pending after the UI closes.
// Dispose any resource that arrives after cancellation or a deadline.
function boundedOperation(operation, { timeoutMs = 20000, message, signal, onLateResolve } = {}) {
  return new Promise((resolve, reject) => {
    let settled = false, timer;
    const clean = () => { clearTimeout(timer); signal?.removeEventListener('abort', abort); };
    const fail = error => { if (settled) return; settled = true; clean(); reject(error); };
    const abort = () => fail(new DOMException('Operation cancelled', 'AbortError'));
    timer = setTimeout(() => fail(new Error(message || 'The operation timed out. Please retry.')), timeoutMs);
    signal?.addEventListener('abort', abort, { once: true });
    if (signal?.aborted) abort();
    Promise.resolve(operation).then(value => {
      if (settled) { Promise.resolve().then(() => onLateResolve?.(value)).catch(() => {}); return; }
      settled = true; clean(); resolve(value);
    }, fail);
  });
}

module.exports = { boundedOperation };
