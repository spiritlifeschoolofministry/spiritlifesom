import { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { BadgeCheck, Loader2, Search, ShieldAlert, ShieldX } from "lucide-react";
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
    <div>
      <SEO
        title="Verify a Certificate | Spirit Life School of Ministry"
        description="Confirm that a Spirit Life School of Ministry certificate of completion is genuine by entering the certificate number printed on it."
        path="/verify"
        // Individual results are about a named person; they should not be indexed.
        noindex={Boolean(serialFromUrl)}
      />

      <section className="relative py-16 sm:py-20 text-center text-primary-foreground">
        <div className="absolute inset-0 gradient-purple" />
        <div className="relative z-10 max-w-2xl mx-auto px-4 space-y-3">
          <h1 className="text-3xl sm:text-4xl font-extrabold">Verify a Certificate</h1>
          <p className="text-primary-foreground/80">
            Enter the certificate number printed at the foot of the certificate.
          </p>
        </div>
      </section>

      <section className="py-12 sm:py-16 px-4 bg-background">
        <div className="max-w-xl mx-auto space-y-6">
          <form onSubmit={submit} className="flex flex-col sm:flex-row gap-2">
            <Input
              value={entry}
              onChange={(e) => setEntry(e.target.value)}
              placeholder="SLSM-XXXX-XXXX"
              className="h-11 font-mono tracking-wider uppercase"
              aria-label="Certificate number"
              autoFocus={!serialFromUrl}
            />
            <Button type="submit" className="h-11 px-6 gap-2" disabled={checking || !entry.trim()}>
              {checking ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
              Verify
            </Button>
          </form>

          {failed && (
            <Card className="border-border">
              <CardContent className="py-8 text-center space-y-2">
                <ShieldAlert className="w-10 h-10 mx-auto text-muted-foreground/40" />
                <p className="font-semibold text-foreground">Could not check right now</p>
                <p className="text-sm text-muted-foreground">
                  Something went wrong reaching our records. Please try again in a moment.
                </p>
              </CardContent>
            </Card>
          )}

          {result && !result.found && (
            <Card className="border-destructive/30">
              <CardContent className="py-8 text-center space-y-2">
                <ShieldX className="w-10 h-10 mx-auto text-destructive/60" />
                <p className="font-semibold text-foreground">No certificate found</p>
                <p className="text-sm text-muted-foreground max-w-sm mx-auto">
                  No certificate has been issued with that number. Check the number as printed — the
                  letters I, L, O and U are never used, so those are 1, 1, 0 and V.
                </p>
              </CardContent>
            </Card>
          )}

          {result?.found && <VerificationResult result={result} />}

          {!result && !checking && !failed && (
            <p className="text-center text-sm text-muted-foreground">
              Certificate numbers look like <span className="font-mono">SLSM-4K7P-92XT</span>.
            </p>
          )}
        </div>
      </section>
    </div>
  );
};

const VerificationResult = ({
  result,
}: {
  result: Extract<CertificateVerification, { found: true }>;
}) => {
  const revoked = result.status === "revoked";

  return (
    <Card className={revoked ? "border-destructive/40" : "border-emerald-500/40"}>
      <CardContent className="py-8 space-y-6">
        <div className="text-center space-y-2">
          {revoked ? (
            <ShieldX className="w-12 h-12 mx-auto text-destructive" />
          ) : (
            <BadgeCheck className="w-12 h-12 mx-auto text-emerald-600" />
          )}
          <p className={`text-lg font-bold ${revoked ? "text-destructive" : "text-emerald-700"}`}>
            {revoked ? "This certificate has been withdrawn" : "Genuine certificate"}
          </p>
          {revoked && (
            <p className="text-sm text-muted-foreground">
              It was issued by the school but is no longer valid
              {result.revoked_on ? ` as of ${formatDate(result.revoked_on)}` : ""}.
              {result.revoke_reason ? ` ${result.revoke_reason}` : ""}
            </p>
          )}
        </div>

        <dl className="divide-y divide-border text-sm">
          <Field label="Awarded to" value={result.recipient_name} strong />
          <Field label="Student code" value={result.student_code} mono />
          <Field label="Session" value={result.cohort} />
          <Field label="Graduated" value={formatDate(result.graduated_on)} />
          <Field label="Certificate number" value={result.serial} mono />
        </dl>
      </CardContent>
    </Card>
  );
};

const Field = ({
  label,
  value,
  mono,
  strong,
}: {
  label: string;
  value: string | null;
  mono?: boolean;
  strong?: boolean;
}) => {
  if (!value) return null;
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-2 py-2.5">
      <dt className="text-muted-foreground">{label}</dt>
      <dd
        className={`text-right text-foreground break-anywhere ${mono ? "font-mono text-xs" : ""} ${
          strong ? "font-semibold" : ""
        }`}
      >
        {value}
      </dd>
    </div>
  );
};

export default VerifyCertificate;
