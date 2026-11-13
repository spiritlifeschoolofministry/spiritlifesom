/** Wording shared by the receipt queue on Fees and Payments. */

export const paymentTypeLabel = (type: string | null | undefined, long = false) => {
  if (type === 'FULL') return long ? 'Full payment, settles this fee' : 'Full';
  if (type === 'PART') return long ? 'Part payment, an instalment' : 'Part';
  return 'Not stated';
};

/** "Today, 10:14" / "Yesterday" / "3 days ago" / a date. */
export const submittedLabel = (iso: string | null | undefined) => {
  if (!iso) return 'No date';
  const d = new Date(iso);
  const start = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const days = Math.round((start(new Date()) - start(d)) / 86_400_000);
  if (days <= 0) return `Today, ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days} days ago`;
  return d.toLocaleDateString();
};
