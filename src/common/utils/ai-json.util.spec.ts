import { Logger } from '@nestjs/common';
import { parseJsonArrayResponse, parseJsonResponse } from './ai-json.util';

const SOURCE = 'topic generation';

describe('parseJsonResponse', () => {
  it('reads a bare object', () => {
    expect(parseJsonResponse('{"title":"Present perfect"}', SOURCE)).toEqual({
      title: 'Present perfect',
    });
  });

  it('reads a bare array', () => {
    expect(parseJsonResponse('["#영어공부","#LearnEnglish"]', SOURCE)).toEqual([
      '#영어공부',
      '#LearnEnglish',
    ]);
  });

  // The same prompt returns fenced and bare output on different days, which is
  // not a difference any caller should have to care about.
  it.each([
    ['a json fence', '```json\n{"a":1}\n```'],
    ['a bare fence', '```\n{"a":1}\n```'],
    ['a fence with padding', '  ```json  \n  {"a":1}  \n  ```  '],
    ['a fence on one line', '```json {"a":1} ```'],
  ])('reads an object wrapped in %s', (_label, raw) => {
    expect(parseJsonResponse(raw, SOURCE)).toEqual({ a: 1 });
  });

  it('reads a payload with prose in front of it', () => {
    expect(
      parseJsonResponse('Sure! Here are the hashtags:\n["#a","#b"]', SOURCE),
    ).toEqual(['#a', '#b']);
  });

  it('reads a payload with prose on both sides', () => {
    expect(
      parseJsonResponse('Here you go:\n{"a":1}\nLet me know!', SOURCE),
    ).toEqual({ a: 1 });
  });

  it('keeps a brace that belongs to the payload', () => {
    expect(
      parseJsonResponse('Result: {"outer":{"inner":2}} done', SOURCE),
    ).toEqual({ outer: { inner: 2 } });
  });

  describe('when nothing can be read', () => {
    it('names the call that produced the response', () => {
      expect(() => parseJsonResponse('not json at all', SOURCE)).toThrow(
        /Invalid JSON from topic generation/,
      );
    });

    // The message lands in draft.errorMessage, which is where someone looks
    // first - so it carries the response rather than only the verdict.
    it('carries a one-line preview of the response', () => {
      expect(() =>
        parseJsonResponse('I cannot\ndo that\nright now', SOURCE),
      ).toThrow(/I cannot do that right now/);
    });

    it('truncates a long response', () => {
      const raw = 'x'.repeat(500);
      try {
        parseJsonResponse(raw, SOURCE);
        fail('expected a throw');
      } catch (error) {
        const message = (error as Error).message;
        expect(message).toContain('x'.repeat(200) + '...');
        expect(message).not.toContain('x'.repeat(201));
      }
    });

    it('says so when the model returned nothing', () => {
      expect(() => parseJsonResponse('   ', SOURCE)).toThrow(
        /\(empty response\)/,
      );
    });

    // Truncated in the error, whole in the log: the drift that broke the parse
    // is usually further in than 200 characters.
    it('hands the untruncated response to the logger', () => {
      const logger = { error: jest.fn() } as unknown as Logger;

      expect(() => parseJsonResponse('nope', SOURCE, logger)).toThrow();

      expect(logger.error).toHaveBeenCalledWith(
        'Failed to parse the topic generation response. Raw response:',
      );
      expect(logger.error).toHaveBeenCalledWith('nope');
    });

    it('does not need a logger', () => {
      expect(() => parseJsonResponse('nope', SOURCE)).toThrow();
    });
  });
});

describe('parseJsonArrayResponse', () => {
  it('returns the array', () => {
    expect(parseJsonArrayResponse('[{"id":"a"}]', SOURCE)).toEqual([
      { id: 'a' },
    ]);
  });

  it('reads an array out of a fence', () => {
    expect(parseJsonArrayResponse('```json\n["#a"]\n```', SOURCE)).toEqual([
      '#a',
    ]);
  });

  // The hashtag prompt asks for a bare array and occasionally gets it wrapped.
  // Failing there would throw away a call that did return the list.
  it('takes the list out of an object that wraps it', () => {
    expect(parseJsonArrayResponse('{"hashtags":["#a","#b"]}', SOURCE)).toEqual([
      '#a',
      '#b',
    ]);
  });

  // Valid JSON of the wrong shape used to travel on and fail on a .map several
  // frames away, pointing at the caller instead of the response.
  it('refuses an object with no list in it', () => {
    expect(() => parseJsonArrayResponse('{"a":1}', SOURCE)).toThrow(
      /Expected an array from topic generation/,
    );
  });

  it('refuses a bare string', () => {
    expect(() => parseJsonArrayResponse('"just a string"', SOURCE)).toThrow(
      /Expected an array/,
    );
  });
});
