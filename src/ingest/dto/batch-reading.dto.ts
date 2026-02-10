import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, ValidateNested } from 'class-validator';
import {
  CreateMeterReadingDto,
  CreateVehicleReadingDto,
} from './create-reading.dto';

export class BatchMeterReadingDto {
  @ApiProperty({ type: [CreateMeterReadingDto] })
  @ValidateNested({ each: true })
  @Type(() => CreateMeterReadingDto)
  @ArrayMinSize(1)
  @ArrayMaxSize(10_000)
  readings: CreateMeterReadingDto[];
}

export class BatchVehicleReadingDto {
  @ApiProperty({ type: [CreateVehicleReadingDto] })
  @ValidateNested({ each: true })
  @Type(() => CreateVehicleReadingDto)
  @ArrayMinSize(1)
  @ArrayMaxSize(10_000)
  readings: CreateVehicleReadingDto[];
}
