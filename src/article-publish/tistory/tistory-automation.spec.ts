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

describe('buildHtmlContent, escaping attribute values', () => {
  /** The alt value as the browser would read it, up to the closing quote */
  function altAttribute(html: string): string | undefined {
    return /alt="([^"]*)"/.exec(html)?.[1];
  }

  // The generation prompt asks for the English term in quotation marks, so a
  // title carrying them is the normal case. Interpolated raw, the first one
  // closes the attribute and the rest of the title becomes stray markup in the
  // published post.
  it('escapes quotation marks in the title', () => {
    const html = buildHtmlContent(
      buildDraft({
        title: '[Meaning] What "ghosting" really means',
        thumbnailImageUrl: THUMBNAIL,
      }),
    );

    expect(altAttribute(html)).toBe('What &quot;ghosting&quot; really means');
  });

  it('escapes ampersands and angle brackets in the title', () => {
    const html = buildHtmlContent(
      buildDraft({
        title: '[Grammar] <b> tags & how to read them',
        thumbnailImageUrl: THUMBNAIL,
      }),
    );

    expect(altAttribute(html)).toBe('&lt;b&gt; tags &amp; how to read them');
  });

  it('escapes an apostrophe in the title', () => {
    const html = buildHtmlContent(
      buildDraft({
        title: "[Phrases] It's on me",
        thumbnailImageUrl: THUMBNAIL,
      }),
    );

    expect(altAttribute(html)).toBe('It&#39;s on me');
  });

  // S3 URLs arrive with query strings, and a bare & in an attribute is the
  // difference between an image and a broken one.
  it('escapes an ampersand in the thumbnail url', () => {
    const html = buildHtmlContent(
      buildDraft({
        thumbnailImageUrl: 'https://cdn.example.com/thumb.png?v=2&size=large',
      }),
    );

    expect(html).toContain(
      'src="https://cdn.example.com/thumb.png?v=2&amp;size=large"',
    );
  });

  it('leaves a title that needs no escaping unchanged', () => {
    const html = buildHtmlContent(buildDraft({ thumbnailImageUrl: THUMBNAIL }));

    expect(altAttribute(html)).toBe('Present perfect explained');
  });
});
