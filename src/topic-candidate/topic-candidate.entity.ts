import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { TopicSeedEntity } from '../topic-seed/topic-seed.entity';
import { TopicCandidateStatus } from './enums/topic-candidate-status.enum';

@Entity('topic_candidates')
export class TopicCandidateEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  topicSeedId: string;

  @ManyToOne(() => TopicSeedEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'topicSeedId' })
  topicSeed: TopicSeedEntity;

  @Column({ type: 'varchar', length: 200 })
  keyword: string;

  @Column({ type: 'varchar', length: 300 })
  title: string;

  @Column({ type: 'int', default: 0 })
  score: number;

  @Column({ type: 'varchar', length: 50, nullable: true })
  searchIntent: string | null;

  @Column({ type: 'varchar', length: 20, nullable: true })
  targetReader: string | null;

  @Column({ type: 'text', nullable: true })
  whyThisTopic: string | null;

  @Column({ type: 'jsonb', nullable: true })
  outlinePreview: string[] | null;

  @Column({ type: 'int', nullable: true })
  overallScore: number | null;

  @Column({ type: 'int', nullable: true })
  rank: number | null;

  @Column({ type: 'jsonb', nullable: true })
  strengths: string[] | null;

  @Column({ type: 'jsonb', nullable: true })
  weaknesses: string[] | null;

  @Column({ type: 'text', nullable: true })
  verdict: string | null;

  @Column({
    type: 'enum',
    enum: TopicCandidateStatus,
    default: TopicCandidateStatus.PENDING,
  })
  status: TopicCandidateStatus;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
