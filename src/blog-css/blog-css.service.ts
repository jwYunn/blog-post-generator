import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BlogCssEntity } from './blog-css.entity';
import { CreateBlogCssDto } from './dto/create-blog-css.dto';
import { UpdateBlogCssDto } from './dto/update-blog-css.dto';

@Injectable()
export class BlogCssService {
  constructor(
    @InjectRepository(BlogCssEntity)
    private readonly blogCssRepository: Repository<BlogCssEntity>,
  ) {}

  async create(dto: CreateBlogCssDto): Promise<BlogCssEntity> {
    const existing = await this.blogCssRepository.findOne({
      where: { blogUrl: dto.blogUrl },
    });
    if (existing) {
      throw new ConflictException(
        `CSS for "${dto.blogUrl}" already exists`,
      );
    }

    const entity = this.blogCssRepository.create(dto);
    return this.blogCssRepository.save(entity);
  }

  async findAll(): Promise<BlogCssEntity[]> {
    return this.blogCssRepository.find({
      order: { createdAt: 'DESC' },
    });
  }

  async findOne(id: string): Promise<BlogCssEntity> {
    const entity = await this.blogCssRepository.findOne({ where: { id } });
    if (!entity) {
      throw new NotFoundException(`BlogCss #${id} not found`);
    }
    return entity;
  }

  async findByBlogUrl(blogUrl: string): Promise<BlogCssEntity | null> {
    return this.blogCssRepository.findOne({ where: { blogUrl } });
  }

  async update(id: string, dto: UpdateBlogCssDto): Promise<BlogCssEntity> {
    const entity = await this.findOne(id);

    if (dto.blogUrl !== undefined && dto.blogUrl !== entity.blogUrl) {
      const conflict = await this.blogCssRepository.findOne({
        where: { blogUrl: dto.blogUrl },
      });
      if (conflict) {
        throw new ConflictException(
          `CSS for "${dto.blogUrl}" already exists`,
        );
      }
    }

    Object.assign(entity, dto);
    return this.blogCssRepository.save(entity);
  }

  async remove(id: string): Promise<void> {
    await this.findOne(id);
    await this.blogCssRepository.delete(id);
  }
}
