import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { ThumbnailPromptEntity } from './thumbnail-prompt.entity';
import { ThumbnailEntity } from './thumbnail.entity';

@Entity('thumbnail_prompt_mappings')
export class ThumbnailPromptMappingEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  promptId: string;

  @Column({ type: 'uuid' })
  thumbnailId: string;

  @Column({ type: 'int', nullable: true })
  rank: number | null;

  @Column({ type: 'boolean', default: false })
  active: boolean;

  @ManyToOne(() => ThumbnailPromptEntity, (p) => p.mappings, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'promptId' })
  prompt: ThumbnailPromptEntity;

  @ManyToOne(() => ThumbnailEntity, (t) => t.mappings, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'thumbnailId' })
  thumbnail: ThumbnailEntity;

  @CreateDateColumn()
  createdAt: Date;
}
