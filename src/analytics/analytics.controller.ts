import { Controller, Get, Param } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiParam } from '@nestjs/swagger';
import { AnalyticsService } from './analytics.service';

@ApiTags('Analytics')
@Controller('api/analytics')
export class AnalyticsController {
  constructor(private readonly analyticsService: AnalyticsService) {}

  @Get('meter/summary')
  @ApiOperation({ summary: 'Meter summary for the last 24 hours' })
  async getMeterSummary() {
    return this.analyticsService.getMeterSummary24h();
  }

  @Get('vehicle/summary')
  @ApiOperation({ summary: 'Vehicle summary for the last 24 hours' })
  async getVehicleSummary() {
    return this.analyticsService.getVehicleSummary24h();
  }

  @Get('meter/:meterId')
  @ApiOperation({ summary: 'Current state + history stats for a meter' })
  @ApiParam({ name: 'meterId', example: 'METER-001' })
  async getMeterStats(@Param('meterId') meterId: string) {
    return this.analyticsService.getMeterStats(meterId);
  }

  @Get('vehicle/:vehicleId')
  @ApiOperation({ summary: 'Current state + history stats for a vehicle' })
  @ApiParam({ name: 'vehicleId', example: 'VEH-001' })
  async getVehicleStats(@Param('vehicleId') vehicleId: string) {
    return this.analyticsService.getVehicleStats(vehicleId);
  }
}
