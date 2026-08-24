/**
 * Limits on a stored signature.
 *
 * A signature is a few KB of thin strokes. Anything approaching the cap is a
 * photograph, and it would be paid for on every certificate the cohort issues --
 * the image travels inside the row every graduate reads.
 */
export const MAX_SIGNATURE_BYTES = 256 * 1024;

/** Rough byte size of a data URL's payload. */
export const dataUrlBytes = (dataUrl: string) =>
  Math.ceil((dataUrl.split(",")[1]?.length ?? 0) * 0.75);
