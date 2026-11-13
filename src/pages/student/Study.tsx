import { useCallback, useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  BookOpen,
  CheckCircle2,
  Info,
  Loader2,
  MessageCircleQuestion,
  XCircle,
} from 'lucide-react';
import { toast } from 'sonner';
import { DarkPanel, Panel, Pill, ScreenHeader } from '@/components/redesign/student-pages/ui';
import { cn } from '@/lib/utils';
import AssistantAttribution from '@/components/student/AssistantAttribution';
import { useAiFlags, useAssistantName } from '@/lib/ai-flags';
import {
  answerPractice,
  askAboutMaterial,
  fetchPracticeOptions,
  listStudyMaterials,
  type PracticeOption,
  type PracticeQuestion,
  type PracticeVerdict,
  startPractice,
  type StudyMaterial,
} from '@/lib/ai-student';

/**
 * Practice questions, and asking about a course material.
 *
 * Both live here because they are the same activity from a student's side —
 * sitting down with the material — and because both need the same thing said
 * once and clearly: nothing on this page counts towards anything. A student
 * who suspects practice might affect their grade will not practise.
 */

export default function Study() {
  const { data: flags } = useAiFlags();
  const name = useAssistantName();

  const [courses, setCourses] = useState<PracticeOption[]>([]);
  const [loading, setLoading] = useState(true);

  // Practice
  /**
   * The courses this round draws from. Empty means every course the student
   * takes — the server resolves that, and refuses any course that is not
   * theirs, so this list is a convenience rather than the boundary.
   */
  const [practiceCourses, setPracticeCourses] = useState<string[]>([]);
  const [practiceCount, setPracticeCount] = useState(10);
  const [sessionId, setSessionId] = useState('');
  const [questions, setQuestions] = useState<PracticeQuestion[]>([]);
  const [index, setIndex] = useState(0);
  const [answer, setAnswer] = useState<unknown>(null);
  const [verdict, setVerdict] = useState<PracticeVerdict | null>(null);
  const [checking, setChecking] = useState(false);
  const [starting, setStarting] = useState(false);
  const [score, setScore] = useState({ right: 0, done: 0 });

  // Study assistant
  const [materials, setMaterials] = useState<StudyMaterial[]>([]);
  const [askMaterial, setAskMaterial] = useState('');
  const [question, setQuestion] = useState('');
  const [asking, setAsking] = useState(false);
  const [answered, setAnswered] = useState<{ answer: string; title: string } | null>(null);

  const practiceOn = !!flags?.on('ai_practice_quizzes');
  const assistantOn = !!flags?.on('ai_study_assistant');

  /**
   * What this student may practise, and how full each course is.
   *
   * Asked of the server rather than worked out here. It is the same question
   * the server answers when a round starts, so the courses offered and the
   * courses that will actually serve questions are one list — a page that
   * offers a course and is then refused it is a page lying to the student.
   */
  const load = useCallback(async () => {
    if (!practiceOn) {
      setCourses([]);
      setLoading(false);
      return;
    }
    try {
      setCourses(await fetchPracticeOptions());
    } catch {
      setCourses([]);
    } finally {
      setLoading(false);
    }
  }, [practiceOn]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!assistantOn) return;
    listStudyMaterials()
      .then(setMaterials)
      .catch(() => setMaterials([]));
  }, [assistantOn]);

  /** Courses that actually have something in them. */
  const stocked = useMemo(() => courses.filter((c) => c.available > 0), [courses]);

  /**
   * The courses this round will draw from: what they ticked, or everything
   * with questions in it when they ticked nothing. Worked out here so the
   * summary can say it back to them in the same terms the server will use.
   */
  const chosen = useMemo(
    () => (practiceCourses.length > 0
      ? stocked.filter((c) => practiceCourses.includes(c.id))
      : stocked),
    [stocked, practiceCourses],
  );

  /** How many questions exist across those courses. */
  const available = useMemo(
    () => chosen.reduce((sum, c) => sum + c.available, 0),
    [chosen],
  );

  const current = questions[index];
  /** True when this round's questions come from more than one course. */
  const mixedRound = new Set(questions.map((q) => q.course_id ?? '')).size > 1;

  const begin = async () => {
    setStarting(true);
    try {
      const session = await startPractice({
        courseIds: practiceCourses,
        count: practiceCount,
      });
      setSessionId(session.session_id);
      setQuestions(session.questions);
      setIndex(0);
      setAnswer(null);
      setVerdict(null);
      setScore({ right: 0, done: 0 });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not start practice');
    } finally {
      setStarting(false);
    }
  };

  const check = async () => {
    if (!current) return;
    setChecking(true);
    try {
      const result = await answerPractice({
        sessionId,
        questionId: current.id,
        answer,
      });
      setVerdict(result);
      setScore((prev) => ({
        right: prev.right + (result.correct ? 1 : 0),
        done: prev.done + 1,
      }));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not check that answer');
    } finally {
      setChecking(false);
    }
  };

  const next = () => {
    setIndex((i) => i + 1);
    setAnswer(null);
    setVerdict(null);
  };

  const ask = async () => {
    if (!askMaterial || question.trim().length < 5) return;
    setAsking(true);
    setAnswered(null);
    try {
      const result = await askAboutMaterial({ materialId: askMaterial, question });
      setAnswered({ answer: result.answer, title: result.source.title });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not answer that');
    } finally {
      setAsking(false);
    }
  };

  /** How the answer for the question on screen is collected. */
  const answerInput = useMemo(() => {
    if (!current) return null;
    const options = Array.isArray(current.options) ? current.options.map(String) : [];

    if (current.question_type === 'true_false') {
      return (
        <div className="flex gap-2">
          {[true, false].map((value) => (
            <Button
              key={String(value)}
              className="h-11 min-w-[88px] rounded-xl"
              variant={answer === value ? 'default' : 'outline'}
              disabled={!!verdict}
              onClick={() => setAnswer(value)}
            >
              {value ? 'True' : 'False'}
            </Button>
          ))}
        </div>
      );
    }

    if (current.question_type === 'mcq_single' && options.length) {
      return (
        <div className="space-y-1.5">
          {options.map((option, i) => (
            <Button
              key={i}
              variant={answer === i ? 'default' : 'outline'}
              className="w-full min-h-11 justify-start rounded-xl text-left h-auto py-2.5 whitespace-normal"
              disabled={!!verdict}
              onClick={() => setAnswer(i)}
            >
              {option}
            </Button>
          ))}
        </div>
      );
    }

    if (current.question_type === 'mcq_multi' && options.length) {
      const picked = Array.isArray(answer) ? (answer as number[]) : [];
      return (
        <div className="space-y-1.5">
          {options.map((option, i) => (
            <Button
              key={i}
              variant={picked.includes(i) ? 'default' : 'outline'}
              className="w-full min-h-11 justify-start rounded-xl text-left h-auto py-2.5 whitespace-normal"
              disabled={!!verdict}
              onClick={() =>
                setAnswer(
                  picked.includes(i) ? picked.filter((p) => p !== i) : [...picked, i],
                )}
            >
              {option}
            </Button>
          ))}
        </div>
      );
    }

    return (
      <Input
        value={typeof answer === 'string' ? answer : ''}
        disabled={!!verdict}
        onChange={(e) => setAnswer(e.target.value)}
        placeholder="Your answer"
        aria-label="Your answer"
        className="h-11 rounded-xl"
      />
    );
  }, [current, answer, verdict]);

  const formatKey = (value: unknown): string => {
    if (value === null || value === undefined) return '—';
    if (typeof value === 'boolean') return value ? 'True' : 'False';
    const options = Array.isArray(current?.options) ? current!.options.map(String) : [];
    if (typeof value === 'number') return options[value] ?? String(value);
    if (Array.isArray(value)) {
      return value.map((v) => (typeof v === 'number' ? options[v] ?? String(v) : String(v)))
        .join(', ');
    }
    return String(value);
  };

  if (loading) return <p className="text-sm text-muted-foreground">Loading…</p>;

  if (!practiceOn && !assistantOn) {
    return (
      <div className="mx-auto max-w-3xl space-y-4">
        <ScreenHeader title="Study" description={`Practice questions and help from ${name}`} />
        <Panel className="flex items-start gap-3">
          <Info className="mt-0.5 h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
          <div className="space-y-1">
            <h2 className="text-[15px] font-bold">Not available yet</h2>
            <p className="text-sm text-muted-foreground">
              The school has not switched {name} on yet. Your course materials and past papers are
              still where they always were.
            </p>
          </div>
        </Panel>
      </div>
    );
  }

  // The sentence said back before a round starts, in the server's own terms.
  const roundSize = Math.min(practiceCount, available);
  const roundSummary = available === 0
    ? 'Nothing to practise in what you have chosen.'
    : null;

  const segment =
    'h-10 flex-1 rounded-[10px] px-4 text-sm font-semibold text-muted-foreground data-[state=active]:bg-card data-[state=active]:text-foreground data-[state=active]:shadow-[0_1px_3px_rgba(23,17,43,0.12)]';

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <ScreenHeader
        title="Study"
        description={`${name}, your study assistant, working from your own course materials`}
      />

      {/* Said once, plainly, at the top — a student unsure whether this counts
          will not use it honestly. */}
      <div className="flex items-start gap-3 rounded-2xl bg-secondary px-4 py-3 text-secondary-foreground">
        <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
        <div className="space-y-0.5 text-[13px] leading-relaxed">
          <p className="font-bold">None of this counts towards your grade</p>
          <p>
            Nothing on this page is recorded against your marks, your transcript or your attendance.
            It is here to practise with. While you have an exam in progress, none of it is available
            at all.
          </p>
        </div>
      </div>

      <Tabs defaultValue={practiceOn ? 'practice' : 'ask'} className="space-y-3">
        <TabsList className="flex h-auto w-full gap-1 rounded-[14px] bg-[#ECE9F3] p-1 dark:bg-muted">
          {practiceOn && <TabsTrigger value="practice" className={segment}>Practice</TabsTrigger>}
          {assistantOn && <TabsTrigger value="ask" className={segment}>Ask {name}</TabsTrigger>}
        </TabsList>

        {/* ---------------------------------------------------------------- */}
        {practiceOn && (
          <TabsContent value="practice" className="mt-0 space-y-3">
            {questions.length === 0
              ? (
                <DarkPanel className="space-y-5 rounded-[18px]">
                  <div className="space-y-1.5">
                    <h2 className="text-lg font-extrabold tracking-tight">Set up a practice round</h2>
                    <p className="text-sm leading-relaxed text-[#CFC9DE]">
                      Two choices and you are practising: which courses, and how many questions.
                      You will get one question at a time, and after each answer you are told
                      whether you were right and why. Stop whenever you like — nothing is saved
                      against you.
                    </p>
                  </div>

                  {/* Numbered, because "pick courses, set a number, press the
                      button" is the whole thing and a student should be able
                      to see that it is the whole thing. */}
                  <fieldset className="space-y-2">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <legend className="text-sm font-bold">1. Choose your courses</legend>
                        <p className="text-xs text-[#CFC9DE]">
                          Tick as many as you like. Tick none and you practise everything you
                          take, mixed together.
                        </p>
                      </div>
                      <div className="flex gap-1">
                        <Button
                          type="button"
                          variant="ghost"
                          className="h-11 rounded-xl px-3 text-white hover:bg-white/10 hover:text-white"
                          disabled={practiceCourses.length === stocked.length || stocked.length === 0}
                          onClick={() => setPracticeCourses(stocked.map((c) => c.id))}
                        >
                          Select all
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          className="h-11 rounded-xl px-3 text-white hover:bg-white/10 hover:text-white"
                          disabled={practiceCourses.length === 0}
                          onClick={() => setPracticeCourses([])}
                        >
                          Clear
                        </Button>
                      </div>
                    </div>
                    <div className="space-y-0.5 rounded-[14px] bg-[#241C3D] p-1.5">
                      {courses.map((course) => {
                        // A course with no questions in it cannot be
                        // practised, so it is shown and disabled rather than
                        // hidden: a student looking for it should find out
                        // why it is not there, not wonder where it went.
                        const empty = course.available === 0;
                        return (
                          <label
                            key={course.id}
                            className={cn(
                              'flex min-h-11 items-center justify-between gap-3 rounded-[10px] px-2.5 py-2 text-sm',
                              empty ? 'opacity-60' : 'cursor-pointer hover:bg-white/5',
                            )}
                          >
                            <span className="flex items-center gap-2.5">
                              <Checkbox
                                disabled={empty}
                                checked={practiceCourses.includes(course.id)}
                                className="border-[#CFC9DE] data-[state=checked]:border-primary data-[state=checked]:bg-primary data-[state=checked]:text-primary-foreground focus-visible:ring-[#C4B5FD] focus-visible:ring-offset-[#17112B]"
                                onCheckedChange={(v) =>
                                  setPracticeCourses((prev) =>
                                    v
                                      ? [...prev, course.id]
                                      : prev.filter((id) => id !== course.id),
                                  )}
                              />
                              <span>{course.title}</span>
                            </span>
                            <span className="shrink-0 text-xs text-[#CFC9DE]">
                              {empty
                                ? 'none yet'
                                : `${course.available} question${course.available === 1 ? '' : 's'}`}
                            </span>
                          </label>
                        );
                      })}
                      {courses.length === 0 && (
                        <p className="px-2.5 py-2 text-sm text-[#CFC9DE]">
                          There is nothing to practise yet. Your school adds these as each course
                          goes on.
                        </p>
                      )}
                    </div>
                  </fieldset>

                  <div className="space-y-2">
                    <div>
                      <Label htmlFor="practice-count" className="text-sm font-bold">
                        2. How many questions
                      </Label>
                      <p className="text-xs text-[#CFC9DE]">
                        Anywhere from 3 to 50. A short round is easier to finish than a long one
                        you abandon.
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Quick choices">
                      {[5, 10, 20].map((n) => (
                        <button
                          key={n}
                          type="button"
                          aria-pressed={practiceCount === n}
                          onClick={() => setPracticeCount(n)}
                          className={cn(
                            'h-11 min-w-11 rounded-xl px-4 text-sm font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C4B5FD]',
                            practiceCount === n
                              ? 'bg-white text-[#17112B]'
                              : 'border border-[#3A3254] text-white hover:bg-white/10',
                          )}
                        >
                          {n}
                        </button>
                      ))}
                      <Input
                        id="practice-count"
                        type="number"
                        min={3}
                        max={50}
                        value={practiceCount}
                        // Clamped here as well as on the server, so the
                        // summary below cannot promise a number the round
                        // will not honour.
                        onChange={(e) =>
                          setPracticeCount(Math.min(50, Math.max(3, Number(e.target.value) || 3)))}
                        className="h-11 w-[5.5rem] rounded-xl border-[#3A3254] bg-[#241C3D] text-white"
                        aria-label="Number of questions"
                      />
                    </div>
                  </div>

                  {/* Said back to them in a sentence before they commit, so
                      nobody starts a round expecting something else. */}
                  <div className="space-y-2.5">
                    <p className="text-sm text-[#E9E5F2]" aria-live="polite">
                      {roundSummary ?? (
                        <>
                          You will get{' '}
                          <strong className="text-white">
                            {roundSize} question{roundSize === 1 ? '' : 's'}
                          </strong>{' '}
                          from{' '}
                          <strong className="text-white">
                            {chosen.length === 1 ? chosen[0].title : `${chosen.length} courses`}
                          </strong>
                          {available < practiceCount && (
                            <>
                              {' '}— that is everything there is in{' '}
                              {chosen.length === 1 ? 'it' : 'them'} so far
                            </>
                          )}
                          , with explained answers.
                        </>
                      )}
                    </p>
                    <button
                      type="button"
                      disabled={starting || available === 0}
                      onClick={begin}
                      className="flex h-[46px] w-full items-center justify-center gap-2 rounded-xl bg-primary text-[15px] font-bold text-primary-foreground transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-[#17112B] disabled:opacity-55"
                    >
                      {starting
                        ? <><Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Setting up…</>
                        : <><BookOpen className="h-4 w-4" aria-hidden="true" /> Start practice</>}
                    </button>
                  </div>
                </DarkPanel>
              )
              : !current
                ? (
                  <Panel className="space-y-3 p-8 text-center">
                    <CheckCircle2 className="mx-auto h-8 w-8 text-[#157F5B] dark:text-emerald-400" aria-hidden="true" />
                    <p className="text-lg font-extrabold tracking-tight">
                      {score.right} out of {score.done} right
                    </p>
                    <p className="text-sm text-muted-foreground">
                      That is the end of this round, and it counts towards nothing. The questions
                      are drawn fresh each time, so going again is not the same round twice.
                    </p>
                    <div className="flex flex-wrap justify-center gap-2">
                      <Button className="h-11 rounded-xl font-bold" onClick={begin} disabled={starting}>
                        {starting
                          ? <><Loader2 className="mr-1.5 h-4 w-4 animate-spin" aria-hidden="true" /> Setting up…</>
                          : 'Same again'}
                      </Button>
                      <Button className="h-11 rounded-xl" variant="outline" onClick={() => setQuestions([])}>
                        Change what I practise
                      </Button>
                    </div>
                  </Panel>
                )
                : (
                  <Panel className="space-y-4">
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-xs font-bold text-muted-foreground">
                        Question {index + 1} of {questions.length}
                        {/* Only on a mixed round: on a single-course one the
                            student already knows what they picked. */}
                        {mixedRound && current.course_title && (
                          <span className="block font-semibold">{current.course_title}</span>
                        )}
                      </p>
                      <Pill tone="info">{score.right}/{score.done} right</Pill>
                    </div>
                    <div
                      className="prose prose-sm dark:prose-invert max-w-none font-semibold"
                      dangerouslySetInnerHTML={{ __html: current.question_text }}
                    />

                    {answerInput}

                    {verdict && (
                      <div
                        role="status"
                        className={cn(
                          'space-y-1.5 rounded-[14px] p-3',
                          verdict.correct
                            ? 'bg-[#E6F4EE] text-[#11603F] dark:bg-emerald-500/15 dark:text-emerald-200'
                            : 'bg-[#FDE2D8] text-[#8E2A0A] dark:bg-red-500/15 dark:text-red-200',
                        )}
                      >
                        <p className="flex items-center gap-1.5 text-sm font-bold">
                          {verdict.correct
                            ? <><CheckCircle2 className="h-4 w-4" aria-hidden="true" /> Right</>
                            : <><XCircle className="h-4 w-4" aria-hidden="true" /> Not quite</>}
                        </p>
                        {!verdict.correct && (
                          <p className="text-sm">
                            The answer is <strong>{formatKey(verdict.correct_answer)}</strong>
                          </p>
                        )}
                        {verdict.explanation && (
                          <p className="text-sm text-foreground/80">{verdict.explanation}</p>
                        )}
                      </div>
                    )}

                    <div className="flex gap-2">
                      {verdict
                        ? (
                          <Button className="h-11 rounded-xl font-bold" onClick={next}>
                            {index + 1 < questions.length ? 'Next question' : 'See how you did'}
                          </Button>
                        )
                        : (
                          <Button
                            className="h-11 rounded-xl font-bold"
                            disabled={checking || answer === null || answer === ''}
                            onClick={check}
                          >
                            {checking
                              ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" aria-hidden="true" />
                              : null}
                            Check
                          </Button>
                        )}
                      <Button className="h-11 rounded-xl" variant="ghost" onClick={() => setQuestions([])}>Stop</Button>
                    </div>
                  </Panel>
                )}
          </TabsContent>
        )}

        {/* ---------------------------------------------------------------- */}
        {assistantOn && (
          <TabsContent value="ask" className="mt-0 space-y-3">
            <Panel className="space-y-4 rounded-2xl">
              <div className="flex items-start gap-3">
                <span
                  aria-hidden="true"
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-secondary text-sm font-extrabold text-primary"
                >
                  {name.charAt(0).toUpperCase()}
                </span>
                <div className="space-y-1">
                  <h2 className="text-[15px] font-bold">Ask {name} about a course material</h2>
                  <p className="text-[13px] leading-relaxed text-muted-foreground">
                    {name} answers from the material you pick and from nothing else. If it does not
                    cover your question you will be told so — which is the honest answer, and the
                    point at which to ask your lecturer.
                  </p>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="ask-material">Material</Label>
                <Select value={askMaterial} onValueChange={setAskMaterial}>
                  <SelectTrigger id="ask-material" className="h-11 rounded-xl">
                    <SelectValue placeholder="Pick a material" />
                  </SelectTrigger>
                  <SelectContent>
                    {materials.map((material) => (
                      <SelectItem key={material.id} value={material.id}>
                        {material.title}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {materials.length === 0 && (
                  <p className="text-xs text-muted-foreground">
                    None of your materials can be read yet — only files whose text was captured
                    on upload can be asked about.
                  </p>
                )}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="ask-question">Your question</Label>
                <Textarea
                  id="ask-question"
                  value={question}
                  onChange={(e) => setQuestion(e.target.value.slice(0, 600))}
                  rows={3}
                  className="rounded-xl"
                  placeholder="e.g. what does this say about the difference between the two covenants?"
                />
              </div>

              <Button
                className="h-11 w-full rounded-xl font-bold sm:w-auto"
                disabled={asking || !askMaterial || question.trim().length < 5}
                onClick={ask}
              >
                {asking
                  ? <><Loader2 className="mr-1.5 h-4 w-4 animate-spin" aria-hidden="true" /> {name} is reading…</>
                  : <><MessageCircleQuestion className="mr-1.5 h-4 w-4" aria-hidden="true" /> Ask {name}</>}
              </Button>

              {answered && (
                <div className="space-y-2 rounded-[14px] bg-muted/60 p-3" aria-live="polite">
                  <p className="whitespace-pre-wrap text-sm leading-relaxed">
                    {answered.answer}
                  </p>
                  <AssistantAttribution
                    className="border-t pt-2"
                    source={`“${answered.title}”`}
                    fallback="Go and read that section yourself — this is a pointer to the material, not a replacement for it."
                  />
                </div>
              )}
            </Panel>
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}
