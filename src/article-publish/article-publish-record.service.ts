import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ArticlePublishRecordEntity } from './article-publish-record.entity';
import { QueryPublishRecordListDto } from './dto/query-publish-record-list.dto';

@Injectable()
export class ArticlePublishRecordService {
  constructor(
    @InjectRepository(ArticlePublishRecordEntity)
    private readonly recordRepository: Repository<ArticlePublishRecordEntity>,
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
      .where('r.draftId = :draftId', { draftId })
      .orderBy('r.createdAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);

    const [data, total] = await qb.getManyAndCount();
    return { data, total, page, limit };
  }
}
