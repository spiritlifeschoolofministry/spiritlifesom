import { Helmet } from "react-helmet-async";

interface SEOProps {
  title: string;
  description: string;
  path?: string; // e.g. "/about" — leading slash required, no trailing
  image?: string;
  type?: "website" | "article";
  jsonLd?: Record<string, unknown> | Record<string, unknown>[];
  noindex?: boolean;
}

export const SITE_ORIGIN = "https://spiritlifesom.org";
const DEFAULT_IMAGE = "https://spiritlifesom.org/og-image.png";

/**
 * Per-page SEO. Sets <title>, meta description, canonical, OG/Twitter tags,
 * and optional JSON-LD. All canonical URLs use the apex (no www).
 */
export const SEO = ({
  title,
  description,
  path = "/",
  image = DEFAULT_IMAGE,
  type = "website",
  jsonLd,
  noindex = false,
}: SEOProps) => {
  const url = `${SITE_ORIGIN}${path === "/" ? "/" : path.replace(/\/$/, "")}`;
  const cleanTitle = title.length > 60 ? title.slice(0, 57) + "…" : title;
  const cleanDesc = description.length > 160 ? description.slice(0, 157) + "…" : description;

  const ldArray = jsonLd ? (Array.isArray(jsonLd) ? jsonLd : [jsonLd]) : [];

  return (
    <Helmet>
      <title>{cleanTitle}</title>
      <meta name="description" content={cleanDesc} />
      <link rel="canonical" href={url} />
      {noindex && <meta name="robots" content="noindex, nofollow" />}

      <meta property="og:title" content={cleanTitle} />
      <meta property="og:description" content={cleanDesc} />
      <meta property="og:url" content={url} />
      <meta property="og:type" content={type} />
      <meta property="og:image" content={image} />

      <meta name="twitter:title" content={cleanTitle} />
      <meta name="twitter:description" content={cleanDesc} />
      <meta name="twitter:url" content={url} />
      <meta name="twitter:image" content={image} />

      {ldArray.map((ld, i) => (
        <script key={i} type="application/ld+json">{JSON.stringify(ld)}</script>
      ))}
    </Helmet>
  );
};

export default SEO;
