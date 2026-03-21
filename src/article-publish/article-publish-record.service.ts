import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ArticleDraftEntity } from '../article-draft/article-draft.entity';
import { ArticlePublishRecordEntity } from './article-publish-record.entity';
import { QueryPublishRecordListDto } from './dto/query-publish-record-list.dto';
import { CreatePublishRecordDto } from './dto/create-publish-record.dto';
import { UpdatePublishRecordDto } from './dto/update-publish-record.dto';

@Injectable()
export class ArticlePublishRecordService {
  constructor(
    @InjectRepository(ArticlePublishRecordEntity)
    private readonly recordRepository: Repository<ArticlePublishRecordEntity>,
    @InjectRepository(ArticleDraftEntity)
    private readonly draftRepository: Repository<ArticleDraftEntity>,
  ) {}

  async findAll(dto: QueryPublishRecordListDto): Promise<{
    data: ArticlePublishRecordEntity[];
    total: number;
    page: number;
    limit: number;
  }> {
    const { page = 1, limit = 20 } = dto;

    const qb = this.recordRepository
      .createQueryBuilder('r')
      .leftJoinAndSelect('r.draft', 'draft')
      .orderBy('r.createdAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);

    const [data, total] = await qb.getManyAndCount();
    return { data, total, page, limit };
  }

  async findOne(id: string): Promise<ArticlePublishRecordEntity> {
    const record = await this.recordRepository.findOne({ where: { id } });
    if (!record) {
      throw new NotFoundException(`ArticlePublishRecord #${id} not found`);
    }
    return record;
  }

  async findByDraftId(
    draftId: string,
    dto: QueryPublishRecordListDto,
  ): Promise<{
    data: ArticlePublishRecordEntity[];
    total: number;
    page: number;
    limit: number;
  }> {
    const { page = 1, limit = 20 } = dto;

    const qb = this.recordRepository
      .createQueryBuilder('r')
      .leftJoinAndSelect('r.draft', 'draft')
      .where('r.draftId = :draftId', { draftId })
      .orderBy('r.createdAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);

    const [data, total] = await qb.getManyAndCount();
    return { data, total, page, limit };
  }

  async create(dto: CreatePublishRecordDto): Promise<ArticlePublishRecordEntity> {
    const draft = await this.draftRepository.findOne({
      where: { id: dto.draftId },
    });
    if (!draft) {
      throw new NotFoundException(`ArticleDraft #${dto.draftId} not found`);
    }

    const record = this.recordRepository.create({
      draftId: dto.draftId,
      permalink: dto.permalink ?? null,
      schedule: dto.schedule ?? null,
      meta: dto.meta ?? null,
    });

    return this.recordRepository.save(record);
  }

  async update(
    id: string,
    dto: UpdatePublishRecordDto,
  ): Promise<ArticlePublishRecordEntity> {
    const record = await this.findOne(id);

    if (dto.permalink !== undefined) record.permalink = dto.permalink ?? null;
    if (dto.schedule !== undefined) record.schedule = dto.schedule ?? null;
    if (dto.meta !== undefined) record.meta = dto.meta ?? null;

    return this.recordRepository.save(record);
  }

  async remove(id: string): Promise<void> {
    const record = await this.findOne(id);
    await this.recordRepository.remove(record);
  }
}
