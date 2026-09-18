import { ArticleDepth } from '../topic-candidate/enums/article-depth.enum';
import { buildOutlinePrompt } from './article-outline-prompt';

const INPUT = {
  title: '수고하셨습니다 영어로',
  keyword: '수고하셨습니다 영어로',
  searchIntent: 'informational',
  targetReader: 'beginner',
  outlinePreview: ['상황별 표현'],
};

describe('buildOutlinePrompt', () => {
  // Standard is what every outline was asked for before depth existed
  it('asks a standard outline for exactly three sections and one or two FAQs', () => {
    const prompt = buildOutlinePrompt({
      ...INPUT,
      depth: ArticleDepth.STANDARD,
    });

    expect(prompt).toContain('- Exactly 3 main sections\n');
    expect(prompt).toContain('- Include 1 or 2 FAQ suggestions only\n');
  });

  it('asks a brief outline for one or two sections and at most one FAQ', () => {
    const prompt = buildOutlinePrompt({ ...INPUT, depth: ArticleDepth.BRIEF });

    expect(prompt).toContain('- 1 or 2 main sections');
    expect(prompt).toContain('- Include at most 1 FAQ suggestion');
    // The fixed shape is exactly what made a one-point topic pad itself out
    expect(prompt).not.toContain('Exactly 3 main sections');
    expect(prompt).not.toContain('Include 1 or 2 FAQ suggestions only');
  });
});
