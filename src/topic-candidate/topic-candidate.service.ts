import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { TopicCandidateEntity } from './topic-candidate.entity';
import { TopicCandidateStatus } from './enums/topic-candidate-status.enum';
import {
  QueryTopicCandidateListDto,
  CandidateSortBy,
  CandidateSortOrder,
} from './dto/query-topic-candidate-list.dto';
import {
  AllowedCandidateStatus,
  UpdateTopicCandidateStatusDto,
} from './dto/update-topic-candidate-status.dto';
import { ArticleDraftEntity } from '../article-draft/article-draft.entity';
import { ArticleDraftStatus } from '../article-draft/enums/article-draft-status.enum';
import { formatTitleWithCategory } from '../common/utils/title.util';
import {
  ARTICLE_OUTLINE_QUEUE,
  GENERATE_ARTICLE_OUTLINE_JOB,
} from '../article-outline/article-outline.constants';

export interface CandidatePayload {
  keyword: string;
  title: string;
  score: number;
  searchIntent: string | null;
  targetReader: string | null;
  whyThisTopic: string | null;
  outlinePreview: string[] | null;
}

export interface EvaluationPayload {
  id: string;
  overallScore: number;
  rank: number;
  strengths: string[];
  weaknesses: string[];
  verdict: string;
}

type ApproveResult = {
  id: string;
  status: 'approved';
  articleDraftId: string;
  articleDraftCreated: boolean;
};

type RejectResult = {
  id: string;
  status: 'rejected';
};

@Injectable()
export class TopicCandidateService {
  constructor(
    @InjectRepository(TopicCandidateEntity)
    private readonly candidateRepository: Repository<TopicCandidateEntity>,
    @InjectRepository(ArticleDraftEntity)
    private readonly draftRepository: Repository<ArticleDraftEntity>,
    @InjectQueue(ARTICLE_OUTLINE_QUEUE)
    private readonly articleOutlineQueue: Queue,
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
          searchIntent: c.searchIntent,
          targetReader: c.targetReader,
          whyThisTopic: c.whyThisTopic,
          outlinePreview: c.outlinePreview,
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
  ): Promise<ApproveResult | RejectResult> {
    if (dto.status === AllowedCandidateStatus.APPROVED) {
      return this.approveCandidate(id);
    }
    return this.rejectCandidate(id);
  }

  private async approveCandidate(id: string): Promise<ApproveResult> {
    const { draft, articleDraftCreated } =
      await this.candidateRepository.manager.transaction(async (manager) => {
        // 1. candidate 조회 및 상태 검증
        const candidate = await manager.findOne(TopicCandidateEntity, {
          where: { id },
          relations: ['topicSeed'],
        });
        if (!candidate) {
          throw new NotFoundException(`TopicCandidate #${id} not found`);
        }
        if (candidate.status !== TopicCandidateStatus.PENDING) {
          throw new ConflictException(
            `TopicCandidate #${id} is not pending (current: ${candidate.status})`,
          );
        }

        // 2. 대상 candidate approved
        await manager.update(TopicCandidateEntity, { id }, {
          status: TopicCandidateStatus.APPROVED,
        });

        // 3. 같은 seed의 다른 pending candidate 전부 rejected
        await manager
          .createQueryBuilder()
          .update(TopicCandidateEntity)
          .set({ status: TopicCandidateStatus.REJECTED })
          .where('topicSeedId = :topicSeedId', { topicSeedId: candidate.topicSeedId })
          .andWhere('id != :id', { id })
          .andWhere('status = :status', { status: TopicCandidateStatus.PENDING })
          .execute();

        // 4. article_draft find-or-create
        const existingDraft = await manager.findOne(ArticleDraftEntity, {
          where: { topicCandidateId: id },
        });

        let draft: ArticleDraftEntity;
        let articleDraftCreated: boolean;

        if (existingDraft) {
          draft = existingDraft;
          articleDraftCreated = false;
        } else {
          const newDraft = manager.create(ArticleDraftEntity, {
            topicCandidateId: id,
            title: formatTitleWithCategory(candidate.topicSeed.category, candidate.title),
            keyword: candidate.keyword,
            status: ArticleDraftStatus.QUEUED,
          });
          draft = await manager.save(newDraft);
          articleDraftCreated = true;
        }

        return { draft, articleDraftCreated };
      });

    // 5. 트랜잭션 커밋 이후 enqueue
    await this.articleOutlineQueue.add(GENERATE_ARTICLE_OUTLINE_JOB, {
      articleDraftId: draft.id,
    });

    return {
      id,
      status: 'approved',
      articleDraftId: draft.id,
      articleDraftCreated,
    };
  }

  private async rejectCandidate(id: string): Promise<RejectResult> {
    const candidate = await this.candidateRepository.findOne({ where: { id } });
    if (!candidate) {
      throw new NotFoundException(`TopicCandidate #${id} not found`);
    }

    candidate.status = TopicCandidateStatus.REJECTED;
    await this.candidateRepository.save(candidate);

    return { id, status: 'rejected' };
  }

  async findBySeedId(seedId: string): Promise<TopicCandidateEntity[]> {
    return this.candidateRepository.find({
      where: { topicSeedId: seedId },
      order: { createdAt: 'ASC' },
    });
  }

  async saveEvaluations(evaluations: EvaluationPayload[]): Promise<void> {
    if (evaluations.length === 0) return;

    await Promise.all(
      evaluations.map((e) =>
        this.candidateRepository.update(e.id, {
          overallScore: e.overallScore,
          rank: e.rank,
          strengths: e.strengths,
          weaknesses: e.weaknesses,
          verdict: e.verdict,
        }),
      ),
    );
  }
}
