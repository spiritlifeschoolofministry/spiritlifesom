import { useEffect } from "react";
import {
  BODY,
  CERTIFICATE_HEIGHT,
  CERTIFICATE_WIDTH,
  CREAM,
  NAVY,
  RED,
  SCRIPT,
  SERIF,
  loadCertificateFonts,
  type CertificateArtworkProps,
  type CertificateSignatory,
} from "@/lib/certificate-design";

/**
 * The certificate itself, at its true print size. Nothing in here is
 * responsive on purpose -- see the note on CERTIFICATE_WIDTH.
 */
export const CertificateArtwork = ({
  recipientName,
  studentCode,
  dateText,
  mainText,
  subText,
  signatories,
}: CertificateArtworkProps) => {
  useEffect(() => {
    void loadCertificateFonts();
  }, []);

  const [left, right] = signatories;

  return (
    <div
      style={{
        position: "relative",
        width: CERTIFICATE_WIDTH,
        height: CERTIFICATE_HEIGHT,
        overflow: "hidden",
        background: CREAM,
        flex: "none",
      }}
    >
      {/* Ivory paper ground with a faint warm sheen */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          background:
            "radial-gradient(120% 90% at 15% 10%, #fffdf6 0%, #fdf9ec 45%, #f7f1de 100%)",
        }}
      />

      {/* Cream ribbon sweeping out of the top-left corner */}
      <svg
        style={{ position: "absolute", top: 0, left: 0, width: 472, height: 175 }}
        viewBox="0 0 700 260"
        preserveAspectRatio="none"
      >
        <path
          d="M0,0 H660 C440,26 210,74 70,158 C38,180 14,212 0,236 Z"
          fill="#f3ead4"
          opacity="0.75"
        />
        <path
          d="M0,0 H430 C300,22 160,58 66,124 C36,146 14,176 0,198 Z"
          fill="#ece0c0"
          opacity="0.6"
        />
        {Array.from({ length: 6 }).map((_, i) => (
          <path
            key={i}
            d={`M0,${34 + i * 30} C170,${16 + i * 26} 400,${-4 + i * 22} 660,${-44 + i * 20}`}
            fill="none"
            stroke="#e0d2ab"
            strokeWidth="3"
            opacity={0.55 - i * 0.06}
          />
        ))}
      </svg>

      {/* Matching whisper of ribbon in the bottom-right corner */}
      <svg
        style={{ position: "absolute", bottom: 0, right: 0, width: 382, height: 127 }}
        viewBox="0 0 560 200"
        preserveAspectRatio="none"
      >
        {Array.from({ length: 4 }).map((_, i) => (
          <path
            key={i}
            d={`M560,${170 - i * 26} C380,${190 - i * 22} 170,${196 - i * 18} 0,${210 - i * 16}`}
            fill="none"
            stroke="#e6dabb"
            strokeWidth="3"
            opacity={0.4 - i * 0.07}
          />
        ))}
      </svg>

      {/* Layered purple-to-magenta ribbon fan, bottom-left corner */}
      <svg
        style={{ position: "absolute", bottom: 0, left: 0, width: 290, height: 205 }}
        viewBox="0 0 460 340"
        preserveAspectRatio="none"
      >
        <path d="M0,26 C150,110 285,225 360,340 L0,340 Z" fill="#3a1878" />
        <path d="M0,96 C140,168 250,258 306,340 L0,340 Z" fill="#7b28c4" />
        <path d="M0,158 C118,214 205,272 252,340 L0,340 Z" fill="#c4359f" />
        <path d="M0,214 C92,252 152,296 190,340 L0,340 Z" fill="#f4499f" />
        <path d="M0,272 C58,296 104,318 128,340 L0,340 Z" fill="#ff77bd" opacity="0.85" />
      </svg>

      {/* Gold medal with red rosette and ribbon tails, top-right */}
      <svg
        style={{ position: "absolute", top: 12, right: 39, width: 258, height: 323 }}
        viewBox="0 0 240 300"
      >
        <defs>
          <radialGradient id="certGoldOuter" cx="38%" cy="30%" r="75%">
            <stop offset="0%" stopColor="#f7e6a8" />
            <stop offset="45%" stopColor="#d7b558" />
            <stop offset="100%" stopColor="#9d7c26" />
          </radialGradient>
          <radialGradient id="certGoldInner" cx="42%" cy="34%" r="72%">
            <stop offset="0%" stopColor="#fbf1c8" />
            <stop offset="40%" stopColor="#dcbe66" />
            <stop offset="100%" stopColor="#b28f34" />
          </radialGradient>
        </defs>

        {/* Ribbon tails hanging below the medal */}
        <path d="M92,152 L58,296 L104,258 L112,164 Z" fill="#c62828" />
        <path d="M148,152 L182,296 L136,258 L128,164 Z" fill="#c62828" />
        <path d="M148,152 L164,220 L136,206 Z" fill="#a81f1f" opacity="0.5" />

        {/* Scalloped red rosette */}
        {Array.from({ length: 22 }).map((_, i) => {
          const a = (i * Math.PI * 2) / 22;
          return (
            <circle
              key={i}
              cx={120 + 78 * Math.cos(a)}
              cy={120 + 78 * Math.sin(a)}
              r="24"
              fill={i % 2 ? "#c0261f" : "#d63028"}
            />
          );
        })}
        <circle cx="120" cy="120" r="82" fill="#cf2a22" />

        {/* Gold discs */}
        <circle cx="120" cy="120" r="70" fill="url(#certGoldOuter)" />
        <circle cx="120" cy="120" r="62" fill="#b8912f" />
        <circle cx="120" cy="120" r="58" fill="url(#certGoldInner)" />

        {/* Brushed-metal spokes across the inner disc */}
        {Array.from({ length: 36 }).map((_, i) => {
          const a1 = (i * Math.PI * 2) / 36;
          const a2 = ((i + 0.5) * Math.PI * 2) / 36;
          return (
            <path
              key={i}
              d={`M120,120 L${120 + 58 * Math.cos(a1)},${120 + 58 * Math.sin(a1)} L${120 + 58 * Math.cos(a2)},${120 + 58 * Math.sin(a2)} Z`}
              fill={i % 2 ? "#c9a54a" : "#e6cd82"}
              opacity="0.18"
            />
          );
        })}
        <circle cx="120" cy="120" r="58" fill="url(#certGoldInner)" opacity="0.6" />
        <ellipse cx="98" cy="96" rx="26" ry="18" fill="#fdf4d2" opacity="0.2" />
      </svg>

      {/* Header: logo + school name */}
      <div
        style={{
          position: "absolute",
          left: 239,
          top: 39,
          display: "flex",
          alignItems: "center",
          gap: 16,
        }}
      >
        <div
          style={{
            width: 149,
            height: 149,
            borderRadius: "50%",
            background: "#ffffff",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flex: "none",
            boxShadow: "0 1px 5px rgba(0,0,0,0.08)",
          }}
        >
          <img
            src="/certificate-logo.png"
            alt="Spirit Life School of Ministry"
            style={{ width: 140, height: 140, objectFit: "contain", borderRadius: "50%" }}
          />
        </div>
        <h2
          style={{
            margin: 0,
            color: NAVY,
            fontFamily: SERIF,
            fontSize: 63,
            fontWeight: 900,
            lineHeight: 0.92,
            letterSpacing: "0.01em",
            textTransform: "uppercase",
            whiteSpace: "nowrap",
          }}
        >
          School of
          <br />
          Ministry
        </h2>
      </div>

      {/* Certificate of Completion */}
      <div style={{ position: "absolute", left: 0, right: 0, top: 276, textAlign: "center" }}>
        <span style={{ color: RED, fontFamily: SCRIPT, fontSize: 45, lineHeight: 1.2 }}>
          Certificate of Completion
        </span>
      </div>

      {/* Certify text */}
      <p
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          top: 345,
          margin: 0,
          textAlign: "center",
          color: "#4a4a4a",
          fontFamily: SERIF,
          fontSize: 19,
          fontWeight: 400,
        }}
      >
        This is to proudly certify that
      </p>

      {/* Student name + student code */}
      <div
        style={{
          position: "absolute",
          left: 90,
          right: 90,
          top: 421,
          display: "flex",
          alignItems: "baseline",
          justifyContent: "center",
          gap: 24,
        }}
      >
        <h1
          style={{
            margin: 0,
            fontFamily: SERIF,
            color: NAVY,
            fontSize: 56,
            fontWeight: 700,
            fontStyle: "italic",
            lineHeight: 1.1,
          }}
        >
          {recipientName}
        </h1>
        {studentCode && (
          <span
            style={{
              color: "#5f6470",
              fontFamily: SERIF,
              fontSize: 24,
              fontWeight: 700,
              fontStyle: "italic",
              whiteSpace: "nowrap",
            }}
          >
            {studentCode}
          </span>
        )}
      </div>

      {/* Diamond-tipped rule under the name */}
      <div
        style={{
          position: "absolute",
          left: 230,
          right: 230,
          top: 494,
          display: "flex",
          alignItems: "center",
        }}
      >
        <span
          style={{ width: 9, height: 9, background: NAVY, transform: "rotate(45deg)", flex: "none" }}
        />
        <span style={{ flex: 1, height: 2, background: NAVY }} />
        <span
          style={{ width: 9, height: 9, background: NAVY, transform: "rotate(45deg)", flex: "none" }}
        />
      </div>

      {/* Completion text */}
      <p
        style={{
          position: "absolute",
          left: 270,
          right: 270,
          top: 507,
          margin: 0,
          textAlign: "center",
          color: "#4a4a4a",
          fontFamily: BODY,
          fontSize: 22,
          lineHeight: 1.55,
        }}
      >
        {mainText}
        {subText && (
          <>
            <br />
            {subText}
          </>
        )}
      </p>

      {/* Date */}
      <p
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          top: 597,
          margin: 0,
          textAlign: "center",
          color: NAVY,
          fontFamily: SERIF,
          fontSize: 25,
          fontWeight: 700,
        }}
      >
        DATE: {dateText}
      </p>

      {/* Rolled diploma scroll between the signatures */}
      <svg
        style={{ position: "absolute", left: 513, top: 690, width: 96, height: 53 }}
        viewBox="0 0 200 110"
      >
        <defs>
          <linearGradient id="certScroll" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#f7dd9b" />
            <stop offset="55%" stopColor="#e6c063" />
            <stop offset="100%" stopColor="#c79f3f" />
          </linearGradient>
        </defs>
        <rect x="26" y="34" width="148" height="44" rx="6" fill="url(#certScroll)" />
        <path d="M40,44 H160 M40,56 H160 M40,68 H140" stroke="#c9a24a" strokeWidth="2" opacity="0.45" />
        <ellipse cx="28" cy="56" rx="15" ry="26" fill="#e8c470" stroke="#b8912f" strokeWidth="2" />
        <ellipse cx="28" cy="56" rx="6" ry="11" fill="#c79f3f" />
        <ellipse cx="172" cy="56" rx="15" ry="26" fill="#e8c470" stroke="#b8912f" strokeWidth="2" />
        <ellipse cx="172" cy="56" rx="6" ry="11" fill="#c79f3f" />
        <rect x="86" y="30" width="13" height="52" fill="#ef5b93" />
        <path d="M92,40 C72,20 60,34 78,44 Z" fill="#f4749f" />
        <path d="M94,40 C114,20 126,34 108,44 Z" fill="#f4749f" />
        <circle cx="93" cy="43" r="6" fill="#ef5b93" />
      </svg>

      {/* Signatories */}
      <div
        style={{
          position: "absolute",
          left: 200,
          right: 90,
          top: 711,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-end",
        }}
      >
        {[left, right].map((signatory, i) => (
          <SignatoryBlock key={i} signatory={signatory} />
        ))}
      </div>
    </div>
  );
};

/**
 * One signature column. A drawn signature sits above the name; the block
 * collapses to nothing rather than printing an empty rule if a cohort has only
 * one signatory configured.
 */
const SignatoryBlock = ({ signatory }: { signatory?: CertificateSignatory }) => {
  const name = signatory?.name?.trim();
  const title = signatory?.title?.trim();
  if (!name && !title && !signatory?.signatureUrl) return <div />;

  return (
    <div style={{ textAlign: "center", whiteSpace: "nowrap" }}>
      {signatory?.signatureUrl && (
        <img
          src={signatory.signatureUrl}
          alt=""
          // The signature overlaps the name slightly, the way a real one signed
          // above a printed name does.
          style={{
            display: "block",
            height: 54,
            margin: "0 auto -8px",
            objectFit: "contain",
          }}
        />
      )}
      {name && (
        <p
          style={{
            margin: 0,
            color: NAVY,
            fontFamily: SERIF,
            fontSize: 20,
            fontWeight: 700,
            textTransform: "uppercase",
          }}
        >
          {name}
        </p>
      )}
      {title && (
        <p
          style={{
            margin: 0,
            color: "#5f6672",
            fontFamily: SERIF,
            fontSize: 19,
            fontWeight: 400,
            letterSpacing: "0.04em",
            textTransform: "uppercase",
          }}
        >
          {title}
        </p>
      )}
    </div>
  );
};
