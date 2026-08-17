import { r2Storage } from '@/lib/r2-storage';

/**
 * Resolve a course material to a viewable URL.
 *
 * Prefers the R2 path, falling back to the legacy `file_url` column for rows
 * that predate the R2 migration. Synchronous, so it can be dropped straight
 * into an `<a href>` without an await.
 */
export function resolveMaterialUrl(material: {
  storage_provider?: string | null;
  storage_path?: string | null;
  file_url?: string | null;
}): string | null {
  if (material.storage_provider === 'r2' && material.storage_path) {
    return r2Storage.getPublicUrl(material.storage_path);
  }
  return material.file_url || null;
}
