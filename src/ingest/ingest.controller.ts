import { Body, Controller, Post, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { IngestService } from './ingest.service';
import {
  CreateMeterReadingDto,
  CreateVehicleReadingDto,
} from './dto/create-reading.dto';
import {
  BatchMeterReadingDto,
  BatchVehicleReadingDto,
} from './dto/batch-reading.dto';

@ApiTags('Ingestion')
@Controller('api/ingest')
export class IngestController {
  constructor(private readonly ingestService: IngestService) {}

  // ── Meter endpoints ──────────────────────────────────────────────────────

  @Post('meter')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Ingest a single meter reading' })
  @ApiResponse({ status: 201, description: 'Meter reading ingested' })
  async ingestMeter(@Body() dto: CreateMeterReadingDto) {
    return this.ingestService.ingestMeterReading(dto);
  }

  @Post('meter/batch')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Ingest a batch of meter readings (up to 10 000)' })
  @ApiResponse({ status: 201, description: 'Batch ingested' })
  async ingestMeterBatch(@Body() dto: BatchMeterReadingDto) {
    return this.ingestService.ingestMeterBatch(dto.readings);
  }

  // ── Vehicle endpoints ────────────────────────────────────────────────────

  @Post('vehicle')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Ingest a single vehicle reading' })
  @ApiResponse({ status: 201, description: 'Vehicle reading ingested' })
  async ingestVehicle(@Body() dto: CreateVehicleReadingDto) {
    return this.ingestService.ingestVehicleReading(dto);
  }

  @Post('vehicle/batch')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Ingest a batch of vehicle readings (up to 10 000)' })
  @ApiResponse({ status: 201, description: 'Batch ingested' })
  async ingestVehicleBatch(@Body() dto: BatchVehicleReadingDto) {
    return this.ingestService.ingestVehicleBatch(dto.readings);
  }
}
