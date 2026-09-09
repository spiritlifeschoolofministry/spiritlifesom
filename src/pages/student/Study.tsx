import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/useAuth';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
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
  Sparkles,
  XCircle,
} from 'lucide-react';
import { toast } from 'sonner';
import PageHeader from '@/components/portal/PageHeader';
import AssistantAttribution from '@/components/student/AssistantAttribution';
import { useAiFlags, useAssistantName } from '@/lib/ai-flags';
import {
  answerPractice,
  askAboutMaterial,
  listStudyMaterials,
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

interface CourseOption {
  id: string;
  title: string;
}

export default function Study() {
  const { student } = useAuth();
  const { data: flags } = useAiFlags();
  const name = useAssistantName();

  const [courses, setCourses] = useState<CourseOption[]>([]);
  const [loading, setLoading] = useState(true);

  // Practice
  const [practiceCourse, setPracticeCourse] = useState('');
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

  const load = useCallback(async () => {
    if (!student?.cohort_id) {
      setLoading(false);
      return;
    }
    // The student's own courses, from both places a course can belong to a
    // cohort: the course's own `cohort_id`, which is what the courses page
    // reads and what creating a course sets, and `course_cohorts`, which only
    // ever holds the extra cohorts a course was later shared with. Reading the
    // join table alone missed every course that was never shared — which is
    // most of them — so this page offered a cohort's courses to nobody.
    const [ownRes, sharedRes] = await Promise.all([
      supabase
        .from('courses')
        .select('id, title')
        .eq('cohort_id', student.cohort_id),
      supabase
        .from('course_cohorts')
        .select('courses(id, title)')
        .eq('cohort_id', student.cohort_id),
    ]);

    const shared = (sharedRes.data ?? [])
      .map((row) => row.courses as CourseOption | null)
      .filter((course): course is CourseOption => !!course);

    // De-duplicated: a course can legitimately appear in both.
    const byId = new Map<string, CourseOption>();
    for (const course of [...((ownRes.data ?? []) as CourseOption[]), ...shared]) {
      byId.set(course.id, course);
    }
    setCourses([...byId.values()].sort((a, b) => a.title.localeCompare(b.title)));
    setLoading(false);
  }, [student?.cohort_id]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!assistantOn) return;
    listStudyMaterials()
      .then(setMaterials)
      .catch(() => setMaterials([]));
  }, [assistantOn]);

  const current = questions[index];

  const begin = async () => {
    if (!practiceCourse) return;
    setStarting(true);
    try {
      const session = await startPractice(practiceCourse);
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
              className="w-full justify-start text-left h-auto py-2 whitespace-normal"
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
              className="w-full justify-start text-left h-auto py-2 whitespace-normal"
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
      <div className="space-y-4">
        <PageHeader title="Study" description={`Practice questions and help from ${name}`} />
        <Alert>
          <Info className="h-4 w-4" />
          <AlertTitle>Not available yet</AlertTitle>
          <AlertDescription>
            The school has not switched {name} on yet. Your course materials and past papers are
            still where they always were.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="Study"
        description={`${name}, your study assistant, working from your own course materials`}
      />

      {/* Said once, plainly, at the top — a student unsure whether this counts
          will not use it honestly. */}
      <Alert>
        <Info className="h-4 w-4" />
        <AlertTitle>None of this counts towards your grade</AlertTitle>
        <AlertDescription>
          Nothing on this page is recorded against your marks, your transcript or your attendance.
          It is here to practise with. While you have an exam in progress, none of it is available
          at all.
        </AlertDescription>
      </Alert>

      <Tabs defaultValue={practiceOn ? 'practice' : 'ask'}>
        <TabsList>
          {practiceOn && <TabsTrigger value="practice">Practice</TabsTrigger>}
          {assistantOn && <TabsTrigger value="ask">Ask {name}</TabsTrigger>}
        </TabsList>

        {/* ---------------------------------------------------------------- */}
        {practiceOn && (
          <TabsContent value="practice" className="space-y-4">
            {questions.length === 0
              ? (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Practise a course</CardTitle>
                    <CardDescription>
                      Ten questions drawn from the same bank your exams come from, with the
                      explanation shown after each one.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div>
                      <Label>Course</Label>
                      <Select value={practiceCourse} onValueChange={setPracticeCourse}>
                        <SelectTrigger><SelectValue placeholder="Pick a course" /></SelectTrigger>
                        <SelectContent>
                          {courses.map((course) => (
                            <SelectItem key={course.id} value={course.id}>{course.title}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <Button disabled={!practiceCourse || starting} onClick={begin}>
                      {starting
                        ? <><Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> Setting up…</>
                        : <><BookOpen className="mr-1.5 h-4 w-4" /> Start practising</>}
                    </Button>
                  </CardContent>
                </Card>
              )
              : !current
                ? (
                  <Card className="p-8 text-center space-y-3">
                    <CheckCircle2 className="mx-auto h-8 w-8 text-emerald-600" />
                    <p className="text-lg font-medium">
                      {score.right} out of {score.done} right
                    </p>
                    <p className="text-sm text-muted-foreground">
                      That is the end of this round, and it counts towards nothing.
                    </p>
                    <Button variant="outline" onClick={() => setQuestions([])}>
                      Practise again
                    </Button>
                  </Card>
                )
                : (
                  <Card>
                    <CardHeader>
                      <div className="flex items-center justify-between gap-2">
                        <CardTitle className="text-sm text-muted-foreground font-normal">
                          Question {index + 1} of {questions.length}
                        </CardTitle>
                        <Badge variant="secondary">{score.right}/{score.done} right</Badge>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div
                        className="prose prose-sm dark:prose-invert max-w-none"
                        dangerouslySetInnerHTML={{ __html: current.question_text }}
                      />

                      {answerInput}

                      {verdict && (
                        <div
                          className={`rounded-lg border p-3 space-y-1.5 ${
                            verdict.correct
                              ? 'border-emerald-500/30 bg-emerald-500/5'
                              : 'border-destructive/30 bg-destructive/5'
                          }`}
                        >
                          <p className="flex items-center gap-1.5 text-sm font-medium">
                            {verdict.correct
                              ? <><CheckCircle2 className="h-4 w-4 text-emerald-600" /> Right</>
                              : <><XCircle className="h-4 w-4 text-destructive" /> Not quite</>}
                          </p>
                          {!verdict.correct && (
                            <p className="text-sm">
                              <span className="text-muted-foreground">The answer is </span>
                              {formatKey(verdict.correct_answer)}
                            </p>
                          )}
                          {verdict.explanation && (
                            <p className="text-sm text-muted-foreground">{verdict.explanation}</p>
                          )}
                        </div>
                      )}

                      <div className="flex gap-2">
                        {verdict
                          ? (
                            <Button onClick={next}>
                              {index + 1 < questions.length ? 'Next question' : 'See how you did'}
                            </Button>
                          )
                          : (
                            <Button
                              disabled={checking || answer === null || answer === ''}
                              onClick={check}
                            >
                              {checking
                                ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                                : null}
                              Check
                            </Button>
                          )}
                        <Button variant="ghost" onClick={() => setQuestions([])}>Stop</Button>
                      </div>
                    </CardContent>
                  </Card>
                )}
          </TabsContent>
        )}

        {/* ---------------------------------------------------------------- */}
        {assistantOn && (
          <TabsContent value="ask" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Ask {name} about a course material</CardTitle>
                <CardDescription>
                  {name} answers from the material you pick and from nothing else. If it does not
                  cover your question you will be told so — which is the honest answer, and the
                  point at which to ask your lecturer.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div>
                  <Label>Material</Label>
                  <Select value={askMaterial} onValueChange={setAskMaterial}>
                    <SelectTrigger><SelectValue placeholder="Pick a material" /></SelectTrigger>
                    <SelectContent>
                      {materials.map((material) => (
                        <SelectItem key={material.id} value={material.id}>
                          {material.title}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {materials.length === 0 && (
                    <p className="mt-1.5 text-xs text-muted-foreground">
                      None of your materials can be read yet — only files whose text was captured
                      on upload can be asked about.
                    </p>
                  )}
                </div>

                <div>
                  <Label>Your question</Label>
                  <Textarea
                    value={question}
                    onChange={(e) => setQuestion(e.target.value.slice(0, 600))}
                    rows={3}
                    placeholder="e.g. what does this say about the difference between the two covenants?"
                  />
                </div>

                <Button
                  disabled={asking || !askMaterial || question.trim().length < 5}
                  onClick={ask}
                >
                  {asking
                    ? <><Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> {name} is reading…</>
                    : <><MessageCircleQuestion className="mr-1.5 h-4 w-4" /> Ask {name}</>}
                </Button>

                {answered && (
                  <div className="rounded-lg border bg-muted/30 p-3 space-y-2">
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
              </CardContent>
            </Card>
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}
