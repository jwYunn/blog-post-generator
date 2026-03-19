export enum ArticleDraftStatus {
  QUEUED = 'queued',
  GENERATING_OUTLINE = 'generating_outline',
  OUTLINE_GENERATED = 'outline_generated',
  GENERATING_CONTENT = 'generating_content',
  CONTENT_GENERATED = 'content_generated',
  GENERATING_THUMBNAIL = 'generating_thumbnail',
  REVIEW_READY = 'review_ready',
  PUBLISHING = 'publishing',
  PUBLISHED = 'published',
  FAILED = 'failed',
}
