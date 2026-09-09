import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  ArrowRight,
  ChevronDown,
  ChevronUp,
  Database,
  Loader2,
  Map as MapIcon,
  Send,
  Sparkles,
} from 'lucide-react';
import { useAiFeature, useAssistantName } from '@/lib/ai-flags';
import { SUGGESTIONS } from '@/lib/chat-intents';
import type { Audience } from '@/lib/portal-map';
import { askAssistant, type ChatAnswer } from '@/lib/chat';
import { preloadPath } from '@/routes/lazy-pages';

/**
 * The chatbox.
 *
 * Two things about it are deliberate and worth not undoing:
 *
 *   Figures are rendered as figures, from `figures`, never read out of the
 *   answer text. Where an answer came from the records, the numbers on screen
 *   are database fields that have been through no model at all. That is the
 *   whole defence against the failure that matters — a confident "you owe
 *   nothing" to somebody who owes ₦40,000.
 *
 *   The conversation is not stored. It lives in this component's state and is
 *   gone when the tab closes. A log of what somebody privately did not
 *   understand is not something the school needs, and the nearest existing
 *   table is staff-readable by design — right for a progress note about a
 *   student, wrong for their own questions.
 *
 * The turn limit is a courtesy, not a control: the real cap is the daily one
 * the edge function enforces. This just stops a single thread quietly becoming
 * the cheapest way to spend it.
 */

const TURN_LIMIT = 12;

interface Turn {
  question: string;
  answer?: ChatAnswer;
  error?: string;
}

const SOURCE_LABEL: Record<ChatAnswer['source'], { text: string; icon: typeof Database }> = {
  portal: { text: 'From the portal itself', icon: MapIcon },
  records: { text: 'From your records', icon: Database },
  model: { text: 'Written for you', icon: Sparkles },
};

const TONE_CLASS: Record<string, string> = {
  good: 'text-emerald-600 dark:text-emerald-400',
  warn: 'text-amber-600 dark:text-amber-400',
  bad: 'text-destructive',
};

export default function AssistantChat({ audience }: { audience: Audience }) {
  const enabled = useAiFeature('ai_chat');
  const name = useAssistantName();
  const [open, setOpen] = useState(false);
  const [question, setQuestion] = useState('');
  const [turns, setTurns] = useState<Turn[]>([]);
  const [busy, setBusy] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  const spent = turns.length >= TURN_LIMIT;

  useEffect(() => {
    if (turns.length > 0) endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [turns]);

  const ask = useCallback(
    async (asked: string) => {
      const text = asked.trim();
      if (!text || busy || spent) return;
      setQuestion('');
      setTurns((prev) => [...prev, { question: text }]);
      setBusy(true);
      try {
        const answer = await askAssistant(text, audience);
        setTurns((prev) =>
          prev.map((turn, index) => (index === prev.length - 1 ? { ...turn, answer } : turn)),
        );
      } catch (err) {
        const message = err instanceof Error ? err.message : 'The assistant could not answer.';
        setTurns((prev) =>
          prev.map((turn, index) => (index === prev.length - 1 ? { ...turn, error: message } : turn)),
        );
      } finally {
        setBusy(false);
      }
    },
    [audience, busy, spent],
  );

  if (!enabled) return null;

  return (
    <Card className="border-border shadow-[var(--shadow-card)]">
      <CardHeader className="pb-3">
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          aria-expanded={open}
          className="flex w-full items-center gap-3 text-left"
        >
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-violet-100 dark:bg-violet-900/40">
            <Sparkles className="h-4 w-4 text-violet-600 dark:text-violet-400" />
          </div>
          <CardTitle className="flex-1 text-base">
            Ask {name}
            <span className="ml-2 text-xs font-normal text-muted-foreground">
              {audience === 'admin'
                ? 'about the school, or where to find something'
                : 'about your record, or where to find something'}
            </span>
          </CardTitle>
          {open ? (
            <ChevronUp className="h-4 w-4 shrink-0 text-muted-foreground" />
          ) : (
            <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
          )}
        </button>
      </CardHeader>

      {open && (
        <CardContent className="space-y-3">
          {turns.length === 0 && (
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground">
                {name} reads {audience === 'admin' ? "the school's records" : 'your own record'} and
                can point you at any page. He cannot change anything — every action stays yours.
              </p>
              <div className="flex flex-wrap gap-2">
                {SUGGESTIONS[audience].map((suggestion) => (
                  <button
                    key={suggestion}
                    type="button"
                    onClick={() => ask(suggestion)}
                    className="rounded-full border bg-card px-3 py-1.5 text-xs text-foreground transition-colors hover:bg-secondary"
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
            </div>
          )}

          {turns.length > 0 && (
            <div className="max-h-[420px] space-y-3 overflow-y-auto pr-1">
              {turns.map((turn, index) => (
                <div key={index} className="space-y-2">
                  <p className="ml-auto w-fit max-w-[85%] rounded-2xl rounded-br-sm bg-primary px-3 py-2 text-sm text-primary-foreground">
                    {turn.question}
                  </p>

                  {turn.error && (
                    <p className="w-fit max-w-[95%] rounded-2xl rounded-bl-sm bg-destructive/10 px-3 py-2 text-sm text-destructive">
                      {turn.error}
                    </p>
                  )}

                  {!turn.answer && !turn.error && (
                    <p className="flex items-center gap-2 px-1 text-xs text-muted-foreground">
                      <Loader2 className="h-3 w-3 animate-spin" /> Looking…
                    </p>
                  )}

                  {turn.answer && (
                    <div className="w-full space-y-2 rounded-2xl rounded-bl-sm bg-muted/60 px-3 py-2.5">
                      <p className="text-sm leading-relaxed">{turn.answer.answer}</p>

                      {/* Straight from the database, never parsed out of prose. */}
                      {turn.answer.figures.length > 0 && (
                        <div className="flex flex-wrap gap-2">
                          {turn.answer.figures.map((figure) => (
                            <div
                              key={figure.label}
                              className="rounded-lg border bg-card px-2.5 py-1.5"
                            >
                              <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
                                {figure.label}
                              </p>
                              <p
                                className={`text-sm font-bold ${
                                  figure.tone ? TONE_CLASS[figure.tone] : 'text-foreground'
                                }`}
                              >
                                {figure.value}
                              </p>
                            </div>
                          ))}
                        </div>
                      )}

                      {turn.answer.items.length > 0 && (
                        <ul className="space-y-1">
                          {turn.answer.items.map((item, itemIndex) => (
                            <li
                              key={`${item.label}-${itemIndex}`}
                              className="flex items-baseline justify-between gap-3 border-b border-border/50 pb-1 text-xs last:border-0 last:pb-0"
                            >
                              <span className="text-foreground">{item.label}</span>
                              {item.detail && (
                                <span className="shrink-0 text-muted-foreground">{item.detail}</span>
                              )}
                            </li>
                          ))}
                        </ul>
                      )}

                      <div className="flex flex-wrap items-center justify-between gap-2 pt-0.5">
                        {(() => {
                          const source = SOURCE_LABEL[turn.answer.source];
                          return (
                            <span className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                              <source.icon className="h-3 w-3" />
                              {source.text}
                            </span>
                          );
                        })()}
                        {turn.answer.page && (
                          <Button
                            asChild
                            size="sm"
                            variant="outline"
                            className="h-7 gap-1 text-xs"
                          >
                            <Link
                              to={turn.answer.page.path}
                              onMouseEnter={() => preloadPath(turn.answer!.page!.path)}
                            >
                              {turn.answer.page.label} <ArrowRight className="h-3 w-3" />
                            </Link>
                          </Button>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              ))}
              <div ref={endRef} />
            </div>
          )}

          <form
            onSubmit={(event) => {
              event.preventDefault();
              ask(question);
            }}
            className="flex items-center gap-2"
          >
            <Input
              value={question}
              onChange={(event) => setQuestion(event.target.value)}
              placeholder={spent ? 'Start a new conversation to ask more' : 'Ask a question…'}
              disabled={busy || spent}
              maxLength={500}
              aria-label={`Ask ${name} a question`}
            />
            <Button type="submit" size="icon" disabled={busy || spent || !question.trim()}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </Button>
          </form>

          {spent && (
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="secondary" className="text-[10px]">
                {TURN_LIMIT} questions in this conversation
              </Badge>
              <Button
                size="sm"
                variant="ghost"
                className="h-7 text-xs"
                onClick={() => setTurns([])}
              >
                Start again
              </Button>
            </div>
          )}
        </CardContent>
      )}
    </Card>
  );
}
