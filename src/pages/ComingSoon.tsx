import StudentLayout from "@/components/StudentLayout";

const ComingSoon = () => (
  <StudentLayout>
    <div className="flex flex-col items-center justify-center h-[60vh] text-center">
      <h2 className="text-2xl font-bold text-foreground mb-2">Coming Soon</h2>
      <p className="text-muted-foreground">This section is under construction. Check back later!</p>
    </div>
  </StudentLayout>
);

export default ComingSoon;
