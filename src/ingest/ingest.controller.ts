import {
  Body,
  Controller,
  Post,
  HttpCode,
  HttpStatus,
  BadRequestException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBody } from '@nestjs/swagger';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { IngestService } from './ingest.service';
import {
  CreateMeterReadingDto,
  CreateVehicleReadingDto,
} from './dto/create-reading.dto';

@ApiTags('Ingestion')
@Controller('v1/ingest')
export class IngestController {
  constructor(private readonly ingestService: IngestService) {}

  /**
   * Polymorphic endpoint — detects payload type:
   *   - meterId present  → meter reading
   *   - vehicleId present → vehicle reading
   *   - neither           → 400
   */
  @Post()
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({
    summary: 'Ingest a single reading (meter or vehicle, auto-detected)',
  })
  @ApiBody({
    schema: {
      oneOf: [
        { $ref: '#/components/schemas/CreateMeterReadingDto' },
        { $ref: '#/components/schemas/CreateVehicleReadingDto' },
      ],
    },
  })
  @ApiResponse({ status: 202, description: 'Reading accepted' })
  @ApiResponse({ status: 400, description: 'Invalid or unrecognised payload' })
  async ingest(@Body() body: Record<string, unknown>) {
    // ── Detect type ────────────────────────────────────────────────────────
    if (body.meterId !== undefined) {
      const dto = plainToInstance(CreateMeterReadingDto, body);
      const errors = await validate(dto, {
        whitelist: true,
        forbidNonWhitelisted: true,
      });
      if (errors.length > 0) {
        throw new BadRequestException(
          errors.flatMap((e) => Object.values(e.constraints ?? {})),
        );
      }
      await this.ingestService.ingestMeter(dto);
      return { type: 'meter' };
    }

    if (body.vehicleId !== undefined) {
      const dto = plainToInstance(CreateVehicleReadingDto, body);
      const errors = await validate(dto, {
        whitelist: true,
        forbidNonWhitelisted: true,
      });
      if (errors.length > 0) {
        throw new BadRequestException(
          errors.flatMap((e) => Object.values(e.constraints ?? {})),
        );
      }
      await this.ingestService.ingestVehicle(dto);
      return { type: 'vehicle' };
    }

    throw new BadRequestException(
      'Payload must contain either "meterId" (meter) or "vehicleId" (vehicle)',
    );
  }
}
