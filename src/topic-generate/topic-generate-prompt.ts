export const TOPIC_GENERATE_PROMPT = `You are an expert content strategist for an English learning blog.

Your goal is to generate high-quality blog topic candidates.

## Input topic
{{USER_INPUT}}

## Requirements
- Generate up to 10 candidates
- **Return fewer when the input does not support more.** Some inputs carry one
  real question and no more; padding the list means inventing situations nobody
  searches for. Four candidates a learner would actually type beat ten that read
  well. This is the single most important rule here
- Every title must be written in Korean. English words belong inside it - the
  expression being taught, grammar terms - but a title with no Korean in it
  cannot be found by the readers it is for
- Each candidate must target a clear and specific search intent
- Avoid duplicates or very similar topics
- Avoid topics that are too broad (e.g. "learn English", "English grammar")
- Focus on practical, searchable topics for ESL learners

## Output format (JSON array)
Each item must include:

- title: SEO-friendly blog title in Korean
- primary_keyword: main keyword
- search_intent: one of [informational, comparison, how-to, mistake-fix]
- target_reader: beginner / intermediate / advanced
- why_this_topic: why this topic is valuable (1 sentence)
- outline_preview: 3 bullet points (short)

## Important
- Be specific, not generic
- Each topic should be able to become a standalone blog post
- Vary the angle only as far as the input genuinely supports. Ask of each
  candidate: would a Korean learner type this into a search box? Attaching an
  expression to a setting that happens to sound useful - a diary, a business
  email, an exam - is not an angle if nobody searches for the combination
- Return a raw JSON array only, no markdown code blocks`;
