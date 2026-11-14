import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, Loader2, MessageSquareHeart } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/contexts/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyCard, Panel, Pill, ScreenHeader } from "@/components/redesign/student-pages/ui";
import {
  RATING_QUESTIONS,
  RATING_WORDS,
  ratingsComplete,
  type FeedbackRatings,
  type RatingKey,
} from "@/lib/course-feedback";
import { cn } from "@/lib/utils";

interface Course {
  id: string;
  code: string;
  title: string;
  lecturer: string | null;
  feedback_open: boolean;
}

const EMPTY_RATINGS: FeedbackRatings = {
  rating_overall: null,
  rating_content: null,
  rating_teaching: null,
  rating_materials: null,
};

/** One 1–5 question as a radio group. */
const RatingField = ({
  name,
  label,
  value,
  onChange,
}: {
  name: string;
  label: string;
  value: number | null;
  onChange: (value: number) => void;
}) => (
  <fieldset>
    <legend className="text-sm font-semibold text-foreground">{label}</legend>
    <div className="mt-2 flex flex-wrap gap-2">
      {RATING_WORDS.map((word, index) => {
        const score = index + 1;
        const checked = value === score;
        return (
          <label
            key={word}
            className={cn(
              "flex min-h-11 cursor-pointer items-center gap-1.5 rounded-xl border px-3 text-sm font-medium transition-colors focus-within:ring-2 focus-within:ring-ring",
              checked
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border bg-card text-foreground hover:bg-muted",
            )}
          >
            <input
              type="radio"
              name={name}
              value={score}
              checked={checked}
              onChange={() => onChange(score)}
              className="sr-only"
            />
            <span aria-hidden="true" className="font-bold">{score}</span>
            {word}
          </label>
        );
      })}
    </div>
  </fieldset>
);

const FeedbackForm = ({
  course,
  studentId,
  onSent,
}: {
  course: Course;
  studentId: string;
  onSent: () => void;
}) => {
  const [ratings, setRatings] = useState<FeedbackRatings>(EMPTY_RATINGS);
  const [liked, setLiked] = useState("");
  const [improve, setImprove] = useState("");
  const [sending, setSending] = useState(false);

  const send = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!ratingsComplete(ratings)) {
      toast.error("Please answer all four ratings");
      return;
    }
    setSending(true);
    const { error } = await supabase.from("course_feedback").insert({
      course_id: course.id,
      student_id: studentId,
      rating_overall: ratings.rating_overall!,
      rating_content: ratings.rating_content!,
      rating_teaching: ratings.rating_teaching!,
      rating_materials: ratings.rating_materials!,
      liked: liked.trim() || null,
      improve: improve.trim() || null,
    });
    setSending(false);
    if (error) {
      console.error("Send feedback error:", error);
      toast.error(error.code === "23505" ? "You have already sent feedback for this course" : "Could not send your feedback");
      if (error.code === "23505") onSent();
      return;
    }
    toast.success("Thank you. Your feedback has been sent");
    onSent();
  };

  const set = (key: RatingKey) => (value: number) => setRatings((current) => ({ ...current, [key]: value }));

  return (
    <form onSubmit={send} className="mt-4 space-y-5 border-t border-border pt-4">
      {RATING_QUESTIONS.map((question) => (
        <RatingField
          key={question.key}
          name={`${course.id}-${question.key}`}
          label={question.label}
          value={ratings[question.key]}
          onChange={set(question.key)}
        />
      ))}
      <div className="space-y-1.5">
        <Label htmlFor={`${course.id}-liked`}>What helped you most? (optional)</Label>
        <Textarea id={`${course.id}-liked`} value={liked} onChange={(e) => setLiked(e.target.value)} maxLength={2000} rows={3} />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor={`${course.id}-improve`}>What should change next time? (optional)</Label>
        <Textarea id={`${course.id}-improve`} value={improve} onChange={(e) => setImprove(e.target.value)} maxLength={2000} rows={3} />
      </div>
      <Button type="submit" disabled={sending} className="h-11 w-full font-bold sm:w-auto">
        {sending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Send feedback
      </Button>
    </form>
  );
};

const StudentFeedback = () => {
  const { student } = useAuth();
  const [courses, setCourses] = useState<Course[]>([]);
  const [sentFor, setSentFor] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [openId, setOpenId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!student?.id || !student.cohort_id) {
      setLoading(false);
      return;
    }
    const [coursesRes, sentRes] = await Promise.all([
      supabase
        .from("courses")
        .select("id, code, title, lecturer, feedback_open")
        .eq("cohort_id", student.cohort_id)
        .order("code"),
      supabase.from("course_feedback").select("course_id").eq("student_id", student.id),
    ]);
    if (coursesRes.error || sentRes.error) {
      console.error("Load feedback error:", coursesRes.error ?? sentRes.error);
      toast.error("Could not load course feedback");
    }
    setCourses(coursesRes.data ?? []);
    setSentFor(new Set((sentRes.data ?? []).map((row) => row.course_id)));
    setLoading(false);
  }, [student?.id, student?.cohort_id]);

  useEffect(() => {
    void load();
  }, [load]);

  // A course shows here when feedback is open, or when this student has
  // already answered it.
  const listed = courses.filter((course) => course.feedback_open || sentFor.has(course.id));
  const waiting = listed.filter((course) => course.feedback_open && !sentFor.has(course.id)).length;

  return (
    <div className="space-y-5">
      <ScreenHeader
        title="Course Feedback"
        description="Tell the school how each course went. Your name is not shown with your answers."
        aside={waiting > 0 ? <Pill tone="warning">{waiting} to answer</Pill> : undefined}
      />

      {loading ? (
        <div className="space-y-3">
          {[1, 2].map((i) => <Skeleton key={i} className="h-24 w-full rounded-[20px]" />)}
        </div>
      ) : listed.length === 0 ? (
        <EmptyCard icon={<MessageSquareHeart className="h-6 w-6" />} title="No feedback to give right now">
          When the school opens feedback for one of your courses it appears here, and you get a notification.
        </EmptyCard>
      ) : (
        <ul className="space-y-3">
          {listed.map((course) => {
            const sent = sentFor.has(course.id);
            const open = openId === course.id;
            return (
              <Panel as="li" key={course.id}>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">{course.code}</p>
                    <h2 className="text-base font-bold text-foreground">{course.title}</h2>
                    {course.lecturer && <p className="text-sm text-muted-foreground">{course.lecturer}</p>}
                  </div>
                  {sent ? (
                    <Pill tone="success"><CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" /> Sent</Pill>
                  ) : (
                    <Button
                      variant={open ? "outline" : "default"}
                      className="h-11 font-bold"
                      aria-expanded={open}
                      onClick={() => setOpenId(open ? null : course.id)}
                    >
                      {open ? "Close" : "Give feedback"}
                    </Button>
                  )}
                </div>
                {open && !sent && student?.id && (
                  <FeedbackForm
                    course={course}
                    studentId={student.id}
                    onSent={() => {
                      setOpenId(null);
                      void load();
                    }}
                  />
                )}
              </Panel>
            );
          })}
        </ul>
      )}
    </div>
  );
};

export default StudentFeedback;
