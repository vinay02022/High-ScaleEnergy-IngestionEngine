import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL!,
});
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log('Seeding database…');

  // ── Vehicle-Meter mappings ──────────────────────────────────────────────
  const mappings = [
    { vehicleId: 'VEH-001', meterId: 'METER-001' },
    { vehicleId: 'VEH-002', meterId: 'METER-002' },
    { vehicleId: 'VEH-003', meterId: 'METER-003' },
  ];

  for (const m of mappings) {
    await prisma.vehicleMeterMap.upsert({
      where: { vehicleId: m.vehicleId },
      create: m,
      update: { meterId: m.meterId },
    });
  }
  console.log(`  ✓ ${mappings.length} vehicle-meter mappings`);

  // ── Sample meter readings (last 6 hours, one per hour) ─────────────────
  const now = Date.now();
  const meterReadings = [];
  for (let h = 5; h >= 0; h--) {
    for (const meterId of ['METER-001', 'METER-002', 'METER-003']) {
      meterReadings.push({
        meterId,
        kwhConsumedAc: parseFloat((Math.random() * 20 + 5).toFixed(2)),
        voltage: parseFloat((Math.random() * 10 + 225).toFixed(1)),
        ts: new Date(now - h * 3600_000),
      });
    }
  }
  await prisma.meterReading.createMany({ data: meterReadings });
  console.log(`  ✓ ${meterReadings.length} meter readings`);

  // ── Sample vehicle readings (last 6 hours, one per hour) ───────────────
  const vehicleReadings = [];
  for (let h = 5; h >= 0; h--) {
    for (const vehicleId of ['VEH-001', 'VEH-002', 'VEH-003']) {
      vehicleReadings.push({
        vehicleId,
        soc: parseFloat((Math.random() * 60 + 20).toFixed(1)),
        kwhDeliveredDc: parseFloat((Math.random() * 15 + 2).toFixed(2)),
        batteryTemp: parseFloat((Math.random() * 15 + 25).toFixed(1)),
        ts: new Date(now - h * 3600_000),
      });
    }
  }
  await prisma.vehicleReading.createMany({ data: vehicleReadings });
  console.log(`  ✓ ${vehicleReadings.length} vehicle readings`);

  // ── Upsert current state from the most recent readings ─────────────────
  for (const meterId of ['METER-001', 'METER-002', 'METER-003']) {
    const latest = meterReadings
      .filter((r) => r.meterId === meterId)
      .sort((a, b) => b.ts.getTime() - a.ts.getTime())[0];
    await prisma.meterCurrent.upsert({
      where: { meterId },
      create: latest,
      update: {
        kwhConsumedAc: latest.kwhConsumedAc,
        voltage: latest.voltage,
        ts: latest.ts,
      },
    });
  }

  for (const vehicleId of ['VEH-001', 'VEH-002', 'VEH-003']) {
    const latest = vehicleReadings
      .filter((r) => r.vehicleId === vehicleId)
      .sort((a, b) => b.ts.getTime() - a.ts.getTime())[0];
    await prisma.vehicleCurrent.upsert({
      where: { vehicleId },
      create: latest,
      update: {
        soc: latest.soc,
        kwhDeliveredDc: latest.kwhDeliveredDc,
        batteryTemp: latest.batteryTemp,
        ts: latest.ts,
      },
    });
  }
  console.log('  ✓ current-state tables seeded');

  console.log('Seed complete.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
