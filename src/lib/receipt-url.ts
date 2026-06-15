import { supabase } from '@/integrations/supabase/client';
import { r2Storage } from '@/lib/r2-storage';

/**
 * Resolve a payment receipt to a viewable URL.
 * Handles three eras of stored values:
 *  - R2 paths (storage_provider = 'r2')
 *  - Legacy public Supabase URLs (stored full URL when bucket was public)
 *  - New private Supabase paths (need signed URL)
 */
export async function resolveReceiptUrl(payment: {
  storage_provider?: string | null;
  storage_path?: string | null;
  payment_proof_url?: string | null;
}): Promise<string | null> {
  const provider = payment.storage_provider;
  const rawPath = payment.storage_path || payment.payment_proof_url || '';
  if (!rawPath) return null;

  // R2-stored receipts
  if (provider === 'r2') {
    try {
      return await r2Storage.getDownloadUrl(rawPath);
    } catch (err) {
      console.error('R2 download URL failed, will try Supabase fallback', err);
    }
  }

  // Extract path from various Supabase URL formats
  let path = rawPath;
  if (path.startsWith('http')) {
    const markers = [
      '/storage/v1/object/public/submissions/',
      '/storage/v1/object/sign/submissions/',
      '/submissions/',
    ];
    let extracted: string | null = null;
    for (const marker of markers) {
      const idx = path.indexOf(marker);
      if (idx >= 0) {
        extracted = path.substring(idx + marker.length).split('?')[0];
        break;
      }
    }
    if (extracted) {
      path = extracted;
    } else {
      // Unknown URL format — return raw URL as a last resort
      return payment.payment_proof_url || null;
    }
  }

  // Try signed URL on submissions bucket
  const { data, error } = await supabase
    .storage
    .from('submissions')
    .createSignedUrl(path, 60 * 60);
  if (!error && data?.signedUrl) {
    return data.signedUrl;
  }

  // Final fallback: try R2 (in case provider field wasn't set on legacy rows)
  try {
    return await r2Storage.getDownloadUrl(path);
  } catch {
    return null;
  }
}
