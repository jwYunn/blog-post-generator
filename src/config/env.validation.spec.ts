import { isEnabled, validateEnv } from './env.validation';

describe('isEnabled', () => {
  it.each(['true', 'TRUE', 'True', '  true  '])(
    'reads %p as enabled',
    (value) => {
      expect(isEnabled(value)).toBe(true);
    },
  );

  // Anything other than an explicit "true" leaves the flag off. The values here
  // are the ones someone reaches for expecting them to work.
  it.each(['false', '1', 'yes', 'on', 'TRUE ish', '', undefined, null, 0])(
    'reads %p as disabled',
    (value) => {
      expect(isEnabled(value)).toBe(false);
    },
  );

  it('accepts a real boolean as well as its string form', () => {
    expect(isEnabled(true)).toBe(true);
    expect(isEnabled(false)).toBe(false);
  });
});

describe('validateEnv', () => {
  const complete = {
    TISTORY_BLOG_NAME: 'my-blog',
    BROWSERLESS_URL: 'ws://browserless:3000',
  };

  it('returns the config untouched when nothing is missing', () => {
    expect(validateEnv({ ...complete })).toEqual(complete);
  });

  it('refuses to start without a blog name', () => {
    expect(() =>
      validateEnv({ BROWSERLESS_URL: 'ws://browserless:3000' }),
    ).toThrow(/TISTORY_BLOG_NAME/);
  });

  it('names every missing variable in one error', () => {
    // One restart per missing variable is the alternative, and each one costs a
    // deploy to discover.
    expect(() => validateEnv({})).toThrow(
      'Missing required environment variable(s): TISTORY_BLOG_NAME, BROWSERLESS_URL',
    );
  });

  it('treats a whitespace-only value as missing', () => {
    expect(() =>
      validateEnv({ ...complete, TISTORY_BLOG_NAME: '   ' }),
    ).toThrow(/TISTORY_BLOG_NAME/);
  });

  it('stops requiring the remote browser once local browser debug is on', () => {
    expect(() =>
      validateEnv({
        TISTORY_BLOG_NAME: 'my-blog',
        BROWSER_DEBUG_LOCAL: 'true',
      }),
    ).not.toThrow();
  });

  it('still requires the remote browser for a debug flag that is not exactly "true"', () => {
    // Reading this loosely would let a typo in the flag drop the one variable
    // the publish flow cannot run without, and only the publish job would notice
    expect(() =>
      validateEnv({ TISTORY_BLOG_NAME: 'my-blog', BROWSER_DEBUG_LOCAL: '1' }),
    ).toThrow(/BROWSERLESS_URL/);
  });
});
