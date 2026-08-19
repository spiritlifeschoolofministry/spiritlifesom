/**
 * Edge functions answer failures with a JSON `error` and a non-2xx status, but
 * supabase-js only surfaces "Edge Function returned a non-2xx status code" and
 * drops `data` — so every considered refusal ("You have already submitted this
 * exam", "This exam has closed") reached the student as that one useless line.
 * The real message is in the unread Response hanging off the error's context.
 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export async function edgeErrorMessage(
  error: unknown,
  data: unknown,
  fallback: string,
): Promise<string> {
  if (isRecord(data) && typeof data.error === "string") return data.error;

  const context = isRecord(error) ? error.context : null;
  if (context instanceof Response) {
    const body: unknown = await context.clone().json().catch(() => null);
    if (isRecord(body) && typeof body.error === "string") return body.error;
  }

  const message = isRecord(error) && typeof error.message === "string" ? error.message : null;
  return message || fallback;
}
