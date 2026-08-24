import {
  CERTIFICATE_HEIGHT,
  CERTIFICATE_WIDTH,
  loadCertificateFonts,
} from "@/lib/certificate-design";

export type CertificateFormat = "pdf" | "png";

// Three times the 96dpi design size, so 288dpi on an A4 landscape sheet. Same
// output resolution the previous html2canvas path produced.
const EXPORT_SCALE = 3;

/**
 * Rasterises the certificate at its true print size, whatever size it happens
 * to be displayed at.
 *
 * html-to-image renders through an SVG foreignObject, so the browser's own
 * engine does the layout and gradients, SVG and webfonts come out as painted on
 * screen. It reads layout dimensions rather than painted ones, so the preview's
 * CSS transform does not scale the output -- but the clone has the transform
 * cleared anyway rather than depending on that.
 */
let fontEmbedCss: Promise<string> | null = null;

/**
 * The certificate's typefaces, inlined as base64 for the exporter.
 *
 * html-to-image rasterises through an SVG foreignObject, which cannot reach out
 * to a stylesheet -- every face has to be embedded in the markup it builds. That
 * means fetching and base64-encoding ~134KB of woff2, which is slow and is the
 * same result for every certificate, so it is computed once per session instead
 * of on each download.
 */
const embeddedFontCss = async (node: HTMLElement): Promise<string> => {
  if (!fontEmbedCss) {
    fontEmbedCss = import("html-to-image")
      .then(({ getFontEmbedCSS }) => getFontEmbedCSS(node))
      .catch((err) => {
        // Better a certificate in the fallback faces than no certificate, but
        // don't cache the failure -- the next attempt should try again.
        console.error("[certificate-export] Could not embed fonts", err);
        fontEmbedCss = null;
        return "";
      });
  }
  return fontEmbedCss;
};

export async function renderCertificateCanvas(node: HTMLElement): Promise<HTMLCanvasElement> {
  // Rasterising is a snapshot of what is painted, so a face still in flight
  // would bake the fallback into the file. document.fonts.ready alone is not
  // enough -- it resolves immediately if a face has not been asked for yet.
  await loadCertificateFonts();
  if (document.fonts) await document.fonts.ready;

  const [{ toCanvas }, fonts] = await Promise.all([
    import("html-to-image"),
    embeddedFontCss(node),
  ]);

  return toCanvas(node, {
    width: CERTIFICATE_WIDTH,
    height: CERTIFICATE_HEIGHT,
    pixelRatio: EXPORT_SCALE,
    backgroundColor: "#ffffff",
    fontEmbedCSS: fonts,
    // The node is scaled down by a CSS transform for preview; html-to-image
    // measures layout size rather than painted size, so the export comes out at
    // full size regardless -- but the clone has the transform cleared anyway
    // rather than depending on that.
    style: { transform: "none", transformOrigin: "top left", margin: "0" },
  });
}

/**
 * Downloads the certificate as a print-ready PDF or a PNG. Returns false if it
 * could not be produced, so the caller can report it without inspecting errors.
 */
export async function exportCertificate(
  node: HTMLElement,
  filename: string,
  format: CertificateFormat,
): Promise<boolean> {
  try {
    const canvas = await renderCertificateCanvas(node);

    if (format === "png") {
      downloadDataUrl(canvas.toDataURL("image/png"), `${filename}.png`);
      return true;
    }

    const { jsPDF } = await import("jspdf");
    const pdf = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
    pdf.addImage(
      canvas.toDataURL("image/png"),
      "PNG",
      0,
      0,
      pdf.internal.pageSize.getWidth(),
      pdf.internal.pageSize.getHeight(),
      undefined,
      "FAST",
    );
    pdf.save(`${filename}.pdf`);
    return true;
  } catch (err) {
    console.error("[certificate-export] Failed to export certificate", err);
    return false;
  }
}

const downloadDataUrl = (dataUrl: string, filename: string) => {
  const a = document.createElement("a");
  a.href = dataUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
};

/** `Olaopa Olajide Michael` -> `SLSM_Certificate_Olaopa_Olajide_Michael` */
export const certificateFilename = (name: string) =>
  `SLSM_Certificate_${name.trim().replace(/\s+/g, "_").replace(/[^\w-]/g, "") || "Graduate"}`;
