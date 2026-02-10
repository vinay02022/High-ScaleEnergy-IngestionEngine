import 'reflect-metadata';
import { Test, TestingModule } from '@nestjs/testing';
import { IngestService } from '../ingest.service';
import { PrismaService } from '../../db/prisma.service';

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Build a mock Prisma interactive-transaction context. */
function buildTxMock() {
  return {
    meterReading: { create: jest.fn().mockResolvedValue({}) },
    vehicleReading: { create: jest.fn().mockResolvedValue({}) },
    $executeRaw: jest.fn().mockResolvedValue(0),
  };
}

function buildPrismaMock(txMock: ReturnType<typeof buildTxMock>) {
  return {
    // $transaction receives a callback; we invoke it with our txMock
    $transaction: jest.fn(async (cb: (tx: unknown) => Promise<void>) => {
      await cb(txMock);
    }),
  };
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('IngestService — conditional UPSERT logic', () => {
  let service: IngestService;
  let txMock: ReturnType<typeof buildTxMock>;

  beforeEach(async () => {
    txMock = buildTxMock();
    const prismaMock = buildPrismaMock(txMock);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        IngestService,
        { provide: PrismaService, useValue: prismaMock },
      ],
    }).compile();

    service = module.get<IngestService>(IngestService);
  });

  // ── Meter ────────────────────────────────────────────────────────────────

  describe('ingestMeter', () => {
    const baseMeter = {
      meterId: 'METER-001',
      kwhConsumedAc: 10,
      voltage: 230,
      timestamp: '2026-02-11T12:00:00Z',
    };

    it('inserts into history table on every call', async () => {
      await service.ingestMeter(baseMeter);

      expect(txMock.meterReading.create).toHaveBeenCalledTimes(1);
      expect(txMock.meterReading.create).toHaveBeenCalledWith({
        data: {
          meterId: 'METER-001',
          kwhConsumedAc: 10,
          voltage: 230,
          ts: new Date('2026-02-11T12:00:00Z'),
        },
      });
    });

    it('executes raw UPSERT SQL with correct parameters', async () => {
      await service.ingestMeter(baseMeter);

      expect(txMock.$executeRaw).toHaveBeenCalledTimes(1);

      // $executeRaw is called with a tagged template, which Jest receives
      // as an array of [strings[], ...values]. Extract the SQL + params.
      const call = txMock.$executeRaw.mock.calls[0];
      const sqlParts: string[] = call[0].strings ?? call[0];
      const fullSql = sqlParts.join('?');

      expect(fullSql).toContain('INSERT INTO meter_current');
      expect(fullSql).toContain('ON CONFLICT (meter_id)');
      expect(fullSql).toContain('WHERE meter_current.ts < EXCLUDED.ts');
    });

    it('passes ts as a Date object so Postgres gets a timestamptz', async () => {
      await service.ingestMeter(baseMeter);

      const call = txMock.$executeRaw.mock.calls[0];
      // Tagged template values start at index 0 of call[0].values or
      // are spread as call[0][1..n] depending on Prisma.sql implementation.
      // We just verify the history create got the right Date.
      const historyData = txMock.meterReading.create.mock.calls[0][0].data;
      expect(historyData.ts).toEqual(new Date('2026-02-11T12:00:00Z'));
    });

    it('calls UPSERT even for out-of-order packet (SQL WHERE guard filters)', async () => {
      // Newer first, older second — both should call $executeRaw.
      // The SQL WHERE clause ensures the DB ignores the stale update.
      await service.ingestMeter({
        ...baseMeter,
        timestamp: '2026-02-11T14:00:00Z', // newer
        kwhConsumedAc: 20,
      });
      await service.ingestMeter({
        ...baseMeter,
        timestamp: '2026-02-11T10:00:00Z', // older (out-of-order)
        kwhConsumedAc: 5,
      });

      // Both appended to history
      expect(txMock.meterReading.create).toHaveBeenCalledTimes(2);

      // Both tried the UPSERT — the WHERE guard in SQL prevents overwrite
      expect(txMock.$executeRaw).toHaveBeenCalledTimes(2);
    });
  });

  // ── Vehicle ──────────────────────────────────────────────────────────────

  describe('ingestVehicle', () => {
    const baseVehicle = {
      vehicleId: 'VEH-001',
      soc: 80,
      kwhDeliveredDc: 5,
      batteryTemp: 30,
      timestamp: '2026-02-11T12:00:00Z',
    };

    it('inserts into history table on every call', async () => {
      await service.ingestVehicle(baseVehicle);

      expect(txMock.vehicleReading.create).toHaveBeenCalledTimes(1);
      expect(txMock.vehicleReading.create).toHaveBeenCalledWith({
        data: {
          vehicleId: 'VEH-001',
          soc: 80,
          kwhDeliveredDc: 5,
          batteryTemp: 30,
          ts: new Date('2026-02-11T12:00:00Z'),
        },
      });
    });

    it('executes raw UPSERT SQL with WHERE ts guard', async () => {
      await service.ingestVehicle(baseVehicle);

      expect(txMock.$executeRaw).toHaveBeenCalledTimes(1);

      const call = txMock.$executeRaw.mock.calls[0];
      const sqlParts: string[] = call[0].strings ?? call[0];
      const fullSql = sqlParts.join('?');

      expect(fullSql).toContain('INSERT INTO vehicle_current');
      expect(fullSql).toContain('ON CONFLICT (vehicle_id)');
      expect(fullSql).toContain('WHERE vehicle_current.ts < EXCLUDED.ts');
    });

    it('calls UPSERT even for out-of-order packet (SQL WHERE guard filters)', async () => {
      await service.ingestVehicle({
        ...baseVehicle,
        timestamp: '2026-02-11T14:00:00Z',
        soc: 90,
      });
      await service.ingestVehicle({
        ...baseVehicle,
        timestamp: '2026-02-11T10:00:00Z', // stale
        soc: 50,
      });

      expect(txMock.vehicleReading.create).toHaveBeenCalledTimes(2);
      expect(txMock.$executeRaw).toHaveBeenCalledTimes(2);
    });
  });
});

// ── SQL-level out-of-order proof ─────────────────────────────────────────────
// This test doesn't hit a real DB, but it documents the exact SQL contract
// that the WHERE guard enforces. Integration tests would verify the actual
// Postgres behavior.

describe('Out-of-order UPSERT — SQL contract', () => {
  it('the SQL uses WHERE current.ts < EXCLUDED.ts so stale packets are ignored', () => {
    // This is a structural assertion: the service's SQL must contain the guard.
    // We extract the SQL from IngestService source as a documented contract.
    const serviceSource = require('fs').readFileSync(
      require('path').resolve(__dirname, '../ingest.service.ts'),
      'utf8',
    );

    // Meter guard
    expect(serviceSource).toContain(
      'WHERE meter_current.ts < EXCLUDED.ts',
    );

    // Vehicle guard
    expect(serviceSource).toContain(
      'WHERE vehicle_current.ts < EXCLUDED.ts',
    );
  });
});
