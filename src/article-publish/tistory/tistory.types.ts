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

/** runTistoryPublish 반환 결과 */
export interface TistoryPublishResult {
  /** 발행된 글의 permalink. 추출 실패 시 null */
  permalink: string | null;
}
