import { Store } from '../src/store.js';
import { runReader } from '../src/reader.js';

let dbPath = 'test-child.db';
let reservePath = 'test-child.db.reserve';
let host = '127.0.0.1';
let port = 7100;

const args = process.argv.slice(2);
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--db') dbPath = args[++i]!;
  else if (args[i] === '--reserve') reservePath = args[++i]!;
  else if (args[i] === '--host') host = args[++i]!;
  else if (args[i] === '--port') port = parseInt(args[++i]!, 10);
}

const store = new Store({ dbPath, reservePath });
const ac = new AbortController();

runReader({ host, port, store, mode: 'online', timeoutMs: 5000 }, ac.signal)
  .catch(() => {})
  .finally(() => {
    try {
      store.close();
    } catch {}
  });
