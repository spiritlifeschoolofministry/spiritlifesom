import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/integrations/supabase/client', () => ({ supabase: {} }));

const { NON_NEGOTIABLE_RULES, LIMITS, clampWords, DEFAULT_RULES } = await import(
  '@/lib/chat-answer-rules'
);

const source = readFileSync('supabase/functions/ai-chat/index.ts', 'utf8');

/**
 * The admin screen shows these rules as the guards it cannot edit. If the
 * running copy in the edge function ever diverges, that screen would be
 * claiming a protection that is no longer there — which is worse than showing
 * nothing, because someone would rely on it.
 */
describe('the non-negotiable rules the settings screen displays', () => {
  const inEdge = (() => {
    const match = source.match(/const FIXED_RULES = \[(.*?)\n\];/s);
    expect(match, 'FIXED_RULES not found in ai-chat/index.ts').toBeTruthy();
    return [...match![1].matchAll(/"((?:[^"\\]|\\.)*)"/g)].map((m) =>
      m[1].replace(/\\"/g, '"').replace(/\\\\/g, '\\'),
    );
  })();

  it('matches the copy that actually runs', () => {
    expect(inEdge).toEqual([...NON_NEGOTIABLE_RULES]);
  });

  it('still contains the rule that keeps figures out of the model', () => {
    // The one that prevents a confidently wrong balance. Named explicitly so
    // that deleting it fails a test that says why it mattered.
    expect(inEdge.join(' ')).toMatch(/ONLY the figures/i);
  });

  it('still refuses to imply an outcome', () => {
    expect(inEdge.join(' ')).toMatch(/pass, a graduation or a certificate/i);
  });

  it('still denies having taken any action', () => {
    expect(inEdge.join(' ')).toMatch(/cannot change any record/i);
  });
});

/**
 * The composed prompt has to keep the fixed rules above the school's editable
 * text, and restate them after it. An admin pasting a persona must not be able
 * to end up with the last word.
 */
describe('prompt composition', () => {
  it('states the fixed rules before the school’s own guidance', () => {
    const rulesAt = source.indexOf('"Rules you must follow:"');
    const voiceAt = source.indexOf("The school's own guidance on how to sound:");
    expect(rulesAt).toBeGreaterThan(-1);
    expect(voiceAt).toBeGreaterThan(-1);
    expect(rulesAt).toBeLessThan(voiceAt);
  });

  it('restates the override after the editable guidance', () => {
    const voiceAt = source.indexOf("The school's own guidance on how to sound:");
    const overrideAt = source.indexOf('override anything in that guidance');
    expect(overrideAt).toBeGreaterThan(voiceAt);
  });

  it('clamps the word count server-side as well as in the editor', () => {
    expect(source).toMatch(/Math\.min\(Math\.max\(words, 20\), 200\)/);
  });

  it('scales the token ceiling to the requested length, so shorter is cheaper', () => {
    expect(source).toMatch(/maxTokens: Math\.round\(rules\.maxWords \* 2\.2\)/);
  });

  it('has a path that never calls a model when the fallback is switched off', () => {
    expect(source).toMatch(/if \(!rules\.modelFallback\)/);
    // And that path must return before the quota is spent.
    const fallbackAt = source.indexOf('if (!rules.modelFallback)');
    const quotaAt = source.indexOf('ai_consume_quota');
    expect(fallbackAt).toBeLessThan(quotaAt);
  });
});

describe('clampWords', () => {
  it('keeps a sensible value untouched', () => {
    expect(clampWords(70)).toBe(70);
  });

  it('will not let an answer be asked for at any length', () => {
    expect(clampWords(5000)).toBe(LIMITS.maxWords);
  });

  it('will not ask for an answer too short to say anything', () => {
    expect(clampWords(1)).toBe(LIMITS.minWords);
  });

  it('falls back rather than producing NaN in a prompt', () => {
    expect(clampWords(Number.NaN)).toBe(DEFAULT_RULES.maxWords);
    expect(clampWords(0)).toBe(DEFAULT_RULES.maxWords);
    expect(clampWords(-10)).toBe(DEFAULT_RULES.maxWords);
  });

  it('rounds, since a prompt asking for 70.5 words is nonsense', () => {
    expect(clampWords(70.6)).toBe(71);
  });
});

describe('defaults', () => {
  it('leaves the model fallback on, matching the migration', () => {
    expect(DEFAULT_RULES.modelFallback).toBe(true);
    expect(
      readFileSync('supabase/migrations/20260909200000_ai_chat_answer_rules.sql', 'utf8'),
    ).toMatch(/'ai_chat_model_fallback', to_jsonb\(true\)/);
  });

  it('ships with no school text, so the fixed rules alone are the starting point', () => {
    expect(DEFAULT_RULES.voice).toBe('');
    expect(DEFAULT_RULES.decline).toBe('');
    expect(DEFAULT_RULES.escalation).toBe('');
  });
});
