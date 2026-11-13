import { useCallback, useEffect, useState } from "react";
import LazyCertificate3D from "@/components/three/LazyCertificate3D";
import { useNavigate, useParams } from "react-router-dom";
import { Input } from "@/components/ui/input";
import { Check, Loader2, Search, ShieldAlert, ShieldX } from "lucide-react";
import SEO from "@/components/SEO";
import { normaliseSerial } from "@/lib/certificate-serial";
import { verifyCertificate, type CertificateVerification } from "@/lib/certificate-verify";

const formatDate = (value: string | null) =>
  value
    ? new Date(value).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })
    : null;

/**
 * Public certificate check. Someone holding a printed certificate types the
 * serial from its foot, or follows a link that already contains it.
 */
const VerifyCertificate = () => {
  const { serial: serialFromUrl } = useParams<{ serial: string }>();
  const navigate = useNavigate();

  const [entry, setEntry] = useState(serialFromUrl ?? "");
  const [checking, setChecking] = useState(false);
  const [result, setResult] = useState<CertificateVerification | null>(null);
  const [failed, setFailed] = useState(false);

  const check = useCallback(async (serial: string) => {
    setChecking(true);
    setFailed(false);
    setResult(null);
    try {
      setResult(await verifyCertificate(serial));
    } catch (err) {
      console.error("Certificate verification failed:", err);
      setFailed(true);
    } finally {
      setChecking(false);
    }
  }, []);

  // A serial in the URL checks itself, so a printed link needs no interaction.
  useEffect(() => {
    if (serialFromUrl) {
      setEntry(serialFromUrl);
      void check(serialFromUrl);
    }
  }, [serialFromUrl, check]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const serial = normaliseSerial(entry);
    if (!serial) return;
    // Put it in the URL so the result can be linked to and reloaded.
    if (serial !== serialFromUrl) navigate(`/verify/${encodeURIComponent(serial)}`);
    else void check(serial);
  };

  return (
    <div className="bg-background">
      <SEO
        title="Verify a Certificate | Spirit Life School of Ministry"
        description="Confirm that a Spirit Life School of Ministry certificate of completion is genuine by entering the certificate number printed on it."
        path="/verify"
        // Individual results are about a named person; they should not be indexed.
        noindex={Boolean(serialFromUrl)}
      />

      <div className="mx-auto flex max-w-[760px] flex-col gap-[22px] px-4 pb-[72px] pt-12 sm:px-6 sm:pt-14">
        <h1 className="text-[32px] font-extrabold tracking-tight sm:text-[40px]">Verify a certificate</h1>
        <p className="text-base leading-relaxed text-muted-foreground sm:text-[17px]">
          Enter the serial printed at the foot of the certificate (SLSM-XXXX-XXXX). Small typing slips are corrected
          for you, and a link that already contains the serial checks it straight away.
        </p>

        <form onSubmit={submit} className="flex flex-col gap-2.5 sm:flex-row">
          <label htmlFor="verify-serial" className="sr-only">Certificate serial number</label>
          <Input
            id="verify-serial"
            value={entry}
            onChange={(e) => setEntry(e.target.value)}
            placeholder="SLSM-XXXX-XXXX"
            className="h-[52px] min-w-0 flex-1 rounded-xl bg-card px-4 font-mono text-base uppercase tracking-wider md:text-base"
            autoFocus={!serialFromUrl}
            autoCapitalize="characters"
            spellCheck={false}
          />
          <button
            type="submit"
            disabled={checking || !entry.trim()}
            className="inline-flex h-[52px] items-center justify-center gap-2 rounded-xl bg-primary px-6 text-base font-bold text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            {checking ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Search className="h-4 w-4" aria-hidden="true" />}
            {checking ? "Checking..." : "Verify"}
          </button>
        </form>

        <div aria-live="polite" className="flex flex-col gap-[22px]">
          {failed && (
            <section className="flex flex-col gap-2 rounded-[20px] border border-border bg-card p-6">
              <StatusPill tone="neutral" icon={<ShieldAlert className="h-4 w-4" aria-hidden="true" />}>
                Could not check right now
              </StatusPill>
              <p className="text-[15px] text-muted-foreground">
                Something went wrong reaching our records. Please try again in a moment.
              </p>
            </section>
          )}

          {result && !result.found && (
            <section className="flex flex-col gap-2 rounded-[20px] border border-red-200 bg-card p-6 dark:border-red-500/30">
              <StatusPill tone="bad" icon={<ShieldX className="h-4 w-4" aria-hidden="true" />}>
                No certificate found
              </StatusPill>
              <p className="text-[15px] text-muted-foreground">
                No certificate has been issued with that number. Check the number as printed — the letters I, L, O
                and U are never used, so those are 1, 1, 0 and V.
              </p>
            </section>
          )}

          {result?.found && <VerificationResult result={result} />}
        </div>
      </div>
    </div>
  );
};

const pillTones = {
  good: "bg-emerald-50 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300",
  bad: "bg-red-50 text-red-800 dark:bg-red-500/15 dark:text-red-300",
  neutral: "bg-muted text-foreground",
} as const;

const StatusPill = ({
  tone,
  icon,
  children,
}: {
  tone: keyof typeof pillTones;
  icon: React.ReactNode;
  children: React.ReactNode;
}) => (
  <span className={`inline-flex items-center gap-2 self-start rounded-full px-3 py-1.5 text-sm font-bold ${pillTones[tone]}`}>
    {icon}
    {children}
  </span>
);

const VerificationResult = ({
  result,
}: {
  result: Extract<CertificateVerification, { found: true }>;
}) => {
  const revoked = result.status === "revoked";

  return (
    <section
      className={`flex flex-col gap-4 rounded-[20px] border bg-card p-6 ${
        revoked ? "border-red-200 dark:border-red-500/30" : "border-emerald-200 dark:border-emerald-500/30"
      }`}
    >
      {revoked ? (
        <>
          <StatusPill tone="bad" icon={<ShieldX className="h-4 w-4" aria-hidden="true" />}>
            This certificate has been withdrawn
          </StatusPill>
          <p className="text-[15px] text-muted-foreground">
            It was issued by the school but is no longer valid
            {result.revoked_on ? ` as of ${formatDate(result.revoked_on)}` : ""}.
            {result.revoke_reason ? ` ${result.revoke_reason}` : ""}
          </p>
        </>
      ) : (
        <StatusPill tone="good" icon={<Check className="h-4 w-4" strokeWidth={2.6} aria-hidden="true" />}>
          Valid certificate
        </StatusPill>
      )}

      {!revoked && (
        <LazyCertificate3D
          className="h-56 w-full sm:h-72"
          details={{ name: result.recipient_name ?? "", cohort: result.cohort, serial: result.serial, dateText: result.graduated_on ? formatDate(result.graduated_on) : null }}
        />
      )}

      <dl className="grid grid-cols-1 gap-x-6 gap-y-3.5 sm:grid-cols-2">
        <Field label="Awarded to" value={result.recipient_name} />
        <Field label="Cohort" value={result.cohort} />
        <Field label="Issued" value={formatDate(result.issued_on)} />
        <Field label="Graduated" value={formatDate(result.graduated_on)} />
        <Field label="Student code" value={result.student_code} mono />
        <Field label="Serial" value={result.serial} mono />
      </dl>
    </section>
  );
};

const Field = ({
  label,
  value,
  mono,
}: {
  label: string;
  value: string | null;
  mono?: boolean;
}) => {
  if (!value) return null;
  return (
    <div className="min-w-0">
      <dt className="text-xs font-bold uppercase tracking-[0.05em] text-muted-foreground">{label}</dt>
      <dd className={`mt-0.5 break-anywhere text-base font-semibold text-foreground ${mono ? "font-mono" : ""}`}>
        {value}
      </dd>
    </div>
  );
};

export default VerifyCertificate;
