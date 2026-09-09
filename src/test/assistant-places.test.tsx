import { describe, expect, it, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import type { AiFeature, AiFlags } from '@/lib/ai-flags';

const flagsMock = vi.fn<() => { data: AiFlags | undefined }>();

// Mocked outright rather than spread over the real module: ai-flags imports the
// Supabase client at load, and this hook only ever reads useAiFlags. The types
// above are type-only imports, so they are erased and need nothing at runtime.
vi.mock('@/lib/ai-flags', () => ({
  useAiFlags: () => flagsMock(),
}));

import { useAssistantContext } from '@/lib/assistant-places';

/** A flags object shaped like the real one, with only the named features on. */
const flagsWith = (enabled: AiFeature[], masterSwitch = true): AiFlags => {
  const features = {
    ai_material_descriptions: false,
    ai_question_drafting: false,
    ai_message_drafting: false,
    ai_essay_marking: false,
    ai_practice_quizzes: false,
    ai_progress_summary: false,
    ai_result_guidance: false,
    ai_study_assistant: false,
  } as Record<AiFeature, boolean>;
  enabled.forEach((feature) => {
    features[feature] = true;
  });
  return {
    enabled: masterSwitch,
    assistantName: 'Barnabas',
    features,
    limits: { admin: 200, student: 20 },
    on: (feature: AiFeature) => masterSwitch && features[feature],
  };
};

describe('useAssistantContext', () => {
  beforeEach(() => flagsMock.mockReset());

  it('is unavailable before the flags have loaded', () => {
    flagsMock.mockReturnValue({ data: undefined });
    const { result } = renderHook(() => useAssistantContext());
    expect(result.current.available).toBe(false);
    expect(result.current.places).toEqual([]);
  });

  it('is unavailable when every student feature is off', () => {
    flagsMock.mockReturnValue({ data: flagsWith([]) });
    expect(renderHook(() => useAssistantContext()).result.current.available).toBe(false);
  });

  it('stays unavailable when the master switch is off, however many features are on', () => {
    flagsMock.mockReturnValue({
      data: flagsWith(
        ['ai_progress_summary', 'ai_study_assistant', 'ai_practice_quizzes', 'ai_result_guidance'],
        false,
      ),
    });
    const { result } = renderHook(() => useAssistantContext());
    expect(result.current.available).toBe(false);
    expect(result.current.studyOn).toBe(false);
  });

  it('never lists a feature the school has switched off', () => {
    flagsMock.mockReturnValue({ data: flagsWith(['ai_progress_summary']) });
    const { result } = renderHook(() => useAssistantContext());
    expect(result.current.places.map((place) => place.feature)).toEqual(['ai_progress_summary']);
    // Nothing on Study is on, so a student must not be sent there.
    expect(result.current.studyOn).toBe(false);
  });

  it('does not count staff-only features as places students can go', () => {
    flagsMock.mockReturnValue({
      data: flagsWith(['ai_essay_marking', 'ai_question_drafting', 'ai_message_drafting']),
    });
    const { result } = renderHook(() => useAssistantContext());
    expect(result.current.available).toBe(false);
  });

  it.each(['ai_study_assistant', 'ai_practice_quizzes'] as AiFeature[])(
    'treats %s as a reason to link to Study',
    (feature) => {
      flagsMock.mockReturnValue({ data: flagsWith([feature]) });
      expect(renderHook(() => useAssistantContext()).result.current.studyOn).toBe(true);
    },
  );

  it('does not send a student to Study for revision guidance, which lives on Assessments', () => {
    flagsMock.mockReturnValue({ data: flagsWith(['ai_result_guidance']) });
    const { result } = renderHook(() => useAssistantContext());
    expect(result.current.available).toBe(true);
    expect(result.current.studyOn).toBe(false);
    expect(result.current.places[0].path).toBe('/student/grades');
  });

  it('carries the school-configured name rather than a hardcoded one', () => {
    flagsMock.mockReturnValue({ data: flagsWith(['ai_progress_summary']) });
    expect(renderHook(() => useAssistantContext()).result.current.name).toBe('Barnabas');
  });

  it('every listed place has somewhere to go and something to say', () => {
    flagsMock.mockReturnValue({
      data: flagsWith([
        'ai_progress_summary',
        'ai_study_assistant',
        'ai_practice_quizzes',
        'ai_result_guidance',
      ]),
    });
    const { result } = renderHook(() => useAssistantContext());
    expect(result.current.places).toHaveLength(4);
    result.current.places.forEach((place) => {
      expect(place.path).toMatch(/^\/student\//);
      expect(place.where.length).toBeGreaterThan(0);
      expect(place.what.length).toBeGreaterThan(0);
    });
  });
});
