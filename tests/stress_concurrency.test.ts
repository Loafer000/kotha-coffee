import assert from 'assert';
import path from 'path';
import { spawn } from 'child_process';
import { createClient } from '@libsql/client';
import { initSchema } from '../src/server/db/schema.js';
import { getDbClient, closeDbClient } from '../src/server/db/client.js';
import {
  getNextDailyOrderNumber,
  getCurrentDailyOrderNumber,
  resetDailyCounter
} from '../src/server/db/sequence.js';

function runChildWorker(dateKey: string, count: number): Promise<{ success: boolean; numbers: number[]; error?: string }> {
  return new Promise((resolve) => {
    const workerPath = path.resolve('tests/helpers/concurrency_worker.ts');
    const child = spawn('node', ['node_modules/tsx/dist/cli.mjs', workerPath, dateKey, String(count)], {
      cwd: process.cwd(),
      env: { ...process.env, NODE_ENV: 'test' }
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (d) => { stdout += d.toString(); });
    child.stderr.on('data', (d) => { stderr += d.toString(); });

    child.on('close', (code) => {
      try {
        const lines = stdout.trim().split('\n').filter(Boolean);
        const lastLine = lines[lines.length - 1];
        const parsed = JSON.parse(lastLine);
        resolve(parsed);
      } catch (err: any) {
        resolve({
          success: false,
          numbers: [],
          error: `Exit code ${code}. Stderr: ${stderr}. Stdout: ${stdout}. Parse error: ${err.message}`
        });
      }
    });
  });
}

async function runConcurrencyStressSuite() {
  console.log('=== Starting Adversarial Concurrency Stress Suite ===\n');

  // Ensure schema is initialized
  await initSchema();
  const db = getDbClient();

  try {
    // ------------------------------------------------------------------------
    // STRESS TEST 1: Massive In-Process Burst (150 parallel calls)
    // ------------------------------------------------------------------------
    console.log('1. Stress Test: Massive in-process burst (150 simultaneous requests)...');
    const burstDate = '2026-10-20';
    await resetDailyCounter(burstDate);

    const burstCount = 150;
    const burstPromises = Array.from({ length: burstCount }, () =>
      getNextDailyOrderNumber(burstDate)
    );
    const burstStart = Date.now();
    const burstResults = await Promise.all(burstPromises);
    const burstDuration = Date.now() - burstStart;

    assert.strictEqual(burstResults.length, burstCount, `Expected ${burstCount} results`);
    const burstSet = new Set(burstResults);
    assert.strictEqual(burstSet.size, burstCount, `Expected ${burstCount} unique numbers, got ${burstSet.size}`);

    const sortedBurst = [...burstResults].sort((a, b) => a - b);
    for (let i = 0; i < burstCount; i++) {
      assert.strictEqual(sortedBurst[i], i + 1, `Sequence gap at index ${i}: expected ${i + 1}, got ${sortedBurst[i]}`);
    }
    const dbValueBurst = await getCurrentDailyOrderNumber(burstDate);
    assert.strictEqual(dbValueBurst, burstCount, `DB last_number mismatch: expected ${burstCount}, got ${dbValueBurst}`);
    console.log(`   PASSED: 150 parallel requests generated numbers 1..150 in ${burstDuration}ms with 0 collisions.\n`);

    // ------------------------------------------------------------------------
    // STRESS TEST 2: Multi-Process True Parallel Concurrency (4 OS processes x 25 requests = 100)
    // ------------------------------------------------------------------------
    console.log('2. Stress Test: Multi-process concurrency across 4 separate Node OS processes (100 total requests)...');
    const multiProcDate = '2026-10-21';
    await resetDailyCounter(multiProcDate);

    const procCount = 4;
    const reqsPerProc = 25;
    const totalExpected = procCount * reqsPerProc;

    const procPromises: Promise<{ success: boolean; numbers: number[]; error?: string }>[] = [];
    const procStart = Date.now();
    for (let p = 0; p < procCount; p++) {
      procPromises.push(runChildWorker(multiProcDate, reqsPerProc));
    }

    const procResults = await Promise.all(procPromises);
    const procDuration = Date.now() - procStart;

    for (let i = 0; i < procResults.length; i++) {
      const res = procResults[i] as any;
      console.log(`Process index ${i} (PID ${res.pid}) logs:`, JSON.stringify(res.logs));
    }
    const allProcNumbers: number[] = [];
    for (let i = 0; i < procResults.length; i++) {
      const res = procResults[i];
      assert.ok(res.success, `Child process ${i} failed: ${res.error}`);
      assert.strictEqual(res.numbers.length, reqsPerProc, `Child process ${i} returned ${res.numbers.length} numbers`);
      allProcNumbers.push(...res.numbers);
    }

    assert.strictEqual(allProcNumbers.length, totalExpected, `Expected ${totalExpected} total numbers across processes`);
    const procSet = new Set(allProcNumbers);
    assert.strictEqual(procSet.size, totalExpected, `Collision detected across processes! Unique count: ${procSet.size}/${totalExpected}`);

    const sortedProc = [...allProcNumbers].sort((a, b) => a - b);
    for (let i = 0; i < totalExpected; i++) {
      assert.strictEqual(sortedProc[i], i + 1, `Cross-process gap at ${i}: expected ${i + 1}, got ${sortedProc[i]}`);
    }

    const dbValueProc = await getCurrentDailyOrderNumber(multiProcDate);
    assert.strictEqual(dbValueProc, totalExpected, `DB last_number mismatch: expected ${totalExpected}, got ${dbValueProc}`);
    console.log(`   PASSED: 4 parallel OS processes generated 100 unique contiguous sequence numbers (1..100) in ${procDuration}ms with 0 lock collisions.\n`);

    // ------------------------------------------------------------------------
    // STRESS TEST 3: Multi-Connection Lock Contention (5 separate Client instances without queue)
    // ------------------------------------------------------------------------
    console.log('3. Stress Test: Multi-connection contention (5 separate @libsql/client instances bypassing in-memory queue)...');
    const multiConnDate = '2026-10-22';
    await resetDailyCounter(multiConnDate);

    const clientCount = 5;
    const clientReqs = 15;
    const totalClientExpected = clientCount * clientReqs;

    const clients: any[] = [];
    const dbPath = path.resolve('data/kotha.db').replace(/\\/g, '/');
    for (let c = 0; c < clientCount; c++) {
      clients.push(createClient({ url: `file:${dbPath}` }));
    }

    // Direct atomic upsert bypassing sequenceQueue to stress-test SQLite WAL lock handling directly
    async function directUpsertWithRetry(dateKey: string, client: any, maxRetries = 10): Promise<number> {
      let attempt = 0;
      while (attempt < maxRetries) {
        try {
          const res = await client.execute({
            sql: `INSERT INTO daily_counters (date_key, last_number)
                  VALUES (?, 1)
                  ON CONFLICT(date_key) DO UPDATE SET last_number = daily_counters.last_number + 1
                  RETURNING last_number;`,
            args: [dateKey]
          });
          return Number(res.rows[0].last_number);
        } catch (err: any) {
          attempt++;
          const isBusy = err.code === 'SQLITE_BUSY' ||
                        (err.message && err.message.includes('database is locked'));
          if (isBusy && attempt < maxRetries) {
            const delay = 15 * Math.pow(2, attempt) + Math.floor(Math.random() * 20);
            await new Promise((r) => setTimeout(r, delay));
            continue;
          }
          throw err;
        }
      }
      throw new Error(`Exceeded max retries (${maxRetries})`);
    }

    const directPromises: Promise<number>[] = [];
    for (let c = 0; c < clientCount; c++) {
      for (let r = 0; r < clientReqs; r++) {
        directPromises.push(directUpsertWithRetry(multiConnDate, clients[c]));
      }
    }

    const directResults = await Promise.all(directPromises);
    assert.strictEqual(directResults.length, totalClientExpected);
    const directSet = new Set(directResults);
    assert.strictEqual(directSet.size, totalClientExpected, `Collisions found in direct multi-connection test: ${directSet.size}/${totalClientExpected}`);

    for (const c of clients) {
      await c.close();
    }
    console.log(`   PASSED: 5 independent DB clients generated ${totalClientExpected} distinct sequence numbers with 0 collisions.\n`);

    // ------------------------------------------------------------------------
    // STRESS TEST 4: Queue Fault Isolation & Liveness
    // ------------------------------------------------------------------------
    console.log('4. Stress Test: Queue fault isolation & liveness after rejection...');
    const faultDate = '2026-10-23';
    await resetDailyCounter(faultDate);

    // Call 1: valid
    const q1 = await getNextDailyOrderNumber(faultDate);
    assert.strictEqual(q1, 1);

    // Call 2: invalid dateKey (triggers error in sequenceQueue)
    let rejected = false;
    try {
      await getNextDailyOrderNumber('');
    } catch {
      rejected = true;
    }
    assert.ok(rejected, 'Invalid dateKey must reject');

    // Call 3: subsequent valid call must NOT hang or fail due to previous rejection
    const q3 = await getNextDailyOrderNumber(faultDate);
    assert.strictEqual(q3, 2, 'Subsequent task after rejection must succeed and increment counter to 2');
    console.log('   PASSED: sequenceQueue cleanly recovers after task rejection.\n');

    console.log('=====================================================');
    console.log('✅ ALL CONCURRENCY STRESS TESTS PASSED CLEANLY!');
    console.log('=====================================================');
  } finally {
    await closeDbClient();
  }
}

runConcurrencyStressSuite().catch((err) => {
  console.error('\n❌ CONCURRENCY STRESS SUITE FAILED:', err);
  process.exit(1);
});
