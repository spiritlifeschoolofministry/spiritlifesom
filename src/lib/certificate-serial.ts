/**
 * Printed on the certificate next to the serial, so somebody holding a paper
 * copy knows where to check it. Deliberately without a scheme -- it is read by a
 * person, not clicked.
 */
export const CERTIFICATE_VERIFY_HOST = "spiritlifesom.org/verify";

/** The page a serial resolves to. */
export const certificateVerifyUrl = (serial: string) =>
  `${window.location.origin}/verify/${encodeURIComponent(serial)}`;

/** Serials are printed as SLSM-XXXX-XXXX in Crockford base32. */
export const SERIAL_PATTERN = /^SLSM-[0-9A-Z]{4}-[0-9A-Z]{4}$/;

/**
 * Tidies a hand-typed serial: case, stray spaces, and the characters Crockford
 * base32 leaves out so that a misread of a printed sheet still resolves.
 */
export const normaliseSerial = (input: string) => {
  const cleaned = input
    .toUpperCase()
    .replace(/\s+/g, "")
    .replace(/^SLSM-?/, "")
    .replace(/-/g, "")
    // I and L are read as 1, O as 0, U as V -- the reason those four are not in
    // the alphabet in the first place.
    .replace(/[IL]/g, "1")
    .replace(/O/g, "0")
    .replace(/U/g, "V")
    .replace(/[^0-9A-Z]/g, "");

  if (cleaned.length !== 8) return input.trim().toUpperCase();
  return `SLSM-${cleaned.slice(0, 4)}-${cleaned.slice(4)}`;
};
