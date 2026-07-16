import { ReactNode } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";

interface PageHeaderProps {
  title: ReactNode;
  subtitle?: ReactNode;
  eyebrow?: string;
  backTo?: string;
  actions?: ReactNode;
  className?: string;
}

/**
 * Sanctuary page header — serif display title, optional gold eyebrow + muted
 * subtitle, and a right-aligned actions slot. Matches the mock's interior
 * page-header pattern used across every admin/student screen.
 */
const PageHeader = ({ title, subtitle, eyebrow, backTo, actions, className = "" }: PageHeaderProps) => (
  <div className={`flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between ${className}`}>
    <div className="flex items-start gap-3 min-w-0">
      {backTo && (
        <Link
          to={backTo}
          className="mt-1 flex h-9 w-9 items-center justify-center rounded-lg border border-border text-muted-foreground hover:bg-accent shrink-0"
          aria-label="Back"
        >
          <ArrowLeft className="h-4 w-4" />
        </Link>
      )}
      <div className="min-w-0">
        {eyebrow && <div className="eyebrow mb-1.5">{eyebrow}</div>}
        <h1 className="font-serif text-3xl sm:text-4xl font-semibold text-foreground leading-none">{title}</h1>
        {subtitle && <p className="text-sm text-muted-foreground mt-2">{subtitle}</p>}
      </div>
    </div>
    {actions && <div className="flex flex-wrap items-center gap-2 shrink-0">{actions}</div>}
  </div>
);

export default PageHeader;
