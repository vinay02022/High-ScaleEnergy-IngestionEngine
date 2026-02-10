import { Controller, Get, Param } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiParam, ApiResponse } from '@nestjs/swagger';
import { AnalyticsService } from './analytics.service';

@ApiTags('Analytics')
@Controller()
export class AnalyticsController {
  constructor(private readonly analyticsService: AnalyticsService) {}

  // ── Performance (Phase 5) ────────────────────────────────────────────────

  @Get('v1/analytics/performance/:vehicleId')
  @ApiOperation({
    summary: 'Vehicle charging performance — last 24 h',
    description:
      'Looks up the linked meter, sums AC consumed + DC delivered in the ' +
      'last 24 h, and computes efficiency = DC / AC. Uses indexed ' +
      '(meter_id, ts) and (vehicle_id, ts) — no full-table scan.',
  })
  @ApiParam({ name: 'vehicleId', example: 'VEH-001' })
  @ApiResponse({ status: 200, description: 'Performance metrics returned' })
  @ApiResponse({ status: 404, description: 'Vehicle has no meter mapping' })
  async getPerformance(@Param('vehicleId') vehicleId: string) {
    return this.analyticsService.getPerformance(vehicleId);
  }

  // ── Existing summary endpoints ───────────────────────────────────────────

  @Get('api/analytics/meter/summary')
  @ApiOperation({ summary: 'Meter summary for the last 24 hours' })
  async getMeterSummary() {
    return this.analyticsService.getMeterSummary24h();
  }

  @Get('api/analytics/vehicle/summary')
  @ApiOperation({ summary: 'Vehicle summary for the last 24 hours' })
  async getVehicleSummary() {
    return this.analyticsService.getVehicleSummary24h();
  }

  @Get('api/analytics/meter/:meterId')
  @ApiOperation({ summary: 'Current state + history stats for a meter' })
  @ApiParam({ name: 'meterId', example: 'METER-001' })
  async getMeterStats(@Param('meterId') meterId: string) {
    return this.analyticsService.getMeterStats(meterId);
  }

  @Get('api/analytics/vehicle/:vehicleId')
  @ApiOperation({ summary: 'Current state + history stats for a vehicle' })
  @ApiParam({ name: 'vehicleId', example: 'VEH-001' })
  async getVehicleStats(@Param('vehicleId') vehicleId: string) {
    return this.analyticsService.getVehicleStats(vehicleId);
  }
}
