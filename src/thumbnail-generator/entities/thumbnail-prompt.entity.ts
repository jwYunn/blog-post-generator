import {
  Column,
  CreateDateColumn,
  Entity,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { ThumbnailPromptMappingEntity } from './thumbnail-prompt-mapping.entity';

export type ThumbnailPromptStatus = 'generating' | 'done' | 'failed';

export interface ThumbnailPromptMeta {
  aspect_ratio?: string;
  output_format?: string;
  output_quality?: number;
  num_outputs?: number;
  megapixels?: string;
}

@Entity('thumbnail_prompts')
export class ThumbnailPromptEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  name: string | null;

  @Column({ type: 'text' })
  prompt: string;

  @Column({ type: 'varchar', length: 100, default: 'black-forest-labs/flux-schnell' })
  model: string;

  @Column({ type: 'jsonb', nullable: true })
  meta: ThumbnailPromptMeta | null;

  @Column({
    type: 'enum',
    enum: ['generating', 'done', 'failed'],
    default: 'generating',
  })
  status: ThumbnailPromptStatus;

  @OneToMany(() => ThumbnailPromptMappingEntity, (m) => m.prompt)
  mappings: ThumbnailPromptMappingEntity[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
