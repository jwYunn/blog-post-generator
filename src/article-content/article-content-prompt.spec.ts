import { ArticleDepth } from '../topic-candidate/enums/article-depth.enum';
import { ArticleOutline } from '../article-outline/article-outline.types';
import { buildContentPrompt } from './article-content-prompt';

const OUTLINE: ArticleOutline = {
  title: '수고하셨습니다 영어로',
  keyword: '수고하셨습니다 영어로',
  searchIntent: 'informational',
  sections: ['상황별 표현'],
  faqs: ['상사에게도 써도 되나요?'],
};

function prompt(
  depth: ArticleDepth,
  outline: ArticleOutline = OUTLINE,
): string {
  return buildContentPrompt({
    title: outline.title,
    keyword: outline.keyword,
    outline,
    depth,
  });
}

describe('buildContentPrompt', () => {
  // Standard is the range every article was written to before depth existed
  it('asks a standard article for 1,800 to 2,500 characters', () => {
    const text = prompt(ArticleDepth.STANDARD);

    expect(text).toContain(
      '- Target length: 1,800 to 2,500 Korean characters\n',
    );
    expect(text).toContain('- Hard maximum: 3,000 Korean characters\n');
  });

  it('asks a brief article for 800 to 1,200 characters', () => {
    const text = prompt(ArticleDepth.BRIEF);

    expect(text).toContain('- Target length: 800 to 1,200 Korean characters\n');
    expect(text).toContain('- Hard maximum: 1,500 Korean characters\n');
    expect(text).not.toContain('1,800');
  });

  describe('the FAQ block', () => {
    it('lists the outline FAQs when there are some', () => {
      const text = prompt(ArticleDepth.STANDARD);

      expect(text).toContain(
        'FAQ:\n- 상사에게도 써도 되나요?\n\nStructure rules:',
      );
      expect(text).toContain(
        '- Add FAQ only if it adds real search value; keep it brief',
      );
    });

    // An empty "FAQ:" heading reads as an invitation to write one
    it('leaves the block out, and says so, when the outline has none', () => {
      const text = prompt(ArticleDepth.BRIEF, { ...OUTLINE, faqs: [] });

      expect(text).not.toContain('FAQ:');
      expect(text).toContain('- Do not add a FAQ section');
      expect(text).toContain('- 상황별 표현\n\nStructure rules:');
    });
  });
});
