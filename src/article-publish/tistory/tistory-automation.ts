/**
 * 티스토리 Playwright 자동화 함수 모음
 * NestJS Processor와 standalone 스크립트 양쪽에서 공유합니다.
 */
import { Logger } from '@nestjs/common';
import { Page, BrowserContext, chromium } from 'playwright';
import { marked } from 'marked';
import { PublishMode, TistoryDraftData, TistoryPublishResult, TistorySessionProvider } from './tistory.types';
import { stripTitleCategory } from '../../common/utils/title.util';

const BLOG_NAME = process.env.TISTORY_BLOG_NAME || 'fromdeepwithin';
const logger = new Logger('TistoryAutomation');

// ─── 유틸 ───────────────────────────────────────────────────────────────────

/** 마크다운 → HTML 변환 */
export function markdownToHtml(markdown: string): string {
  return marked.parse(markdown) as string;
}

/** HTML 본문 생성 (썸네일 이미지 + 마크다운 변환) */
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

// ─── 사람처럼 타이핑 ────────────────────────────────────────────────────────

/** 불규칙한 간격으로 한 글자씩 타이핑 */
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

// ─── 카카오 로그인 ──────────────────────────────────────────────────────────

/**
 * 카카오 계정으로 자동 로그인 + 모바일 인증 대기
 * @param mobileAuthTimeoutMs 모바일 인증 대기 시간 (기본 5분)
 */
export async function kakaoLogin(
  page: Page,
  kakaoId: string,
  kakaoPassword: string,
  mobileAuthTimeoutMs = 300_000,
): Promise<void> {
  // 1. "카카오계정으로 로그인" 버튼 클릭
  logger.log('카카오계정으로 로그인 버튼 클릭');
  await page.waitForSelector('a.btn_login.link_kakao_id', { timeout: 10_000 });
  await page.click('a.btn_login.link_kakao_id');

  // 2. 로그인 폼 대기
  await page.waitForSelector('#loginId--1', { timeout: 10_000 });

  // 3. ID 입력 (불규칙 타이핑)
  logger.log('ID 입력');
  await humanType(page, '#loginId--1', kakaoId);

  // 4. 비밀번호 입력 (불규칙 타이핑)
  logger.log('비밀번호 입력');
  await humanType(page, '#password--2', kakaoPassword);

  // 5. 버튼 클릭 전 살짝 대기 (0.8~1.5초)
  const preClickDelay = Math.floor(Math.random() * 700) + 800;
  await page.waitForTimeout(preClickDelay);

  // 6. 로그인 버튼 클릭
  logger.log('로그인 버튼 클릭');
  await page.click('button[type="submit"].btn_g.highlight.submit');

  // 7. 모바일 인증 대기
  logger.log(`모바일 인증 대기 중 (최대 ${mobileAuthTimeoutMs / 60_000}분)`);
  await page.waitForSelector('button.btn_agree[name="user_oauth_approval"]', {
    timeout: mobileAuthTimeoutMs,
  });

  // 8. Continue 버튼 클릭
  logger.log('Continue 버튼 클릭');
  await page.click('button.btn_agree[name="user_oauth_approval"]');

  // 9. 관리 페이지 도달 대기
  await page.waitForURL(`**//${BLOG_NAME}.tistory.com/manage**`, {
    timeout: 30_000,
  });
  logger.log('로그인 완료');
}

// ─── 에디터 헬퍼 ────────────────────────────────────────────────────────────

/** 카테고리 선택: seed category 값으로 드롭다운에서 매칭 항목 클릭 */
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
      logger.log(`카테고리 선택: "${label}"`);
      return;
    }
  }

  logger.warn(`카테고리 "${category}"와 일치하는 항목을 찾지 못했습니다. 기본값 유지.`);
  await page.keyboard.press('Escape');
}

/** HTML 블럭 모달을 통해 본문 HTML 입력 */
export async function fillHtmlViaModal(
  page: Page,
  html: string,
): Promise<void> {
  // 1. 본문 에디터 클릭 (포커스)
  try {
    await page.waitForSelector('#tinymce', { timeout: 3_000 });
    await page.click('#tinymce');
  } catch {
    const frameEl = page.locator('iframe').first();
    const frame = await frameEl.contentFrame();
    if (frame) await frame.locator('body#tinymce').click();
  }
  await page.waitForTimeout(300);

  // 2. 더보기 플러그인 버튼 클릭
  await page.waitForSelector('#more-plugin-btn-open', { timeout: 10_000 });
  await page.click('#more-plugin-btn-open');

  // 3. HTML 블럭 클릭
  await page.waitForSelector('#plugin-html-block', { timeout: 5_000 });
  await page.click('#plugin-html-block');

  // 4. 모달 대기
  await page.waitForSelector('.mce-codeblock-dialog', { timeout: 5_000 });
  logger.log('HTML 삽입 모달 열림');

  // 5. CodeMirror JS API로 HTML 주입
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
    throw new Error('HTML 모달 CodeMirror에 내용을 주입하지 못했습니다.');
  }
  logger.log('HTML 내용 주입 완료');

  // 6. 확인 버튼 클릭
  await page.click('.mce-codeblock-btn-submit button');
  await page.waitForTimeout(500);
  logger.log('HTML 블럭 삽입 완료');
}

/** 해시태그 입력 (최대 10개, 각 태그 입력 후 Tab) */
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

  logger.log(`해시태그 ${tags.length}개 입력 완료`);
}

/** 캘린더를 목표 연/월까지 이동 */
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

/** 발행 모달 처리 (공개 설정 + 현재/예약 발행) */
export async function handlePublishModal(
  page: Page,
  publishMode: PublishMode,
): Promise<void> {
  // 1. 발행 레이어 버튼 클릭
  await page.waitForSelector('#publish-layer-btn', { timeout: 10_000 });
  await page.click('#publish-layer-btn');
  await page.waitForSelector('.ReactModal__Content', { timeout: 10_000 });
  logger.log('발행 모달 열림');

  // 2. 공개 라디오 선택
  await page.click('#open20');
  logger.log('공개 설정 완료');

  if (publishMode.mode === 'now') {
    await page.click('button.btn_date:has-text("현재")');
    await page.waitForTimeout(300);
    await page.click('#publish-btn');
    logger.log('공개 발행 완료');
  } else {
    const { datetime } = publishMode;
    const targetYear = datetime.getFullYear();
    const targetMonth = datetime.getMonth() + 1;
    const targetDay = datetime.getDate();
    const targetHour = datetime.getHours();
    const targetMinute = datetime.getMinutes();

    // 예약 탭 선택
    await page.click('button.btn_date:has-text("예약")');
    await page.waitForTimeout(300);

    // 캘린더 열기
    await page.click('button.btn_reserve');
    await page.waitForSelector('.box_calendar', { timeout: 5_000 });
    logger.log('캘린더 열림');

    // 목표 월 이동
    await navigateCalendarTo(page, targetYear, targetMonth);

    // 날짜 클릭
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
      throw new Error(`캘린더에서 ${targetDay}일을 클릭할 수 없습니다.`);
    }
    logger.log(`날짜 선택: ${targetYear}-${targetMonth}-${targetDay}`);

    // 시간/분 입력
    await page.fill('#dateHour', String(targetHour));
    await page.fill('#dateMinute', String(targetMinute));
    logger.log(`시간 설정: ${targetHour}:${String(targetMinute).padStart(2, '0')}`);

    await page.click('#publish-btn');
    logger.log(`예약 발행 완료: ${datetime.toLocaleString('ko-KR')}`);
  }
}

// ─── 브라우저 컨텍스트 (세션 연동) ─────────────────────────────────────────

/** 세션 Provider에서 context 생성 */
export async function createContextFromSession(
  browser: Awaited<ReturnType<typeof chromium.launch>>,
  sessionProvider: TistorySessionProvider,
): Promise<BrowserContext> {
  const session = await sessionProvider.getSession();
  if (session) {
    logger.log('저장된 세션을 불러옵니다.');
    return browser.newContext({ storageState: session as any });
  }
  logger.log('저장된 세션이 없습니다. 로그인이 필요합니다.');
  return browser.newContext();
}

/**
 * 티스토리 전체 발행 플로우
 * headless 여부와 waitForConfirm(Enter 대기 함수)을 외부에서 주입받아
 * 스크립트/프로세서 양쪽에서 재사용합니다.
 */
/** posts.json 응답에서 id가 가장 큰 항목의 permalink 추출 */
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

export async function runTistoryPublish(opts: {
  draft: TistoryDraftData;
  publishMode: PublishMode;
  sessionProvider: TistorySessionProvider;
  kakaoId: string;
  kakaoPassword: string;
  headless?: boolean;
  /** 발행 전 사용자 확인이 필요한 경우 주입 (스크립트 전용) */
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
    // 1. 로그인 확인
    logger.log('티스토리 관리 페이지로 이동');
    await page.goto(`https://${BLOG_NAME}.tistory.com/manage`, {
      waitUntil: 'domcontentloaded',
    });

    const currentUrl = page.url();
    const needsLogin =
      currentUrl.includes('accounts.kakao.com') ||
      currentUrl.includes('tistory.com/auth') ||
      currentUrl.includes('login');

    if (needsLogin) {
      // 기존 세션이 있었는데 실패한 경우 Redis에서 삭제
      const existing = await sessionProvider.getSession();
      if (existing) {
        logger.warn('저장된 세션이 만료되었습니다. 세션을 삭제합니다.');
        await sessionProvider.deleteSession();
      }

      logger.warn('로그인이 필요합니다. 카카오 자동 로그인 시작');
      await kakaoLogin(page, kakaoId, kakaoPassword);
    } else {
      logger.log('로그인 상태 확인');
    }

    // 세션 저장
    const state = await context.storageState();
    await sessionProvider.saveSession(state);

    // 2. 글쓰기 페이지 이동
    logger.log('글쓰기 페이지로 이동');
    await page.goto(`https://${BLOG_NAME}.tistory.com/manage/newpost`, {
      waitUntil: 'networkidle',
    });

    // 3. 카테고리 선택
    logger.log('카테고리 선택');
    await selectCategory(page, draft.category);

    // 4. 제목 입력
    logger.log(`제목 입력: ${draft.title}`);
    await page.waitForSelector('#post-title-inp', { timeout: 10_000 });
    await page.click('#post-title-inp');
    await page.fill('#post-title-inp', draft.title);

    // 5. HTML 본문 입력
    logger.log('HTML 본문 입력');
    await fillHtmlViaModal(page, htmlContent);

    // 6. 해시태그 입력
    if (draft.hashtags && draft.hashtags.length > 0) {
      logger.log('해시태그 입력');
      await fillHashtags(page, draft.hashtags);
    }

    // 7. 발행 전 사용자 확인 (스크립트 전용)
    if (waitForConfirm) {
      await waitForConfirm();
    }

    // 8. 발행 (posts.json 응답 동시 캡처)
    // waitForResponse는 Promise를 등록할 뿐이므로 #publish-btn 클릭 전에 먼저 등록해야 응답을 놓치지 않음
    const postsJsonResponsePromise = page.waitForResponse(
      (res) =>
        res.url().includes(`${BLOG_NAME}.tistory.com/manage/posts.json`) &&
        res.status() === 200,
      { timeout: 30_000 },
    );

    logger.log('발행 중');
    await handlePublishModal(page, publishMode);

    // 9. permalink 추출
    const permalink = await extractPermalinkFromPostsResponse(postsJsonResponsePromise);
    if (permalink) {
      logger.log(`발행 완료 - permalink: ${permalink}`);
    } else {
      logger.log('발행 완료 (permalink 추출 실패)');
    }

    await page.waitForTimeout(3_000);
    return { permalink };
  } finally {
    // 최종 세션 저장 (로그아웃 없이 종료되는 경우 갱신)
    try {
      const state = await context.storageState();
      await sessionProvider.saveSession(state);
    } catch {
      // 세션 저장 실패는 무시
    }
    await browser.close();
  }
  return { permalink: null };
}
