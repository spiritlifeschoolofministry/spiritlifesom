import { describe, expect, it } from 'vitest';
import {
  credentialsEmail,
  credentialsWhatsApp,
} from '../../supabase/functions/_shared/mailbox-delivery';

/**
 * The two messages that carry a password out of the building.
 *
 * Imported from the Deno tree like the other shared modules. Only the pure
 * template functions are exercised -- `deliverCredentials` talks to Resend and
 * the WhatsApp gateway, and is not something to fake convincingly in a unit
 * test.
 *
 * Two things are actually worth protecting here. The password has to survive
 * the template intact, because a mangled one is a support call that looks like
 * a server fault. And a name has to be escaped before it reaches the HTML,
 * because names are user-supplied and a broken template would, at best, send a
 * student an unreadable email about their own password.
 */
const PASSWORD = 'Kx7mQp2rTnVb4wZa';
const ADDRESS = 'olaopa.michael@spiritlifesom.org';

describe('credentialsEmail', () => {
  it('carries the address and password through unchanged', () => {
    const { html } = credentialsEmail('Olaopa Michael', ADDRESS, PASSWORD);
    expect(html).toContain(ADDRESS);
    expect(html).toContain(PASSWORD);
  });

  it('says plainly that the password must be changed', () => {
    const { html, subject } = credentialsEmail('Olaopa Michael', ADDRESS, PASSWORD);
    expect(subject).toBeTruthy();
    expect(html).toMatch(/change this password/i);
  });

  it('escapes the name rather than letting it into the markup', () => {
    // Not a realistic attack -- an admin would have to type it into a profile
    // -- but an unescaped apostrophe or ampersand in an ordinary Nigerian name
    // is realistic, and that is the same bug.
    const { html } = credentialsEmail('<script>alert(1)</script>', ADDRESS, PASSWORD);
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('&lt;script&gt;');
  });

  it('escapes a password containing HTML-significant characters', () => {
    // generatePassword cannot currently produce one, but the template must not
    // depend on that: the day it does, the password would silently break.
    const { html } = credentialsEmail('Jane Doe', ADDRESS, 'a&b<c>d"e');
    expect(html).toContain('a&amp;b&lt;c&gt;d&quot;e');
  });

  it('greets by first name', () => {
    expect(credentialsEmail('Olaopa Michael', ADDRESS, PASSWORD).html).toContain('Hello Olaopa');
  });
});

describe('credentialsWhatsApp', () => {
  it('carries the address and password, and is plain text', () => {
    const text = credentialsWhatsApp('Olaopa Michael', ADDRESS, PASSWORD);
    expect(text).toContain(ADDRESS);
    expect(text).toContain(PASSWORD);
    expect(text).not.toContain('<');
  });

  it('tells them to change it', () => {
    expect(credentialsWhatsApp('Jane Doe', ADDRESS, PASSWORD)).toMatch(/change this password/i);
  });

  it('copes with a one-word name', () => {
    expect(credentialsWhatsApp('Prince', ADDRESS, PASSWORD)).toContain('Hello Prince');
  });
});
