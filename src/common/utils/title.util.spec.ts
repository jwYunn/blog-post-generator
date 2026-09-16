import { containsKorean, stripTitleCategory } from './title.util';

/**
 * The gate on titles the blog's own readers could never search for. It asks for
 * any Hangul rather than a proportion of it, because the titles that work are
 * mostly a Korean sentence wrapped around English being taught.
 */
describe('containsKorean', () => {
  it('accepts a Korean title', () => {
    expect(containsKorean('영어 회의에서 반대 의견 말하는 표현')).toBe(true);
  });

  it('accepts the mixed shape the good titles actually take', () => {
    expect(
      containsKorean('prefer to do vs prefer doing: 언제 to부정사를 쓸까'),
    ).toBe(true);
  });

  // The title that reached review at 9/10 for SEO quality, unreachable by the
  // people it was written for
  it('rejects a title written entirely in English', () => {
    expect(
      containsKorean(
        'Customer vs Custom: Why ESL Learners Confuse These Words',
      ),
    ).toBe(false);
  });

  it('rejects a title carrying no letters at all', () => {
    expect(containsKorean('')).toBe(false);
    expect(containsKorean('2026 :: !!')).toBe(false);
  });

  // Jamo on their own are still Korean - "ㅋㅋ", "ㅠㅠ" turn up in titles
  it('counts standalone jamo', () => {
    expect(containsKorean('English humour and ㅋㅋ')).toBe(true);
  });
});

describe('stripTitleCategory', () => {
  it('removes the tag and the space that follows it', () => {
    expect(stripTitleCategory('[Meaning] What ghosting really means')).toBe(
      'What ghosting really means',
    );
  });

  it('leaves a title that carries no tag untouched', () => {
    expect(stripTitleCategory('What ghosting really means')).toBe(
      'What ghosting really means',
    );
  });

  it('removes only the leading tag', () => {
    expect(stripTitleCategory('[Grammar] Use [sic] correctly')).toBe(
      'Use [sic] correctly',
    );
  });
});

describe('stripTitleCategory, brackets that are not tags', () => {
  // A model writes its own bracketed openers, and the old regex took any of
  // them. The word it removed was gone from the thumbnail overlay and the image
  // alt text with nothing left to say it had happened.
  it.each([
    '[비즈니스] 이메일에서 쓰는 표현',
    '[Beginner] where to start',
    '[2026] this year in English',
  ])('keeps the leading bracket of %p', (title) => {
    expect(stripTitleCategory(title)).toBe(title);
  });

  // The tag was only ever written by code, never by hand, so an exact match is
  // what separates one from a title that merely looks like one.
  it('leaves a category spelled in another case alone', () => {
    expect(stripTitleCategory('[meaning] what ghosting means')).toBe(
      '[meaning] what ghosting means',
    );
    expect(stripTitleCategory('[MEANING] what ghosting means')).toBe(
      '[MEANING] what ghosting means',
    );
  });

  // Spelled as the stored drafts spell them, since those are what reach this
  it.each(['Meaning', 'Difference', 'Example', 'Phrases', 'Grammar'])(
    'still strips the real tag [%s]',
    (tag) => {
      expect(stripTitleCategory(`[${tag}] Some title`)).toBe('Some title');
    },
  );

  // Not a tag any draft carries, so it belongs to the title
  it('keeps a bracket naming a category that was never used as a tag', () => {
    expect(stripTitleCategory('[Idiom] break the ice')).toBe(
      '[Idiom] break the ice',
    );
  });

  // Only the outer tag is a tag; whatever the title opens with afterwards is
  // the title's own.
  it('removes the tag without touching a bracket the title starts with', () => {
    expect(stripTitleCategory('[Grammar] [비즈니스] 이메일 표현')).toBe(
      '[비즈니스] 이메일 표현',
    );
  });
});
