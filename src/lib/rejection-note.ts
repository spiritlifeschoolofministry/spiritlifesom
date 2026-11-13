/**
 * payments.admin_notes also holds the note the student typed when they
 * submitted the receipt. A rejection reason is added after it instead of
 * replacing it, so neither is lost.
 */
export function withRejectionReason(existing: string | null | undefined, reason: string): string {
  const note = (existing ?? "").trim();
  const line = `Rejected: ${reason.trim()}`;
  return note ? `${note}\n\n${line}` : line;
}
