import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { ArticleDraftEntity } from '../article-draft/article-draft.entity';

export type PublishSchedule =
  | { mode: 'now' }
  | { mode: 'schedule'; scheduledAt: string };

@Entity('article_publish_records')
export class ArticlePublishRecordEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  draftId: string;

  @ManyToOne(() => ArticleDraftEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'draftId' })
  draft: ArticleDraftEntity;

  @Column({ type: 'varchar', length: 500, nullable: true })
  permalink: string | null;

  /** { mode: 'now' } | { mode: 'schedule', scheduledAt: ISO string } */
  @Column({ type: 'jsonb', nullable: true })
  schedule: PublishSchedule | null;

  /** 확장용 메타데이터 */
  @Column({ type: 'jsonb', nullable: true })
  meta: Record<string, unknown> | null;

  @CreateDateColumn()
  createdAt: Date;
}
