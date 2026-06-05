let nextMessageId = 1;
const pending = new Map();
let worker;
let workerFailure = null;

function failPending(error) {
  workerFailure = error;
  for (const request of pending.values()) request.reject(error);
  pending.clear();
}

function getWorker() {
  if (workerFailure) throw workerFailure;
  if (worker) return worker;
  worker = new Worker(new URL('./sqlite-worker.js', import.meta.url), { type: 'module' });
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
  worker.addEventListener('error', (event) => failPending(new Error(event.message || 'Database worker error')));
  worker.addEventListener('messageerror', () => failPending(new Error('Database worker message error')));
  return worker;
}

export function dbCall(type, payload = {}) {
  const id = nextMessageId++;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    try {
      getWorker().postMessage({ id, type, payload });
    } catch (error) {
      pending.delete(id);
      reject(error);
    }
  });
}
