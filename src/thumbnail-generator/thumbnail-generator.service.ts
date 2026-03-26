import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { ThumbnailPromptEntity } from './entities/thumbnail-prompt.entity';
import { ThumbnailEntity } from './entities/thumbnail.entity';
import { ThumbnailPromptMappingEntity } from './entities/thumbnail-prompt-mapping.entity';
import { GenerateThumbnailDto } from './dto/generate-thumbnail.dto';
import { QueryThumbnailPromptsDto } from './dto/query-thumbnail-prompts.dto';
import {
  THUMBNAIL_GENERATOR_QUEUE,
  GENERATE_THUMBNAIL_JOB,
} from './thumbnail-generator.constants';

export interface GenerateThumbnailJobPayload {
  promptId: string;
}

@Injectable()
export class ThumbnailGeneratorService {
  constructor(
    @InjectRepository(ThumbnailPromptEntity)
    private readonly promptRepo: Repository<ThumbnailPromptEntity>,
    @InjectRepository(ThumbnailEntity)
    private readonly thumbnailRepo: Repository<ThumbnailEntity>,
    @InjectRepository(ThumbnailPromptMappingEntity)
    private readonly mappingRepo: Repository<ThumbnailPromptMappingEntity>,
    @InjectQueue(THUMBNAIL_GENERATOR_QUEUE)
    private readonly queue: Queue,
  ) {}

  /** 프롬프트 저장 + 큐 등록 */
  async generate(dto: GenerateThumbnailDto): Promise<ThumbnailPromptEntity> {
    const prompt = this.promptRepo.create({
      name: dto.name ?? null,
      prompt: dto.prompt,
      model: dto.model ?? 'black-forest-labs/flux-schnell',
      meta: {
        aspect_ratio: dto.aspect_ratio ?? '16:9',
        output_format: dto.output_format ?? 'webp',
        output_quality: dto.output_quality ?? 85,
        num_outputs: dto.num_outputs ?? 1,
      },
      status: 'generating',
    });

    const saved = await this.promptRepo.save(prompt);

    await this.queue.add(
      GENERATE_THUMBNAIL_JOB,
      { promptId: saved.id } satisfies GenerateThumbnailJobPayload,
    );

    return saved;
  }

  /** 프롬프트 목록 */
  async findAll(query: QueryThumbnailPromptsDto) {
    const { page = 1, limit = 20 } = query;
    const [data, total] = await this.promptRepo.findAndCount({
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });
    return { data, total, page, limit };
  }

  /** 프롬프트 상세 (status 포함 — FE 폴링용) */
  async findOne(id: string): Promise<ThumbnailPromptEntity> {
    const prompt = await this.promptRepo.findOne({ where: { id } });
    if (!prompt) throw new NotFoundException(`ThumbnailPrompt #${id} not found`);
    return prompt;
  }

  /** 프롬프트에 연결된 이미지 목록 */
  async findImages(promptId: string) {
    await this.findOne(promptId); // 존재 확인
    return this.mappingRepo.find({
      where: { promptId },
      relations: ['thumbnail'],
      order: { rank: 'ASC', createdAt: 'ASC' },
    });
  }

  /** active 플래그 토글 */
  async setActive(mappingId: string, active: boolean) {
    const mapping = await this.mappingRepo.findOne({ where: { id: mappingId } });
    if (!mapping) throw new NotFoundException(`Mapping #${mappingId} not found`);
    mapping.active = active;
    return this.mappingRepo.save(mapping);
  }

  /** 프롬프트 삭제 (CASCADE로 mapping도 삭제) */
  async remove(id: string): Promise<void> {
    const prompt = await this.findOne(id);
    await this.promptRepo.remove(prompt);
  }

  // ─── Processor에서 사용 ───────────────────────────────────────────────────

  async saveThumbnailAndMapping(
    promptId: string,
    url: string,
    mimeType: string,
    rank: number,
  ): Promise<void> {
    const thumbnail = await this.thumbnailRepo.save(
      this.thumbnailRepo.create({
        url,
        mimeType,
        meta: { mimeType },
      }),
    );

    await this.mappingRepo.save(
      this.mappingRepo.create({
        promptId,
        thumbnailId: thumbnail.id,
        rank,
        active: false,
      }),
    );
  }

  async updatePromptStatus(
    id: string,
    status: 'done' | 'failed',
  ): Promise<void> {
    await this.promptRepo.update(id, { status });
  }
}
