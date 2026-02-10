import { Injectable } from '@nestjs/common';
import { PrismaService } from '../db/prisma.service';

@Injectable()
export class AnalyticsService {
  constructor(private readonly prisma: PrismaService) {}

  // ── Meter analytics (last 24 h) ─────────────────────────────────────────

  /**
   * Queries meter_readings WHERE ts >= cutoff.
   * Hits the (meterId, ts) index — no full-table scan.
   */
  async getMeterSummary24h() {
    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const agg = await this.prisma.meterReading.aggregate({
      where: { ts: { gte: cutoff } },
      _count: true,
      _sum: { kwhConsumedAc: true },
      _avg: { kwhConsumedAc: true, voltage: true },
      _min: { kwhConsumedAc: true, voltage: true },
      _max: { kwhConsumedAc: true, voltage: true },
    });

    return {
      totalReadings: agg._count,
      kwhConsumedAc: {
        sum: agg._sum.kwhConsumedAc ?? 0,
        avg: agg._avg.kwhConsumedAc ?? 0,
        min: agg._min.kwhConsumedAc ?? 0,
        max: agg._max.kwhConsumedAc ?? 0,
      },
      voltage: {
        avg: agg._avg.voltage ?? 0,
        min: agg._min.voltage ?? 0,
        max: agg._max.voltage ?? 0,
      },
      periodStart: cutoff.toISOString(),
      periodEnd: new Date().toISOString(),
    };
  }

  // ── Vehicle analytics (last 24 h) ───────────────────────────────────────

  async getVehicleSummary24h() {
    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const agg = await this.prisma.vehicleReading.aggregate({
      where: { ts: { gte: cutoff } },
      _count: true,
      _sum: { kwhDeliveredDc: true },
      _avg: { soc: true, kwhDeliveredDc: true, batteryTemp: true },
      _min: { soc: true, batteryTemp: true },
      _max: { soc: true, batteryTemp: true },
    });

    return {
      totalReadings: agg._count,
      kwhDeliveredDc: {
        sum: agg._sum.kwhDeliveredDc ?? 0,
        avg: agg._avg.kwhDeliveredDc ?? 0,
      },
      soc: {
        avg: agg._avg.soc ?? 0,
        min: agg._min.soc ?? 0,
        max: agg._max.soc ?? 0,
      },
      batteryTemp: {
        avg: agg._avg.batteryTemp ?? 0,
        min: agg._min.batteryTemp ?? 0,
        max: agg._max.batteryTemp ?? 0,
      },
      periodStart: cutoff.toISOString(),
      periodEnd: new Date().toISOString(),
    };
  }

  // ── Per-meter stats ─────────────────────────────────────────────────────

  async getMeterStats(meterId: string) {
    const [current, historyAgg] = await Promise.all([
      this.prisma.meterCurrent.findUnique({ where: { meterId } }),
      this.prisma.meterReading.aggregate({
        where: { meterId },
        _count: true,
        _sum: { kwhConsumedAc: true },
        _avg: { kwhConsumedAc: true, voltage: true },
      }),
    ]);

    return {
      meterId,
      current,
      history: {
        totalReadings: historyAgg._count,
        totalKwhConsumed: historyAgg._sum.kwhConsumedAc ?? 0,
        avgKwhConsumed: historyAgg._avg.kwhConsumedAc ?? 0,
        avgVoltage: historyAgg._avg.voltage ?? 0,
      },
    };
  }

  // ── Per-vehicle stats ───────────────────────────────────────────────────

  async getVehicleStats(vehicleId: string) {
    const [current, historyAgg] = await Promise.all([
      this.prisma.vehicleCurrent.findUnique({ where: { vehicleId } }),
      this.prisma.vehicleReading.aggregate({
        where: { vehicleId },
        _count: true,
        _sum: { kwhDeliveredDc: true },
        _avg: { soc: true, kwhDeliveredDc: true, batteryTemp: true },
      }),
    ]);

    return {
      vehicleId,
      current,
      history: {
        totalReadings: historyAgg._count,
        totalKwhDelivered: historyAgg._sum.kwhDeliveredDc ?? 0,
        avgSoc: historyAgg._avg.soc ?? 0,
        avgKwhDelivered: historyAgg._avg.kwhDeliveredDc ?? 0,
        avgBatteryTemp: historyAgg._avg.batteryTemp ?? 0,
      },
    };
  }
}
