import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  ArrowRight,
  ChevronRight,
  Database,
  Loader2,
  Map as MapIcon,
  Send,
  Sparkles,
  X,
} from 'lucide-react';
import { useAiFeature, useAssistantName } from '@/lib/ai-flags';
import { SUGGESTIONS } from '@/lib/chat-intents';
import type { Audience } from '@/lib/portal-map';
import { askAssistant, type ChatAnswer } from '@/lib/chat';
import { preloadPath } from '@/routes/lazy-pages';
import { useAuth } from '@/contexts/useAuth';
import { useIsMobile } from '@/hooks/use-mobile';
import { useFocusTrap } from '@/hooks/use-focus-trap';

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
 *
 * Closed, it is a dark entry card. Open, it is a full-screen conversation on a
 * phone (a modal: focus is trapped and Escape closes it) and an inline panel
 * on wider screens. Closing keeps the conversation; only the tab closing, or
 * "Start again", clears it.
 */

const TURN_LIMIT = 12;

interface Turn {
  question: string;
  answer?: ChatAnswer;
  error?: string;
}

const SOURCE_LABEL: Record<ChatAnswer['source'], { text: string; icon: typeof Database; className: string }> = {
  portal: { text: 'From the portal itself', icon: MapIcon, className: 'text-muted-foreground' },
  records: {
    text: 'From your records, not generated',
    icon: Database,
    className: 'font-bold text-emerald-800 dark:text-emerald-300',
  },
  model: { text: 'Written for you', icon: Sparkles, className: 'text-muted-foreground' },
};

const TONE_CLASS: Record<string, string> = {
  good: 'text-emerald-700 dark:text-emerald-400',
  warn: 'text-amber-700 dark:text-amber-400',
  bad: 'text-destructive',
};

interface Props {
  audience: Audience;
  /** Opens the chat when it turns true (e.g. "Ask Barnabas" in the More sheet). */
  openRequested?: boolean;
  /** Called when the person closes the chat. */
  onClose?: () => void;
}

export default function AssistantChat({ audience, openRequested = false, onClose }: Props) {
  const enabled = useAiFeature('ai_chat');
  const name = useAssistantName();
  const { profile } = useAuth();
  const isMobile = useIsMobile();
  const [open, setOpen] = useState(openRequested);
  const [question, setQuestion] = useState('');
  const [turns, setTurns] = useState<Turn[]>([]);
  const [busy, setBusy] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const entryRef = useRef<HTMLButtonElement>(null);
  // Set when the person closes the panel, so focus goes back to the entry card
  // that replaces it rather than falling to the page.
  const returnFocus = useRef(false);
  const titleId = useId();
  const panelId = useId();

  const spent = turns.length >= TURN_LIMIT;
  const modal = open && isMobile;
  const firstName = profile?.first_name?.trim() || '';
  const suggestions = SUGGESTIONS[audience];

  useEffect(() => {
    if (openRequested) setOpen(true);
  }, [openRequested]);

  const close = useCallback(() => {
    returnFocus.current = true;
    setOpen(false);
    onClose?.();
  }, [onClose]);

  const trapRef = useFocusTrap<HTMLDivElement>(modal, close);

  useEffect(() => {
    if (open && !isMobile) inputRef.current?.focus({ preventScroll: true });
    if (!open && returnFocus.current) {
      returnFocus.current = false;
      entryRef.current?.focus();
    }
  }, [open, isMobile]);

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

  if (!open) {
    return (
      <button
        ref={entryRef}
        type="button"
        onClick={() => setOpen(true)}
        aria-expanded={false}
        aria-controls={panelId}
        className="flex w-full items-center gap-3 rounded-2xl bg-[#17112B] px-4 py-3.5 text-left text-white transition-transform hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
      >
        <span
          aria-hidden="true"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#E0A526] font-extrabold text-[#17112B]"
        >
          {name.charAt(0).toUpperCase()}
        </span>
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <strong className="text-[15px]">Ask {name}</strong>
          <span className="truncate text-[13px] text-[#CFC9DE]">
            {suggestions
              .slice(audience === 'admin' ? 0 : 1, audience === 'admin' ? 2 : 3)
              .map((s) => `“${s}”`)
              .join(' · ')}
          </span>
        </span>
        <ChevronRight className="h-5 w-5 shrink-0" aria-hidden="true" />
      </button>
    );
  }

  const panel = (
    <div
      ref={trapRef}
      id={panelId}
      role={modal ? 'dialog' : 'region'}
      aria-modal={modal ? true : undefined}
      aria-labelledby={titleId}
      className={
        modal
          ? 'fixed inset-0 z-50 flex flex-col bg-background'
          : 'flex flex-col overflow-hidden rounded-2xl border border-border bg-background shadow-[var(--shadow-card)]'
      }
    >
      <div className="flex items-center gap-3 border-b border-border bg-card px-4 py-3 sm:px-5">
        <button
          type="button"
          onClick={close}
          aria-label={`Close ${name}`}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-border text-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <X className="h-5 w-5" aria-hidden="true" />
        </button>
        <span
          aria-hidden="true"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#5B21B6] font-extrabold text-white"
        >
          {name.charAt(0).toUpperCase()}
        </span>
        <span className="flex min-w-0 flex-col">
          <strong id={titleId} className="text-base text-foreground">
            {name}
          </strong>
          <span className="truncate text-xs text-muted-foreground">
            {audience === 'admin'
              ? 'About the school, or where to find something'
              : 'Your study companion · answers from your records'}
          </span>
        </span>
      </div>

      <div
        className={`flex flex-col gap-3 overflow-y-auto px-4 py-4 sm:px-5 ${modal ? 'flex-1' : 'max-h-[520px]'}`}
        aria-live="polite"
      >
        <p className="max-w-[85%] self-start rounded-[4px_16px_16px_16px] border border-border bg-card px-3.5 py-3 text-sm leading-relaxed text-foreground">
          Hello{firstName ? ` ${firstName}` : ''}. Ask me about{' '}
          {audience === 'admin' ? 'students, fees, receipts or the portal' : 'your classes, exams, fees or the school'}, or
          where to find a page. I read {audience === 'admin' ? "the school's records" : 'your own record'} and cannot
          change anything — every action stays yours. Here are some things people ask:
        </p>
        <div className="flex flex-wrap gap-2">
          {suggestions.map((suggestion) => {
            const asked = turns.some((t) => t.question === suggestion);
            return (
              <button
                key={suggestion}
                type="button"
                onClick={() => ask(suggestion)}
                disabled={busy || spent}
                className={`min-h-10 rounded-full border border-primary/25 px-3 text-[13px] font-semibold text-secondary-foreground transition-colors hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60 ${
                  asked ? 'bg-secondary' : 'bg-card'
                }`}
              >
                {suggestion}
              </button>
            );
          })}
        </div>

        {turns.map((turn, index) => (
          <div key={index} className="flex flex-col gap-3">
            <p className="max-w-[80%] self-end rounded-[16px_4px_16px_16px] bg-primary px-3.5 py-2.5 text-sm text-primary-foreground">
              {turn.question}
            </p>

            {turn.error && (
              <p className="max-w-[90%] self-start rounded-[4px_16px_16px_16px] bg-destructive/10 px-3.5 py-2.5 text-sm text-destructive">
                {turn.error}
              </p>
            )}

            {!turn.answer && !turn.error && (
              <p className="flex items-center gap-2 px-1 text-xs text-muted-foreground">
                <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" /> Looking…
              </p>
            )}

            {turn.answer && (
              <div className="flex max-w-[90%] flex-col gap-2.5 self-start rounded-[4px_16px_16px_16px] border border-border bg-card px-3.5 py-3">
                <p className="text-sm leading-relaxed text-foreground">{turn.answer.answer}</p>

                {/* Straight from the database, never parsed out of prose. */}
                {turn.answer.figures.length > 0 && (
                  <div className="grid grid-cols-2 gap-2">
                    {turn.answer.figures.map((figure) => (
                      <div key={figure.label} className="flex flex-col gap-0.5 rounded-xl bg-background p-2.5">
                        <span className="text-[11px] font-semibold text-muted-foreground">{figure.label}</span>
                        <strong
                          className={`text-lg font-extrabold tracking-tight ${
                            figure.tone ? TONE_CLASS[figure.tone] : 'text-foreground'
                          }`}
                        >
                          {figure.value}
                        </strong>
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
                        {item.detail && <span className="shrink-0 text-muted-foreground">{item.detail}</span>}
                      </li>
                    ))}
                  </ul>
                )}

                {(() => {
                  const source = SOURCE_LABEL[turn.answer.source];
                  return (
                    <span className={`flex items-center gap-1.5 text-[11px] ${source.className}`}>
                      <source.icon className="h-3 w-3" aria-hidden="true" />
                      {source.text}
                    </span>
                  );
                })()}

                {turn.answer.page && (
                  <Link
                    to={turn.answer.page.path}
                    onMouseEnter={() => preloadPath(turn.answer!.page!.path)}
                    onFocus={() => preloadPath(turn.answer!.page!.path)}
                    className="inline-flex min-h-10 items-center gap-1.5 self-start rounded-[10px] bg-secondary px-3.5 text-[13px] font-bold text-secondary-foreground hover:bg-secondary/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    {turn.answer.page.label} <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                  </Link>
                )}
              </div>
            )}
          </div>
        ))}

        {spent && (
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="secondary" className="text-[11px]">
              {TURN_LIMIT} questions in this conversation
            </Badge>
            <Button size="sm" variant="ghost" className="h-10 text-xs" onClick={() => setTurns([])}>
              Start again
            </Button>
          </div>
        )}
        <div ref={endRef} />
      </div>

      <form
        onSubmit={(event) => {
          event.preventDefault();
          ask(question);
        }}
        className={`flex flex-col gap-1.5 border-t border-border bg-card px-4 pt-3 ${modal ? 'pb-safe' : 'pb-4'}`}
      >
        <div className="flex gap-2">
          <input
            ref={inputRef}
            value={question}
            onChange={(event) => setQuestion(event.target.value)}
            placeholder={spent ? 'Start a new conversation to ask more' : 'Ask a question…'}
            disabled={busy || spent}
            maxLength={500}
            aria-label={`Ask ${name} a question`}
            className="h-12 min-w-0 flex-1 rounded-[14px] border border-input bg-background px-3.5 text-base text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
          />
          <button
            type="submit"
            disabled={busy || spent || !question.trim()}
            aria-label="Send"
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[14px] bg-primary text-primary-foreground hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-50"
          >
            {busy ? <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" /> : <Send className="h-5 w-5" aria-hidden="true" />}
          </button>
        </div>
        <p className="text-[11px] text-muted-foreground">
          Questions about {audience === 'admin' ? "the school's" : 'your own'} records are free. Other questions count
          toward today's limit.
        </p>
      </form>
    </div>
  );

  // On a phone the open chat covers the screen. Portalled so no transformed
  // ancestor (page transitions, reveal animations) can trap the fixed layer.
  return modal ? createPortal(panel, document.body) : panel;
}
