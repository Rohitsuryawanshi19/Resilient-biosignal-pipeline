import { ChaosHarness } from './harness.js';
import { runAudit } from '../../../apps/device/src/audit.js';
import { Store } from '../../../apps/device/src/store.js';
import { verifyInvariants } from './verifier.js';

const cmd = process.argv[2] || 'run';

if (cmd === 'run') {
  const harness = new ChaosHarness();
  await harness.runAll();
  console.log('=== Chaos Test Matrix Complete. Generated docs/EVIDENCE.md and evidence/*.json ===');
} else if (cmd === 'verify') {
  const dbPath = process.argv[3] || 'pipeline.db';
  const store = new Store({ dbPath, readonly: true });
  try {
    const auditReports = runAudit(store);
    let deviceExportLines: string[] = [];
    const sessions = store.getSessions();
    for (const s of sessions) {
      for (const line of store.streamExport(s.sessionId)) {
        deviceExportLines.push(line.trim());
      }
    }
    const res = verifyInvariants({
      auditReports,
      deviceExportLines,
    });
    console.log(JSON.stringify(res, null, 2));
    if (!res.ok) process.exit(1);
  } finally {
    store.close();
  }
} else {
  console.error(`Unknown command: ${cmd}. Use 'run' or 'verify'`);
  process.exit(1);
}
