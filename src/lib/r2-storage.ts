import { supabase } from '@/integrations/supabase/client';

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

  /** Get public URL (direct, no signing needed). For public files like avatars and materials. */
  getPublicUrl(path: string): string {
    const bucket = 'spiritlifesom';
    return `https://${bucket}.cd.r2.dev/${encodeURIComponent(path)}`;
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
