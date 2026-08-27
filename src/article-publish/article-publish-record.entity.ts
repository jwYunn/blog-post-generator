import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { ArticleDraftEntity } from '../article-draft/article-draft.entity';
import { ArticlePublishRecordStatus } from './enums/article-publish-record-status.enum';

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

  /**
   * Which blog this attempt targeted. Null only on rows written before the
   * column existed, when a single blog was the only possibility.
   */
  @Column({ type: 'varchar', length: 100, nullable: true })
  blogName: string | null;

  /**
   * Whether the post actually went up. A record is written before the browser
   * is driven, so this is what separates "never reached the blog" from "may
   * already be live" once a run fails.
   */
  @Column({
    type: 'enum',
    enum: ArticlePublishRecordStatus,
    default: ArticlePublishRecordStatus.ATTEMPTING,
  })
  status: ArticlePublishRecordStatus;

  /** Null until the post is up, and after that only if extraction failed */
  @Column({ type: 'varchar', length: 500, nullable: true })
  permalink: string | null;

  /** { mode: 'now' } | { mode: 'schedule', scheduledAt: ISO string } */
  @Column({ type: 'jsonb', nullable: true })
  schedule: PublishSchedule | null;

  /** Extensible metadata */
  @Column({ type: 'jsonb', nullable: true })
  meta: Record<string, unknown> | null;

  @CreateDateColumn()
  createdAt: Date;
}
