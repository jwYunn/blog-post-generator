import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { TopicSeedEntity } from '../topic-seed/topic-seed.entity';

/**
 * One query/page pair as Search Console reported it over a window, stored once
 * per sync.
 *
 * The window is a rolling aggregate rather than a per-day row on purpose:
 * Search Console drops queries whose daily volume is too low to anonymise, and
 * on a blog this size that is most of them. Aggregating over four weeks keeps
 * them. The cost is that consecutive rows overlap, which is what makes a row
 * per sync worth keeping - two of them a few weeks apart are how a position
 * that is climbing tells itself apart from one that is stuck.
 */
@Entity('search_console_queries')
@Index(['normalizedQuery', 'page', 'windowEnd'], { unique: true })
export class SearchConsoleQueryEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** As typed by the searcher, kept for display */
  @Column({ type: 'varchar', length: 200 })
  query: string;

  /** Lowercased and space-collapsed, matched against TopicSeed.normalizedSeed */
  @Column({ type: 'varchar', length: 200 })
  normalizedQuery: string;

  /** The article that surfaced for this query */
  @Column({ type: 'varchar', length: 500 })
  page: string;

  @Column({ type: 'date' })
  windowStart: string;

  @Column({ type: 'date' })
  windowEnd: string;

  @Column({ type: 'int' })
  clicks: number;

  @Column({ type: 'int' })
  impressions: number;

  @Column({ type: 'decimal', precision: 6, scale: 4 })
  ctr: number;

  /** Average result position; 1.0 is the top of the first page */
  @Column({ type: 'decimal', precision: 5, scale: 2 })
  position: number;

  /** Null until a seed matches, and for queries no seed covers */
  @Column({ type: 'uuid', nullable: true })
  topicSeedId: string | null;

  /**
   * SET NULL rather than CASCADE: deleting a seed must not erase the record of
   * what people were searching for while it existed. The measurement outlives
   * the thing measured.
   */
  @ManyToOne(() => TopicSeedEntity, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'topicSeedId' })
  topicSeed: TopicSeedEntity | null;

  @CreateDateColumn()
  createdAt: Date;
}
