import ProjectArchiveList from "@/components/projects/ProjectArchiveList";
import PageHeader from "@/components/portal/PageHeader";

const AdminProjectArchive = () => (
  <div className="space-y-5 pb-6">
    <PageHeader
      title="Project Archive"
      backTo="/admin/projects"
      breadcrumbs={[{ label: "Projects", to: "/admin/projects" }]}
      description="Every completed project, and past projects added by staff. Students read the same list on their Project page."
    />
    <ProjectArchiveList staff />
  </div>
);

export default AdminProjectArchive;
