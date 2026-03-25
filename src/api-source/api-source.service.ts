import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ApiSourceEntity } from './api-source.entity';
import { CreateApiSourceDto } from './dto/create-api-source.dto';
import { UpdateApiSourceDto } from './dto/update-api-source.dto';

@Injectable()
export class ApiSourceService {
  constructor(
    @InjectRepository(ApiSourceEntity)
    private readonly apiSourceRepository: Repository<ApiSourceEntity>,
  ) {}

  async create(dto: CreateApiSourceDto): Promise<ApiSourceEntity> {
    const entity = this.apiSourceRepository.create(dto);
    return this.apiSourceRepository.save(entity);
  }

  async findAll(): Promise<ApiSourceEntity[]> {
    return this.apiSourceRepository.find({
      order: { createdAt: 'DESC' },
    });
  }

  async findOne(id: string): Promise<ApiSourceEntity> {
    const entity = await this.apiSourceRepository.findOne({ where: { id } });
    if (!entity) {
      throw new NotFoundException(`ApiSource #${id} not found`);
    }
    return entity;
  }

  async update(id: string, dto: UpdateApiSourceDto): Promise<ApiSourceEntity> {
    const entity = await this.findOne(id);
    Object.assign(entity, dto);
    return this.apiSourceRepository.save(entity);
  }

  async remove(id: string): Promise<void> {
    await this.findOne(id);
    await this.apiSourceRepository.delete(id);
  }
}
