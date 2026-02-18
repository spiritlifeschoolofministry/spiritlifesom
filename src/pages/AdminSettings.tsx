import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const AdminSettings = () => {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold text-foreground">Settings</h1>
        <p className="text-muted-foreground text-sm mt-1">Manage system settings and configurations</p>
      </div>

      <Card className="shadow-[var(--shadow-card)] border-border">
        <CardHeader>
          <CardTitle className="text-base">System Settings</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">Settings page coming soon...</p>
        </CardContent>
      </Card>
    </div>
  );
};

export default AdminSettings;
