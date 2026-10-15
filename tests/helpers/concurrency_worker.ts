import { getNextDailyOrderNumber } from '../../src/server/db/sequence.js';
import { closeDbClient } from '../../src/server/db/client.js';
import { initSchema } from '../../src/server/db/schema.js';

async function runWorker() {
  await initSchema();
  const dateKey = process.argv[2] || '2026-10-18';
  const count = parseInt(process.argv[3] || '25', 10);

  const logs: { time: number; num: number }[] = [];
  const promises: Promise<number>[] = [];

  for (let i = 0; i < count; i++) {
    promises.push(
      getNextDailyOrderNumber(dateKey).then((num) => {
        logs.push({ time: Date.now(), num });
        return num;
      })
    );
  }

  try {
    const results = await Promise.all(promises);
    await closeDbClient();
    console.log(JSON.stringify({ pid: process.pid, success: true, numbers: results, logs }));
    process.exit(0);
  } catch (err: any) {
    await closeDbClient();
    console.error(JSON.stringify({ pid: process.pid, success: false, error: err.message, stack: err.stack }));
    process.exit(1);
  }
}

runWorker();
