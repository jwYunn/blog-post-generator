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
import { EvaluationScope } from './enums/evaluation-scope.enum';

/** Days a seed rests after one of its candidates became an article */
const SEED_COOLDOWN_DAYS = 7;
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
import {
  formatTitleWithCategory,
  stripTitleCategory,
} from '../common/utils/title.util';
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
  verdict: 'keep' | 'consider' | 'drop';
  evaluationDetail: Record<string, number> | null;
}

type ApproveResult = {
  id: string;
  status: 'approved';
  articleDraftId: string;
  articleDraftCreated: boolean;
  /**
   * Whether this approval actually started the generation pipeline. False when
   * an existing draft was left alone, so the caller does not report work that
   * is not happening.
   */
  pipelineQueued: boolean;
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

  /** Returns what it inserted so the caller can record it on the job */
  async saveMany(
    seedId: string,
    candidates: CandidatePayload[],
  ): Promise<{ saved: number; skipped: number }> {
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

    return {
      saved: toSave.length,
      skipped: candidates.length - toSave.length,
    };
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
        // 1. Fetch candidate and validate status
        const candidate = await manager.findOne(TopicCandidateEntity, {
          where: { id },
          relations: ['topicSeed'],
        });
        if (!candidate) {
          throw new NotFoundException(`TopicCandidate #${id} not found`);
        }
        if (
          candidate.status !== TopicCandidateStatus.PENDING &&
          candidate.status !== TopicCandidateStatus.REJECTED
        ) {
          throw new ConflictException(
            `TopicCandidate #${id} cannot be approved (current: ${candidate.status})`,
          );
        }

        // 2. Approve target candidate
        await manager.update(
          TopicCandidateEntity,
          { id },
          {
            status: TopicCandidateStatus.APPROVED,
          },
        );

        // 3. Find or create article draft
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
            title: formatTitleWithCategory(
              candidate.topicSeed.category,
              candidate.title,
            ),
            keyword: candidate.keyword,
            status: ArticleDraftStatus.QUEUED,
          });
          draft = await manager.save(newDraft);
          articleDraftCreated = true;
        }

        return { draft, articleDraftCreated };
      });

    // 5. Enqueue after transaction commit, but only for a draft that has
    // nothing to lose. Re-approving used to restart the pipeline regardless of
    // where the existing draft had got to, which overwrote a finished article -
    // and for a published one left the post that was already live disagreeing
    // with the row behind it. A draft that failed outright is the one case
    // where starting over is what the approval is asking for.
    const pipelineQueued =
      articleDraftCreated || draft.status === ArticleDraftStatus.FAILED;

    if (pipelineQueued) {
      await this.articleOutlineQueue.add(GENERATE_ARTICLE_OUTLINE_JOB, {
        articleDraftId: draft.id,
      });
    }

    return {
      id,
      status: 'approved',
      articleDraftId: draft.id,
      articleDraftCreated,
      pipelineQueued,
    };
  }

  private async rejectCandidate(id: string): Promise<RejectResult> {
    const candidate = await this.candidateRepository.findOne({ where: { id } });
    if (!candidate) {
      throw new NotFoundException(`TopicCandidate #${id} not found`);
    }
    if (candidate.status === TopicCandidateStatus.APPROVED) {
      throw new ConflictException(`Approved candidate cannot be rejected`);
    }

    candidate.status = TopicCandidateStatus.REJECTED;
    await this.candidateRepository.save(candidate);

    return { id, status: 'rejected' };
  }

  /** Candidates an evaluation run should score - pending only unless asked */
  async findBySeedId(
    seedId: string,
    scope: EvaluationScope = EvaluationScope.PENDING,
  ): Promise<TopicCandidateEntity[]> {
    return this.candidateRepository.find({
      where: {
        topicSeedId: seedId,
        ...(scope === EvaluationScope.PENDING
          ? { status: TopicCandidateStatus.PENDING }
          : {}),
      },
      order: { createdAt: 'ASC' },
    });
  }

  /**
   * Highest-scoring candidate still awaiting a decision, at or above
   * `minScore`, preferring seeds that have not produced an article recently.
   *
   * Score alone would let one seed supply several days in a row - its
   * candidates were all scored in the same run, so they cluster near the same
   * number. Beyond looking repetitive, those articles would target nearly the
   * same query and compete with each other. The preference is an ordering
   * rather than a filter, so a pool made entirely of recent seeds still yields
   * its best candidate instead of nothing.
   */
  async findBestPending(
    minScore: number,
    cooldownDays = SEED_COOLDOWN_DAYS,
  ): Promise<TopicCandidateEntity | null> {
    const seedUsedRecently = `EXISTS (
      SELECT 1
      FROM article_drafts d
      JOIN topic_candidates sibling ON sibling.id = d."topicCandidateId"
      WHERE sibling."topicSeedId" = seed.id
        AND d."createdAt" > NOW() - (:cooldownDays * INTERVAL '1 day')
    )`;

    return this.candidateRepository
      .createQueryBuilder('tc')
      .innerJoinAndSelect('tc.topicSeed', 'seed')
      .where('tc.status = :status', { status: TopicCandidateStatus.PENDING })
      .andWhere('tc.overallScore >= :minScore', { minScore })
      .andWhere('seed.isActive = true')
      .andWhere('seed.deletedAt IS NULL')
      .setParameter('cooldownDays', cooldownDays)
      .orderBy(seedUsedRecently, 'ASC')
      .addOrderBy('tc.overallScore', 'DESC')
      .addOrderBy('seed.lastUsedAt', 'ASC', 'NULLS FIRST')
      .getOne();
  }

  /**
   * Titles this seed has already been turned into articles under.
   *
   * Deliberately wider than "published": the scheduler commits one candidate a
   * day while the articles it starts sit waiting for review, so counting only
   * live posts would let three near-identical topics be written before the
   * first of them went up. Failed drafts are excluded - nothing was produced,
   * so nothing is covered. The category prefix is stripped because it says
   * nothing about whether two topics overlap.
   */
  async findCoveredTitlesBySeed(seedId: string): Promise<string[]> {
    const rows = await this.draftRepository
      .createQueryBuilder('draft')
      .select('draft.title', 'title')
      .innerJoin('draft.topicCandidate', 'candidate')
      .where('candidate.topicSeedId = :seedId', { seedId })
      .andWhere('draft.status != :failed', {
        failed: ArticleDraftStatus.FAILED,
      })
      .orderBy('draft.createdAt', 'DESC')
      .getRawMany<{ title: string }>();

    return rows.map((row) => stripTitleCategory(row.title));
  }

  /** How many candidates the scheduler could still draw on */
  async countPendingAtOrAbove(minScore: number): Promise<number> {
    return this.candidateRepository
      .createQueryBuilder('tc')
      .innerJoin('tc.topicSeed', 'seed')
      .where('tc.status = :status', { status: TopicCandidateStatus.PENDING })
      .andWhere('tc.overallScore >= :minScore', { minScore })
      .andWhere('seed.isActive = true')
      .andWhere('seed.deletedAt IS NULL')
      .getCount();
  }

  /**
   * A seed holding pending candidates that were never scored, largest backlog
   * first. Scoring these is far cheaper than generating new ones, so the
   * scheduler drains this before it asks for more candidates.
   */
  async findSeedWithUnscoredPending(): Promise<string | null> {
    const row = await this.candidateRepository
      .createQueryBuilder('tc')
      .select('tc.topicSeedId', 'seedId')
      .innerJoin('tc.topicSeed', 'seed')
      .where('tc.status = :status', { status: TopicCandidateStatus.PENDING })
      .andWhere('tc.overallScore IS NULL')
      .andWhere('seed.isActive = true')
      .andWhere('seed.deletedAt IS NULL')
      .groupBy('tc.topicSeedId')
      .orderBy('COUNT(tc.id)', 'DESC')
      .limit(1)
      .getRawOne<{ seedId: string }>();

    return row?.seedId ?? null;
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
          evaluationDetail: e.evaluationDetail,
        }),
      ),
    );
  }
}
