import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { InjectQueue } from '@nestjs/bullmq';
import { Repository } from 'typeorm';
import { Queue } from 'bullmq';
import { TopicSeedEntity } from './topic-seed.entity';
import { CreateTopicSeedDto } from './dto/create-topic-seed.dto';
import { UpdateTopicSeedDto } from './dto/update-topic-seed.dto';
import { ListTopicSeedQueryDto, SortByField, SortOrder } from './dto/list-topic-seed-query.dto';
import {
  TOPIC_GENERATE_QUEUE,
  GENERATE_TOPIC_CANDIDATES_JOB,
} from '../topic-generate/topic-generate.constants';
import {
  TOPIC_EVALUATE_QUEUE,
  EVALUATE_TOPIC_CANDIDATES_JOB,
} from '../topic-evaluate/topic-evaluate.constants';

@Injectable()
export class TopicSeedService {
  constructor(
    @InjectRepository(TopicSeedEntity)
    private readonly topicSeedRepository: Repository<TopicSeedEntity>,
    @InjectQueue(TOPIC_GENERATE_QUEUE)
    private readonly topicGenerateQueue: Queue,
    @InjectQueue(TOPIC_EVALUATE_QUEUE)
    private readonly topicEvaluateQueue: Queue,
  ) {}

  private normalize(seed: string): string {
    return seed.toLowerCase().trim().replace(/\s+/g, ' ');
  }

  async create(dto: CreateTopicSeedDto): Promise<TopicSeedEntity> {
    const normalizedSeed = this.normalize(dto.seed);

    const existing = await this.topicSeedRepository.findOne({
      where: { normalizedSeed },
      withDeleted: true,
    });

    if (existing) {
      if (existing.deletedAt) {
        await this.topicSeedRepository.restore(existing.id);
        return this.topicSeedRepository.save({
          ...existing,
          ...dto,
          normalizedSeed,
          deletedAt: null,
        });
      }
      throw new ConflictException(
        `Seed "${dto.seed}" already exists after normalization`,
      );
    }

    const entity = this.topicSeedRepository.create({ ...dto, normalizedSeed });
    return this.topicSeedRepository.save(entity);
  }

  async findAll(query: ListTopicSeedQueryDto): Promise<{
    data: TopicSeedEntity[];
    total: number;
    page: number;
    limit: number;
  }> {
    const {
      page = 1,
      limit = 20,
      category,
      isActive,
      search,
      sortBy = SortByField.CREATED_AT,
      order = SortOrder.DESC,
    } = query;

    const qb = this.topicSeedRepository.createQueryBuilder('ts');

    if (category) {
      qb.andWhere('ts.category = :category', { category });
    }
    if (isActive !== undefined) {
      qb.andWhere('ts.isActive = :isActive', { isActive });
    }
    if (search) {
      qb.andWhere('ts.seed ILIKE :search', { search: `%${search}%` });
    }

    qb.orderBy(`ts.${sortBy}`, order.toUpperCase() as 'ASC' | 'DESC');
    qb.skip((page - 1) * limit).take(limit);

    const [data, total] = await qb.getManyAndCount();

    return { data, total, page, limit };
  }

  async findOne(id: string): Promise<TopicSeedEntity> {
    const entity = await this.topicSeedRepository.findOne({ where: { id } });
    if (!entity) {
      throw new NotFoundException(`TopicSeed #${id} not found`);
    }
    return entity;
  }

  async update(id: string, dto: UpdateTopicSeedDto): Promise<TopicSeedEntity> {
    const entity = await this.findOne(id);

    if (dto.seed !== undefined) {
      const normalizedSeed = this.normalize(dto.seed);
      if (normalizedSeed !== entity.normalizedSeed) {
        const conflict = await this.topicSeedRepository.findOne({
          where: { normalizedSeed },
        });
        if (conflict) {
          throw new ConflictException(
            `Seed "${dto.seed}" already exists after normalization`,
          );
        }
        entity.normalizedSeed = normalizedSeed;
      }
    }

    Object.assign(entity, dto);
    return this.topicSeedRepository.save(entity);
  }

  async remove(id: string): Promise<void> {
    await this.findOne(id);
    await this.topicSeedRepository.softDelete(id);
  }

  async generate(id: string): Promise<{ message: string; seedId: string }> {
    const seed = await this.findOne(id);

    if (!seed.isActive) {
      throw new BadRequestException(
        `Seed #${id} is inactive. Activate it before generating topics.`,
      );
    }

    await this.topicGenerateQueue.add(GENERATE_TOPIC_CANDIDATES_JOB, { seedId: id });

    return {
      message: 'Topic generation job has been queued.',
      seedId: id,
    };
  }

  async evaluate(id: string): Promise<{ message: string; seedId: string }> {
    const seed = await this.findOne(id);

    await this.topicEvaluateQueue.add(EVALUATE_TOPIC_CANDIDATES_JOB, {
      seedId: id,
      userInput: seed.seed,
    });

    return {
      message: 'Topic evaluation job has been queued.',
      seedId: id,
    };
  }

  // Used by BullMQ jobs: returns all active seeds
  async findActiveSeeds(): Promise<TopicSeedEntity[]> {
    return this.topicSeedRepository.find({ where: { isActive: true } });
  }

  // Used by BullMQ jobs: increments usage count and updates last used timestamp
  async incrementUsedCount(id: string): Promise<void> {
    await this.topicSeedRepository
      .createQueryBuilder()
      .update()
      .set({
        usedCount: () => '"usedCount" + 1',
        lastUsedAt: new Date(),
      })
      .where('id = :id', { id })
      .execute();
  }
}
