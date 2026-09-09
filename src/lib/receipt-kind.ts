/** What a receipt file actually is, which decides how it can be rendered. */
export type ReceiptKind = 'image' | 'pdf' | 'other';

const IMAGE_EXTENSIONS = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'avif', 'bmp', 'heic', 'heif'];

/**
 * The file's type, read from the stored path rather than the resolved URL.
 *
 * This has to come from the path. R2 hands back a presigned URL carrying
 * `?X-Amz-Expires=…&X-Amz-Signature=…`, so a PDF receipt's URL does not end in
 * ".pdf" — the viewer that tested the URL's extension put every PDF inside an
 * `<img>`, which showed a broken image while "Open in new tab" worked fine.
 *
 * The query string is stripped before the extension is taken so this stays
 * correct whether it is handed a bare path or a signed URL.
 */
export function receiptKind(payment: {
  storage_path?: string | null;
  payment_proof_url?: string | null;
}): ReceiptKind {
  const raw = payment.storage_path || payment.payment_proof_url || '';
  const withoutQuery = raw.split(/[?#]/)[0];
  const extension = withoutQuery.split('.').pop()?.toLowerCase() ?? '';
  if (extension === 'pdf') return 'pdf';
  if (IMAGE_EXTENSIONS.includes(extension)) return 'image';
  return 'other';
}

/** The original file name, for a download attribute and for display. */
export function receiptFilename(payment: {
  storage_path?: string | null;
  payment_proof_url?: string | null;
}): string {
  const raw = payment.storage_path || payment.payment_proof_url || '';
  const name = raw.split(/[?#]/)[0].split('/').pop() ?? '';
  return decodeURIComponent(name) || 'receipt';
}
