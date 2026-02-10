import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../db/prisma.service';

// Row shape returned by $queryRaw for aggregation queries
interface AcRow {
  ac_total: number | null;
}
interface DcRow {
  dc_total: number | null;
  avg_battery_temp: number | null;
}

@Injectable()
export class AnalyticsService {
  constructor(private readonly prisma: PrismaService) {}

  // ── Performance endpoint ─────────────────────────────────────────────────

  /**
   * GET /v1/analytics/performance/:vehicleId
   *
   * 1. Lookup meterId from vehicle_meter_map
   * 2. 24 h window
   * 3. Raw SQL aggregates on indexed (meter_id, ts) and (vehicle_id, ts)
   *    columns — Postgres uses index range scans, no full-table scans.
   * 4. efficiency = dc / ac  (0 when ac == 0)
   */
  async getPerformance(vehicleId: string) {
    // 1. Map lookup
    const mapping = await this.prisma.vehicleMeterMap.findUnique({
      where: { vehicleId },
    });
    if (!mapping) {
      throw new NotFoundException(
        `No meter mapping found for vehicle "${vehicleId}"`,
      );
    }
    const { meterId } = mapping;

    // 2. 24 h window
    const windowEnd = new Date();
    const windowStart = new Date(windowEnd.getTime() - 24 * 60 * 60 * 1000);

    // 3a. AC total — meter_readings, index (meter_id, ts)
    const [acRow] = await this.prisma.$queryRaw<AcRow[]>`
      SELECT COALESCE(SUM(kwh_consumed_ac), 0) AS ac_total
      FROM meter_readings
      WHERE meter_id = ${meterId}
        AND ts BETWEEN ${windowStart}::timestamptz AND ${windowEnd}::timestamptz`;

    // 3b. DC total + avg battery temp — vehicle_readings, index (vehicle_id, ts)
    const [dcRow] = await this.prisma.$queryRaw<DcRow[]>`
      SELECT COALESCE(SUM(kwh_delivered_dc), 0)  AS dc_total,
             COALESCE(AVG(battery_temp), 0)       AS avg_battery_temp
      FROM vehicle_readings
      WHERE vehicle_id = ${vehicleId}
        AND ts BETWEEN ${windowStart}::timestamptz AND ${windowEnd}::timestamptz`;

    const acConsumedTotal = Number(acRow.ac_total);
    const dcDeliveredTotal = Number(dcRow.dc_total);
    const avgBatteryTemp = Number(dcRow.avg_battery_temp);

    // 4. Efficiency ratio — guard against division by zero
    const efficiencyRatio =
      acConsumedTotal === 0
        ? null
        : parseFloat((dcDeliveredTotal / acConsumedTotal).toFixed(4));

    return {
      vehicleId,
      meterId,
      windowStart: windowStart.toISOString(),
      windowEnd: windowEnd.toISOString(),
      acConsumedTotal,
      dcDeliveredTotal,
      efficiencyRatio,
      avgBatteryTemp,
    };
  }

  // ── Existing summary endpoints ───────────────────────────────────────────

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
