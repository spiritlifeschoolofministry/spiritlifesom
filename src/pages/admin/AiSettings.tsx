import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import {
  type AiProvider,
  type CompatibleProvider,
  deleteAiProvider,
  listAiModels,
  listAiProviders,
  fetchAiModelUsage,
  type AiModelUsage,
  providerLabel,
  reorderAiProviders,
  saveAiProvider,
  testAiProvider,
} from '@/lib/ai-providers';
import {
  AI_FEATURES,
  DEFAULT_ASSISTANT_NAME,
  DEFAULT_PRACTICE_ROUND_SIZE,
  fetchAiFlags,
  PRACTICE_ROUND_MAX,
  PRACTICE_ROUND_MIN,
  type AiFeature,
} from '@/lib/ai-flags';
import {
  DEFAULT_RULES,
  LIMITS as RULE_LIMITS,
  NON_NEGOTIABLE_RULES,
  clampWords,
  fetchChatAnswerRules,
  saveChatAnswerRules,
  type ChatAnswerRules,
} from '@/lib/chat-answer-rules';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  CheckCircle2,
  ExternalLink,
  KeyRound,
  Loader2,
  Lock,
  Plus,
  RefreshCw,
  Sparkles,
  Trash2,
} from 'lucide-react';
import { toast } from 'sonner';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { PageSkeleton } from '@/components/portal/PageSkeleton';
import { useQueryClient } from '@tanstack/react-query';

/**
 * Where the model providers and the feature switches are managed.
 *
 * Two quite different things share this screen because they are read together:
 * a feature switched on with no working provider behind it is the failure mode
 * worth making visible, and the chain's own "last error" column is what says
 * which provider stopped answering.
 */

/** What each switch does, in words an admin can decide from. */
const FEATURE_COPY: Record<AiFeature, { title: string; blurb: string; audience: string }> = {
  ai_material_descriptions: {
    title: 'Material descriptions and tags',
    blurb:
      'Writes the one-line description for a course material as it is uploaded, and suggests tags from those already in use. A plain template writes one anyway if no model answers, so nothing saves blank.',
    audience: 'Staff',
  },
  ai_question_drafting: {
    title: 'Draft exam questions from a material',
    blurb:
      'Reads the opening of a course material and drafts questions into the bank as drafts. Nothing reaches a student until someone approves it.',
    audience: 'Staff',
  },
  ai_message_drafting: {
    title: 'Draft announcements and emails',
    blurb:
      'Writes a first draft into the editor from the real figures behind it. It never sends anything — that stays a separate, deliberate click.',
    audience: 'Staff',
  },
  ai_essay_marking: {
    title: 'Suggest marks for essay answers',
    blurb:
      'Proposes a mark and a reason for essay and short-answer questions against the rubric. Suggestions sit beside the real mark until someone accepts them one at a time.',
    audience: 'Staff',
  },
  ai_practice_quizzes: {
    title: 'Practice questions',
    blurb:
      'Lets a student test themselves on their course’s approved practice questions, with the explanation shown after each answer. A separate pool from the exam bank, and never counted towards a grade.',
    audience: 'Students',
  },
  ai_proctor_review: {
    title: 'Exam review notes',
    blurb:
      'After an exam, ranks the attempts worth looking at by hand — tab switches, unusual timing, a shared device, identical answers. The ranking is arithmetic, not judgement; the AI only puts it in a sentence, and never says a student cheated. Nothing is flagged or recorded: a person opens the footage and decides.',
    audience: 'Staff',
  },
  ai_progress_summary: {
    title: 'Progress summary',
    blurb:
      'A plain-English read of a student’s grades, attendance and outstanding work. Written once a day per student, so it costs one call however often they look.',
    audience: 'Students',
  },
  ai_result_guidance: {
    title: 'Revision guidance after results',
    blurb:
      'Turns the questions a student got wrong into topics to revise, once results are released. Written once per attempt.',
    audience: 'Students',
  },
  ai_study_assistant: {
    title: 'Study assistant',
    blurb:
      'Answers a student’s questions from their own cohort’s materials, citing the material, and refusing when it isn’t covered there. Unavailable to anyone with an exam in progress.',
    audience: 'Students',
  },
  ai_chat: {
    title: 'Ask-anything chatbox',
    blurb:
      'A chatbox on both dashboards. Almost every question is answered straight from the records — where a page is, what a student owes, who has not paid — which reaches no model and costs nothing. Only an unrecognised question spends a call, against its own daily limit below. It can read, never act.',
    audience: 'Everyone',
  },
};

const RELATIVE = new Intl.RelativeTimeFormat('en-GB', { numeric: 'auto' });

const whenLastUsed = (iso: string | null): string => {
  if (!iso) return 'never used';
  const seconds = (Date.now() - new Date(iso).getTime()) / 1000;
  if (seconds < 90) return 'just now';
  if (seconds < 3600) return RELATIVE.format(-Math.round(seconds / 60), 'minute');
  if (seconds < 86_400) return RELATIVE.format(-Math.round(seconds / 3600), 'hour');
  return RELATIVE.format(-Math.round(seconds / 86_400), 'day');
};

export default function AiSettings() {
  const queryClient = useQueryClient();
  const [loading, setLoading] = useState(true);
  const [providers, setProviders] = useState<AiProvider[]>([]);
  const [supported, setSupported] = useState<string[]>([]);
  const [compatible, setCompatible] = useState<Record<string, CompatibleProvider>>({});

  const [masterOn, setMasterOn] = useState(false);
  const [flags, setFlags] = useState<Record<string, boolean>>({});
  const [limits, setLimits] = useState({ admin: 200, student: 20, chat: 40 });
  const [roundSize, setRoundSize] = useState(DEFAULT_PRACTICE_ROUND_SIZE);
  const [modelUsage, setModelUsage] = useState<AiModelUsage[]>([]);
  const [answerRules, setAnswerRules] = useState<ChatAnswerRules>(DEFAULT_RULES);
  const [assistantName, setAssistantName] = useState(DEFAULT_ASSISTANT_NAME);

  const [busyRow, setBusyRow] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<Record<string, string>>({});
  const [models, setModels] = useState<Record<string, string[]>>({});
  const [keyDraft, setKeyDraft] = useState<Record<string, string>>({});
  const [confirmDelete, setConfirmDelete] = useState<AiProvider | null>(null);
  const [addingProvider, setAddingProvider] = useState('');

  const load = useCallback(async () => {
    try {
      const [chain, ai, rules] = await Promise.all([
        listAiProviders(),
        fetchAiFlags(),
        fetchChatAnswerRules(),
      ]);
      setProviders(chain.providers);
      setSupported(chain.supported);
      setCompatible(chain.compatible);
      setMasterOn(ai.enabled);
      setFlags(ai.features);
      setLimits(ai.limits);
      setRoundSize(ai.practiceRoundSize);
      // Best-effort: the console is still usable if the counts do not load,
      // and a provider list held back by a usage query would be the wrong
      // trade on the screen an admin opens when the AI has stopped working.
      fetchAiModelUsage(30).then(setModelUsage).catch(() => setModelUsage([]));
      setAssistantName(ai.assistantName);
      setAnswerRules(rules);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not load AI settings');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  /**
   * Writes one setting.
   *
   * `value` is a jsonb column, so a real boolean or number is stored rather
   * than a stringified one — the readers cope with either, but there is no
   * reason to add another shape to a table that already holds three.
   *
   * The cached flags are invalidated because both portals read them.
   */
  const writeSetting = async (key: string, value: boolean | number | string) => {
    const { error } = await supabase
      .from('system_settings')
      .upsert({ key, value, updated_at: new Date().toISOString() }, { onConflict: 'key' });
    if (error) {
      toast.error(error.message);
      return false;
    }
    queryClient.invalidateQueries({ queryKey: ['ai-flags'] });
    return true;
  };

  const toggleMaster = async (on: boolean) => {
    setMasterOn(on);
    if (!(await writeSetting('ai_enabled', on))) setMasterOn(!on);
  };

  const toggleFeature = async (feature: AiFeature, on: boolean) => {
    setFlags((prev) => ({ ...prev, [feature]: on }));
    if (!(await writeSetting(feature, on))) {
      setFlags((prev) => ({ ...prev, [feature]: !on }));
    }
  };

  const saveRoundSize = async (value: number) => {
    const next = Math.min(PRACTICE_ROUND_MAX, Math.max(PRACTICE_ROUND_MIN, Math.floor(value)));
    if (!Number.isFinite(next)) return;
    setRoundSize(next);
    if (await writeSetting('ai_practice_round_size', next)) {
      toast.success(`Practice rounds now ask ${next} questions`);
    }
  };

  const saveLimit = async (which: 'admin' | 'student' | 'chat', value: number) => {
    if (!Number.isFinite(value) || value < 1) return;
    setLimits((prev) => ({ ...prev, [which]: value }));
    if (await writeSetting(`ai_daily_limit_${which}`, value)) {
      toast.success('Daily limit saved');
    }
  };

  /**
   * Saves one answer rule.
   *
   * Optimistic, and reverted on failure, so the box never shows a value the
   * database does not hold — these are instructions to a model, and a screen
   * disagreeing with what is actually being sent would be the worst kind of
   * wrong here.
   */
  const saveRule = async <K extends keyof ChatAnswerRules>(
    key: K,
    value: ChatAnswerRules[K],
  ) => {
    const previous = answerRules[key];
    setAnswerRules((prev) => ({ ...prev, [key]: value }));
    try {
      // Sent as a one-field patch, so two admins editing different boxes
      // cannot overwrite each other. The stored result comes back and is
      // adopted, so the screen shows what the database actually holds rather
      // than what was typed — these are instructions to a model, and a box
      // disagreeing with what is being sent is the worst kind of wrong here.
      setAnswerRules(await saveChatAnswerRules({ [key]: value } as Partial<ChatAnswerRules>));
      toast.success('Answer rules saved');
    } catch (err) {
      setAnswerRules((prev) => ({ ...prev, [key]: previous }));
      toast.error(err instanceof Error ? err.message : 'Could not save');
    }
  };

  const patchRow = async (id: string | null, patch: Parameters<typeof saveAiProvider>[1]) => {
    setBusyRow(id ?? 'new');
    try {
      setProviders(await saveAiProvider(id, patch));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not save');
    } finally {
      setBusyRow(null);
    }
  };

  const addRow = async () => {
    if (!addingProvider) return;
    await patchRow(null, { provider: addingProvider });
    setAddingProvider('');
    toast.success('Provider added — paste its API key, then pick a model.');
  };

  const move = async (index: number, direction: -1 | 1) => {
    const next = [...providers];
    const target = index + direction;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    setProviders(next);
    try {
      setProviders(await reorderAiProviders(next.map((p) => p.id)));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not reorder');
      load();
    }
  };

  const loadModels = async (row: AiProvider) => {
    setBusyRow(row.id);
    try {
      const result = await listAiModels({ id: row.id });
      if (!result.ok) {
        toast.error(result.error ?? 'Could not read the model list');
        return;
      }
      setModels((prev) => ({ ...prev, [row.id]: result.models ?? [] }));
      if (!result.models?.length) toast.info('That key can call no models right now.');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not read the model list');
    } finally {
      setBusyRow(null);
    }
  };

  const runTest = async (row: AiProvider) => {
    setBusyRow(row.id);
    setTestResult((prev) => ({ ...prev, [row.id]: '' }));
    try {
      const result = await testAiProvider(row.id);
      if (result.providers) setProviders(result.providers);
      setTestResult((prev) => ({
        ...prev,
        [row.id]: result.ok ? `✓ ${result.sample}` : `✗ ${result.error}`,
      }));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'The test failed');
    } finally {
      setBusyRow(null);
    }
  };

  const removeRow = async (row: AiProvider) => {
    setConfirmDelete(null);
    setBusyRow(row.id);
    try {
      setProviders(await deleteAiProvider(row.id));
      toast.success('Provider removed');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not remove it');
    } finally {
      setBusyRow(null);
    }
  };

  /**
   * Usage rolled up per model, busiest first.
   *
   * Rolled up rather than shown day by day because the decision this informs is
   * "is this model pulling its weight, and is it about to run out" — a
   * per-day chart of nine models answers that worse than four numbers each.
   */
  const usageByModel = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    const rows = new Map<
      string,
      { provider: string; model: string; calls: number; failures: number; today: number }
    >();
    for (const row of modelUsage) {
      const key = `${row.provider}/${row.model}`;
      const entry = rows.get(key) ??
        { provider: row.provider, model: row.model, calls: 0, failures: 0, today: 0 };
      entry.calls += row.calls;
      entry.failures += row.failures;
      if (row.day === today) entry.today += row.calls;
      rows.set(key, entry);
    }
    return [...rows.values()].sort((a, b) => b.calls - a.calls);
  }, [modelUsage]);

  /** A provider that will actually be tried: enabled, keyed, and with a model. */
  const workingCount = useMemo(
    () => providers.filter((p) => p.enabled && p.has_key && p.model).length,
    [providers],
  );

  const featuresOn = useMemo(
    () => AI_FEATURES.filter((f) => flags[f]).length,
    [flags],
  );

  if (loading) return <PageSkeleton />;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-primary" /> AI
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          What {assistantName} runs on: the models the school can call, in the order they are
          tried, and which features use them.
        </p>
      </div>

      {/* The failure worth making loud: switches on, nothing behind them. */}
      {masterOn && workingCount === 0 && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>AI is on, but no provider can answer</AlertTitle>
          <AlertDescription>
            {providers.length === 0
              ? 'Add a provider below and paste its API key. Groq and Google Gemini both have free tiers that suit a school this size.'
              : 'Every provider is disabled, missing a key, or missing a model. Every AI feature will fall back or fail until one works.'}
          </AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">What it is called</CardTitle>
          <CardDescription>
            The name students and staff see on every AI button and note. They are not shown which
            model answered, and should not be — nine sit behind this name, and which one replies
            depends on whose free allowance is intact at the time.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          <Input
            className="max-w-xs"
            defaultValue={assistantName}
            onBlur={async (e) => {
              const next = e.target.value.trim();
              if (!next || next === assistantName) return;
              setAssistantName(next);
              if (await writeSetting('ai_assistant_name', next)) {
                toast.success(`Now called ${next} everywhere.`);
              }
            }}
          />
          <p className="text-xs text-muted-foreground">
            Worth avoiding names for the Holy Spirit — Paraclete, Ruach, Comforter, Helper. A study
            tool carrying that name invites students to read authority into something that drafts
            work for staff to approve.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-4">
          <div>
            <CardTitle className="text-base">Master switch</CardTitle>
            <CardDescription>
              Off disables all {AI_FEATURES.length} features at once, whatever their own switches
              say. This is the one to reach for if a model ever starts writing something it
              shouldn’t.
            </CardDescription>
          </div>
          <Switch
            checked={masterOn}
            onCheckedChange={toggleMaster}
            aria-label="Enable AI features"
          />
        </CardHeader>
        {masterOn && (
          <CardContent className="text-sm text-muted-foreground">
            {featuresOn} of {AI_FEATURES.length} features on, {workingCount}{' '}
            provider{workingCount === 1 ? '' : 's'} able to answer.
          </CardContent>
        )}
      </Card>

      {/* ------------------------------------------------------------------ */}
      {/* Providers                                                           */}
      {/* ------------------------------------------------------------------ */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <KeyRound className="h-4 w-4" /> Providers
          </CardTitle>
          <CardDescription>
            Tried top to bottom until one answers, so put the fastest free tier first. Keys are
            write-only: once saved, this screen can show you enough to recognise a key but never
            enough to use it.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {providers.map((row, index) => {
            const busy = busyRow === row.id;
            const listed = models[row.id];
            const result = testResult[row.id];
            const gateway = compatible[row.provider];
            const capped = row.daily_limit !== null && row.calls_today >= row.daily_limit;

            return (
              <div key={row.id} className="rounded-lg border p-4 space-y-3">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="outline" className="font-mono">{index + 1}</Badge>
                  <span className="font-medium">{providerLabel(row.provider, compatible)}</span>
                  {!row.enabled && <Badge variant="secondary">disabled</Badge>}
                  {!row.has_key && <Badge variant="destructive">no key</Badge>}
                  {row.has_key && !row.model && <Badge variant="destructive">no model</Badge>}
                  {/* Said on the rail rather than only in the field below,
                      because the question this screen is opened with is "which
                      model has run out", and that must be answerable at a
                      glance down the list. */}
                  {capped && <Badge variant="destructive">limit reached</Badge>}
                  <span className="text-xs text-muted-foreground ml-auto">
                    {row.calls_today > 0 || row.daily_limit !== null
                      ? `${row.calls_today}${row.daily_limit !== null ? ` / ${row.daily_limit}` : ''} today · `
                      : ''}
                    {whenLastUsed(row.last_used_at)}
                  </span>
                  <div className="flex items-center gap-1">
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7"
                      disabled={index === 0}
                      onClick={() => move(index, -1)}
                      aria-label="Move up"
                    >
                      <ArrowUp className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7"
                      disabled={index === providers.length - 1}
                      onClick={() => move(index, 1)}
                      aria-label="Move down"
                    >
                      <ArrowDown className="h-3.5 w-3.5" />
                    </Button>
                    <Switch
                      checked={row.enabled}
                      onCheckedChange={(on) => patchRow(row.id, { enabled: on })}
                      aria-label="Enable this provider"
                    />
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7 text-destructive"
                      onClick={() => setConfirmDelete(row)}
                      aria-label="Remove this provider"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label className="text-xs">API key</Label>
                    <div className="flex gap-2">
                      <Input
                        type="password"
                        autoComplete="off"
                        placeholder={row.key_preview ?? 'Paste the key'}
                        value={keyDraft[row.id] ?? ''}
                        onChange={(e) =>
                          setKeyDraft((prev) => ({ ...prev, [row.id]: e.target.value }))}
                      />
                      <Button
                        variant="secondary"
                        disabled={busy || !(keyDraft[row.id] ?? '').trim()}
                        onClick={async () => {
                          await patchRow(row.id, { api_key: keyDraft[row.id] });
                          setKeyDraft((prev) => ({ ...prev, [row.id]: '' }));
                          toast.success('Key saved');
                        }}
                      >
                        Save
                      </Button>
                    </div>
                    {row.key_preview && (
                      <p className="text-xs text-muted-foreground font-mono">{row.key_preview}</p>
                    )}
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-xs">Model</Label>
                    <div className="flex gap-2">
                      {listed?.length
                        ? (
                          <Select
                            value={row.model || undefined}
                            onValueChange={(model) => patchRow(row.id, { model })}
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="Pick a model" />
                            </SelectTrigger>
                            <SelectContent>
                              {listed.map((m) => (
                                <SelectItem key={m} value={m}>{m}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        )
                        : (
                          <Input
                            placeholder="e.g. llama-3.3-70b-versatile"
                            defaultValue={row.model}
                            onBlur={(e) => {
                              const model = e.target.value.trim();
                              if (model !== row.model) patchRow(row.id, { model });
                            }}
                          />
                        )}
                      <Button
                        variant="secondary"
                        disabled={busy || !row.has_key}
                        onClick={() => loadModels(row)}
                        title="Read the list of models this key can call"
                      >
                        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                      </Button>
                    </div>
                    {gateway?.modelsUrl && (
                      <a
                        href={gateway.modelsUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="text-xs text-muted-foreground inline-flex items-center gap-1 hover:underline"
                      >
                        {gateway.label} model list <ExternalLink className="h-3 w-3" />
                      </a>
                    )}
                  </div>
                </div>

                {/* Only the escape-hatch provider has no default address, so it
                    is the only one that must be told where to call. */}
                {(row.provider === 'openai_compatible' || row.base_url) && (
                  <div className="space-y-1.5">
                    <Label className="text-xs">API address</Label>
                    <Input
                      placeholder="https://…/v1"
                      defaultValue={row.base_url ?? ''}
                      onBlur={(e) => {
                        const base_url = e.target.value.trim();
                        if (base_url !== (row.base_url ?? '')) patchRow(row.id, { base_url });
                      }}
                    />
                    <p className="text-xs text-muted-foreground">
                      Calling {row.effective_base_url ?? 'nowhere — this needs an address'}
                    </p>
                  </div>
                )}

                <div className="space-y-1.5 sm:max-w-64">
                  <Label className="text-xs">Daily limit for this model</Label>
                  <Input
                    type="number"
                    min={0}
                    placeholder="No limit"
                    defaultValue={row.daily_limit ?? ''}
                    onBlur={(e) => {
                      const raw = e.target.value.trim();
                      const value = raw === '' ? null : Math.floor(Number(raw));
                      const next = value !== null && value > 0 ? value : null;
                      if (next !== row.daily_limit) patchRow(row.id, { daily_limit: next });
                    }}
                  />
                  <p className="text-xs text-muted-foreground">
                    {row.daily_limit === null
                      ? 'Called as often as the chain reaches it. Set a number a little under this tier\u2019s free ceiling and the chain will move on to the next model instead of waiting for a refusal.'
                      : `${row.calls_today} of ${row.daily_limit} used today. Resets at midnight UTC.`}
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <Button size="sm" variant="outline" disabled={busy} onClick={() => runTest(row)}>
                    {busy
                      ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                      : <Sparkles className="mr-1.5 h-3.5 w-3.5" />}
                    Test
                  </Button>
                  {result && (
                    <p
                      className={`text-xs ${
                        result.startsWith('✓') ? 'text-emerald-600' : 'text-destructive'
                      }`}
                    >
                      {result}
                    </p>
                  )}
                </div>

                {row.last_error && !result && (
                  <p className="text-xs text-destructive">Last failure — {row.last_error}</p>
                )}
              </div>
            );
          })}

          <div className="flex flex-wrap items-end gap-2 pt-2 border-t">
            <div className="space-y-1.5 min-w-56">
              <Label className="text-xs">Add a provider</Label>
              <Select value={addingProvider} onValueChange={setAddingProvider}>
                <SelectTrigger>
                  <SelectValue placeholder="Pick one" />
                </SelectTrigger>
                <SelectContent>
                  {supported.map((name) => (
                    <SelectItem key={name} value={name}>
                      {providerLabel(name, compatible)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button onClick={addRow} disabled={!addingProvider || busyRow === 'new'}>
              {busyRow === 'new'
                ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                : <Plus className="mr-1.5 h-4 w-4" />}
              Add
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* ------------------------------------------------------------------ */}
      {/* Features                                                            */}
      {/* ------------------------------------------------------------------ */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Features</CardTitle>
          <CardDescription>
            Each can be switched off on its own. The student-facing ones start off, so {assistantName}
            can be watched on staff traffic before a whole cohort reaches it.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-1 divide-y">
          {AI_FEATURES.map((feature) => {
            const copy = FEATURE_COPY[feature];
            return (
              <div key={feature} className="flex items-start justify-between gap-4 py-3">
                <div className="space-y-0.5">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">{copy.title}</span>
                    <Badge variant={copy.audience === 'Students' ? 'default' : 'secondary'}>
                      {copy.audience}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground max-w-2xl">{copy.blurb}</p>
                </div>
                <Switch
                  checked={!!flags[feature]}
                  disabled={!masterOn}
                  onCheckedChange={(on) => toggleFeature(feature, on)}
                  aria-label={copy.title}
                />
              </div>
            );
          })}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Daily limits</CardTitle>
          <CardDescription>
            Per person, per feature, per day. These are what keep a free tier viable: the school's
            whole allowance is shared, so one student in a long study session must not be able to
            spend it before the rest of the cohort wakes up.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          {(['admin', 'student', 'chat'] as const).map((which) => (
            <div key={which} className="space-y-1.5">
              <Label className="text-xs capitalize">
                {which === 'admin' ? 'Staff' : which === 'chat' ? 'Chatbox' : 'Students'}
              </Label>
              <Input
                type="number"
                min={1}
                defaultValue={limits[which]}
                onBlur={(e) => {
                  const value = Number(e.target.value);
                  if (value !== limits[which]) saveLimit(which, value);
                }}
              />
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Only shown when practice exists; a number governing a switched-off
          feature is just something to wonder about. */}
      {flags.ai_practice_quizzes && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Practice rounds</CardTitle>
            <CardDescription>
              How many questions a student is asked in one round. They are drawn at random from
              that course’s approved practice questions, so a pool much larger than this number is
              what makes two rounds feel different.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-1.5 sm:max-w-64">
            <Label htmlFor="practice-round-size" className="text-xs">
              Questions per round
            </Label>
            <Input
              id="practice-round-size"
              type="number"
              min={PRACTICE_ROUND_MIN}
              max={PRACTICE_ROUND_MAX}
              defaultValue={roundSize}
              onBlur={(e) => {
                const value = Number(e.target.value);
                if (value !== roundSize) saveRoundSize(value);
              }}
            />
            <p className="text-xs text-muted-foreground">
              Between {PRACTICE_ROUND_MIN} and {PRACTICE_ROUND_MAX}. A course with fewer approved
              questions than this simply serves all of them, so a short pool is a short round
              rather than an error.
            </p>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Which model answered</CardTitle>
          <CardDescription>
            Every attempt the chain made in the last 30 days, counted per model. A refused request
            is counted too, because a vendor's free tier counts it. This is the school's side of
            the ledger — the daily limits above are per person, and say nothing about how much of
            a given free tier is left.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {usageByModel.length === 0
            ? (
              <p className="text-sm text-muted-foreground">
                Nothing counted yet. Counting starts with the next call any AI feature makes.
              </p>
            )
            : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-xs text-muted-foreground">
                      <th className="pb-2 font-medium">Model</th>
                      <th className="pb-2 font-medium text-right">Today</th>
                      <th className="pb-2 font-medium text-right">30 days</th>
                      <th className="pb-2 font-medium text-right">Failed</th>
                    </tr>
                  </thead>
                  <tbody>
                    {usageByModel.map((row) => (
                      <tr key={`${row.provider}/${row.model}`} className="border-b last:border-0">
                        <td className="py-2">
                          <span className="font-mono text-xs">{row.model}</span>
                          <span className="block text-xs text-muted-foreground">
                            {providerLabel(row.provider, compatible)}
                          </span>
                        </td>
                        <td className="py-2 text-right tabular-nums">{row.today}</td>
                        <td className="py-2 text-right tabular-nums">{row.calls}</td>
                        <td
                          className={`py-2 text-right tabular-nums ${
                            row.failures > 0 ? 'text-destructive' : 'text-muted-foreground'
                          }`}
                        >
                          {row.failures}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
        </CardContent>
      </Card>

      {/* Only rendered when the chatbox exists; these settings steer nothing
          else, and a card of instructions for a switched-off feature is just
          something to misread. */}
      {flags.ai_chat && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">How the chatbox answers</CardTitle>
            <CardDescription>
              Most questions never reach a model at all — where a page is, what a student owes, who
              has not paid, all come straight from the records. These settings shape the answer to
              the ones that do.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            {/* The strongest control here, so it goes first. */}
            <div className="flex items-start justify-between gap-4 rounded-lg border p-3">
              <div className="space-y-0.5">
                <Label htmlFor="chat-fallback" className="text-sm">
                  Let it answer questions it does not recognise
                </Label>
                <p className="text-xs text-muted-foreground">
                  Off is the safest setting available on this screen. An unrecognised question is
                  then never sent to a model — {assistantName} answers everything he can from the
                  records and the portal's own pages, and says plainly that the rest is outside what
                  he can help with. Nothing invented, and nothing spent.
                </p>
              </div>
              <Switch
                id="chat-fallback"
                checked={answerRules.modelFallback}
                onCheckedChange={(on) => saveRule('modelFallback', on)}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="chat-voice" className="text-xs">
                How {assistantName} should sound, and anything school-specific
              </Label>
              <Textarea
                id="chat-voice"
                rows={4}
                maxLength={RULE_LIMITS.voice}
                placeholder={`e.g. Speak plainly and pastorally. Refer to lecturers as "your lecturer". If someone sounds distressed, encourage them to speak to the school office rather than trying to help further.`}
                defaultValue={answerRules.voice}
                onBlur={(e) => {
                  const next = e.target.value.trim();
                  if (next !== answerRules.voice) saveRule('voice', next);
                }}
              />
              <p className="text-xs text-muted-foreground">
                Guidance on voice and school policy. It sits underneath the rules below, which it
                cannot override. Leave it empty and those rules alone are already a complete
                instruction.
              </p>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="chat-words" className="text-xs">
                  Longest answer, in words
                </Label>
                <Input
                  id="chat-words"
                  type="number"
                  min={RULE_LIMITS.minWords}
                  max={RULE_LIMITS.maxWords}
                  defaultValue={answerRules.maxWords}
                  onBlur={(e) => {
                    const next = clampWords(Number(e.target.value));
                    e.target.value = String(next);
                    if (next !== answerRules.maxWords) {
                      saveRule('maxWords', next);
                    }
                  }}
                />
                <p className="text-xs text-muted-foreground">
                  Between {RULE_LIMITS.minWords} and {RULE_LIMITS.maxWords}. This also lowers the
                  ceiling on the call itself, so a shorter answer is genuinely cheaper rather than
                  merely requested.
                </p>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="chat-escalation" className="text-xs">
                  Where to send someone he cannot help
                </Label>
                <Input
                  id="chat-escalation"
                  maxLength={RULE_LIMITS.escalation}
                  placeholder="e.g. the school office on 0800 000 0000"
                  defaultValue={answerRules.escalation}
                  onBlur={(e) => {
                    const next = e.target.value.trim();
                    if (next !== answerRules.escalation) {
                      saveRule('escalation', next);
                    }
                  }}
                />
                <p className="text-xs text-muted-foreground">
                  A named office beats “contact the school”, and only you know what to put here.
                </p>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="chat-decline" className="text-xs">
                Subjects to decline
              </Label>
              <Textarea
                id="chat-decline"
                rows={2}
                maxLength={RULE_LIMITS.decline}
                placeholder="e.g. doctrinal rulings, disciplinary matters, anything about another student"
                defaultValue={answerRules.decline}
                onBlur={(e) => {
                  const next = e.target.value.trim();
                  if (next !== answerRules.decline) saveRule('decline', next);
                }}
              />
            </div>

            {/* Shown so it is clear what is being relied on — and shown
                read-only, because these are the lines that removing would
                quietly break. */}
            <div className="rounded-lg border border-dashed bg-muted/30 p-3">
              <p className="flex items-center gap-1.5 text-xs font-medium text-foreground">
                <Lock className="h-3 w-3" /> Always applied, and not editable
              </p>
              <ul className="mt-2 space-y-1.5">
                {NON_NEGOTIABLE_RULES.map((rule) => (
                  <li key={rule} className="text-xs leading-relaxed text-muted-foreground">
                    • {rule}
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-xs text-muted-foreground">
                These are in the code rather than on this screen on purpose. The first is the only
                thing standing between a student and a confidently wrong balance, and an editable
                prompt is also a way to delete it by accident. They are restated after your guidance
                above so nothing added there can read as replacing them.
              </p>
            </div>

            <p className="text-xs text-muted-foreground">
              What he can do is bounded by more than wording: every read goes through the asker's
              own permissions, every figure comes from the database rather than from the model, and
              the chatbox has no way to change any record — it can tell someone where to do
              something, never do it for them. Exam marks are not read at all, so “did I pass?”
              cannot be answered before you release results.
            </p>
          </CardContent>
        </Card>
      )}

      <Alert>
        <CheckCircle2 className="h-4 w-4" />
        <AlertTitle>Where the keys live</AlertTitle>
        <AlertDescription className="text-xs">
          Provider keys are held in a table no browser session can read — not even yours — and are
          reachable only by the server-side function this screen calls. That is why a key can be
          replaced here but never read back. The school's other settings live in a table that is
          readable without signing in, which is exactly why keys are kept out of it.
        </AlertDescription>
      </Alert>

      <ConfirmDialog
        open={!!confirmDelete}
        onOpenChange={(open) => !open && setConfirmDelete(null)}
        title="Remove this provider?"
        description={
          confirmDelete
            ? `${
              providerLabel(confirmDelete.provider, compatible)
            } and its saved key will be deleted. Any feature relying on it falls through to the next provider in the chain.`
            : ''
        }
        confirmLabel="Remove"
        variant="destructive"
        onConfirm={() => confirmDelete && removeRow(confirmDelete)}
      />
    </div>
  );
}
