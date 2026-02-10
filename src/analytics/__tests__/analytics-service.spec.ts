import 'reflect-metadata';
import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { AnalyticsService } from '../analytics.service';
import { PrismaService } from '../../db/prisma.service';

// ── Mock PrismaService ───────────────────────────────────────────────────────

function buildPrismaMock() {
  return {
    vehicleMeterMap: {
      findUnique: jest.fn(),
    },
    $queryRaw: jest.fn(),
    // Existing Prisma client methods (unused by performance, but needed for DI)
    meterReading: { aggregate: jest.fn() },
    vehicleReading: { aggregate: jest.fn() },
    meterCurrent: { findUnique: jest.fn() },
    vehicleCurrent: { findUnique: jest.fn() },
  };
}

describe('AnalyticsService — getPerformance', () => {
  let service: AnalyticsService;
  let prismaMock: ReturnType<typeof buildPrismaMock>;

  beforeEach(async () => {
    prismaMock = buildPrismaMock();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AnalyticsService,
        { provide: PrismaService, useValue: prismaMock },
      ],
    }).compile();

    service = module.get<AnalyticsService>(AnalyticsService);
  });

  // ── 404 when no mapping exists ─────────────────────────────────────────

  it('throws 404 when vehicle has no meter mapping', async () => {
    prismaMock.vehicleMeterMap.findUnique.mockResolvedValue(null);

    await expect(service.getPerformance('VEH-UNKNOWN')).rejects.toThrow(
      NotFoundException,
    );
  });

  // ── Happy path ─────────────────────────────────────────────────────────

  it('returns correct performance metrics with efficiency ratio', async () => {
    prismaMock.vehicleMeterMap.findUnique.mockResolvedValue({
      vehicleId: 'VEH-001',
      meterId: 'METER-001',
    });

    // AC query result
    prismaMock.$queryRaw
      .mockResolvedValueOnce([{ ac_total: 100 }])
      // DC query result
      .mockResolvedValueOnce([{ dc_total: 85, avg_battery_temp: 32.5 }]);

    const result = await service.getPerformance('VEH-001');

    expect(result.vehicleId).toBe('VEH-001');
    expect(result.meterId).toBe('METER-001');
    expect(result.acConsumedTotal).toBe(100);
    expect(result.dcDeliveredTotal).toBe(85);
    expect(result.efficiencyRatio).toBe(0.85);
    expect(result.avgBatteryTemp).toBe(32.5);
    expect(result.windowStart).toBeDefined();
    expect(result.windowEnd).toBeDefined();
  });

  // ── Efficiency edge case: AC = 0 ──────────────────────────────────────

  it('returns efficiencyRatio null when AC consumed is 0', async () => {
    prismaMock.vehicleMeterMap.findUnique.mockResolvedValue({
      vehicleId: 'VEH-001',
      meterId: 'METER-001',
    });

    prismaMock.$queryRaw
      .mockResolvedValueOnce([{ ac_total: 0 }])
      .mockResolvedValueOnce([{ dc_total: 0, avg_battery_temp: 0 }]);

    const result = await service.getPerformance('VEH-001');

    expect(result.acConsumedTotal).toBe(0);
    expect(result.dcDeliveredTotal).toBe(0);
    expect(result.efficiencyRatio).toBeNull();
  });

  // ── Efficiency > 1 (losses inverted) ──────────────────────────────────

  it('handles efficiency > 1 without clamping', async () => {
    prismaMock.vehicleMeterMap.findUnique.mockResolvedValue({
      vehicleId: 'VEH-001',
      meterId: 'METER-001',
    });

    prismaMock.$queryRaw
      .mockResolvedValueOnce([{ ac_total: 50 }])
      .mockResolvedValueOnce([{ dc_total: 60, avg_battery_temp: 28 }]);

    const result = await service.getPerformance('VEH-001');

    expect(result.efficiencyRatio).toBe(1.2);
  });

  // ── Window boundaries ─────────────────────────────────────────────────

  it('windowStart is exactly 24h before windowEnd', async () => {
    prismaMock.vehicleMeterMap.findUnique.mockResolvedValue({
      vehicleId: 'VEH-001',
      meterId: 'METER-001',
    });

    prismaMock.$queryRaw
      .mockResolvedValueOnce([{ ac_total: 10 }])
      .mockResolvedValueOnce([{ dc_total: 8, avg_battery_temp: 30 }]);

    const result = await service.getPerformance('VEH-001');

    const start = new Date(result.windowStart).getTime();
    const end = new Date(result.windowEnd).getTime();
    const diffHours = (end - start) / (1000 * 60 * 60);

    expect(diffHours).toBeCloseTo(24, 1);
  });

  // ── Verifies raw SQL queries are issued (not Prisma aggregate) ─────────

  it('calls $queryRaw twice: once for AC, once for DC', async () => {
    prismaMock.vehicleMeterMap.findUnique.mockResolvedValue({
      vehicleId: 'VEH-001',
      meterId: 'METER-001',
    });

    prismaMock.$queryRaw
      .mockResolvedValueOnce([{ ac_total: 10 }])
      .mockResolvedValueOnce([{ dc_total: 8, avg_battery_temp: 30 }]);

    await service.getPerformance('VEH-001');

    expect(prismaMock.$queryRaw).toHaveBeenCalledTimes(2);
  });
});
