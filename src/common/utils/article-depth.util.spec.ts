import { ArticleDepth } from '../../topic-candidate/enums/article-depth.enum';
import { parseArticleDepth, resolveArticleDepth } from './article-depth.util';

describe('parseArticleDepth', () => {
  it.each([
    ['brief', ArticleDepth.BRIEF],
    ['standard', ArticleDepth.STANDARD],
  ])('accepts %p', (value, expected) => {
    expect(parseArticleDepth(value)).toBe(expected);
  });

  // A model's casing and spacing are not a reason to lose the decision
  it('ignores case and surrounding space', () => {
    expect(parseArticleDepth(' Brief ')).toBe(ArticleDepth.BRIEF);
  });

  // Null, not standard: the stored value has to show the model gave no answer
  it.each(['detailed', 'short', '', null, undefined, 3])(
    'returns null for %p',
    (value) => {
      expect(parseArticleDepth(value)).toBeNull();
    },
  );
});

describe('resolveArticleDepth', () => {
  it('keeps a decided depth', () => {
    expect(resolveArticleDepth('brief')).toBe(ArticleDepth.BRIEF);
  });

  // Candidates written before depth existed have to come out as they would have
  it.each([null, undefined, 'detailed'])(
    'builds anything undecided (%p) as standard',
    (value) => {
      expect(resolveArticleDepth(value)).toBe(ArticleDepth.STANDARD);
    },
  );
});
