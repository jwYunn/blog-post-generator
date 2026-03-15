import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { TopicSeedCategory } from './enums/topic-seed-category.enum';

@Entity('topic_seeds')
export class TopicSeedEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 100 })
  seed: string;

  @Index({ unique: true })
  @Column({ type: 'varchar', length: 100 })
  normalizedSeed: string;

  @Column({ type: 'enum', enum: TopicSeedCategory })
  category: TopicSeedCategory;

  @Column({ type: 'int', default: 5 })
  priority: number;

  @Column({ type: 'boolean', default: true })
  isActive: boolean;

  @Column({ type: 'text', nullable: true })
  memo: string | null;

  @Column({ type: 'int', default: 0 })
  usedCount: number;

  @Column({ type: 'timestamp', nullable: true })
  lastUsedAt: Date | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @DeleteDateColumn()
  deletedAt: Date | null;
}
