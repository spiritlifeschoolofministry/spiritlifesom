import { Sparkles } from 'lucide-react';
import { useAssistantName } from '@/lib/ai-flags';

/**
 * The line under anything the assistant wrote.
 *
 * One component rather than a sentence retyped at each of the four places,
 * because these lines are the only way a student learns that the paragraph on
 * their dashboard and the sparkle next to their grade are the same assistant.
 * Written four different ways, they read as four different things.
 *
 * Each carries `source` — what this particular answer was built from — since
 * the thing a student most needs to know is how narrow the basis was. And each
 * ends by pointing at the real record or a real person, because that is what
 * stops a summary being mistaken for the transcript.
 */
export default function AssistantAttribution({
  source,
  fallback,
  className,
}: {
  /** What this output was written from, e.g. "your own attendance, fees and tasks". */
  source: string;
  /** Where to go instead when it does not cover something. */
  fallback: string;
  className?: string;
}) {
  const name = useAssistantName();

  return (
    <p className={`flex items-start gap-1.5 text-xs text-muted-foreground ${className ?? ''}`}>
      <Sparkles className="mt-0.5 h-3 w-3 shrink-0 opacity-70" aria-hidden="true" />
      <span>
        <span className="font-medium text-foreground/80">{name}</span>, your study assistant,
        wrote this from {source}. {fallback}
      </span>
    </p>
  );
}
