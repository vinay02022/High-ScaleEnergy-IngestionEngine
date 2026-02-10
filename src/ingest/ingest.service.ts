import { Injectable, Logger } from '@nestjs/common';
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
   * 1. INSERT into meter_readings (history, append-only)
   * 2. Raw SQL UPSERT into meter_current — only overwrites if incoming ts
   *    is newer than what's already stored (conditional timestamp update).
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

      // Current — raw UPSERT with conditional ts guard
      await tx.$executeRawUnsafe(
        `INSERT INTO meter_current ("meterId", "kwhConsumedAc", "voltage", "ts")
         VALUES ($1, $2, $3, $4)
         ON CONFLICT ("meterId")
         DO UPDATE SET
           "kwhConsumedAc" = EXCLUDED."kwhConsumedAc",
           "voltage"       = EXCLUDED."voltage",
           "ts"            = EXCLUDED."ts"
         WHERE meter_current."ts" < EXCLUDED."ts"`,
        dto.meterId,
        dto.kwhConsumedAc,
        dto.voltage,
        ts,
      );
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

      // Current — raw UPSERT with conditional ts guard
      await tx.$executeRawUnsafe(
        `INSERT INTO vehicle_current ("vehicleId", "soc", "kwhDeliveredDc", "batteryTemp", "ts")
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT ("vehicleId")
         DO UPDATE SET
           "soc"            = EXCLUDED."soc",
           "kwhDeliveredDc" = EXCLUDED."kwhDeliveredDc",
           "batteryTemp"    = EXCLUDED."batteryTemp",
           "ts"             = EXCLUDED."ts"
         WHERE vehicle_current."ts" < EXCLUDED."ts"`,
        dto.vehicleId,
        dto.soc,
        dto.kwhDeliveredDc,
        dto.batteryTemp,
        ts,
      );
    });

    this.logger.log(`Ingested vehicle reading for ${dto.vehicleId}`);
  }
}
