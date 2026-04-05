export type PublishMode = { mode: 'now' } | { mode: 'schedule'; datetime: Date };

export interface TistoryDraftData {
  title: string;
  content: string;
  thumbnailImageUrl: string | null;
  hashtags: string[] | null;
  /** TopicSeed category (e.g. 'meaning', 'grammar') */
  category: string;
}

/** Session management interface – used by both the NestJS service and standalone scripts */
export interface TistorySessionProvider {
  getSession(): Promise<object | null>;
  saveSession(state: object): Promise<void>;
  deleteSession(): Promise<void>;
}

/** Return type of runTistoryPublish */
export interface TistoryPublishResult {
  /** Permalink of the published post. null if extraction failed */
  permalink: string | null;
}
