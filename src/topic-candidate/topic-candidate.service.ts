import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository, SelectQueryBuilder } from 'typeorm';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { TopicCandidateEntity } from './topic-candidate.entity';
import { TopicCandidateStatus } from './enums/topic-candidate-status.enum';
import { EvaluationScope } from './enums/evaluation-scope.enum';
import { ArticleDepth } from './enums/article-depth.enum';

/** Days a seed rests after one of its candidates became an article */
const SEED_COOLDOWN_DAYS = 7;

/** The evaluator's "do not write this" - the scheduler skips it whatever the score */
const DROP_VERDICT: TopicCandidateEntity['verdict'] = 'drop';
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
import { stripTitleCategory } from '../common/utils/title.util';
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
  depth: ArticleDepth | null;
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

/** A listed candidate, with the draft its approval made if there is one */
export type CandidateListItem = TopicCandidateEntity & {
  articleDraftId: string | null;
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
          depth: c.depth,
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
    data: CandidateListItem[];
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

    // id makes the order total - OFFSET paging over tied values can repeat or skip rows
    qb.orderBy(`tc.${sortBy}`, sortOrder).addOrderBy('tc.id', sortOrder);
    qb.skip((page - 1) * limit).take(limit);

    const [candidates, total] = await qb.getManyAndCount();
    const data = await this.withArticleDraftIds(candidates);

    return { data, total, page, limit };
  }

  /**
   * Pairs each candidate with its draft so a list can link straight to the
   * article - including drafts the scheduler started, which nobody saw being
   * approved. A second query for the page rather than a join, which would load
   * every draft column, content included, just to read an id.
   */
  private async withArticleDraftIds(
    candidates: TopicCandidateEntity[],
  ): Promise<CandidateListItem[]> {
    if (candidates.length === 0) return [];

    const drafts = await this.draftRepository.find({
      select: { id: true, topicCandidateId: true },
      where: { topicCandidateId: In(candidates.map((c) => c.id)) },
    });
    const draftIdByCandidate = new Map(
      drafts.map((d) => [d.topicCandidateId, d.id]),
    );

    return candidates.map((candidate) => ({
      ...candidate,
      articleDraftId: draftIdByCandidate.get(candidate.id) ?? null,
    }));
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
            title: candidate.title,
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
   * `minScore`, preferring seeds that have never been written up, and after
   * that seeds that have not produced an article recently.
   *
   * A seed that already has an article goes behind one that has none, because
   * the second article on a seed does not find readers: search tends to give a
   * site one page per query, and the first article already holds it. Approval
   * leaves a seed's other candidates pending, so without this a single
   * generation run quietly books the next several articles on the same seed.
   *
   * Among the rest, score alone would let one seed supply several days in a
   * row - its candidates were all scored in the same run, so they cluster near
   * the same number.
   *
   * Both preferences are orderings rather than filters, so a pool made entirely
   * of covered or recent seeds still yields its best candidate instead of
   * nothing. A filter would have stopped the pipeline the day it shipped: every
   * candidate waiting at the time came from a seed that had an article.
   */
  async findBestPending(
    minScore: number,
    cooldownDays = SEED_COOLDOWN_DAYS,
  ): Promise<TopicCandidateEntity | null> {
    // Both tests count the same drafts: any that did not fail, which is also
    // what findCoveredTitlesBySeed calls covered. A failed draft produced no
    // article, so it neither covers a seed nor rests it. Counting only
    // published articles would miss the ones still waiting for review, and
    // those pile up while publishing stays manual.
    const liveDraftOnSeed = (extra = '') => `EXISTS (
      SELECT 1
      FROM article_drafts d
      JOIN topic_candidates sibling ON sibling.id = d."topicCandidateId"
      WHERE sibling."topicSeedId" = seed.id
        AND d.status != :failedStatus
        ${extra}
    )`;
    const seedAlreadyCovered = liveDraftOnSeed();
    const seedUsedRecently = liveDraftOnSeed(
      `AND d."createdAt" > NOW() - (:cooldownDays * INTERVAL '1 day')`,
    );

    return (
      this.whereDrawable(
        this.candidateRepository
          .createQueryBuilder('tc')
          .innerJoinAndSelect('tc.topicSeed', 'seed'),
        minScore,
      )
        .setParameter('cooldownDays', cooldownDays)
        .setParameter('failedStatus', ArticleDraftStatus.FAILED)
        .orderBy(seedAlreadyCovered, 'ASC')
        .addOrderBy(seedUsedRecently, 'ASC')
        .addOrderBy('tc.overallScore', 'DESC')
        .addOrderBy('seed.lastUsedAt', 'ASC', 'NULLS FIRST')
        // Without it getOne() fetches every drawable candidate and keeps the
        // first. limit rather than take: the join is many-to-one, so one row is
        // one candidate, and take would split this into two queries
        .limit(1)
        .getOne()
    );
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
    return this.whereDrawable(
      this.candidateRepository
        .createQueryBuilder('tc')
        .innerJoin('tc.topicSeed', 'seed'),
      minScore,
    ).getCount();
  }

  /**
   * What the scheduler may draw on: pending, scored at or above `minScore`, not
   * marked drop, on a live seed.
   *
   * The pick and the pool count both take their conditions from here. Were
   * they to disagree, the count would include candidates the pick refuses, the
   * pool would look full and never be topped up, and nothing would be written.
   *
   * The verdict is checked on its own because the score does not carry it.
   * Uniqueness weighs 0.05 in the overall score, so a model that follows the
   * weights exactly scores a duplicate of a written article 8.9 and marks it
   * drop. A null verdict passes - `!=` alone would exclude it, since
   * NULL != 'drop' is not true in SQL.
   *
   * A deleted seed needs no condition here: TopicSeedEntity has a
   * @DeleteDateColumn, so TypeORM adds seed.deletedAt IS NULL to any join
   * through the relation. Joining the table by name would lose that.
   */
  private whereDrawable(
    qb: SelectQueryBuilder<TopicCandidateEntity>,
    minScore: number,
  ): SelectQueryBuilder<TopicCandidateEntity> {
    return qb
      .where('tc.status = :status', { status: TopicCandidateStatus.PENDING })
      .andWhere('tc.overallScore >= :minScore', { minScore })
      .andWhere('(tc.verdict IS NULL OR tc.verdict != :dropVerdict)', {
        dropVerdict: DROP_VERDICT,
      })
      .andWhere('seed.isActive = true');
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
      // The join through the relation already leaves deleted seeds out
      .andWhere('seed.isActive = true')
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
