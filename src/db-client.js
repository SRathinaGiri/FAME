const worker = new Worker(new URL('./sqlite-worker.js', import.meta.url), { type: 'module' });
let nextMessageId = 1;
const pending = new Map();

worker.addEventListener('message', (event) => {
  const { id, ok, result, error } = event.data;
  const request = pending.get(id);
  if (!request) return;
  pending.delete(id);
  if (ok) {
    request.resolve(result);
  } else {
    request.reject(new Error(error || 'Database worker failed'));
  }
});

worker.addEventListener('error', (event) => {
  for (const request of pending.values()) {
    request.reject(new Error(event.message || 'Database worker error'));
  }
  pending.clear();
});

export function dbCall(type, payload = {}) {
  const id = nextMessageId++;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    worker.postMessage({ id, type, payload });
  });
}
