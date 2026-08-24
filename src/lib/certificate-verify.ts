import { supabase } from "@/integrations/supabase/client";
import { normaliseSerial } from "@/lib/certificate-serial";

export type CertificateVerification =
  | { found: false }
  | {
      found: true;
      status: "valid" | "revoked";
      serial: string;
      recipient_name: string | null;
      student_code: string | null;
      cohort: string | null;
      issued_on: string | null;
      graduated_on: string | null;
      revoked_on: string | null;
      revoke_reason: string | null;
    };

/**
 * Looks a certificate up by serial.
 *
 * Goes through a database function rather than a table read: the serial is the
 * only thing a stranger has, so a readable table would mean letting the public
 * SELECT it, and that is a downloadable list of every graduate.
 */
export const verifyCertificate = async (serial: string): Promise<CertificateVerification> => {
  const { data, error } = await supabase.rpc("verify_certificate", {
    p_serial: normaliseSerial(serial),
  });

  if (error) throw error;
  return (data ?? { found: false }) as CertificateVerification;
};
