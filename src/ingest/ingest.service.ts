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

  async ingestMeterReading(dto: CreateMeterReadingDto) {
    return this.ingestMeterBatch([dto]);
  }

  /**
   * Batch meter ingestion in one transaction:
   *   1. INSERT into meter_readings  (history — append-only)
   *   2. UPSERT into meter_current   (latest state per meter)
   */
  async ingestMeterBatch(dtos: CreateMeterReadingDto[]) {
    await this.prisma.$transaction(async (tx) => {
      // 1. History — bulk append
      await tx.meterReading.createMany({
        data: dtos.map((d) => ({
          meterId: d.meterId,
          kwhConsumedAc: d.kwhConsumedAc,
          voltage: d.voltage,
          ts: new Date(d.ts),
        })),
      });

      // 2. Current — upsert latest state per meter
      for (const d of dtos) {
        await tx.meterCurrent.upsert({
          where: { meterId: d.meterId },
          create: {
            meterId: d.meterId,
            kwhConsumedAc: d.kwhConsumedAc,
            voltage: d.voltage,
            ts: new Date(d.ts),
          },
          update: {
            kwhConsumedAc: d.kwhConsumedAc,
            voltage: d.voltage,
            ts: new Date(d.ts),
          },
        });
      }
    });

    this.logger.log(`Ingested ${dtos.length} meter readings`);
    return { inserted: dtos.length };
  }

  // ── Vehicle ──────────────────────────────────────────────────────────────

  async ingestVehicleReading(dto: CreateVehicleReadingDto) {
    return this.ingestVehicleBatch([dto]);
  }

  /**
   * Batch vehicle ingestion in one transaction:
   *   1. INSERT into vehicle_readings (history — append-only)
   *   2. UPSERT into vehicle_current  (latest state per vehicle)
   */
  async ingestVehicleBatch(dtos: CreateVehicleReadingDto[]) {
    await this.prisma.$transaction(async (tx) => {
      // 1. History — bulk append
      await tx.vehicleReading.createMany({
        data: dtos.map((d) => ({
          vehicleId: d.vehicleId,
          soc: d.soc,
          kwhDeliveredDc: d.kwhDeliveredDc,
          batteryTemp: d.batteryTemp,
          ts: new Date(d.ts),
        })),
      });

      // 2. Current — upsert latest state per vehicle
      for (const d of dtos) {
        await tx.vehicleCurrent.upsert({
          where: { vehicleId: d.vehicleId },
          create: {
            vehicleId: d.vehicleId,
            soc: d.soc,
            kwhDeliveredDc: d.kwhDeliveredDc,
            batteryTemp: d.batteryTemp,
            ts: new Date(d.ts),
          },
          update: {
            soc: d.soc,
            kwhDeliveredDc: d.kwhDeliveredDc,
            batteryTemp: d.batteryTemp,
            ts: new Date(d.ts),
          },
        });
      }
    });

    this.logger.log(`Ingested ${dtos.length} vehicle readings`);
    return { inserted: dtos.length };
  }
}
