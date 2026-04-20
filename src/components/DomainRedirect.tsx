import { useEffect } from "react";

const CANONICAL_HOST = "spiritlifesom.org";
const LEGACY_HOSTS = [
  "spiritlifesom.lovable.app",
  "spiritlifesom.vercel.app",
  "www.spiritlifesom.org", // canonicalize www → apex
];

/**
 * Client-side safety net: if the page loads on a legacy / non-canonical host,
 * redirect to the canonical apex domain preserving the path + query + hash.
 *
 * Note: Real 301 redirects must be configured in Lovable Project Settings
 * → Domains by setting spiritlifesom.org as the Primary domain. This is
 * only a fallback for users who land on stale URLs.
 */
export default function DomainRedirect() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    const host = window.location.hostname;
    // Don't touch preview / sandbox URLs used during development
    if (host.includes("id-preview--") || host === "localhost" || host.startsWith("127.")) {
      return;
    }
    if (LEGACY_HOSTS.includes(host)) {
      const target = `https://${CANONICAL_HOST}${window.location.pathname}${window.location.search}${window.location.hash}`;
      window.location.replace(target);
    }
  }, []);

  return null;
}
