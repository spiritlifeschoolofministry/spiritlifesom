/**
 * Describes and files a course material.
 *
 * Called from the upload dialog while the file is still in the browser, before
 * anything reaches R2 or the database — so what comes back lands in a field
 * the uploader is already looking at and can edit or discard. Nothing here
 * writes to `course_materials`; the caller does, with whatever the person
 * uploading finally approved.
 *
 * Two actions, because they are two different jobs with different guarantees:
 *
 *   `describe` writes prose, and its standing instruction is not to invent.
 *   Metadata on a donated teaching document is thin, and a model asked to
 *   describe "Foundations of Faith" with nothing else will happily invent its
 *   contents. On a Bible school's own catalogue, a fluent invention about what
 *   a course teaches is worse than a flat, true sentence.
 *
 *   `tags` writes nothing at all. The model is handed the tags the school
 *   already uses and must answer with a subset: it can choose wrongly, which
 *   an admin corrects, but it cannot invent a new subject because that is not
 *   on the list it was given. That bound is enforced twice — asked for in the
 *   prompt, then intersected with the vocabulary on the way out, because a
 *   prompt is a request and not a guarantee.
 */
import {
  chainFailureResponse,
  corsHeaders,
  guard,
  json,
} from "../_shared/ai-guard.ts";
import { runChain } from "../_shared/ai-chain.ts";
import { clampExcerpt, extractJson, line, MAX_DESCRIPTION_CHARS, tidy } from "../_shared/ai-text.ts";

/** Guards the prompt against a whole book arriving instead of its opening. */
const MAX_EXCERPT_CHARS = 12_000;

/** Caps on what comes back, not on what is asked for. */
const MAX_TAGS = 6;

/** Guards the prompt once a school has grown a long tag list. */
const MAX_VOCABULARY = 200;

interface MaterialMeta {
  title?: string;
  courseName?: string;
  materialType?: string;
  fileType?: string;
}

const describePrompt = (meta: MaterialMeta, excerpt: string) =>
  `You are writing the catalogue description for a teaching resource in a Bible school's course library.

Rules:
- One sentence, at most ${MAX_DESCRIPTION_CHARS} characters. It must read whole, not cut off.
- Describe only what the details below actually establish. Never invent chapters, topics, doctrines, authors or claims that are not there.
- If the details are thin, write a plain factual sentence rather than an impressive one. A flat true sentence is the correct answer here.
- No preamble, no quotes, no "This document…". Just the sentence.
- Write in British English, in the school's own voice: plain, warm, unsensational.

Details:
${line("Title", meta.title)}${line("Course", meta.courseName)}${
    line("Kind of resource", meta.materialType)
  }${line("File type", meta.fileType)}${
    excerpt ? `\nOpening of the document:\n"""\n${clampExcerpt(excerpt, MAX_EXCERPT_CHARS)}\n"""\n` : ""
  }`;

const tagsPrompt = (meta: MaterialMeta, vocabulary: string[], excerpt: string) =>
  `You are filing a teaching resource in a Bible school's library against the school's own subject tags.

Rules:
- Choose only from the list given. Never invent a tag that is not listed, however well it would fit.
- Choose at most ${MAX_TAGS}, and fewer where fewer genuinely apply. A resource filed under nine subjects is filed under none.
- If nothing on the list fits, answer with an empty array. That is a correct answer.
- Answer with a JSON array of strings and nothing else.

The school's tags:
${vocabulary.join(", ")}

The resource:
${line("Title", meta.title)}${line("Course", meta.courseName)}${
    line("Kind of resource", meta.materialType)
  }${excerpt ? `\nOpening of the document:\n"""\n${clampExcerpt(excerpt, 4000)}\n"""\n` : ""}`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const gate = await guard(req, { feature: "ai_material_descriptions", audience: "admin" });
  if (!gate.ok) return gate.response;
  const { service } = gate;

  try {
    const body = await req.json().catch(() => ({}));
    const action = String(body?.action ?? "describe");
    const meta: MaterialMeta = {
      title: body?.title ? String(body.title) : "",
      courseName: body?.courseName ? String(body.courseName) : "",
      materialType: body?.materialType ? String(body.materialType) : "",
      fileType: body?.fileType ? String(body.fileType) : "",
    };
    const excerpt = String(body?.excerpt ?? "");

    if (!meta.title) return json({ error: "A title is needed to describe anything." }, 400);

    if (action === "describe") {
      const result = await runChain(service, describePrompt(meta, excerpt), {
        // An answer that survives being tidied to a sentence is the only one
        // worth taking; anything else is treated as that provider failing so
        // the chain moves on.
        accept: (raw) => tidy(raw).length >= 20,
        maxTokens: 300,
      });
      if (!result.text) return chainFailureResponse(result.failures, result.configured);

      return json({
        description: tidy(result.text),
        provider: result.provider,
        model: result.model,
        usage: gate.usage,
      });
    }

    if (action === "tags") {
      // The vocabulary is the school's own, read fresh: a tag added by hand
      // last week should be available to the model this week.
      const { data } = await service
        .from("course_materials")
        .select("tags")
        .not("tags", "is", null)
        .limit(1000);

      const vocabulary = [
        ...new Set(
          ((data ?? []) as { tags: string[] | null }[])
            .flatMap((row) => row.tags ?? [])
            .map((tag) => tag.trim())
            .filter(Boolean),
        ),
      ].slice(0, MAX_VOCABULARY);

      // With no vocabulary there is nothing to choose from, and inventing one
      // is exactly what this action refuses to do. Say so rather than calling a
      // model to be told the same thing.
      if (vocabulary.length === 0) {
        return json({
          tags: [],
          note:
            "No tags exist yet to choose from. Add a few by hand on any material and this can then file the rest against them.",
        });
      }

      const lookup = new Map(vocabulary.map((tag) => [tag.toLowerCase(), tag]));
      const parse = (raw: string): string[] | null => {
        const parsed = extractJson<unknown>(raw);
        if (!Array.isArray(parsed)) return null;
        // The second enforcement. Whatever the model returned, only tags that
        // exist survive, in the school's own spelling of them.
        return [
          ...new Set(
            parsed
              .map((item) => lookup.get(String(item).trim().toLowerCase()))
              .filter((tag): tag is string => !!tag),
          ),
        ].slice(0, MAX_TAGS);
      };

      const result = await runChain(service, tagsPrompt(meta, vocabulary, excerpt), {
        accept: (raw) => parse(raw) !== null,
        maxTokens: 300,
      });
      if (!result.text) return chainFailureResponse(result.failures, result.configured);

      const tags = parse(result.text) ?? [];
      return json({
        tags,
        note: tags.length ? undefined : "Nothing on the school's tag list fitted this resource.",
        provider: result.provider,
        model: result.model,
        usage: gate.usage,
      });
    }

    return json({ error: `Unknown action "${action}".` }, 400);
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : String(err) }, 500);
  }
});
