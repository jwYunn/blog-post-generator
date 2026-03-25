import { PartialType } from '@nestjs/mapped-types';
import { CreateApiSourceDto } from './create-api-source.dto';

export class UpdateApiSourceDto extends PartialType(CreateApiSourceDto) {}
