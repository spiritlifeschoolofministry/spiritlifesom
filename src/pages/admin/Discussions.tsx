import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import DiscussionBoard, { type DiscussionCourse } from "@/components/discussions/DiscussionBoard";
import { AdminPageHeader } from "@/components/redesign/admin/primitives";

const AdminDiscussions = () => {
  const [courses, setCourses] = useState<DiscussionCourse[]>([]);

  useEffect(() => {
    supabase
      .from("courses")
      .select("id, code, cohort:cohorts(name)")
      .order("code")
      .then(({ data }) =>
        setCourses((data ?? []).map((c) => ({ id: c.id, label: [c.code, c.cohort?.name].filter(Boolean).join(" · ") }))),
      );
  }, []);

  return (
    <div className="pb-6">
      <DiscussionBoard
        staff
        courses={courses}
        header={(ask) => (
          <AdminPageHeader
            section="Teaching"
            title="Discussions"
            description="Questions students have asked about their courses. Answers from staff are marked as such."
            actions={ask}
          />
        )}
      />
    </div>
  );
};

export default AdminDiscussions;
