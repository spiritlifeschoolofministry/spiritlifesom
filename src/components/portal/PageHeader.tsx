import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import PortalBreadcrumbs, { type Crumb } from "@/components/portal/PortalBreadcrumbs";

interface PageHeaderProps {
  title: string;
  /** A node, so pages can pass a badge/meta row rather than plain text. */
  description?: React.ReactNode;
  /** Ancestors only; the title is appended as the current page. */
  breadcrumbs?: Crumb[];
  /** Shows a back button to this path, for pages reached from a list. */
  backTo?: string;
  /** Back button that runs a handler instead of navigating (e.g. unsaved-changes prompts). */
  onBack?: () => void;
  backLabel?: string;
  /** Buttons for this page, right-aligned on wide screens. */
  actions?: React.ReactNode;
}

/**
 * The consistent top edge for a portal page: where you are, what this page is,
 * and what you can do here. Deep pages pass `breadcrumbs` so the trail back up
 * is always visible instead of relying on the browser's back button.
 */
const PageHeader = ({
  title,
  description,
  breadcrumbs,
  backTo,
  onBack,
  backLabel = "Back",
  actions,
}: PageHeaderProps) => (
  <div className="mb-6 space-y-3">
    {breadcrumbs && breadcrumbs.length > 0 && (
      <PortalBreadcrumbs crumbs={breadcrumbs} current={title} />
    )}

    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div className="flex items-start gap-3 min-w-0">
        {backTo && (
          <Button asChild variant="ghost" size="icon" className="mt-0.5 shrink-0" aria-label={backLabel}>
            <Link to={backTo}>
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
        )}
        {!backTo && onBack && (
          <Button
            variant="ghost"
            size="icon"
            className="mt-0.5 shrink-0"
            aria-label={backLabel}
            onClick={onBack}
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
        )}
        <div className="min-w-0">
          <h1 className="text-2xl font-bold tracking-tight text-foreground truncate">{title}</h1>
          {description && (
            <div className="mt-1 text-sm text-muted-foreground">{description}</div>
          )}
        </div>
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2 shrink-0">{actions}</div>}
    </div>
  </div>
);

export default PageHeader;
