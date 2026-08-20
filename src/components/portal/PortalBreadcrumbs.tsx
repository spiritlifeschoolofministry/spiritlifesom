import { Link } from "react-router-dom";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";

export interface Crumb {
  label: string;
  /** Omit for a crumb that isn't navigable. */
  to?: string;
}

interface PortalBreadcrumbsProps {
  /** Ancestors of the current page, outermost first. */
  crumbs: Crumb[];
  /** The current page, rendered as the trailing, non-navigable crumb. */
  current: string;
}

/** The trail back up from a page nested under a portal section. */
const PortalBreadcrumbs = ({ crumbs, current }: PortalBreadcrumbsProps) => (
  <Breadcrumb>
    <BreadcrumbList>
      {crumbs.map((crumb) => (
        <BreadcrumbItem key={`${crumb.label}-${crumb.to ?? ""}`}>
          {crumb.to ? (
            <BreadcrumbLink asChild>
              <Link to={crumb.to}>{crumb.label}</Link>
            </BreadcrumbLink>
          ) : (
            <span className="text-muted-foreground">{crumb.label}</span>
          )}
          <BreadcrumbSeparator />
        </BreadcrumbItem>
      ))}
      <BreadcrumbItem>
        <BreadcrumbPage>{current}</BreadcrumbPage>
      </BreadcrumbItem>
    </BreadcrumbList>
  </Breadcrumb>
);

export default PortalBreadcrumbs;
