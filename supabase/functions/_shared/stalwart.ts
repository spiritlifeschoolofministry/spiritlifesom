/**
 * The school's mail server, as far as the portal is concerned.
 *
 * Everything that knows Stalwart's HTTP shape is in this file, and deliberately
 * so. Stalwart 1.1's management API is not documented, so the shapes below were
 * read off the live server rather than guessed: its JMAP session advertises
 * `apiUrl`, and its own admin console is driven by a schema served from
 * `/api/schema`, which names every object type and property. What that showed:
 *
 *   - The endpoint is the JMAP `apiUrl` (`/jmap/`), not a separate REST API.
 *     `/api/principal`, `/api/accounts` and friends do not exist on 1.1.
 *   - Management objects are ordinary JMAP types under the `urn:stalwart:jmap`
 *     capability, named with an `x:` prefix -- `x:Account/query`, `x:Account/get`,
 *     `x:Account/set`. Plain `Account/get` is an unknownMethod.
 *   - `x:` types address the session's **primary** account id, which is why
 *     `primaryAccountId()` below reads the session rather than assuming a value.
 *   - **List-valued properties are maps keyed "0", "1", … on the wire, not JSON
 *     arrays.** The server returns `aliases` and `credentials` that way and
 *     expects them back that way; this is also why the handover's CLI examples
 *     are written `credentials={"0":{...}}`. Sending an array is the single
 *     easiest way to break this file.
 *
 * `STALWART_API_PATH` and `STALWART_API_URN` stay overridable so a server
 * upgrade that moves either one is a secret change rather than a deploy.
 *
 * ---------------------------------------------------------------------------
 * On secrets: STALWART_API_KEY belongs to a service account with the Admin
 * role, because Stalwart 1.1 has no narrower one. It can create and delete any
 * account on the server, so it lives only in the edge function's environment
 * and must never reach the browser bundle.
 */

/**
 * Deno's globals are not in the browser tsconfig that type-checks `src/`, and
 * `src/test/mailbox-naming.test.ts` deliberately imports this file so the
 * naming rules are tested as they actually run. This narrow declaration is
 * what lets one file be type-checked by both programs; the runtime is still
 * Deno, and `readConfig()` is the only thing that touches it.
 */
declare const Deno: { env: { get(key: string): string | undefined } };

/** An `x:Account` of variant `User`, as the server returns it. */
export interface StalwartAccount {
  id: string;
  name: string;
  domainId?: string | null;
  description?: string | null;
  emailAddress?: string | null;
  quotas?: Record<string, number> | null;
}

export interface StalwartConfig {
  url: string;
  apiKey: string;
  domainId: string;
  apiPath: string;
  urn: string;
}

/**
 * Addresses the server already answers to, which no student may be given.
 *
 * `admin` is the school's own mailbox and the other four are aliases onto it
 * (see the handover). Creating an account with one of these names would either
 * be refused by Stalwart or, worse, shadow the alias and divert the school's
 * own incoming mail.
 */
export const RESERVED_LOCAL_PARTS = new Set([
  "admin", "info", "contact", "hello", "postmaster",
  // Not currently configured, but reserved by convention and by RFC 2142 --
  // handing "abuse@" or "webmaster@" to a student is a problem later.
  "abuse", "webmaster", "hostmaster", "noreply", "no-reply", "support",
  "mail", "mailer-daemon", "root", "security", "billing", "accounts",
]);

export const DEFAULT_QUOTA_BYTES = 2 * 1024 * 1024 * 1024; // 2 GB

export const readConfig = (): StalwartConfig => {
  const url = (Deno.env.get("STALWART_URL") || "").replace(/\/+$/, "");
  const apiKey = Deno.env.get("STALWART_API_KEY") || "";
  const domainId = Deno.env.get("STALWART_MAIL_DOMAIN_ID") || "";
  if (!url || !apiKey || !domainId) {
    throw new Error(
      "Mail server is not configured. STALWART_URL, STALWART_API_KEY and STALWART_MAIL_DOMAIN_ID must all be set.",
    );
  }
  return {
    url,
    apiKey,
    domainId,
    // The JMAP apiUrl the live session advertises. Trailing slash matters.
    apiPath: Deno.env.get("STALWART_API_PATH") || "/jmap/",
    // The capability that unlocks the x:* management types.
    urn: Deno.env.get("STALWART_API_URN") || "urn:stalwart:jmap",
  };
};

/**
 * The name part of an address, from a person's name.
 *
 * `firstname.lastname`, as the handover settles on. First and last are taken
 * separately because that is how `profiles` stores them -- splitting a joined
 * string would have to guess which of three words is the surname, and a middle
 * name does not belong in an address people read aloud.
 *
 * Accents are folded rather than stripped, so a student whose name carries accents gets
 * `adebayo` and not `adby`. Spaces and apostrophes inside a single name close
 * up (`O'Brien` -> `obrien`, `de Souza` -> `desouza`), which keeps the one dot
 * in the address meaning "first name ends here".
 */
const nameToken = (value: string | null | undefined): string =>
  String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");

export const localPartFromName = (
  firstName: string | null | undefined,
  lastName: string | null | undefined,
): string => {
  const first = nameToken(firstName);
  const last = nameToken(lastName);
  if (first && last) return `${first}.${last}`.slice(0, 64);
  // One name on file is common enough to handle rather than refuse; the admin
  // can always type the address they want instead.
  return (first || last).slice(0, 64);
};

export interface LocalPartCheck {
  ok: boolean;
  reason?: string;
}

/**
 * Whether a name may be used at all -- the same rule the database CHECK
 * enforces, so a bad name is refused with a sentence instead of a constraint
 * violation.
 */
export const checkLocalPart = (localPart: string): LocalPartCheck => {
  const value = String(localPart || "").trim().toLowerCase();
  if (!value) return { ok: false, reason: "An address name is required." };
  if (value.length < 2) return { ok: false, reason: "The address name is too short." };
  if (value.length > 64) return { ok: false, reason: "The address name is too long (64 characters maximum)." };
  if (!/^[a-z0-9]+([._-][a-z0-9]+)*$/.test(value)) {
    return {
      ok: false,
      reason: "Use lowercase letters, numbers, and single dots, dashes or underscores between them.",
    };
  }
  if (RESERVED_LOCAL_PARTS.has(value)) {
    return { ok: false, reason: `${value}@ is reserved for the school's own mail.` };
  }
  return { ok: true };
};

/**
 * An initial password nobody has to read out twice.
 *
 * Generated from the platform CSPRNG, and from an alphabet with the characters
 * people mistake for one another removed (no O/0, l/1/I). An admin reads this
 * to a student once; a password that is strong but gets typed wrong four times
 * is a support call, not security.
 */
export const generatePassword = (length = 16): string => {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
  const bytes = new Uint32Array(length);
  crypto.getRandomValues(bytes);
  // Modulo bias across a 2^32 range into a 57-character alphabet is far below
  // anything that matters for a 16-character password changed on first login.
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join("");
};

/** What the mail server said, when it said no. */
export class StalwartError extends Error {
  readonly status: number;
  readonly body: string;
  constructor(message: string, status: number, body: string) {
    super(message);
    this.name = "StalwartError";
    this.status = status;
    this.body = body;
  }
}

const REQUEST_TIMEOUT_MS = 20_000;

/** The management object type. The `x:` prefix is not decoration -- see above. */
const ACCOUNT = "x:Account";

/** `quotas` is a map keyed by the StorageQuota enum; this is the disk one. */
const DISK_QUOTA_KEY = "maxDiskQuota";

/**
 * A list-valued property, in the shape the server actually speaks.
 *
 * JMAP arrays would be the obvious guess and are wrong: Stalwart returns
 * `aliases` and `credentials` as `{"0": …, "1": …}` and expects the same back.
 */
const asIndexedMap = <T>(items: T[]): Record<string, T> =>
  Object.fromEntries(items.map((item, i) => [String(i), item]));

/** A password credential, as `x:PasswordCredential` defines it. */
const passwordCredentials = (secret: string) =>
  asIndexedMap([{ "@type": "Password", secret }]);

const jmapFetch = async (
  config: StalwartConfig,
  path: string,
  init: RequestInit,
): Promise<unknown> => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  let response: Response;
  try {
    response = await fetch(`${config.url}${path}`, {
      ...init,
      headers: {
        "Authorization": `Bearer ${config.apiKey}`,
        "Accept": "application/json",
        ...(init.headers ?? {}),
      },
      signal: controller.signal,
    });
  } catch (error) {
    const reason = error instanceof Error && error.name === "AbortError"
      ? "The mail server did not answer in time."
      : `The mail server could not be reached: ${error instanceof Error ? error.message : String(error)}`;
    throw new StalwartError(reason, 0, "");
  } finally {
    clearTimeout(timer);
  }

  const text = await response.text();
  if (!response.ok) {
    throw new StalwartError(
      response.status === 401 || response.status === 403
        ? "The mail server rejected the portal's API key."
        : `The mail server returned ${response.status}.`,
      response.status,
      text.slice(0, 1000),
    );
  }
  try {
    return text ? JSON.parse(text) : null;
  } catch {
    throw new StalwartError("The mail server's reply was not JSON.", response.status, text.slice(0, 1000));
  }
};

/**
 * The account id every `x:` call is addressed to.
 *
 * Not a constant: it is the session's *primary* account, which the server
 * assigns and which differs between deployments (and after a restore). The
 * session is cheap and effectively static, so it is fetched once per isolate
 * and kept -- but never baked into a secret, where it would go stale silently.
 */
let primaryAccountCache: string | null = null;

export const primaryAccountId = async (config: StalwartConfig): Promise<string> => {
  if (primaryAccountCache) return primaryAccountCache;
  const session = await jmapFetch(config, "/.well-known/jmap", { method: "GET" }) as {
    primaryAccounts?: Record<string, string>;
  };
  const id = session?.primaryAccounts?.[config.urn] ??
    Object.values(session?.primaryAccounts ?? {})[0];
  if (!id) {
    throw new StalwartError("The mail server's session named no account to manage.", 0, "");
  }
  primaryAccountCache = id;
  return id;
};

/**
 * One JMAP method call, with the per-method error unwrapped.
 *
 * JMAP answers 200 even when the method failed -- the failure is a
 * `["error", …]` entry in methodResponses. Returning that as success is the
 * bug this function exists to prevent.
 */
export const stalwartCall = async (
  config: StalwartConfig,
  method: string,
  args: Record<string, unknown>,
): Promise<Record<string, unknown>> => {
  const accountId = await primaryAccountId(config);
  const payload = await jmapFetch(config, config.apiPath, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      using: ["urn:ietf:params:jmap:core", config.urn],
      methodCalls: [[method, { accountId, ...args }, "c0"]],
    }),
  }) as { methodResponses?: unknown[] };

  const responses = payload?.methodResponses;
  if (!Array.isArray(responses) || responses.length === 0) {
    throw new StalwartError("The mail server sent no answer to the request.", 200, "");
  }
  const [name, result] = responses[0] as [string, Record<string, unknown>];
  if (name === "error") {
    throw new StalwartError(
      String(result?.description || result?.type || "The mail server refused the request."),
      200,
      JSON.stringify(result).slice(0, 1000),
    );
  }
  return result ?? {};
};

/** The ids of every account on the server. */
export const listAccounts = async (config: StalwartConfig): Promise<unknown> =>
  await stalwartCall(config, `${ACCOUNT}/query`, {});

/** Full records for the given account ids. */
export const getAccounts = async (
  config: StalwartConfig,
  ids: string[],
): Promise<StalwartAccount[]> => {
  const result = await stalwartCall(config, `${ACCOUNT}/get`, { ids });
  return (result?.list as StalwartAccount[]) ?? [];
};

/** Turns a `notCreated` / `notUpdated` / `notDestroyed` entry into a sentence. */
const refusal = (entry: unknown, fallback: string): StalwartError => {
  const e = entry as { description?: string; type?: string } | undefined;
  return new StalwartError(
    String(e?.description || e?.type || fallback),
    200,
    JSON.stringify(entry).slice(0, 1000),
  );
};

/**
 * What Stalwart calls a role, and what it actually means here.
 *
 * "User" is an ordinary mailbox: this person's own mail and nothing else.
 * "Admin" is the whole mail server -- it can read, alter and delete every
 * other account on it, the school's own admin@ included. There is no middle
 * setting; Stalwart 1.1 offers these two and a Custom role the portal does not
 * expose. So this is never inferred and never defaulted from somebody's role
 * in the portal: being an administrator of the school is not the same as
 * being an administrator of its mail server.
 */
export type AccountRole = "User" | "Admin";

export interface CreateAccountArgs {
  localPart: string;
  password: string;
  description: string;
  quotaBytes?: number;
  /** Defaults to an ordinary user. Granting Admin must always be explicit. */
  role?: AccountRole;
}

/**
 * A new mailbox, returning Stalwart's id for it.
 *
 * `roles` is set explicitly and is the most important line here. Both accounts
 * that existed on this server before the portal did carry `{"@type":"Admin"}`,
 * and a student account that inherited that could read and delete every other
 * mailbox on the server. It is never left to a default: absent an explicit
 * choice this sends "User", so the dangerous value can only ever arrive by
 * someone asking for it.
 */
export const createAccount = async (
  config: StalwartConfig,
  args: CreateAccountArgs,
): Promise<string> => {
  const result = await stalwartCall(config, `${ACCOUNT}/set`, {
    create: {
      new: {
        "@type": "User",
        name: args.localPart,
        domainId: config.domainId,
        description: args.description,
        roles: { "@type": args.role ?? "User" },
        credentials: passwordCredentials(args.password),
        quotas: { [DISK_QUOTA_KEY]: args.quotaBytes ?? DEFAULT_QUOTA_BYTES },
      },
    },
  });

  const notCreated = (result?.notCreated as Record<string, unknown>)?.new;
  if (notCreated) throw refusal(notCreated, "The mail server refused to create the account.");

  const created = (result?.created as Record<string, { id?: string }>)?.new;
  if (!created?.id) {
    throw new StalwartError(
      "The mail server did not say whether the account was created.",
      200,
      JSON.stringify(result).slice(0, 1000),
    );
  }
  return created.id;
};

/**
 * Grants or withdraws server administration on an existing account.
 *
 * Separate from the password reset because it is a different kind of act: one
 * returns someone to their own mailbox, the other hands them every mailbox in
 * the school. Keeping them apart means neither can be done by accident while
 * meaning to do the other.
 */
export const setAccountRole = async (
  config: StalwartConfig,
  accountId: string,
  role: AccountRole,
): Promise<void> => {
  const result = await stalwartCall(config, `${ACCOUNT}/set`, {
    update: { [accountId]: { roles: { "@type": role } } },
  });
  const notUpdated = (result?.notUpdated as Record<string, unknown>)?.[accountId];
  if (notUpdated) throw refusal(notUpdated, "The mail server refused the role change.");
};

/** A new password on an existing account. Replaces the credential outright. */
export const setPassword = async (
  config: StalwartConfig,
  accountId: string,
  password: string,
): Promise<void> => {
  const result = await stalwartCall(config, `${ACCOUNT}/set`, {
    update: { [accountId]: { credentials: passwordCredentials(password) } },
  });
  const notUpdated = (result?.notUpdated as Record<string, unknown>)?.[accountId];
  if (notUpdated) throw refusal(notUpdated, "The mail server refused the password change.");
};

/**
 * Deletes the account, and with it the mail it holds.
 *
 * Stalwart has no "disable and keep" on this path, so the portal says plainly
 * what this does before asking an admin to confirm it.
 */
export const deleteAccount = async (config: StalwartConfig, accountId: string): Promise<void> => {
  const result = await stalwartCall(config, `${ACCOUNT}/set`, { destroy: [accountId] });
  const notDestroyed = (result?.notDestroyed as Record<string, unknown>)?.[accountId];
  if (notDestroyed) throw refusal(notDestroyed, "The mail server refused the deletion.");
};

/**
 * A read-only call whose answer is reported verbatim.
 *
 * Wired to an admin-only action in mailbox-admin so that "is the mail server
 * reachable, and does the portal's key still work" can be answered without
 * creating a real mailbox to find out. It never changes anything.
 */
export const probe = async (config: StalwartConfig): Promise<{ ok: boolean; detail: string }> => {
  try {
    const result = await listAccounts(config) as { ids?: string[] };
    const count = result?.ids?.length ?? 0;
    return { ok: true, detail: `${count} account${count === 1 ? "" : "s"} on the server.` };
  } catch (error) {
    if (error instanceof StalwartError) {
      return { ok: false, detail: `${error.message} ${error.body}`.trim().slice(0, 2000) };
    }
    return { ok: false, detail: error instanceof Error ? error.message : String(error) };
  }
};
