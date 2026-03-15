import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TopicCandidateEntity } from './topic-candidate.entity';
import { TopicCandidateStatus } from './enums/topic-candidate-status.enum';
import {
  QueryTopicCandidateListDto,
  CandidateSortBy,
  CandidateSortOrder,
} from './dto/query-topic-candidate-list.dto';
import { UpdateTopicCandidateStatusDto } from './dto/update-topic-candidate-status.dto';

export interface CandidatePayload {
  keyword: string;
  title: string;
  score: number;
}

@Injectable()
export class TopicCandidateService {
  constructor(
    @InjectRepository(TopicCandidateEntity)
    private readonly candidateRepository: Repository<TopicCandidateEntity>,
  ) {}

  async saveMany(seedId: string, candidates: CandidatePayload[]): Promise<void> {
    const existing = await this.candidateRepository.find({
      where: { topicSeedId: seedId },
      select: ['keyword', 'title'],
    });

    const existingSet = new Set(
      existing.map((c) => `${c.keyword}::${c.title}`),
    );

    const toSave = candidates
      .filter((c) => !existingSet.has(`${c.keyword}::${c.title}`))
      .map((c) =>
        this.candidateRepository.create({
          topicSeedId: seedId,
          keyword: c.keyword,
          title: c.title,
          score: c.score,
          status: TopicCandidateStatus.PENDING,
        }),
      );

    if (toSave.length > 0) {
      await this.candidateRepository.save(toSave);
    }
  }

  async findAll(dto: QueryTopicCandidateListDto): Promise<{
    data: TopicCandidateEntity[];
    total: number;
    page: number;
    limit: number;
  }> {
    const {
      page = 1,
      limit = 20,
      topicSeedId,
      status,
      keyword,
      minScore,
      maxScore,
      sortBy = CandidateSortBy.CREATED_AT,
      sortOrder = CandidateSortOrder.DESC,
    } = dto;

    const qb = this.candidateRepository.createQueryBuilder('tc');

    if (topicSeedId) {
      qb.andWhere('tc.topicSeedId = :topicSeedId', { topicSeedId });
    }
    if (status) {
      qb.andWhere('tc.status = :status', { status });
    }
    if (keyword) {
      qb.andWhere('(tc.keyword ILIKE :keyword OR tc.title ILIKE :keyword)', {
        keyword: `%${keyword}%`,
      });
    }
    if (minScore !== undefined) {
      qb.andWhere('tc.score >= :minScore', { minScore });
    }
    if (maxScore !== undefined) {
      qb.andWhere('tc.score <= :maxScore', { maxScore });
    }

    qb.orderBy(`tc.${sortBy}`, sortOrder);
    qb.skip((page - 1) * limit).take(limit);

    const [data, total] = await qb.getManyAndCount();

    return { data, total, page, limit };
  }

  async updateStatus(
    id: string,
    dto: UpdateTopicCandidateStatusDto,
  ): Promise<TopicCandidateEntity> {
    const candidate = await this.candidateRepository.findOne({ where: { id } });
    if (!candidate) {
      throw new NotFoundException(`TopicCandidate #${id} not found`);
    }

    candidate.status = dto.status as unknown as TopicCandidateStatus;
    return this.candidateRepository.save(candidate);
  }
}
