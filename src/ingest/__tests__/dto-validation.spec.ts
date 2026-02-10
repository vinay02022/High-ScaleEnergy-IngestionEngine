import 'reflect-metadata';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import {
  CreateMeterReadingDto,
  CreateVehicleReadingDto,
} from '../dto/create-reading.dto';

// ── helpers ──────────────────────────────────────────────────────────────────

const validMeter = {
  meterId: 'METER-001',
  kwhConsumedAc: 12.5,
  voltage: 230.0,
  timestamp: '2026-02-11T10:00:00Z',
};

const validVehicle = {
  vehicleId: 'VEH-001',
  soc: 78.5,
  kwhDeliveredDc: 6.2,
  batteryTemp: 32.0,
  timestamp: '2026-02-11T10:00:00Z',
};

async function expectValid<T extends object>(cls: new () => T, data: object) {
  const dto = plainToInstance(cls, data);
  const errors = await validate(dto, {
    whitelist: true,
    forbidNonWhitelisted: true,
  });
  expect(errors).toHaveLength(0);
}

async function expectInvalid<T extends object>(
  cls: new () => T,
  data: object,
  minErrors = 1,
) {
  const dto = plainToInstance(cls, data);
  const errors = await validate(dto, {
    whitelist: true,
    forbidNonWhitelisted: true,
  });
  expect(errors.length).toBeGreaterThanOrEqual(minErrors);
  return errors;
}

// ── Meter DTO tests ──────────────────────────────────────────────────────────

describe('CreateMeterReadingDto', () => {
  it('accepts a valid meter payload', async () => {
    await expectValid(CreateMeterReadingDto, validMeter);
  });

  it('rejects negative kwhConsumedAc', async () => {
    await expectInvalid(CreateMeterReadingDto, {
      ...validMeter,
      kwhConsumedAc: -1,
    });
  });

  it('rejects negative voltage', async () => {
    await expectInvalid(CreateMeterReadingDto, {
      ...validMeter,
      voltage: -5,
    });
  });

  it('rejects missing meterId', async () => {
    const { meterId, ...rest } = validMeter;
    await expectInvalid(CreateMeterReadingDto, rest);
  });

  it('rejects missing timestamp', async () => {
    const { timestamp, ...rest } = validMeter;
    await expectInvalid(CreateMeterReadingDto, rest);
  });

  it('rejects non-ISO timestamp', async () => {
    await expectInvalid(CreateMeterReadingDto, {
      ...validMeter,
      timestamp: 'not-a-date',
    });
  });

  it('rejects non-numeric kwhConsumedAc', async () => {
    await expectInvalid(CreateMeterReadingDto, {
      ...validMeter,
      kwhConsumedAc: 'abc',
    });
  });
});

// ── Vehicle DTO tests ────────────────────────────────────────────────────────

describe('CreateVehicleReadingDto', () => {
  it('accepts a valid vehicle payload', async () => {
    await expectValid(CreateVehicleReadingDto, validVehicle);
  });

  it('rejects soc > 100', async () => {
    await expectInvalid(CreateVehicleReadingDto, {
      ...validVehicle,
      soc: 101,
    });
  });

  it('rejects soc < 0', async () => {
    await expectInvalid(CreateVehicleReadingDto, {
      ...validVehicle,
      soc: -1,
    });
  });

  it('rejects negative kwhDeliveredDc', async () => {
    await expectInvalid(CreateVehicleReadingDto, {
      ...validVehicle,
      kwhDeliveredDc: -0.1,
    });
  });

  it('rejects batteryTemp < -50', async () => {
    await expectInvalid(CreateVehicleReadingDto, {
      ...validVehicle,
      batteryTemp: -51,
    });
  });

  it('rejects batteryTemp > 200', async () => {
    await expectInvalid(CreateVehicleReadingDto, {
      ...validVehicle,
      batteryTemp: 201,
    });
  });

  it('accepts batteryTemp at boundaries (-50 and 200)', async () => {
    await expectValid(CreateVehicleReadingDto, {
      ...validVehicle,
      batteryTemp: -50,
    });
    await expectValid(CreateVehicleReadingDto, {
      ...validVehicle,
      batteryTemp: 200,
    });
  });

  it('rejects missing vehicleId', async () => {
    const { vehicleId, ...rest } = validVehicle;
    await expectInvalid(CreateVehicleReadingDto, rest);
  });

  it('rejects missing timestamp', async () => {
    const { timestamp, ...rest } = validVehicle;
    await expectInvalid(CreateVehicleReadingDto, rest);
  });
});
