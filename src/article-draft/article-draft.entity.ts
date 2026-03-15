import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { TopicCandidateEntity } from '../topic-candidate/topic-candidate.entity';
import { ArticleDraftStatus } from './enums/article-draft-status.enum';

@Entity('article_drafts')
export class ArticleDraftEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', unique: true })
  topicCandidateId: string;

  @ManyToOne(() => TopicCandidateEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'topicCandidateId' })
  topicCandidate: TopicCandidateEntity;

  @Column({ type: 'varchar', length: 300 })
  title: string;

  @Column({ type: 'varchar', length: 200 })
  keyword: string;

  @Column({ type: 'jsonb', nullable: true })
  outline: object | null;

  @Column({ type: 'text', nullable: true })
  content: string | null;

  @Column({ type: 'text', nullable: true })
  thumbnailImageUrl: string | null;

  @Column({
    type: 'enum',
    enum: ArticleDraftStatus,
    default: ArticleDraftStatus.QUEUED,
  })
  status: ArticleDraftStatus;

  @Column({ type: 'text', nullable: true })
  errorMessage: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
