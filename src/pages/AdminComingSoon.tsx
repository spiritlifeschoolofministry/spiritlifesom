import { CalendarCheck, FileText, Folder, CreditCard, Bell } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

const ICONS: Record<string, React.ElementType> = {
  calendar: CalendarCheck,
  "file-text": FileText,
  folder: Folder,
  "credit-card": CreditCard,
  bell: Bell,
};

interface AdminComingSoonProps {
  title: string;
  description: string;
  icon: string;
}

const AdminComingSoon = ({ title, description, icon }: AdminComingSoonProps) => {
  const Icon = ICONS[icon] || Bell;

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] text-center py-12">
      <Card className="max-w-md w-full shadow-[var(--shadow-card)] border-border">
        <CardContent className="p-10 flex flex-col items-center gap-4">
          <div className="w-16 h-16 rounded-2xl bg-secondary flex items-center justify-center">
            <Icon className="w-8 h-8 text-primary" />
          </div>
          <h2 className="text-2xl font-bold text-foreground">{title}</h2>
          <p className="text-muted-foreground text-sm">{description}</p>
          <div className="gradient-flame text-accent-foreground text-xs font-semibold px-4 py-1.5 rounded-full mt-2">
            Coming Soon
          </div>
          <Button variant="outline" size="sm" disabled className="mt-2">
            Notify me when ready
          </Button>
        </CardContent>
      </Card>
    </div>
  );
};

export default AdminComingSoon;
