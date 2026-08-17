import { supabase } from '@/integrations/supabase/client';

/** Public R2 base. Override per-environment with VITE_R2_PUBLIC_URL. */
export const R2_PUBLIC_BASE = (
  import.meta.env.VITE_R2_PUBLIC_URL || 'https://media.spiritlifesom.org'
).replace(/\/+$/, '');

/** Unwrap an edge function error, preferring the message the function sent back. */
async function unwrap(error: unknown, data: any, fallback: string): Promise<never> {
  const fromBody = data?.error;
  if (fromBody) throw new Error(fromBody);

  const context = (error as any)?.context;
  if (context instanceof Response) {
    const body = await context.json().catch(() => null);
    if (body?.error) throw new Error(body.error);
  }

  throw new Error((error as any)?.message || fallback);
}

export const r2Storage = {
  async uploadFile(file: File, path: string): Promise<string> {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('path', path);

    const { data, error } = await supabase.functions.invoke('r2-storage', { body: formData });
    if (error || !data?.success) await unwrap(error, data, 'Upload failed');

    return data.path as string;
  },

  async getDownloadUrl(path: string): Promise<string> {
    const { data, error } = await supabase.functions.invoke('r2-storage', {
      body: { action: 'download', path },
    });
    if (error || !data?.url) await unwrap(error, data, 'Failed to get download URL');

    return data.url as string;
  },

  async deleteFile(path: string): Promise<void> {
    const { data, error } = await supabase.functions.invoke('r2-storage', {
      body: { action: 'delete', path },
    });
    if (error || !data?.success) await unwrap(error, data, 'Failed to delete file');
  },

  /**
   * Public URL for a stored object, for files rendered directly by the browser
   * (avatars, course material links). Requires the bucket's public access.
   */
  getPublicUrl(path: string): string {
    const encoded = path.split('/').map(encodeURIComponent).join('/');
    return `${R2_PUBLIC_BASE}/${encoded}`;
  },

  /**
   * True bucket inventory, straight from R2's ListObjectsV2.
   * The Cloudflare dashboard's object/size columns are lagging telemetry;
   * this is the live count.
   */
  async list(prefix?: string): Promise<{
    bucket: string;
    objects: number;
    bytes: number;
    byPrefix: Record<string, { objects: number; bytes: number }>;
  }> {
    const { data, error } = await supabase.functions.invoke('r2-storage', {
      body: { action: 'list', ...(prefix ? { prefix } : {}) },
    });
    if (error || typeof data?.objects !== 'number') {
      await unwrap(error, data, 'Failed to list R2 bucket');
    }
    return data;
  },

  /** Connectivity check: proves the R2 credentials and bucket are reachable. */
  async ping(): Promise<{ ok: boolean; bucket: string }> {
    const { data, error } = await supabase.functions.invoke('r2-storage', {
      body: { action: 'ping' },
    });
    if (error || !data?.ok) await unwrap(error, data, 'R2 is unreachable');

    return data;
  },
};
