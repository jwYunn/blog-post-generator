import { TopicSeedCategory } from '../../topic-seed/enums/topic-seed-category.enum';
import { formatTitleWithCategory, stripTitleCategory } from './title.util';

describe('formatTitleWithCategory', () => {
  it('capitalises the category and prefixes the title with it', () => {
    expect(
      formatTitleWithCategory('meaning', 'What ghosting really means'),
    ).toBe('[Meaning] What ghosting really means');
  });

  it('leaves an already capitalised category as it is', () => {
    expect(formatTitleWithCategory('Grammar', 'Present perfect')).toBe(
      '[Grammar] Present perfect',
    );
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

  // The tag is written by formatTitleWithCategory and never by hand, so an
  // exact match is what separates one from a title that merely looks like one.
  it('leaves a category spelled in another case alone', () => {
    expect(stripTitleCategory('[meaning] what ghosting means')).toBe(
      '[meaning] what ghosting means',
    );
    expect(stripTitleCategory('[MEANING] what ghosting means')).toBe(
      '[MEANING] what ghosting means',
    );
  });

  it.each(Object.values(TopicSeedCategory))(
    'still strips the real tag for category "%s"',
    (category) => {
      const tagged = formatTitleWithCategory(category, 'Some title');
      expect(stripTitleCategory(tagged)).toBe('Some title');
    },
  );

  // Only the outer tag is a tag; whatever the title opens with afterwards is
  // the title's own.
  it('removes the tag without touching a bracket the title starts with', () => {
    expect(stripTitleCategory('[Grammar] [비즈니스] 이메일 표현')).toBe(
      '[비즈니스] 이메일 표현',
    );
  });
});

describe('the pair, round trip', () => {
  // The tag is added when a candidate is approved and removed again to build
  // the thumbnail alt text, so a category that survives one direction but not
  // the other would put "[Meaning] ..." in front of readers. Every category the
  // seed enum can produce goes through both.
  it.each(Object.values(TopicSeedCategory))(
    'recovers the original title for category "%s"',
    (category) => {
      const title = 'How to use get used to';
      expect(stripTitleCategory(formatTitleWithCategory(category, title))).toBe(
        title,
      );
    },
  );
});
