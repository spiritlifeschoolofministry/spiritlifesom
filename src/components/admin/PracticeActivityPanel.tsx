import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { BarChart3, Loader2, Pencil } from 'lucide-react';
import { format } from 'date-fns';
import {
  asPercent,
  summarisePractice,
  type PracticeSessionRecord,
} from '@/lib/practice-activity';
import { questionSnippet } from '@/lib/question-snippet';

/** As much of a practice question as this panel needs to name one. */
interface QuestionRef {
  id: string;
  course_id: string;
  question_text: string;
}

interface CourseRef {
  id: string;
  code: string;
  title: string;
}

/** A session row with the student's name pulled alongside it. */
type SessionRow = PracticeSessionRecord & {
  students: {
    student_code: string | null;
    is_staff_preview: boolean | null;
    profiles: { first_name: string | null; last_name: string | null } | null;
  } | null;
};

const WINDOWS = [
  { value: '7', label: 'Last 7 days' },
  { value: '30', label: 'Last 30 days' },
  { value: '90', label: 'Last 90 days' },
  { value: 'all', label: 'Everything' },
];

/** How many rows to pull. Enough to be a record, small enough to stay cheap. */
const ROW_LIMIT = 1000;

/**
 * What students have actually done with the practice questions.
 *
 * The record already exists — every round writes a `practice_sessions` row
 * carrying who sat it, what was served and whether each answer was right — so
 * this reads it back rather than recording anything of its own. Nothing new is
 * written, nothing has to be kept in step, and there is no second version of
 * the truth to drift from the first.
 *
 * Loaded only when it is opened. Somebody here to approve a draft should not
 * pay for a query they did not ask for.
 */
export const PracticeActivityPanel = ({
  questions,
  courses,
  onOpen,
}: {
  questions: QuestionRef[];
  courses: CourseRef[];
  /** Called with a question id when the reader wants to go and read one. */
  onOpen?: (id: string) => void;
}) => {
  const [open, setOpen] = useState(false);
  const [days, setDays] = useState('30');
  const [sessions, setSessions] = useState<SessionRow[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setFailed(false);
    let query = supabase
      .from('practice_sessions')
      // One literal string, not a concatenation: the generated types parse the
      // select to work out the row shape, and can only do that for a literal.
      .select('id, student_id, course_id, question_ids, answers, created_at, students!practice_sessions_student_id_fkey(student_code, is_staff_preview, profiles(first_name, last_name))')
      .order('created_at', { ascending: false })
      .limit(ROW_LIMIT);

    if (days !== 'all') {
      const since = new Date();
      since.setDate(since.getDate() - Number(days));
      query = query.gte('created_at', since.toISOString());
    }

    const { data, error } = await query;
    if (error) {
      setFailed(true);
      setSessions(null);
    } else {
      // Staff preview accounts practise to check the page works. Counting them
      // would put a member of staff on a list of students.
      setSessions((data ?? []).filter((row) => !row.students?.is_staff_preview) as SessionRow[]);
    }
    setLoading(false);
  }, [days]);

  useEffect(() => {
    if (open) load();
  }, [open, load]);

  /**
   * Which course each question belongs to, so a round spanning several of them
   * still counts towards the right ones. Without this a mixed round — the
   * whole point of practising across courses — would count towards none.
   */
  const courseOfQuestion = useMemo(
    () => new Map(questions.map((q) => [q.id, q.course_id])),
    [questions],
  );

  const activity = useMemo(
    () => summarisePractice(sessions ?? [], { courseOfQuestion }),
    [sessions, courseOfQuestion],
  );

  const nameOf = (studentId: string) => {
    const row = sessions?.find((s) => s.student_id === studentId)?.students;
    const name = [row?.profiles?.first_name, row?.profiles?.last_name]
      .filter(Boolean)
      .join(' ')
      .trim();
    return name || row?.student_code || 'Unknown student';
  };

  /**
   * The course, named once.
   *
   * Some titles already begin with the course code, and prefixing those gave
   * "SLM104 — SLM104 – The Concept of Ministry". The code is a prefix for
   * finding the course in a list, not something to say twice.
   */
  const courseName = (id: string | null) => {
    if (!id) return 'Unknown course';
    const course = courses.find((c) => c.id === id);
    if (!course) return 'Unknown course';
    const title = course.title.trim();
    return title.toLowerCase().startsWith(course.code.toLowerCase())
      ? title
      : `${course.code} — ${title}`;
  };

  const textOf = (id: string) =>
    questionSnippet(questions.find((q) => q.id === id)?.question_text);

  const stat = (label: string, value: string) => (
    <div key={label} className="rounded-md border border-border p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-lg font-semibold">{value}</p>
    </div>
  );

  return (
    <Card>
      <CardHeader className="gap-2">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <CardTitle className="text-base flex items-center gap-2">
              <BarChart3 className="h-4 w-4" /> Activity
            </CardTitle>
            <CardDescription>
              Who has been practising, and how it went. Kept for reference only — practice counts
              towards no grade, no transcript and no attendance, so nothing here is a mark.
            </CardDescription>
          </div>
          <Button size="sm" variant="outline" onClick={() => setOpen((was) => !was)}>
            {open ? 'Hide' : 'Show'}
          </Button>
        </div>
      </CardHeader>

      {open && (
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <Select value={days} onValueChange={setDays}>
              <SelectTrigger className="w-[11rem]"><SelectValue /></SelectTrigger>
              <SelectContent>
                {WINDOWS.map((w) => (
                  <SelectItem key={w.value} value={w.value}>{w.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {loading && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
            {sessions?.length === ROW_LIMIT && (
              <span className="text-xs text-muted-foreground">
                Showing the most recent {ROW_LIMIT} rounds.
              </span>
            )}
          </div>

          {failed && (
            <p className="text-sm text-muted-foreground">
              Could not read the practice record just now.
            </p>
          )}

          {!failed && !loading && activity.rounds === 0 && (
            <p className="text-sm text-muted-foreground">
              Nobody has practised in this period.
            </p>
          )}

          {!failed && activity.rounds > 0 && (
            <>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {stat('Rounds', String(activity.rounds))}
                {stat('Students', String(activity.students))}
                {stat('Answers', String(activity.answered))}
                {stat('Correct', asPercent(activity.accuracy))}
              </div>
              {activity.abandoned > 0 && (
                <p className="text-xs text-muted-foreground">
                  {activity.abandoned} of those rounds were started and left without a single
                  answer, so they count towards the rounds and towards nothing else.
                </p>
              )}

              <div className="space-y-1.5">
                <p className="text-xs font-medium">By course</p>
                <ul className="space-y-2">
                  {activity.byCourse.map((row) => (
                    <li key={row.courseId ?? 'unknown'} className="space-y-1">
                      <div className="flex flex-wrap items-baseline justify-between gap-x-2 text-xs">
                        <span className="min-w-0 truncate">{courseName(row.courseId)}</span>
                        <span className="shrink-0 text-muted-foreground">
                          {row.students} student{row.students === 1 ? '' : 's'} · {row.answered}{' '}
                          answer{row.answered === 1 ? '' : 's'} ·{' '}
                          <span className="font-medium text-foreground">
                            {asPercent(row.accuracy)} right
                          </span>
                        </span>
                      </div>
                      {/* A bar, because comparing 55% with 78% across five
                          rows of prose is work the reader should not be doing. */}
                      <div
                        className="h-1 w-full overflow-hidden rounded-full bg-muted"
                        role="presentation"
                      >
                        <div
                          className="h-full rounded-full bg-foreground/50"
                          style={{ width: `${Math.round((row.accuracy ?? 0) * 100)}%` }}
                        />
                      </div>
                    </li>
                  ))}
                </ul>
              </div>

              {activity.hardest.length > 0 && (
                <div className="space-y-1.5">
                  <p className="text-xs font-medium">Most often got wrong</p>
                  <ul className="space-y-1">
                    {activity.hardest.map((row) => {
                      const text = textOf(row.questionId);
                      // Under five attempts a rate is arithmetic rather than
                      // evidence, and "100%" off three answers reads far
                      // stronger than it is. Say the count instead.
                      const thin = row.attempts < 5;
                      return (
                        <li
                          key={row.questionId}
                          className="rounded-md border border-border/60 px-2.5 py-2 text-xs text-muted-foreground"
                        >
                          <button
                            type="button"
                            disabled={!text || !onOpen}
                            className="group flex w-full items-start gap-1.5 text-left text-foreground enabled:hover:underline"
                            onClick={() => onOpen?.(row.questionId)}
                          >
                            {text && onOpen && (
                              <Pencil className="mt-0.5 h-3 w-3 shrink-0 opacity-40 group-hover:opacity-100" />
                            )}
                            <span>{text || 'A question since deleted'}</span>
                          </button>
                          <span className="mt-0.5 block pl-[1.125rem]">
                            {row.wrong} of {row.attempts} got it wrong
                            {!thin && ` (${asPercent(row.wrongRate)})`}
                            {thin && ' — too few tries yet to read much into'}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                  <p className="text-xs text-muted-foreground italic">
                    A question most people get wrong is sometimes a hard one and sometimes a badly
                    written one. Only reading it tells you which.
                  </p>
                </div>
              )}

              <div className="space-y-1.5">
                <p className="text-xs font-medium">
                  By student
                  <Badge variant="secondary" className="ml-1.5 text-[10px]">
                    {activity.byStudent.length}
                  </Badge>
                </p>
                <div className="max-h-[22rem] overflow-y-auto">
                  <table className="w-full text-xs">
                    <thead className="text-muted-foreground">
                      <tr className="text-left">
                        <th className="py-1 font-normal">Student</th>
                        <th className="py-1 font-normal">Rounds</th>
                        <th className="py-1 font-normal">Answers</th>
                        <th className="py-1 font-normal">Right</th>
                        <th className="py-1 font-normal">Last practised</th>
                      </tr>
                    </thead>
                    <tbody>
                      {activity.byStudent.map((row) => (
                        <tr key={row.studentId} className="border-t border-border">
                          <td className="py-1.5 pr-2">{nameOf(row.studentId)}</td>
                          <td className="py-1.5">{row.rounds}</td>
                          <td className="py-1.5">{row.answered}</td>
                          <td className="py-1.5">{asPercent(row.accuracy)}</td>
                          <td className="py-1.5">
                            {format(new Date(row.lastAt), 'd MMM yyyy')}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
        </CardContent>
      )}
    </Card>
  );
};
