import { describe, expect, it } from 'vitest';
import { receiptFilename, receiptKind } from '@/lib/receipt-kind';

/**
 * The bug these cover: the receipt viewer decided PDF-vs-image by testing the
 * *resolved* URL's extension. R2 hands back a presigned URL with the signature
 * in the query string, so a PDF's URL never ends in ".pdf" and every PDF
 * receipt was rendered inside an `<img>` — broken on screen, fine in a new tab.
 */
describe('receiptKind', () => {
  it('reads a PDF from the stored path', () => {
    expect(
      receiptKind({
        storage_path: 'receipts/39b51ec8/1788890769118-Transaction Receipt-260908.pdf',
      }),
    ).toBe('pdf');
  });

  it('still reads a PDF once a presigning query string is attached', () => {
    expect(
      receiptKind({
        storage_path:
          'receipts/39b51ec8/statement.pdf?X-Amz-Expires=3600&X-Amz-Signature=abc123',
      }),
    ).toBe('pdf');
  });

  it.each(['jpg', 'jpeg', 'png', 'webp', 'heic'])('reads .%s as an image', (extension) => {
    expect(receiptKind({ storage_path: `receipts/x/proof.${extension}` })).toBe('image');
  });

  it('is case-insensitive about the extension', () => {
    expect(receiptKind({ storage_path: 'receipts/x/PROOF.JPEG' })).toBe('image');
    expect(receiptKind({ storage_path: 'receipts/x/PROOF.PDF' })).toBe('pdf');
  });

  it('falls back to the legacy URL column when there is no stored path', () => {
    expect(
      receiptKind({
        storage_path: null,
        payment_proof_url: 'https://x.supabase.co/storage/v1/object/public/submissions/a/b.png',
      }),
    ).toBe('image');
  });

  it('reports anything it cannot place as "other" rather than guessing', () => {
    expect(receiptKind({ storage_path: 'receipts/x/proof' })).toBe('other');
    expect(receiptKind({ storage_path: 'receipts/x/proof.docx' })).toBe('other');
    expect(receiptKind({ storage_path: null, payment_proof_url: null })).toBe('other');
  });

  it('does not mistake a dot in a folder name for an extension', () => {
    expect(receiptKind({ storage_path: 'receipts/v1.2/proof.png' })).toBe('image');
  });
});

describe('receiptFilename', () => {
  it('takes the file name off the end of the path', () => {
    expect(receiptFilename({ storage_path: 'receipts/abc/1788890769118-Receipt.pdf' })).toBe(
      '1788890769118-Receipt.pdf',
    );
  });

  it('drops a query string and decodes escaped spaces', () => {
    expect(
      receiptFilename({ storage_path: 'receipts/abc/Transaction%20Receipt.pdf?X-Amz-Expires=3600' }),
    ).toBe('Transaction Receipt.pdf');
  });

  it('has a usable name for a row with no file at all', () => {
    expect(receiptFilename({ storage_path: null, payment_proof_url: null })).toBe('receipt');
  });
});
