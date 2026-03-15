import { TopicSeedCategory } from '../enums/topic-seed-category.enum';

export interface TopicTemplate {
  titleTemplate: string;
  keywordTemplate: string;
}

export const TOPIC_GENERATE_TEMPLATES: Record<TopicSeedCategory, TopicTemplate[]> = {
  [TopicSeedCategory.MEANING]: [
    { titleTemplate: '{term} 뜻과 사용법 정리',           keywordTemplate: '{term} meaning' },
    { titleTemplate: '{term} 뜻, 뉘앙스, 예문 한 번에 보기', keywordTemplate: '{term} usage' },
    { titleTemplate: '{term} 뜻은? 자주 쓰는 예문까지 정리', keywordTemplate: '{term} examples' },
    { titleTemplate: '{term} 의미와 실제 회화에서의 쓰임',  keywordTemplate: 'how to use {term}' },
  ],

  [TopicSeedCategory.DIFFERENCE]: [
    { titleTemplate: '{term1} vs {term2} 차이 쉽게 정리',    keywordTemplate: '{term1} vs {term2} difference' },
    { titleTemplate: '{term1}와 {term2} 차이점과 예문',       keywordTemplate: '{term1} {term2} examples' },
    { titleTemplate: '{term1} {term2} 차이, 언제 어떻게 쓸까?', keywordTemplate: 'when to use {term1} and {term2}' },
    { titleTemplate: '{term1} 대신 {term2}를 쓰면 어색한 이유', keywordTemplate: '{term1} or {term2}' },
  ],

  [TopicSeedCategory.EXAMPLE]: [
    { titleTemplate: '{term} 예문 모음',                keywordTemplate: '{term} examples' },
    { titleTemplate: '{term} 예문으로 익히는 실제 쓰임', keywordTemplate: '{term} sentence examples' },
    { titleTemplate: '{term} 문장 예시와 자주 쓰는 패턴', keywordTemplate: '{term} usage examples' },
    { titleTemplate: '{term} 예문과 회화 패턴 정리',     keywordTemplate: 'how to use {term} in a sentence' },
  ],

  [TopicSeedCategory.PHRASES]: [
    { titleTemplate: '{term} 표현 모음',                     keywordTemplate: '{term} phrases' },
    { titleTemplate: '{term}에서 자주 쓰는 영어 표현 정리',   keywordTemplate: '{term} useful expressions' },
    { titleTemplate: '{term} 상황별 영어 문장과 표현',         keywordTemplate: '{term} common expressions' },
    { titleTemplate: '{term} 영어 표현과 예문 정리',           keywordTemplate: '{term} example sentences' },
  ],

  [TopicSeedCategory.GRAMMAR]: [
    { titleTemplate: '{term} 문법 정리',                  keywordTemplate: '{term} grammar' },
    { titleTemplate: '{term} 문법, 예문과 함께 이해하기',  keywordTemplate: '{term} grammar examples' },
    { titleTemplate: '{term} 언제 쓰는지 쉽게 설명',      keywordTemplate: 'how to use {term}' },
    { titleTemplate: '{term} 문법과 패턴 한 번에 정리',    keywordTemplate: '{term} grammar pattern' },
  ],
};
