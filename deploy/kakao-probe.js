/*
 * Exercises only the login half of runTistoryPublish: reach the Tistory manage
 * page, and if Kakao asks for credentials, go through the login flow. Nothing is
 * published. Run inside the app container so it uses the same env and the same
 * compiled code the publish job does.
 *
 *   docker compose exec -T app node < kakao-probe.js
 *
 * Set PROBE_LOGIN=1 to actually attempt the login; without it the script only
 * reports whether login would be required.
 */
const { chromium } = require('playwright-core');
const {
  kakaoLogin,
  createContextFromSession,
} = require('./dist/article-publish/tistory/tistory-automation');
const Redis = require('ioredis');

const SESSION_KEY = 'tistory:session';

const redis = new Redis({
  host: process.env.REDIS_HOST || 'localhost',
  port: Number(process.env.REDIS_PORT || 6379),
  maxRetriesPerRequest: 1,
});
redis.on('error', () => undefined);

const sessionProvider = {
  getSession: async () => {
    const raw = await redis.get(SESSION_KEY);
    return raw ? JSON.parse(raw) : null;
  },
  saveSession: async (state) =>
    redis.set(SESSION_KEY, JSON.stringify(state), 'EX', 86400),
  deleteSession: async () => redis.del(SESSION_KEY),
};

(async () => {
  const blogName = process.env.TISTORY_BLOG_NAME;
  const url = process.env.BROWSERLESS_URL;
  const attemptLogin = process.env.PROBE_LOGIN === '1';

  console.log(`blogName      : ${blogName}`);
  console.log(`browserless   : ${url}`);
  console.log(`saved session : ${(await sessionProvider.getSession()) ? '있음' : '없음'}`);
  console.log(`login 시도     : ${attemptLogin ? '예' : '아니오 (감지만)'}`);
  console.log('');

  const browser = await chromium.connect(url, { slowMo: 50, timeout: 30_000 });
  const context = await createContextFromSession(browser, sessionProvider);
  const page = await context.newPage();

  try {
    await page.goto(`https://${blogName}.tistory.com/manage`, {
      waitUntil: 'domcontentloaded',
    });
    const landed = page.url();
    console.log(`도착 URL      : ${landed}`);

    const needsLogin =
      landed.includes('accounts.kakao.com') ||
      landed.includes('tistory.com/auth') ||
      landed.includes('login');

    if (!needsLogin) {
      console.log('RESULT: 이미 로그인 상태 - 서버 IP가 차단되지 않았습니다');
      const state = await context.storageState();
      await sessionProvider.saveSession(state);
      console.log(`세션 저장 완료 (쿠키 ${state.cookies.length}개)`);
      return;
    }

    console.log('RESULT: 로그인 필요');
    if (!attemptLogin) {
      console.log('PROBE_LOGIN=1 로 다시 실행하면 실제 로그인을 시도합니다');
      return;
    }

    console.log('카카오 로그인 시도 중...');
    await kakaoLogin(
      page,
      process.env.KAKAO_ID,
      process.env.KAKAO_PASSWORD,
      blogName,
    );
    console.log('RESULT: 로그인 성공 - manage 페이지 도달');
    const state = await context.storageState();
    await sessionProvider.saveSession(state);
    console.log(`세션 저장 완료 (쿠키 ${state.cookies.length}개)`);
  } catch (err) {
    console.log(`RESULT: 실패 - ${err.message.split('\n')[0]}`);
    console.log(`현재 URL      : ${page.url()}`);
    console.log(`페이지 제목    : ${await page.title().catch(() => '(읽기 실패)')}`);
    const body = await page
      .locator('body')
      .innerText()
      .catch(() => '');
    console.log(`본문 발췌      : ${body.replace(/\s+/g, ' ').slice(0, 300)}`);
    process.exitCode = 1;
  } finally {
    await browser.close();
    await redis.quit().catch(() => redis.disconnect());
  }
})();
