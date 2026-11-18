/** Matching an off-portal mailbox holder to a portal account that registered later. */

export interface LinkCandidate {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  role: string;
}

export interface OffPortalMailbox {
  id: string;
  address: string;
  holder_name: string | null;
  holder_email: string | null;
  holder_phone: string | null;
}

/** The last ten digits, which is what Nigerian numbers share in every format. */
const phoneKey = (v: string | null | undefined) => {
  const d = String(v ?? "").replace(/\D/g, "");
  return d.length >= 10 ? d.slice(-10) : "";
};

/**
 * Whether a portal account is probably the same person as an off-portal
 * holder: same personal email, or same phone number. A suggestion only --
 * the admin still picks and confirms.
 */
export const isLikelyMatch = (m: OffPortalMailbox, p: LinkCandidate) => {
  const email = (m.holder_email ?? "").trim().toLowerCase();
  if (email && email === (p.email ?? "").trim().toLowerCase()) return true;
  const phone = phoneKey(m.holder_phone);
  return !!phone && phone === phoneKey(p.phone);
};
