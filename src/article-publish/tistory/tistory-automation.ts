/**
 * Tistory Playwright automation utilities
 * Shared between the NestJS processor and standalone scripts.
 */
import { Logger } from '@nestjs/common';
import { Browser, Page, BrowserContext, chromium } from 'playwright-core';
import { marked } from 'marked';
import {
  PublishMode,
  TistoryDraftData,
  TistoryPublishResult,
  TistorySessionProvider,
} from './tistory.types';
import { stripTitleCategory } from '../../common/utils/title.util';

const logger = new Logger('TistoryAutomation');

/** Delay applied to every Playwright operation, carried over from local launch */
const SLOW_MO_MS = 50;

/**
 * Budget for establishing the WebSocket connection to the remote browser only.
 * How long the session may then stay open is the remote's call - browserless
 * caps it with its own TIMEOUT setting, which has to cover a whole publish run
 * or the browser is torn down mid-flow. Its 30s default is not enough.
 */
const CONNECT_TIMEOUT_MS = 30_000;

/**
 * How long to wait, after the credentials are submitted, for Kakao to land
 * somewhere recognisable. Generous on purpose: the previous budget was 10s and
 * expired before Kakao had responded at all, which the flow then read as "no
 * interstitial was shown" and carried on regardless.
 */
const POST_SUBMIT_TIMEOUT_MS = 60_000;

/** Budget for the redirect chain that follows the interstitial */
const MANAGE_TIMEOUT_MS = 30_000;

// ─── Browser acquisition ────────────────────────────────────────────────────

/** Attach to the remote browser that runs the publish session */
async function connectRemoteBrowser(browserlessUrl: string): Promise<Browser> {
  logger.log('Connecting to remote browser');
  return chromium.connect(browserlessUrl, {
    // Preserves the pacing the flow was tuned against when it launched a local
    // browser; Tistory's editor is sensitive to operations landing too fast
    slowMo: SLOW_MO_MS,
    timeout: CONNECT_TIMEOUT_MS,
  });
}

/**
 * Debug escape hatch: run a visible browser on this machine so the operator can
 * watch the flow, instead of driving the remote one.
 *
 * Only works in a dev checkout. playwright-core ships no browser binary and
 * finds one here solely because the full playwright package - a devDependency -
 * downloaded it into the shared cache. A production install has neither, so
 * turning this on there fails at launch rather than silently doing something
 * unexpected.
 */
async function launchLocalBrowser(): Promise<Browser> {
  logger.warn('Local browser debug mode is on - launching a visible browser');
  return chromium.launch({ headless: false, slowMo: SLOW_MO_MS });
}

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

/** Log in with a Kakao account and land on the Tistory manage page */
export async function kakaoLogin(
  page: Page,
  kakaoId: string,
  kakaoPassword: string,
  blogName: string,
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

  // 7. Submitting leads to one of two places: straight through to the manage
  // page, or an interstitial that has to be confirmed first. Kakao decides
  // which, and takes a varying amount of time about it.
  //
  // Waiting a fixed budget for the interstitial and treating its absence as
  // "already past it" conflated two different situations - a step that was
  // never shown, and one that had not rendered yet. A slow response then fell
  // through to the manage-page wait with the interstitial still on screen and
  // nothing left to click it. Racing the two outcomes drops the assumption
  // about ordering and timing alike; whichever arrives first is the answer.
  const confirmButton = 'button[type="submit"].btn_g.btn_confirm';
  const managePattern = `**//${blogName}.tistory.com/manage**`;

  // Both branches swallow their own timeout so the loser cannot surface as an
  // unhandled rejection once the race has already settled.
  const outcome = await Promise.race([
    page
      .waitForURL(managePattern, { timeout: POST_SUBMIT_TIMEOUT_MS })
      .then(() => 'manage' as const)
      .catch(() => null),
    page
      .waitForSelector(confirmButton, { timeout: POST_SUBMIT_TIMEOUT_MS })
      .then(() => 'confirm' as const)
      .catch(() => null),
  ]);

  if (outcome === null) {
    // Naming the landing spot matters: an additional-auth screen and a changed
    // selector both stall here, and the URL is what tells them apart.
    throw new Error(
      `Kakao login reached neither the manage page nor a confirm step within ` +
        `${POST_SUBMIT_TIMEOUT_MS / 1000}s. Stopped at: ${page.url()}`,
    );
  }

  // 8. Confirm if asked, then wait out the redirect chain to the manage page
  if (outcome === 'confirm') {
    logger.log('Confirm step presented - clicking through');
    await page.click(confirmButton);
    await page.waitForURL(managePattern, { timeout: MANAGE_TIMEOUT_MS });
  } else {
    logger.log('No confirm step - reached the manage page directly');
  }

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
    const ta = dialog.querySelector(
      'textarea.textarea',
    ) as HTMLTextAreaElement | null;
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
      curYear < targetYear ||
      (curYear === targetYear && curMonth < targetMonth);

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
    logger.log(
      `Time set: ${targetHour}:${String(targetMinute).padStart(2, '0')}`,
    );

    await page.click('#publish-btn');
    logger.log(`Scheduled publish complete: ${datetime.toISOString()}`);
  }
}

// ─── Browser context (session management) ───────────────────────────────────

/** Create a browser context from a saved session, or a fresh context if none exists */
export async function createContextFromSession(
  browser: Browser,
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
  responsePromise: Promise<import('playwright-core').Response>,
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
 * Drives a remote browser - or a local one under useLocalBrowser - and takes an
 * optional waitForConfirm hook so it can be reused by both the NestJS processor
 * and standalone scripts.
 */
export async function runTistoryPublish(opts: {
  draft: TistoryDraftData;
  publishMode: PublishMode;
  sessionProvider: TistorySessionProvider;
  kakaoId: string;
  kakaoPassword: string;
  /** Tistory blog name (the subdomain of <name>.tistory.com) */
  blogName: string;
  /** WebSocket endpoint of the remote browser; unused when useLocalBrowser is set */
  browserlessUrl?: string;
  /** Debug only: launch a visible browser here instead of using browserlessUrl */
  useLocalBrowser?: boolean;
  /** Optional confirmation step before publishing (script use only) */
  waitForConfirm?: () => Promise<void>;
  /**
   * Fires just before the publish modal is driven. Everything up to this point
   * leaves nothing behind on the blog, and everything after it may, so a caller
   * that has to decide whether a retry is safe hooks in here.
   */
  onBeforePublish?: () => Promise<void>;
  /**
   * Sink for the step-by-step narration, mirrored from the container log. The
   * publish job records these on itself, which is what remains once the
   * container logs have rolled over.
   */
  onProgress?: (message: string) => Promise<void>;
}): Promise<TistoryPublishResult> {
  const {
    draft,
    publishMode,
    sessionProvider,
    kakaoId,
    kakaoPassword,
    blogName,
    browserlessUrl,
    useLocalBrowser = false,
    waitForConfirm,
    onBeforePublish,
    onProgress,
  } = opts;

  /** Narrate to the container log and to the caller's sink at once */
  const report = async (
    message: string,
    level: 'log' | 'warn' = 'log',
  ): Promise<void> => {
    logger[level](message);
    if (onProgress) await onProgress(message);
  };

  if (!useLocalBrowser && !browserlessUrl) {
    throw new Error(
      'browserlessUrl is required unless useLocalBrowser is enabled.',
    );
  }

  const htmlContent = buildHtmlContent(draft);

  const browser = useLocalBrowser
    ? await launchLocalBrowser()
    : await connectRemoteBrowser(browserlessUrl);

  const context = await createContextFromSession(browser, sessionProvider);
  const page = await context.newPage();

  try {
    // 1. Check login status
    await report('Navigating to Tistory manage page');
    await page.goto(`https://${blogName}.tistory.com/manage`, {
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
        await report('Saved session expired. Deleting session.', 'warn');
        await sessionProvider.deleteSession();
      }

      await report('Login required. Starting Kakao auto-login.', 'warn');
      await kakaoLogin(page, kakaoId, kakaoPassword, blogName);
    } else {
      await report('Login status verified - saved session still valid');
    }

    // Save session
    const state = await context.storageState();
    await sessionProvider.saveSession(state);

    // 2. Navigate to new post page
    await report('Navigating to new post page');
    await page.goto(`https://${blogName}.tistory.com/manage/newpost`, {
      waitUntil: 'networkidle',
    });

    // 3. Select category
    await report(`Selecting category "${draft.category}"`);
    await selectCategory(page, draft.category);

    // 4. Enter title
    await report(`Entering title: ${draft.title}`);
    await page.waitForSelector('#post-title-inp', { timeout: 10_000 });
    await page.click('#post-title-inp');
    await page.fill('#post-title-inp', draft.title);

    // 5. Enter HTML body
    await report(`Entering HTML content (${htmlContent.length} chars)`);
    await fillHtmlViaModal(page, htmlContent);

    // 6. Enter hashtags
    if (draft.hashtags && draft.hashtags.length > 0) {
      await report(`Entering ${draft.hashtags.length} hashtags`);
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
        res.url().includes(`${blogName}.tistory.com/manage/posts.json`) &&
        res.status() === 200,
      { timeout: 30_000 },
    );

    // Announced before the modal rather than before the button inside it: the
    // caller is deciding whether a post may exist, and erring early there costs
    // a manual check, while erring late costs a duplicate post.
    if (onBeforePublish) {
      await onBeforePublish();
    }

    await report(`Publishing (mode: ${publishMode.mode})`);
    await handlePublishModal(page, publishMode);

    // 9. Extract permalink
    const permalink = await extractPermalinkFromPostsResponse(
      postsJsonResponsePromise,
    );
    if (permalink) {
      await report(`Publish complete - permalink: ${permalink}`);
    } else {
      await report('Publish complete, but permalink extraction failed', 'warn');
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
}
