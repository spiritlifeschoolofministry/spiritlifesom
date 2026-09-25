import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  ArrowLeft,
  Bot,
  Loader2,
  MessageSquare,
  RefreshCw,
  Search,
  UserRound,
} from 'lucide-react';

/**
 * What people said to the school's number, and what it said back.
 *
 * Part of every reply is now written by a model, and a model's output is the
 * one thing here nobody can reconstruct afterwards. If it tells an enquirer
 * something wrong about fees or entry requirements, the only other copy is on
 * that person's phone -- and they are the least likely person to come back and
 * mention it.
 *
 * So both halves are shown together. A reply read without the question it
 * answered tells you very little about whether it was a good one.
 */

type Row = {
  id: string;
  received_at: string;
  from_jid: string;
  body: string | null;
  command: string | null;
  reply: string | null;
  replied: boolean;
  ai_generated: boolean;
  student: {
    student_code: string | null;
    profile: { first_name: string | null; last_name: string | null } | null;
  } | null;
};

type Filter = 'all' | 'ai' | 'unanswered' | 'students';

const FILTERS: { key: Filter; label: string }[] = [
  { key: 'all', label: 'Everything' },
  { key: 'ai', label: 'Written by AI' },
  { key: 'unanswered', label: 'Not answered' },
  { key: 'students', label: 'From students' },
];

/** A JID back to something dialable. */
const readableNumber = (jid: string) => '+' + jid.split('@')[0].split(':')[0];

const when = (iso: string) =>
  new Date(iso).toLocaleString('en-GB', {
    timeZone: 'Africa/Lagos',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });

export default function WhatsAppLog() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Filter>('all');
  const [search, setSearch] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from('whatsapp_inbound_log')
      .select(
        'id, received_at, from_jid, body, command, reply, replied, ai_generated, ' +
          'student:students(student_code, profile:profiles(first_name, last_name))',
      )
      .order('received_at', { ascending: false })
      .limit(200);
    setRows((data ?? []) as unknown as Row[]);
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  const shown = useMemo(() => {
    const term = search.trim().toLowerCase();
    return rows.filter((row) => {
      if (filter === 'ai' && !row.ai_generated) return false;
      if (filter === 'unanswered' && row.replied) return false;
      if (filter === 'students' && !row.student) return false;
      if (!term) return true;
      return (
        (row.body ?? '').toLowerCase().includes(term) ||
        (row.reply ?? '').toLowerCase().includes(term) ||
        row.from_jid.includes(term)
      );
    });
  }, [rows, filter, search]);

  const aiCount = rows.filter((r) => r.ai_generated).length;

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-start justify-between gap-4">
        <div>
          <Button asChild variant="ghost" size="sm" className="-ml-2 mb-1">
            <Link to="/admin/whatsapp"><ArrowLeft className="h-4 w-4 mr-1" /> WhatsApp settings</Link>
          </Button>
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            <MessageSquare className="h-6 w-6" /> Incoming messages
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            What people sent the school&rsquo;s number, and what it replied.
            {aiCount > 0 && ` ${aiCount} of the last ${rows.length} replies were written by AI.`}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
          <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} /> Refresh
        </Button>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="flex flex-wrap gap-2">
          {FILTERS.map((f) => (
            <Button
              key={f.key}
              size="sm"
              variant={filter === f.key ? 'default' : 'outline'}
              onClick={() => setFilter(f.key)}
            >
              {f.label}
            </Button>
          ))}
        </div>
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search messages and replies"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8"
          />
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center p-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : shown.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <MessageSquare className="h-8 w-8 mx-auto text-muted-foreground mb-3" />
            <p className="font-medium">Nothing here yet</p>
            <p className="text-sm text-muted-foreground mt-1">
              {rows.length === 0
                ? 'Nobody has written to the number yet.'
                : 'No messages match this filter.'}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {shown.map((row) => {
            const name = row.student
              ? [row.student.profile?.first_name, row.student.profile?.last_name]
                  .map((p) => p?.trim())
                  .filter(Boolean)
                  .join(' ')
              : null;
            return (
              <Card key={row.id}>
                <CardHeader className="pb-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <CardTitle className="text-sm font-medium flex items-center gap-2">
                      {row.student ? (
                        <><UserRound className="h-4 w-4 text-muted-foreground" />
                          {name || 'Student'}
                          {row.student.student_code && (
                            <span className="text-muted-foreground font-normal">
                              {row.student.student_code}
                            </span>
                          )}</>
                      ) : (
                        <span className="text-muted-foreground">
                          {readableNumber(row.from_jid)} &middot; not a student
                        </span>
                      )}
                    </CardTitle>
                    <div className="flex items-center gap-2">
                      {row.ai_generated && (
                        <Badge variant="secondary" className="gap-1">
                          <Bot className="h-3 w-3" /> AI
                        </Badge>
                      )}
                      {row.command && <Badge variant="outline">{row.command}</Badge>}
                      {!row.replied && <Badge variant="destructive">not answered</Badge>}
                      <CardDescription className="text-xs">{when(row.received_at)}</CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-2 pt-0">
                  <div className="rounded-lg bg-muted px-3 py-2 text-sm whitespace-pre-wrap">
                    {row.body || <span className="italic text-muted-foreground">(empty)</span>}
                  </div>
                  {row.reply ? (
                    <div
                      className={`rounded-lg px-3 py-2 text-sm whitespace-pre-wrap border-l-2 ${
                        row.ai_generated
                          ? 'bg-amber-50 dark:bg-amber-950/30 border-amber-400'
                          : 'bg-emerald-50 dark:bg-emerald-950/20 border-emerald-500'
                      }`}
                    >
                      {row.reply}
                    </div>
                  ) : (
                    <p className="text-xs italic text-muted-foreground px-1">No reply was sent.</p>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
