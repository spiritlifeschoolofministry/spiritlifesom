import type { CertificateSignatory } from "@/lib/certificate-design";

/**
 * What every cohort printed before signatories were configurable. Also the
 * column default in the database, so a cohort nobody has edited keeps producing
 * exactly the certificate it produced before.
 */
export const DEFAULT_SIGNATORIES: CertificateSignatory[] = [
  { name: "Pastor Folakemi Obadare", title: "Residence Pastor", signatureUrl: null },
  { name: "Prophet Cherub Obadare", title: "Founder/Proprietor", signatureUrl: null },
];

/** The certificate prints two signature columns. */
export const SIGNATORY_SLOTS = 2;

type StoredSignatory = {
  name?: unknown;
  title?: unknown;
  signature?: unknown;
};

const asText = (value: unknown) => (typeof value === "string" ? value : "");

/**
 * Reads the signatories jsonb into the shape the artwork draws.
 *
 * Hand-edited JSON, an older row written before a field existed, or null all
 * have to produce something printable rather than throwing on a page whose
 * whole job is to show a certificate.
 */
export const parseSignatories = (value: unknown): CertificateSignatory[] => {
  if (!Array.isArray(value)) return DEFAULT_SIGNATORIES;

  const parsed = value.slice(0, SIGNATORY_SLOTS).map((entry): CertificateSignatory => {
    const row = (entry ?? {}) as StoredSignatory;
    const signature = asText(row.signature);
    return {
      name: asText(row.name),
      title: asText(row.title),
      // Only ever a data URL: a remote signature image would have to survive
      // being inlined by the exporter, and silently does not when it cannot.
      signatureUrl: signature.startsWith("data:image/") ? signature : null,
    };
  });

  // An empty array means "no signatories", which is a legitimate choice -- but a
  // row of nothing but blanks is a mis-save, not a decision.
  const anything = parsed.some((s) => s.name.trim() || s.title.trim() || s.signatureUrl);
  return anything ? parsed : DEFAULT_SIGNATORIES;
};

/** The shape written back to the jsonb column. */
export const serialiseSignatories = (signatories: CertificateSignatory[]) =>
  signatories.slice(0, SIGNATORY_SLOTS).map((s) => ({
    name: s.name.trim(),
    title: s.title.trim(),
    signature: s.signatureUrl || null,
  }));

/** Pads a list out to the two columns the editor shows. */
export const withEmptySlots = (signatories: CertificateSignatory[]): CertificateSignatory[] =>
  Array.from({ length: SIGNATORY_SLOTS }, (_, i) => signatories[i] ?? { name: "", title: "", signatureUrl: null });
