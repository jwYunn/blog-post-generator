import { PartialType } from '@nestjs/mapped-types';
import { CreateTopicSeedDto } from './create-topic-seed.dto';

export class UpdateTopicSeedDto extends PartialType(CreateTopicSeedDto) {}
