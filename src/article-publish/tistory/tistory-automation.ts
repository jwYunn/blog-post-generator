/**
 * Tistory Playwright automation utilities
 * Shared between the NestJS processor and standalone scripts.
 */
import { Logger } from '@nestjs/common';
import { Page, BrowserContext, chromium } from 'playwright';
import { marked } from 'marked';
import { PublishMode, TistoryDraftData, TistoryPublishResult, TistorySessionProvider } from './tistory.types';
import { stripTitleCategory } from '../../common/utils/title.util';

const BLOG_NAME = process.env.TISTORY_BLOG_NAME || 'fromdeepwithin';
const logger = new Logger('TistoryAutomation');

// ─── Utilities ──────────────────────────────────────────────────────────────

/** Convert Markdown to HTML */
export function markdownToHtml(markdown: string): string {
  return marked.parse(markdown) as string;
}

/** Build full HTML body (thumbnail image + converted Markdown) */
export function buildHtmlContent(draft: TistoryDraftData): string {
  const parts: string[] = [];
  if (draft.thumbnailImageUrl) {
    parts.push(
      `<div style="text-align: center; margin-bottom: 24px;">` +
        `<img src="${draft.thumbnailImageUrl}" alt="${stripTitleCategory(draft.title)}" style="max-width: 100%;">` +
        `</div>`,
    );
  }
  parts.push(markdownToHtml(draft.content));
  return parts.join('\n\n');
}

// ─── Human-like typing ──────────────────────────────────────────────────────

/** Type text one character at a time with irregular delays */
export async function humanType(
  page: Page,
  selector: string,
  text: string,
): Promise<void> {
  await page.click(selector);
  for (const char of text) {
    await page.type(selector, char, {
      delay: Math.floor(Math.random() * 120) + 40,
    });
    if (Math.random() < 0.2) {
      await page.waitForTimeout(Math.floor(Math.random() * 200) + 100);
    }
  }
}

// ─── Kakao login ────────────────────────────────────────────────────────────

/**
 * Log in with a Kakao account and wait for mobile auth approval.
 * @param mobileAuthTimeoutMs Maximum wait time for mobile auth (default 5 min)
 */
export async function kakaoLogin(
  page: Page,
  kakaoId: string,
  kakaoPassword: string,
  mobileAuthTimeoutMs = 300_000,
): Promise<void> {
  // 1. Click "Login with Kakao account" button
  logger.log('Clicking Kakao login button');
  await page.waitForSelector('a.btn_login.link_kakao_id', { timeout: 10_000 });
  await page.click('a.btn_login.link_kakao_id');

  // 2. Wait for login form
  await page.waitForSelector('#loginId--1', { timeout: 10_000 });

  // 3. Enter ID (human-like typing)
  logger.log('Entering ID');
  await humanType(page, '#loginId--1', kakaoId);

  // 4. Enter password (human-like typing)
  logger.log('Entering password');
  await humanType(page, '#password--2', kakaoPassword);

  // 5. Short pause before clicking (0.8–1.5 s)
  const preClickDelay = Math.floor(Math.random() * 700) + 800;
  await page.waitForTimeout(preClickDelay);

  // 6. Click login button
  logger.log('Clicking login button');
  await page.click('button[type="submit"].btn_g.highlight.submit');

  // 7. Wait for mobile auth approval
  logger.log(`Waiting for mobile auth (up to ${mobileAuthTimeoutMs / 60_000} min)`);
  await page.waitForSelector('button.btn_agree[name="user_oauth_approval"]', {
    timeout: mobileAuthTimeoutMs,
  });

  // 8. Click Continue button
  logger.log('Clicking Continue button');
  await page.click('button.btn_agree[name="user_oauth_approval"]');

  // 9. Wait to reach the manage page
  await page.waitForURL(`**//${BLOG_NAME}.tistory.com/manage**`, {
    timeout: 30_000,
  });
  logger.log('Login complete');
}

// ─── Editor helpers ─────────────────────────────────────────────────────────

/** Select category by matching the seed category value against the dropdown */
export async function selectCategory(
  page: Page,
  category: string,
): Promise<void> {
  await page.waitForSelector('#category-btn', { timeout: 10_000 });
  await page.click('#category-btn');
  await page.waitForSelector('#category-list', { timeout: 5_000 });

  const items = await page.$$('#category-list [role="option"]');
  for (const item of items) {
    const label = (await item.getAttribute('aria-label')) ?? '';
    const normalized = label.replace(/^-\s*/, '').trim();
    if (normalized.toLowerCase() === category.toLowerCase()) {
      await item.click();
      logger.log(`Category selected: "${label}"`);
      return;
    }
  }

  logger.warn(`No category matching "${category}" found. Keeping default.`);
  await page.keyboard.press('Escape');
}

/** Insert HTML body via the HTML block modal */
export async function fillHtmlViaModal(
  page: Page,
  html: string,
): Promise<void> {
  // 1. Click the body editor to focus it
  try {
    await page.waitForSelector('#tinymce', { timeout: 3_000 });
    await page.click('#tinymce');
  } catch {
    const frameEl = page.locator('iframe').first();
    const frame = await frameEl.contentFrame();
    if (frame) await frame.locator('body#tinymce').click();
  }
  await page.waitForTimeout(300);

  // 2. Click the "more plugins" button
  await page.waitForSelector('#more-plugin-btn-open', { timeout: 10_000 });
  await page.click('#more-plugin-btn-open');

  // 3. Click the HTML block option
  await page.waitForSelector('#plugin-html-block', { timeout: 5_000 });
  await page.click('#plugin-html-block');

  // 4. Wait for the modal
  await page.waitForSelector('.mce-codeblock-dialog', { timeout: 5_000 });
  logger.log('HTML insert modal opened');

  // 5. Inject HTML via CodeMirror JS API
  const injected = await page.evaluate((content: string) => {
    const dialog = document.querySelector('.mce-codeblock-dialog');
    if (!dialog) return false;
    const cm = (dialog.querySelector('.CodeMirror') as any)?.CodeMirror;
    if (cm) {
      cm.setValue(content);
      cm.refresh();
      return true;
    }
    const ta = dialog.querySelector('textarea.textarea') as HTMLTextAreaElement | null;
    if (ta) {
      ta.value = content;
      ta.dispatchEvent(new Event('input', { bubbles: true }));
      return true;
    }
    return false;
  }, html);

  if (!injected) {
    throw new Error('Failed to inject content into HTML modal CodeMirror.');
  }
  logger.log('HTML content injected');

  // 6. Click confirm button
  await page.click('.mce-codeblock-btn-submit button');
  await page.waitForTimeout(500);
  logger.log('HTML block inserted');
}

/** Enter hashtags (up to 10), pressing Tab after each one */
export async function fillHashtags(
  page: Page,
  hashtags: string[],
): Promise<void> {
  const tags = hashtags
    .map((t) => t.replace(/^#/, '').trim())
    .filter(Boolean)
    .slice(0, 10);

  await page.waitForSelector('#tagText', { timeout: 10_000 });
  await page.click('#tagText');

  for (const tag of tags) {
    await page.fill('#tagText', tag);
    await page.waitForTimeout(150);
    await page.keyboard.press('Tab');
    await page.waitForTimeout(200);
  }

  logger.log(`${tags.length} hashtags entered`);
}

/** Navigate the calendar widget to the target year/month */
export async function navigateCalendarTo(
  page: Page,
  targetYear: number,
  targetMonth: number,
): Promise<void> {
  for (let i = 0; i < 24; i++) {
    const headerText = await page.textContent('.txt_calendar');
    const m = headerText?.match(/(\d{4})년\s*(\d{1,2})월/);
    if (!m) break;
    const curYear = parseInt(m[1]);
    const curMonth = parseInt(m[2]);

    if (curYear === targetYear && curMonth === targetMonth) break;

    const isAhead =
      curYear < targetYear || (curYear === targetYear && curMonth < targetMonth);

    if (isAhead) {
      await page.click('.btn_arr.btn_next');
    } else {
      await page.click('.btn_arr.btn_prev');
    }
    await page.waitForTimeout(300);
  }
}

/** Handle the publish modal (set visibility + immediate or scheduled publish) */
export async function handlePublishModal(
  page: Page,
  publishMode: PublishMode,
): Promise<void> {
  // 1. Open publish layer
  await page.waitForSelector('#publish-layer-btn', { timeout: 10_000 });
  await page.click('#publish-layer-btn');
  await page.waitForSelector('.ReactModal__Content', { timeout: 10_000 });
  logger.log('Publish modal opened');

  // 2. Select public visibility
  await page.click('#open20');
  logger.log('Public visibility set');

  if (publishMode.mode === 'now') {
    await page.click('button.btn_date:has-text("현재")');
    await page.waitForTimeout(300);
    await page.click('#publish-btn');
    logger.log('Immediate publish complete');
  } else {
    const { datetime } = publishMode;
    const targetYear = datetime.getFullYear();
    const targetMonth = datetime.getMonth() + 1;
    const targetDay = datetime.getDate();
    const targetHour = datetime.getHours();
    const targetMinute = datetime.getMinutes();

    // Select schedule tab
    await page.click('button.btn_date:has-text("예약")');
    await page.waitForTimeout(300);

    // Open calendar
    await page.click('button.btn_reserve');
    await page.waitForSelector('.box_calendar', { timeout: 5_000 });
    logger.log('Calendar opened');

    // Navigate to target month
    await navigateCalendarTo(page, targetYear, targetMonth);

    // Click target day
    const dayButtons = await page.$$('.box_calendar .btn_day:not([disabled])');
    let clicked = false;
    for (const btn of dayButtons) {
      const text = (await btn.textContent())?.trim();
      if (text === String(targetDay)) {
        await btn.click();
        clicked = true;
        break;
      }
    }
    if (!clicked) {
      throw new Error(`Could not click day ${targetDay} in the calendar.`);
    }
    logger.log(`Date selected: ${targetYear}-${targetMonth}-${targetDay}`);

    // Set hour and minute
    await page.fill('#dateHour', String(targetHour));
    await page.fill('#dateMinute', String(targetMinute));
    logger.log(`Time set: ${targetHour}:${String(targetMinute).padStart(2, '0')}`);

    await page.click('#publish-btn');
    logger.log(`Scheduled publish complete: ${datetime.toISOString()}`);
  }
}

// ─── Browser context (session management) ───────────────────────────────────

/** Create a browser context from a saved session, or a fresh context if none exists */
export async function createContextFromSession(
  browser: Awaited<ReturnType<typeof chromium.launch>>,
  sessionProvider: TistorySessionProvider,
): Promise<BrowserContext> {
  const session = await sessionProvider.getSession();
  if (session) {
    logger.log('Loading saved session');
    return browser.newContext({ storageState: session as any });
  }
  logger.log('No saved session found. Login required.');
  return browser.newContext();
}

/** Extract the permalink of the most recently created post from a posts.json response */
async function extractPermalinkFromPostsResponse(
  responsePromise: Promise<import('playwright').Response>,
): Promise<string | null> {
  try {
    const response = await responsePromise;
    const body = (await response.json()) as {
      items: Array<{ id: string; permalink: string }>;
    };
    if (!body.items?.length) return null;
    const sorted = [...body.items].sort((a, b) => Number(b.id) - Number(a.id));
    return sorted[0].permalink;
  } catch {
    return null;
  }
}

/**
 * Full Tistory publish flow.
 * Accepts headless flag and an optional waitForConfirm hook so it can be reused
 * by both the NestJS processor and standalone scripts.
 */
export async function runTistoryPublish(opts: {
  draft: TistoryDraftData;
  publishMode: PublishMode;
  sessionProvider: TistorySessionProvider;
  kakaoId: string;
  kakaoPassword: string;
  headless?: boolean;
  /** Optional confirmation step before publishing (script use only) */
  waitForConfirm?: () => Promise<void>;
}): Promise<TistoryPublishResult> {
  const {
    draft,
    publishMode,
    sessionProvider,
    kakaoId,
    kakaoPassword,
    headless = true,
    waitForConfirm,
  } = opts;

  const htmlContent = buildHtmlContent(draft);

  const browser = await chromium.launch({
    headless,
    slowMo: headless ? 50 : 100,
  });

  const context = await createContextFromSession(browser, sessionProvider);
  const page = await context.newPage();

  try {
    // 1. Check login status
    logger.log('Navigating to Tistory manage page');
    await page.goto(`https://${BLOG_NAME}.tistory.com/manage`, {
      waitUntil: 'domcontentloaded',
    });

    const currentUrl = page.url();
    const needsLogin =
      currentUrl.includes('accounts.kakao.com') ||
      currentUrl.includes('tistory.com/auth') ||
      currentUrl.includes('login');

    if (needsLogin) {
      // If a cached session existed but failed, remove it from Redis
      const existing = await sessionProvider.getSession();
      if (existing) {
        logger.warn('Saved session expired. Deleting session.');
        await sessionProvider.deleteSession();
      }

      logger.warn('Login required. Starting Kakao auto-login.');
      await kakaoLogin(page, kakaoId, kakaoPassword);
    } else {
      logger.log('Login status verified');
    }

    // Save session
    const state = await context.storageState();
    await sessionProvider.saveSession(state);

    // 2. Navigate to new post page
    logger.log('Navigating to new post page');
    await page.goto(`https://${BLOG_NAME}.tistory.com/manage/newpost`, {
      waitUntil: 'networkidle',
    });

    // 3. Select category
    logger.log('Selecting category');
    await selectCategory(page, draft.category);

    // 4. Enter title
    logger.log(`Entering title: ${draft.title}`);
    await page.waitForSelector('#post-title-inp', { timeout: 10_000 });
    await page.click('#post-title-inp');
    await page.fill('#post-title-inp', draft.title);

    // 5. Enter HTML body
    logger.log('Entering HTML content');
    await fillHtmlViaModal(page, htmlContent);

    // 6. Enter hashtags
    if (draft.hashtags && draft.hashtags.length > 0) {
      logger.log('Entering hashtags');
      await fillHashtags(page, draft.hashtags);
    }

    // 7. Optional confirmation step (script use only)
    if (waitForConfirm) {
      await waitForConfirm();
    }

    // 8. Publish — register the posts.json response listener before clicking
    // waitForResponse registers a promise, so it must be set up before the button click
    const postsJsonResponsePromise = page.waitForResponse(
      (res) =>
        res.url().includes(`${BLOG_NAME}.tistory.com/manage/posts.json`) &&
        res.status() === 200,
      { timeout: 30_000 },
    );

    logger.log('Publishing');
    await handlePublishModal(page, publishMode);

    // 9. Extract permalink
    const permalink = await extractPermalinkFromPostsResponse(postsJsonResponsePromise);
    if (permalink) {
      logger.log(`Publish complete - permalink: ${permalink}`);
    } else {
      logger.log('Publish complete (permalink extraction failed)');
    }

    await page.waitForTimeout(3_000);
    return { permalink };
  } finally {
    // Save final session state before closing (in case of graceful exit without logout)
    try {
      const state = await context.storageState();
      await sessionProvider.saveSession(state);
    } catch {
      // Ignore session save failure on teardown
    }
    await browser.close();
  }
  return { permalink: null };
}
