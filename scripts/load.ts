/**
 * Simple load generator — sends N devices every INTERVAL_MS.
 *
 * Usage:
 *   npx ts-node scripts/load.ts                 # 10 devices, 1 s interval
 *   DEVICES=100 INTERVAL_MS=500 npx ts-node scripts/load.ts
 *   DEVICES=1000 INTERVAL_MS=0 npx ts-node scripts/load.ts   # burst mode
 */

const BASE_URL = process.env.API_URL || 'http://localhost:3000';
const DEVICES = parseInt(process.env.DEVICES || '10', 10);
const INTERVAL_MS = parseInt(process.env.INTERVAL_MS || '1000', 10);

let totalSent = 0;
let totalErrors = 0;

async function sendReading(i: number) {
  const now = new Date().toISOString();

  // Alternate: even = meter, odd = vehicle
  const payload =
    i % 2 === 0
      ? {
          meterId: `METER-${String(i).padStart(4, '0')}`,
          kwhConsumedAc: parseFloat((Math.random() * 20 + 1).toFixed(2)),
          voltage: parseFloat((Math.random() * 10 + 225).toFixed(1)),
          timestamp: now,
        }
      : {
          vehicleId: `VEH-${String(i).padStart(4, '0')}`,
          soc: parseFloat((Math.random() * 80 + 10).toFixed(1)),
          kwhDeliveredDc: parseFloat((Math.random() * 15 + 1).toFixed(2)),
          batteryTemp: parseFloat((Math.random() * 30 + 20).toFixed(1)),
          timestamp: now,
        };

  try {
    const res = await fetch(`${BASE_URL}/v1/ingest`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      totalErrors++;
      const body = await res.text();
      console.error(`  [${res.status}] device ${i}: ${body}`);
    } else {
      totalSent++;
    }
  } catch (err) {
    totalErrors++;
    console.error(`  [ERR] device ${i}: ${err}`);
  }
}

async function tick() {
  const start = Date.now();
  const promises = [];
  for (let i = 0; i < DEVICES; i++) {
    promises.push(sendReading(i));
  }
  await Promise.all(promises);
  const elapsed = Date.now() - start;
  console.log(
    `Sent ${DEVICES} readings in ${elapsed} ms | total: ${totalSent} ok, ${totalErrors} err`,
  );
}

async function main() {
  console.log(
    `Load generator: ${DEVICES} devices, ${INTERVAL_MS} ms interval → ${BASE_URL}`,
  );
  console.log('Press Ctrl+C to stop.\n');

  // Run continuously
  // eslint-disable-next-line no-constant-condition
  while (true) {
    await tick();
    if (INTERVAL_MS > 0) {
      await new Promise((r) => setTimeout(r, INTERVAL_MS));
    }
  }
}

main().catch(console.error);
