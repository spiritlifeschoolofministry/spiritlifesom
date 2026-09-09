import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Download, ExternalLink, FileText, Loader2 } from 'lucide-react';
import { receiptFilename, receiptKind, type ReceiptKind } from '@/lib/receipt-kind';

export interface ReceiptSource {
  storage_provider?: string | null;
  storage_path?: string | null;
  payment_proof_url?: string | null;
}

interface ReceiptViewerProps {
  /** The payment row, read for the file's real name and extension. */
  payment: ReceiptSource | null;
  /** The already-resolved URL. Null while it is still being fetched. */
  url: string | null;
  loading?: boolean;
  className?: string;
}

/**
 * Renders a payment receipt, whatever kind of file it turned out to be.
 *
 * The type is taken from the stored path, never from `url` — see `receiptKind`
 * for why an R2 presigned URL cannot be tested for an extension.
 *
 * Even with the right element chosen, a file can still fail to render: an image
 * stored with the wrong extension, a PDF a mobile browser declines to frame.
 * So an image that errors falls through to the same "open it directly" panel a
 * PDF-less browser gets, rather than leaving a broken-image icon on screen. The
 * link out and the download are always offered, because they work in every case
 * this component cannot render inline itself.
 */
export default function ReceiptViewer({ payment, url, loading = false, className }: ReceiptViewerProps) {
  const kind: ReceiptKind = payment ? receiptKind(payment) : 'other';
  const filename = payment ? receiptFilename(payment) : 'receipt';
  const [imageFailed, setImageFailed] = useState(false);

  // A new receipt deserves a fresh attempt at rendering it inline.
  useEffect(() => {
    setImageFailed(false);
  }, [url]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!url) {
    return <p className="text-sm text-destructive">Unable to load receipt.</p>;
  }

  const actions = (
    <div className="flex flex-wrap items-center gap-2">
      <Button asChild size="sm" variant="outline">
        <a href={url} target="_blank" rel="noopener noreferrer">
          <ExternalLink className="mr-1.5 h-3.5 w-3.5" /> Open in new tab
        </a>
      </Button>
      <Button asChild size="sm" variant="ghost">
        <a href={url} download={filename}>
          <Download className="mr-1.5 h-3.5 w-3.5" /> Download
        </a>
      </Button>
    </div>
  );

  const renderInline = () => {
    if (kind === 'pdf') {
      return (
        <object data={url} type="application/pdf" className="h-[70vh] w-full rounded border">
          {/* Shown only where the browser has no PDF viewer of its own. */}
          <div className="flex flex-col items-center gap-3 py-12 text-center">
            <FileText className="h-10 w-10 text-muted-foreground/50" />
            <p className="text-sm text-muted-foreground">
              This receipt is a PDF your browser won't display here.
            </p>
          </div>
        </object>
      );
    }

    if (kind === 'image' && !imageFailed) {
      return (
        <img
          src={url}
          alt={`Receipt (${filename})`}
          onError={() => setImageFailed(true)}
          className="max-h-[70vh] w-full rounded border object-contain"
        />
      );
    }

    return (
      <div className="flex flex-col items-center gap-3 rounded border border-dashed py-12 text-center">
        <FileText className="h-10 w-10 text-muted-foreground/50" />
        <div>
          <p className="text-sm font-medium text-foreground">{filename}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {imageFailed
              ? "This file couldn't be shown here. Open or download it to view it."
              : 'Open or download this receipt to view it.'}
          </p>
        </div>
      </div>
    );
  };

  return (
    <div className={className ? `space-y-3 ${className}` : 'space-y-3'}>
      {renderInline()}
      {actions}
    </div>
  );
}
