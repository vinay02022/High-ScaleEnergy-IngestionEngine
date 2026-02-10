import { ApiProperty } from '@nestjs/swagger';
import {
  IsString,
  IsNumber,
  IsDateString,
  IsNotEmpty,
  MaxLength,
  Min,
} from 'class-validator';

// ── Meter ────────────────────────────────────────────────────────────────────

export class CreateMeterReadingDto {
  @ApiProperty({ example: 'METER-001' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  meterId: string;

  @ApiProperty({ example: 12.5, description: 'AC energy consumed (kWh)' })
  @IsNumber()
  @Min(0)
  kwhConsumedAc: number;

  @ApiProperty({ example: 230.4, description: 'Voltage (V)' })
  @IsNumber()
  @Min(0)
  voltage: number;

  @ApiProperty({ example: '2026-02-11T10:30:00Z' })
  @IsDateString()
  ts: string;
}

// ── Vehicle ──────────────────────────────────────────────────────────────────

export class CreateVehicleReadingDto {
  @ApiProperty({ example: 'VEH-001' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  vehicleId: string;

  @ApiProperty({ example: 78.5, description: 'State of charge (%)' })
  @IsNumber()
  @Min(0)
  soc: number;

  @ApiProperty({ example: 6.2, description: 'DC energy delivered (kWh)' })
  @IsNumber()
  @Min(0)
  kwhDeliveredDc: number;

  @ApiProperty({ example: 32.1, description: 'Battery temperature (°C)' })
  @IsNumber()
  batteryTemp: number;

  @ApiProperty({ example: '2026-02-11T10:30:00Z' })
  @IsDateString()
  ts: string;
}
