import { supabase } from '@/integrations/supabase/client';
import { r2Storage } from '@/lib/r2-storage';

/**
 * Resolve a payment receipt to a viewable URL.
 * The `submissions` bucket is PRIVATE, so we must use signed URLs (not public URLs).
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
    return await r2Storage.getDownloadUrl(rawPath);
  }

  // Supabase storage (default) — extract bucket path if a full URL was stored
  let path = rawPath;
  if (path.startsWith('http')) {
    const marker = '/submissions/';
    const idx = path.indexOf(marker);
    if (idx >= 0) {
      path = path.substring(idx + marker.length).split('?')[0];
    } else {
      // Unknown URL format — just return as-is
      return payment.payment_proof_url || null;
    }
  }

  const { data, error } = await supabase
    .storage
    .from('submissions')
    .createSignedUrl(path, 60 * 60); // 1 hour
  if (error || !data?.signedUrl) {
    throw error || new Error('Failed to create signed URL');
  }
  return data.signedUrl;
}
