import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

interface SiteContent {
  [key: string]: string;
}

const cache: Record<string, SiteContent> = {};

export const useSiteContent = (page: string) => {
  const [content, setContent] = useState<SiteContent>(cache[page] || {});
  const [loading, setLoading] = useState(!cache[page]);

  useEffect(() => {
    if (cache[page]) {
      setContent(cache[page]);
      setLoading(false);
      return;
    }
    
    const load = async () => {
      const { data } = await supabase
        .from("site_content")
        .select("section_key, content")
        .eq("page", page);
      
      const map: SiteContent = {};
      (data || []).forEach((r: any) => { map[r.section_key] = r.content; });
      cache[page] = map;
      setContent(map);
      setLoading(false);
    };
    load();
  }, [page]);

  const get = (key: string, fallback: string = "") => content[key] || fallback;

  return { content, get, loading };
};

// Invalidate cache after admin edits
export const invalidateSiteContentCache = (page?: string) => {
  if (page) delete cache[page];
  else Object.keys(cache).forEach(k => delete cache[k]);
};
