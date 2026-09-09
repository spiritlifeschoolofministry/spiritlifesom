import { supabase } from '@/integrations/supabase/client';
import { edgeErrorMessage } from '@/lib/edge-error';
import { describeFromMetadata, type MaterialMeta } from '@/lib/ai-format';
import { tidy } from '@/lib/ai-format';

/**
 * Descriptions and tags for course materials, written by a model where one is
 * reachable and by a template where one is not.
 *
 * The guarantee this file exists to make is that no material is saved without
 * a description. A model can be unreachable for a dozen ordinary reasons — no
 * key yet, a spent free tier, a rotated key, a scanned PDF with no text layer,
 * the edge function itself down — and every one of them ends in the same place:
 * `describeFromMetadata` builds a plain, true sentence out of what the uploader
 * already knows.
 *
 * That fallback lives here rather than in the edge function on purpose. In the
 * function it would share the function's fate; here it holds even when nothing
 * server-side answers at all.
 */

export { describeFromMetadata } from '@/lib/ai-format';
export type { MaterialMeta } from '@/lib/ai-format';

export interface DescriptionResult {
  description: string;
  /** Which provider wrote it, or null when the template did. */
  provider: string | null;
  /** Set when the template wrote it, saying why in words an admin can act on. */
  note?: string;
}

const call = async (body: Record<string, unknown>) => {
  const { data, error } = await supabase.functions.invoke('ai-material', { body });
  if (error) throw new Error(await edgeErrorMessage(error, data, 'The AI call failed.'));
  return data;
};

/**
 * A description for a material. Always returns one.
 *
 * The model is tried first; anything at all going wrong falls through to the
 * template, with the reason carried alongside so the uploader can be told why
 * the sentence is a plain one — and can still edit it before saving.
 */
export const describeMaterial = async (meta: MaterialMeta): Promise<DescriptionResult> => {
  try {
    const data = await call({
      action: 'describe',
      title: meta.title,
      courseName: meta.courseName ?? '',
      materialType: meta.materialType ?? '',
      fileType: meta.fileType ?? '',
      excerpt: meta.excerpt ?? '',
    });
    const description = tidy(String(data?.description ?? ''));
    if (description) return { description, provider: data?.provider ?? null };
    return {
      description: describeFromMetadata(meta),
      provider: null,
      note: 'The model returned nothing usable, so a plain description was written instead.',
    };
  } catch (err) {
    return {
      description: describeFromMetadata(meta),
      provider: null,
      note: err instanceof Error ? err.message : 'A plain description was written instead.',
    };
  }
};

export interface TagResult {
  tags: string[];
  /** Set when nothing could be suggested, in words an admin can act on. */
  note?: string;
}

/**
 * Tags for a material, drawn only from those the school already uses.
 *
 * Unlike a description there is no fallback, and that is the correct outcome
 * rather than a degraded one: there is no honest way to guess a subject from a
 * title without a model, so when nothing answers this returns nothing and says
 * why. The field stays as it was.
 */
export const suggestMaterialTags = async (meta: MaterialMeta): Promise<TagResult> => {
  try {
    const data = await call({
      action: 'tags',
      title: meta.title,
      courseName: meta.courseName ?? '',
      materialType: meta.materialType ?? '',
      excerpt: meta.excerpt ?? '',
    });
    return {
      tags: Array.isArray(data?.tags) ? data.tags.map(String) : [],
      note: data?.note ? String(data.note) : undefined,
    };
  } catch (err) {
    return { tags: [], note: err instanceof Error ? err.message : 'No tags could be suggested.' };
  }
};
