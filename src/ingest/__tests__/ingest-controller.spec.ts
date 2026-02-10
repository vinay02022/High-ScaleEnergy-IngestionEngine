import 'reflect-metadata';
import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { IngestController } from '../ingest.controller';
import { IngestService } from '../ingest.service';

// ── Mock IngestService ───────────────────────────────────────────────────────

const mockIngestService = {
  ingestMeter: jest.fn().mockResolvedValue(undefined),
  ingestVehicle: jest.fn().mockResolvedValue(undefined),
};

describe('IngestController (polymorphic POST /v1/ingest)', () => {
  let controller: IngestController;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [IngestController],
      providers: [
        { provide: IngestService, useValue: mockIngestService },
      ],
    }).compile();

    controller = module.get<IngestController>(IngestController);
  });

  // ── Meter payloads ─────────────────────────────────────────────────────

  it('accepts a valid meter payload → 202, type: meter', async () => {
    const result = await controller.ingest({
      meterId: 'METER-001',
      kwhConsumedAc: 10,
      voltage: 230,
      timestamp: '2026-02-11T10:00:00Z',
    });
    expect(result).toEqual({ type: 'meter' });
    expect(mockIngestService.ingestMeter).toHaveBeenCalledTimes(1);
    expect(mockIngestService.ingestVehicle).not.toHaveBeenCalled();
  });

  it('rejects meter payload with negative voltage → 400', async () => {
    await expect(
      controller.ingest({
        meterId: 'METER-001',
        kwhConsumedAc: 10,
        voltage: -1,
        timestamp: '2026-02-11T10:00:00Z',
      }),
    ).rejects.toThrow(BadRequestException);
  });

  // ── Vehicle payloads ───────────────────────────────────────────────────

  it('accepts a valid vehicle payload → 202, type: vehicle', async () => {
    const result = await controller.ingest({
      vehicleId: 'VEH-001',
      soc: 80,
      kwhDeliveredDc: 5,
      batteryTemp: 30,
      timestamp: '2026-02-11T10:00:00Z',
    });
    expect(result).toEqual({ type: 'vehicle' });
    expect(mockIngestService.ingestVehicle).toHaveBeenCalledTimes(1);
    expect(mockIngestService.ingestMeter).not.toHaveBeenCalled();
  });

  it('rejects vehicle payload with soc > 100 → 400', async () => {
    await expect(
      controller.ingest({
        vehicleId: 'VEH-001',
        soc: 150,
        kwhDeliveredDc: 5,
        batteryTemp: 30,
        timestamp: '2026-02-11T10:00:00Z',
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('rejects vehicle payload with batteryTemp > 200 → 400', async () => {
    await expect(
      controller.ingest({
        vehicleId: 'VEH-001',
        soc: 50,
        kwhDeliveredDc: 5,
        batteryTemp: 999,
        timestamp: '2026-02-11T10:00:00Z',
      }),
    ).rejects.toThrow(BadRequestException);
  });

  // ── Unknown payloads ───────────────────────────────────────────────────

  it('rejects payload with neither meterId nor vehicleId → 400', async () => {
    await expect(
      controller.ingest({
        someField: 'random',
        timestamp: '2026-02-11T10:00:00Z',
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('rejects empty object → 400', async () => {
    await expect(controller.ingest({})).rejects.toThrow(BadRequestException);
  });
});
