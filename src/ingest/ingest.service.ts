import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../db/prisma.service';
import {
  CreateMeterReadingDto,
  CreateVehicleReadingDto,
} from './dto/create-reading.dto';

@Injectable()
export class IngestService {
  private readonly logger = new Logger(IngestService.name);

  constructor(private readonly prisma: PrismaService) {}

  // ── Meter ────────────────────────────────────────────────────────────────

  /**
   * 1. INSERT into meter_readings   (history, append-only)
   * 2. Raw SQL UPSERT into meter_current — only updates when incoming ts
   *    is strictly newer than what's already stored.
   */
  async ingestMeter(dto: CreateMeterReadingDto) {
    const ts = new Date(dto.timestamp);

    await this.prisma.$transaction(async (tx) => {
      // History — append
      await tx.meterReading.create({
        data: {
          meterId: dto.meterId,
          kwhConsumedAc: dto.kwhConsumedAc,
          voltage: dto.voltage,
          ts,
        },
      });

      // Current — conditional UPSERT (only if newer)
      await tx.$executeRaw`
        INSERT INTO meter_current (meter_id, kwh_consumed_ac, voltage, ts)
        VALUES (${dto.meterId}, ${dto.kwhConsumedAc}, ${dto.voltage}, ${ts}::timestamptz)
        ON CONFLICT (meter_id)
        DO UPDATE SET
          kwh_consumed_ac = EXCLUDED.kwh_consumed_ac,
          voltage         = EXCLUDED.voltage,
          ts              = EXCLUDED.ts
        WHERE meter_current.ts < EXCLUDED.ts`;
    });

    this.logger.log(`Ingested meter reading for ${dto.meterId}`);
  }

  // ── Vehicle ──────────────────────────────────────────────────────────────

  /**
   * Same pattern: INSERT history + raw SQL UPSERT current with ts guard.
   */
  async ingestVehicle(dto: CreateVehicleReadingDto) {
    const ts = new Date(dto.timestamp);

    await this.prisma.$transaction(async (tx) => {
      // History — append
      await tx.vehicleReading.create({
        data: {
          vehicleId: dto.vehicleId,
          soc: dto.soc,
          kwhDeliveredDc: dto.kwhDeliveredDc,
          batteryTemp: dto.batteryTemp,
          ts,
        },
      });

      // Current — conditional UPSERT (only if newer)
      await tx.$executeRaw`
        INSERT INTO vehicle_current (vehicle_id, soc, kwh_delivered_dc, battery_temp, ts)
        VALUES (${dto.vehicleId}, ${dto.soc}, ${dto.kwhDeliveredDc}, ${dto.batteryTemp}, ${ts}::timestamptz)
        ON CONFLICT (vehicle_id)
        DO UPDATE SET
          soc              = EXCLUDED.soc,
          kwh_delivered_dc = EXCLUDED.kwh_delivered_dc,
          battery_temp     = EXCLUDED.battery_temp,
          ts               = EXCLUDED.ts
        WHERE vehicle_current.ts < EXCLUDED.ts`;
    });

    this.logger.log(`Ingested vehicle reading for ${dto.vehicleId}`);
  }
}
