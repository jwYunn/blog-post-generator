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
import { TopicCandidateEntity } from '../topic-candidate/topic-candidate.entity';
import { TopicCandidateStatus } from '../topic-candidate/enums/topic-candidate-status.enum';
import {
  ARTICLE_OUTLINE_QUEUE,
  GENERATE_ARTICLE_OUTLINE_JOB,
} from '../article-outline/article-outline.constants';

@Injectable()
export class ArticleDraftService {
  constructor(
    @InjectRepository(ArticleDraftEntity)
    private readonly draftRepository: Repository<ArticleDraftEntity>,
    @InjectRepository(TopicCandidateEntity)
    private readonly candidateRepository: Repository<TopicCandidateEntity>,
    @InjectQueue(ARTICLE_OUTLINE_QUEUE)
    private readonly articleOutlineQueue: Queue,
  ) {}

  async createFromCandidate(candidateId: string): Promise<ArticleDraftEntity> {
    const candidate = await this.candidateRepository.findOne({
      where: { id: candidateId },
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
      title: candidate.title,
      keyword: candidate.keyword,
      status: ArticleDraftStatus.QUEUED,
    });

    const saved = await this.draftRepository.save(draft);

    await this.articleOutlineQueue.add(GENERATE_ARTICLE_OUTLINE_JOB, {
      articleDraftId: saved.id,
    });

    return saved;
  }

  async findOne(id: string): Promise<ArticleDraftEntity> {
    const draft = await this.draftRepository.findOne({ where: { id } });
    if (!draft) {
      throw new NotFoundException(`ArticleDraft #${id} not found`);
    }
    return draft;
  }
}
