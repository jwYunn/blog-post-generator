import { Page } from 'playwright';
import { marked } from 'marked';

export type PublishMode = { mode: 'now' } | { mode: 'schedule'; datetime: Date };

export interface TistoryDraftData {
  title: string;
  content: string;
  thumbnailImageUrl: string | null;
  hashtags: string[] | null;
  /** TopicSeed category (e.g. 'meaning', 'grammar') */
  category: string;
}

/** 세션 관리 인터페이스 – NestJS 서비스와 스크립트 직접 구현 양쪽에서 사용 */
export interface TistorySessionProvider {
  getSession(): Promise<object | null>;
  saveSession(state: object): Promise<void>;
  deleteSession(): Promise<void>;
}
