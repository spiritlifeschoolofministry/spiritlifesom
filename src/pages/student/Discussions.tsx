import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/useAuth";
import { supabase } from "@/integrations/supabase/client";
import DiscussionBoard, { type DiscussionCourse } from "@/components/discussions/DiscussionBoard";
import { ScreenHeader } from "@/components/redesign/student-pages/ui";

const StudentDiscussions = () => {
  const { student } = useAuth();
  const [courses, setCourses] = useState<DiscussionCourse[]>([]);

  useEffect(() => {
    if (!student?.cohort_id) return;
    supabase
      .from("courses")
      .select("id, code, title")
      .eq("cohort_id", student.cohort_id)
      .order("code")
      .then(({ data }) => setCourses((data ?? []).map((c) => ({ id: c.id, label: `${c.code} · ${c.title}` }))));
  }, [student?.cohort_id]);

  return (
    <DiscussionBoard
      staff={false}
      courses={courses}
      header={(ask) => (
        <ScreenHeader
          title="Discussions"
          description="Ask about a course. Your coursemates and the school's staff can answer."
          aside={ask}
        />
      )}
    />
  );
};

export default StudentDiscussions;
