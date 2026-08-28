import { buildHtmlContent, markdownToHtml } from './tistory-automation';
import { TistoryDraftData } from './tistory.types';

const THUMBNAIL = 'https://cdn.example.com/thumb.png';

function buildDraft(over: Partial<TistoryDraftData> = {}): TistoryDraftData {
  return {
    title: '[Grammar] Present perfect explained',
    content: '# Heading\n\nBody text.',
    thumbnailImageUrl: null,
    hashtags: null,
    category: 'grammar',
    ...over,
  };
}

describe('markdownToHtml', () => {
  it('converts markdown to html', () => {
    const html = markdownToHtml('# Heading\n\nSome **bold** text.');
    expect(html).toContain('<h1>Heading</h1>');
    expect(html).toContain('<strong>bold</strong>');
  });

  // marked.parse is overloaded and hands back a promise under async options.
  // The cast in markdownToHtml hides that from the type checker, so nothing but
  // this assertion stands between a future option change and an editor that
  // receives "[object Promise]" as the article body.
  it('returns a string rather than a promise', () => {
    expect(typeof markdownToHtml('plain')).toBe('string');
  });
});

describe('buildHtmlContent', () => {
  it('returns only the converted content when there is no thumbnail', () => {
    const html = buildHtmlContent(buildDraft());
    expect(html).toBe(markdownToHtml('# Heading\n\nBody text.'));
    expect(html).not.toContain('<img');
  });

  it('puts the thumbnail ahead of the content', () => {
    const html = buildHtmlContent(buildDraft({ thumbnailImageUrl: THUMBNAIL }));
    expect(html).toContain('src="' + THUMBNAIL + '"');
    expect(html.indexOf('<img')).toBeLessThan(html.indexOf('<h1>'));
  });

  // The category tag is a pipeline detail. It belongs in the post title, where
  // it groups the blog, and not in the alt text a reader or a crawler sees.
  it('uses the title without its category tag as the alt text', () => {
    const html = buildHtmlContent(buildDraft({ thumbnailImageUrl: THUMBNAIL }));
    expect(html).toContain('alt="Present perfect explained"');
  });
});
