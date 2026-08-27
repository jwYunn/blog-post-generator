import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { ArticleDraftEntity } from './article-draft.entity';
import { ArticleDraftStatus } from './enums/article-draft-status.enum';
import { ArticlePublishService } from '../article-publish/article-publish.service';
import { CreatePublishJobDto } from '../article-publish/dto/create-publish-job.dto';
import {
  DraftSortBy,
  DraftSortOrder,
  QueryArticleDraftListDto,
} from './dto/query-article-draft-list.dto';
import { TopicCandidateEntity } from '../topic-candidate/topic-candidate.entity';
import { TopicCandidateStatus } from '../topic-candidate/enums/topic-candidate-status.enum';
import { formatTitleWithCategory } from '../common/utils/title.util';
import {
  ARTICLE_OUTLINE_QUEUE,
  GENERATE_ARTICLE_OUTLINE_JOB,
} from '../article-outline/article-outline.constants';

/**
 * Draft states a publish request may start from. REVIEW_READY is the normal
 * route; FAILED and PUBLISHING are here so a run that died can be retried once
 * its attempt record has been resolved. Whether that retry is actually safe is
 * ArticlePublishService's call - it is the side that can see the records.
 *
 * Everything else is a draft with no finished content, and a request against
 * one used to reach the worker and mark it failed on the way out.
 */
const PUBLISHABLE_STATUSES: ArticleDraftStatus[] = [
  ArticleDraftStatus.REVIEW_READY,
  ArticleDraftStatus.FAILED,
  ArticleDraftStatus.PUBLISHING,
];

@Injectable()
export class ArticleDraftService {
  constructor(
    @InjectRepository(ArticleDraftEntity)
    private readonly draftRepository: Repository<ArticleDraftEntity>,
    @InjectRepository(TopicCandidateEntity)
    private readonly candidateRepository: Repository<TopicCandidateEntity>,
    @InjectQueue(ARTICLE_OUTLINE_QUEUE)
    private readonly articleOutlineQueue: Queue,
    private readonly articlePublishService: ArticlePublishService,
  ) {}

  async createFromCandidate(candidateId: string): Promise<ArticleDraftEntity> {
    const candidate = await this.candidateRepository.findOne({
      where: { id: candidateId },
      relations: ['topicSeed'],
    });
    if (!candidate) {
      throw new NotFoundException(`TopicCandidate #${candidateId} not found`);
    }

    if (candidate.status !== TopicCandidateStatus.APPROVED) {
      throw new BadRequestException(
        'TopicCandidate must be approved to create an article draft',
      );
    }

    const existing = await this.draftRepository.findOne({
      where: { topicCandidateId: candidateId },
    });
    if (existing) {
      throw new ConflictException(
        `ArticleDraft already exists for candidate #${candidateId}`,
      );
    }

    const draft = this.draftRepository.create({
      topicCandidateId: candidateId,
      title: formatTitleWithCategory(
        candidate.topicSeed.category,
        candidate.title,
      ),
      keyword: candidate.keyword,
      status: ArticleDraftStatus.QUEUED,
    });

    const saved = await this.draftRepository.save(draft);

    await this.articleOutlineQueue.add(GENERATE_ARTICLE_OUTLINE_JOB, {
      articleDraftId: saved.id,
    });

    return saved;
  }

  async findAll(dto: QueryArticleDraftListDto): Promise<{
    data: ArticleDraftEntity[];
    total: number;
    page: number;
    limit: number;
  }> {
    const {
      page = 1,
      limit = 20,
      status,
      sortBy = DraftSortBy.CREATED_AT,
      sortOrder = DraftSortOrder.DESC,
    } = dto;

    const qb = this.draftRepository.createQueryBuilder('ad');

    if (status) {
      qb.andWhere('ad.status = :status', { status });
    }

    qb.orderBy(`ad.${sortBy}`, sortOrder);
    qb.skip((page - 1) * limit).take(limit);

    const [data, total] = await qb.getManyAndCount();

    return { data, total, page, limit };
  }

  async findOne(id: string): Promise<ArticleDraftEntity> {
    const draft = await this.draftRepository.findOne({ where: { id } });
    if (!draft) {
      throw new NotFoundException(`ArticleDraft #${id} not found`);
    }
    return draft;
  }

  async publish(
    id: string,
    dto: CreatePublishJobDto,
  ): Promise<{ jobId: string; publishRecordId: string }> {
    const draft = await this.findOne(id);

    if (draft.status === ArticleDraftStatus.PUBLISHED) {
      throw new ConflictException(`ArticleDraft #${id} is already published`);
    }
    if (!PUBLISHABLE_STATUSES.includes(draft.status)) {
      throw new ConflictException(
        `ArticleDraft #${id} is not ready to publish (current: ${draft.status})`,
      );
    }

    return this.articlePublishService.addPublishJob(id, dto);
  }
}
