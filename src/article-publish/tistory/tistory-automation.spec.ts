import { Page } from 'playwright-core';
import {
  buildHtmlContent,
  isBackOnTistory,
  isManagePage,
  kakaoLogin,
  markdownToHtml,
} from './tistory-automation';
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

describe('isBackOnTistory', () => {
  const back = (url: string) => isBackOnTistory(new URL(url));

  it('accepts the manage page and the Tistory home page alike', () => {
    expect(back('https://myblog.tistory.com/manage')).toBe(true);
    expect(back('https://www.tistory.com/')).toBe(true);
  });

  // The OAuth callback lives under /auth; landing there means Tistory has not
  // finished with the login yet.
  it('rejects the Tistory auth routes', () => {
    expect(back('https://www.tistory.com/auth/login?redirectUrl=x')).toBe(
      false,
    );
    expect(back('https://www.tistory.com/auth/kakao/redirect?code=x')).toBe(
      false,
    );
  });

  it('rejects Kakao, even with a Tistory address in its query string', () => {
    expect(
      back(
        'https://accounts.kakao.com/login?continue=https://www.tistory.com/',
      ),
    ).toBe(false);
  });

  it('rejects a lookalike domain', () => {
    expect(back('https://nottistory.com/')).toBe(false);
  });
});

describe('isManagePage', () => {
  it('matches only the named blog', () => {
    expect(
      isManagePage(new URL('https://myblog.tistory.com/manage'), 'myblog'),
    ).toBe(true);
    expect(
      isManagePage(new URL('https://other.tistory.com/manage'), 'myblog'),
    ).toBe(false);
    expect(isManagePage(new URL('https://www.tistory.com/'), 'myblog')).toBe(
      false,
    );
  });
});

describe('kakaoLogin', () => {
  const BLOG = 'myblog';
  const MANAGE = `https://${BLOG}.tistory.com/manage`;
  const TISTORY_HOME = 'https://www.tistory.com/';
  const TISTORY_LOGIN = `https://www.tistory.com/auth/login?redirectUrl=${MANAGE}`;
  const KAKAO_BUTTON = 'a.btn_login.link_kakao_id';
  const SUBMIT = 'button[type="submit"].btn_g.highlight.submit';
  const CONFIRM = 'button[type="submit"].btn_g.btn_confirm';

  interface Scenario {
    /** What submitting the credentials shows: the confirm step, or a URL */
    afterSubmit: 'confirm' | string;
    /** Where Kakao hands back to once the confirm step is clicked */
    afterConfirm?: string;
    /** Where a visit to the manage page ends up */
    manageGoesTo: string;
  }

  /**
   * Just enough of a Playwright page to walk kakaoLogin through Kakao's
   * outcomes. Waits resolve when the scenario's navigation satisfies them and
   * otherwise stay pending, which is how a race loser behaves.
   */
  class FakeLoginPage {
    private current = TISTORY_LOGIN;
    private confirmShown = false;
    private waiters: Array<() => void> = [];
    readonly visited: string[] = [];

    constructor(private readonly scenario: Scenario) {}

    url(): string {
      return this.current;
    }

    async click(selector: string): Promise<void> {
      if (selector === KAKAO_BUTTON) {
        this.navigate('https://accounts.kakao.com/login?continue=x');
      } else if (selector === SUBMIT) {
        if (this.scenario.afterSubmit === 'confirm') {
          this.confirmShown = true;
          this.notify();
        } else {
          this.navigate(this.scenario.afterSubmit);
        }
      } else if (selector === CONFIRM) {
        this.confirmShown = false;
        this.navigate(this.scenario.afterConfirm!);
      }
    }

    async type(): Promise<void> {}

    async waitForTimeout(): Promise<void> {}

    async waitForSelector(selector: string): Promise<void> {
      if (selector === CONFIRM) await this.until(() => this.confirmShown);
    }

    async waitForURL(matches: (url: URL) => boolean): Promise<void> {
      await this.until(() => matches(new URL(this.current)));
    }

    async goto(url: string): Promise<void> {
      this.visited.push(url);
      this.navigate(url === MANAGE ? this.scenario.manageGoesTo : url);
    }

    private navigate(url: string): void {
      this.current = url;
      this.notify();
    }

    private until(condition: () => boolean): Promise<void> {
      return new Promise((resolve) => {
        const check = () =>
          condition() ? resolve() : void this.waiters.push(check);
        check();
      });
    }

    private notify(): void {
      const pending = this.waiters;
      this.waiters = [];
      pending.forEach((check) => check());
    }
  }

  async function login(scenario: Scenario) {
    const page = new FakeLoginPage(scenario);
    const progress: string[] = [];
    const result = kakaoLogin(
      page as unknown as Page,
      'id',
      'password',
      BLOG,
      async (message) => void progress.push(message),
    );
    return { page, progress, result };
  }

  // The production failure: Kakao showed its confirm step, and once it was
  // clicked Tistory ended the round trip on its home page. The flow waited 30s
  // there for the manage page to arrive on its own and failed the publish.
  it('goes to the manage page itself when the confirm step lands on the Tistory home page', async () => {
    const { page, progress, result } = await login({
      afterSubmit: 'confirm',
      afterConfirm: TISTORY_HOME,
      manageGoesTo: MANAGE,
    });

    await expect(result).resolves.toBeUndefined();
    expect(page.visited).toEqual([MANAGE]);
    expect(page.url()).toBe(MANAGE);
    expect(progress).toContain(
      'Kakao confirm step presented - clicking through',
    );
    expect(progress.some((line) => line.includes(TISTORY_HOME))).toBe(true);
  });

  it('does not navigate again when Kakao returns straight to the manage page', async () => {
    const { page, progress, result } = await login({
      afterSubmit: MANAGE,
      manageGoesTo: MANAGE,
    });

    await expect(result).resolves.toBeUndefined();
    expect(page.visited).toEqual([]);
    expect(progress).toContain(
      'Kakao login returned straight to the manage page',
    );
  });

  it('fails, naming where it stopped, when the manage page bounces back to login', async () => {
    const { result } = await login({
      afterSubmit: 'confirm',
      afterConfirm: TISTORY_HOME,
      manageGoesTo: TISTORY_LOGIN,
    });

    await expect(result).rejects.toThrow(
      /login did not take\. Stopped at: https:\/\/www\.tistory\.com\/auth\/login/,
    );
  });
});
