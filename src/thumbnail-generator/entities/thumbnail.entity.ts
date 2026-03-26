import {
  Column,
  CreateDateColumn,
  Entity,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { ThumbnailPromptMappingEntity } from './thumbnail-prompt-mapping.entity';

export interface ThumbnailMeta {
  mimeType?: string;
}

@Entity('thumbnails')
export class ThumbnailEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'text' })
  url: string;

  @Column({ type: 'varchar', length: 50, nullable: true })
  mimeType: string | null;

  @Column({ type: 'int', nullable: true })
  width: number | null;

  @Column({ type: 'int', nullable: true })
  height: number | null;

  @Column({ type: 'jsonb', nullable: true })
  meta: ThumbnailMeta | null;

  @OneToMany(() => ThumbnailPromptMappingEntity, (m) => m.thumbnail)
  mappings: ThumbnailPromptMappingEntity[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
