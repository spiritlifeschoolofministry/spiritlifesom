import { describe, expect, it } from 'vitest';
import {
  RESERVED_LOCAL_PARTS,
  checkLocalPart,
  generatePassword,
  localPartFromName,
} from '../../supabase/functions/_shared/stalwart';

/**
 * The part of the mailbox integration that can be tested without a mail server.
 *
 * Imported straight out of the Deno tree. `stalwart.ts` only touches `Deno.env`
 * inside `readConfig()`, never at module scope, so everything below is the code
 * that actually runs in production rather than a copy of it.
 *
 * What these are really protecting is two decisions that are expensive to undo.
 * An address, once issued, is on a student's CV and in other people's address
 * books; the portal will not reissue it and cannot rename it. And a name that
 * slips past `checkLocalPart` is either refused by Stalwart with an error no
 * admin can act on, or -- for the reserved names -- quietly shadows the
 * school's own incoming mail.
 */
describe('localPartFromName', () => {
  it('is firstname.lastname', () => {
    expect(localPartFromName('Jane', 'Doe')).toBe('jane.doe');
  });

  it('folds accents rather than dropping the letters', () => {
    // Stripping instead of folding gave "adby", which is nobody's name.
    expect(localPartFromName('Adébáyò', 'Olúwáségun')).toBe('adebayo.oluwasegun');
  });

  it('closes up spaces and apostrophes inside a single name', () => {
    // The one dot has to keep meaning "the first name ends here".
    expect(localPartFromName("O'Brien", 'de Souza')).toBe('obrien.desouza');
    expect(localPartFromName('Mary-Jane', 'Smith')).toBe('maryjane.smith');
  });

  it('handles one name on file without inventing the other half', () => {
    expect(localPartFromName('Prince', null)).toBe('prince');
    expect(localPartFromName(null, 'Okafor')).toBe('okafor');
    expect(localPartFromName(null, null)).toBe('');
    expect(localPartFromName('   ', '')).toBe('');
  });

  it('never produces something the validator would reject', () => {
    const names: Array<[string, string]> = [
      ['Jane', 'Doe'],
      ['Adébáyò', 'Olúwáségun'],
      ["O'Brien", 'de Souza'],
      ['Mary-Jane', 'Smith'],
      ['Ndidi  ', '  Eze'],
    ];
    for (const [first, last] of names) {
      expect(checkLocalPart(localPartFromName(first, last)).ok).toBe(true);
    }
  });

  it('stays within the 64 characters the column allows', () => {
    const long = localPartFromName('A'.repeat(60), 'B'.repeat(60));
    expect(long.length).toBeLessThanOrEqual(64);
  });
});

describe('checkLocalPart', () => {
  it('accepts the shapes a school actually issues', () => {
    for (const value of ['jane.doe', 'jdoe', 'mary-jane.smith', 'tunde_ade', 'student2024']) {
      expect(checkLocalPart(value).ok).toBe(true);
    }
  });

  it('refuses the school\'s own addresses and the RFC 2142 names', () => {
    // These either already deliver to admin@ or will be wanted later; handing
    // one to a student diverts mail nobody would think to look for.
    for (const value of ['admin', 'info', 'contact', 'hello', 'postmaster', 'abuse', 'webmaster']) {
      expect(RESERVED_LOCAL_PARTS.has(value)).toBe(true);
      expect(checkLocalPart(value).ok).toBe(false);
    }
  });

  it('refuses anything the database CHECK would also refuse', () => {
    // Kept in step with mailboxes_local_part_shape by hand, so a divergence
    // shows up here rather than as a constraint violation in front of an admin.
    const bad = [
      // Uppercase is deliberately absent: checkLocalPart lowercases what it is
      // handed (see the last test in this block), so 'JANE.DOE' is accepted.
      '', 'a', '.jane', 'jane.', 'jane..doe', 'jane doe',
      'jane@doe', 'jane+tag', 'jane#doe', '-jane', 'jane-', 'a'.repeat(65),
    ];
    for (const value of bad) {
      expect(checkLocalPart(value).ok, `${value} should be refused`).toBe(false);
    }
  });

  it('gives a reason an admin can act on', () => {
    expect(checkLocalPart('Jane Doe').reason).toMatch(/lowercase/i);
    expect(checkLocalPart('admin').reason).toMatch(/reserved/i);
    expect(checkLocalPart('a').reason).toMatch(/short/i);
  });

  it('is case- and whitespace-forgiving about what it is handed', () => {
    // The edge function lowercases before calling, but the page may not.
    expect(checkLocalPart('  Jane.Doe  ').ok).toBe(true);
  });
});

describe('generatePassword', () => {
  it('avoids the characters people mistake when reading one out', () => {
    const joined = Array.from({ length: 40 }, () => generatePassword()).join('');
    expect(joined).not.toMatch(/[0O1lI]/);
  });

  it('is the requested length and does not repeat itself', () => {
    expect(generatePassword().length).toBe(16);
    expect(generatePassword(24).length).toBe(24);
    const seen = new Set(Array.from({ length: 200 }, () => generatePassword()));
    expect(seen.size).toBe(200);
  });
});
