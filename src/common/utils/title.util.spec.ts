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
