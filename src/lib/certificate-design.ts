// The certificate is drawn once, at one size: A4 landscape at 96dpi. Every
// measurement in CertificateArtwork is a fixed pixel figure taken off the
// printed original, so the rendered document does not depend on the width of
// the browser that happens to be showing it.
//
// 1123 x 794 is not arbitrary -- at print time 1 CSS px is 1/96in, so 1123px is
// 297mm and 794px is 210mm. Printing that node with @page margin 0 fills an A4
// landscape sheet edge to edge with no scaling anywhere in the chain.
export const CERTIFICATE_WIDTH = 1123;
export const CERTIFICATE_HEIGHT = 794;

// Palette and type stack of the official printed certificate.
export const NAVY = "#17325c";
export const RED = "#c1272d";
export const CREAM = "#fdf9ec";
export const SERIF = "'Playfair Display', Georgia, 'Times New Roman', serif";
export const SCRIPT = "'Yellowtail', 'Brush Script MT', cursive";
export const BODY = "'Nunito', 'Segoe UI', system-ui, sans-serif";

// Every face the certificate draws with, as font-loading descriptors. The
// @font-face rules live in index.css and are self-hosted, but a declaration is
// not a download -- these have to be asked for explicitly before rasterising or
// the export can snapshot a fallback.
export const CERTIFICATE_FACES = [
  "400 19px 'Playfair Display'",
  "700 20px 'Playfair Display'",
  "900 63px 'Playfair Display'",
  "italic 700 56px 'Playfair Display'",
  "400 45px Yellowtail",
  "400 22px Nunito",
];

/** Pulls in the certificate's typefaces and resolves once they are usable. */
export const loadCertificateFonts = async () => {
  if (typeof document === "undefined" || !document.fonts) return;
  await Promise.all(
    CERTIFICATE_FACES.map((face) =>
      // A face the browser cannot match rejects; one missing face must not stop
      // the rest from loading.
      document.fonts.load(face).catch(() => undefined),
    ),
  );
};

export type CertificateSignatory = {
  name: string;
  title: string;
  /** Drawn signature, as a data URL or a public image URL. */
  signatureUrl?: string | null;
};

export type CertificateArtworkProps = {
  recipientName: string;
  studentCode?: string | null;
  dateText: string;
  mainText: string;
  subText?: string | null;
  /** Rendered left to right; only the first two are drawn. */
  signatories: CertificateSignatory[];
  /** Printed serial, the key a verifier looks the certificate up by. */
  serial?: string | null;
  /** Host shown beside the serial, e.g. "spiritlifesom.org/verify". */
  verifyHost?: string | null;
};
