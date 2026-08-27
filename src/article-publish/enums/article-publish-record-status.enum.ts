/**
 * Outcome of a single publish attempt.
 *
 * The distinction that matters is between "nothing reached the blog" and
 * "something might have". A record only reaches FAILED when the run stopped
 * before the publish button was pressed; anything after that - including a
 * worker killed mid-flow - stays ATTEMPTING, because a post may already exist.
 * Republishing is blocked on both ATTEMPTING and PUBLISHED, so an unresolved
 * attempt costs a human a look at the blog rather than a duplicate post.
 */
export enum ArticlePublishRecordStatus {
  /** Started; outcome unknown. Someone has to check the blog to resolve it */
  ATTEMPTING = 'attempting',
  /** The post went up */
  PUBLISHED = 'published',
  /** Stopped before anything was posted, so a retry is safe */
  FAILED = 'failed',
}
