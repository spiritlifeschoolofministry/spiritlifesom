import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Checkbox } from "@/components/ui/checkbox";
import { sanitizeHtml } from "@/lib/exam-utils";

interface Props {
  question: any;
  optionOrder?: number[] | null;
  answer: unknown;
  onChange: (a: unknown) => void;
  disabled?: boolean;
}

export const QuestionRenderer = ({ question, optionOrder, answer, onChange, disabled }: Props) => {
  const orderedOptions: Array<{ original: number; text: string }> = (() => {
    if (!Array.isArray(question.options)) return [];
    if (optionOrder && Array.isArray(optionOrder) && optionOrder.length === question.options.length) {
      return optionOrder.map((origIdx: number) => ({
        original: origIdx,
        text: String(question.options[origIdx]),
      }));
    }
    return question.options.map((t: string, i: number) => ({ original: i, text: String(t) }));
  })();

  return (
    <div className="space-y-4 select-none">
      <div
        className="prose prose-sm dark:prose-invert max-w-none"
        dangerouslySetInnerHTML={{ __html: sanitizeHtml(question.question_text || "") }}
      />

      {question.image_url && (
        <img
          src={question.image_url}
          alt="Question"
          className="rounded-md border border-border max-w-full"
          draggable={false}
        />
      )}

      {question.code_snippet && (
        <pre className="bg-muted text-foreground rounded-md p-3 text-xs overflow-x-auto border border-border">
          <code>{question.code_snippet}</code>
        </pre>
      )}

      {question.question_type === "mcq_single" && (
        <RadioGroup
          value={answer != null ? String(answer) : ""}
          onValueChange={(v) => onChange(Number(v))}
          disabled={disabled}
          className="space-y-2"
        >
          {orderedOptions.map(({ original, text }) => (
            <div key={original} className="flex items-start gap-3 rounded-md border border-border p-3 hover:bg-muted/50 cursor-pointer"
              onClick={() => !disabled && onChange(original)}>
              <RadioGroupItem value={String(original)} id={`opt-${original}`} className="mt-0.5" />
              <Label htmlFor={`opt-${original}`} className="cursor-pointer flex-1">{text}</Label>
            </div>
          ))}
        </RadioGroup>
      )}

      {question.question_type === "mcq_multi" && (
        <div className="space-y-2">
          {orderedOptions.map(({ original, text }) => {
            const arr = Array.isArray(answer) ? (answer as number[]) : [];
            const checked = arr.includes(original);
            return (
              <div key={original} className="flex items-start gap-3 rounded-md border border-border p-3 hover:bg-muted/50">
                <Checkbox
                  id={`mopt-${original}`}
                  checked={checked}
                  disabled={disabled}
                  onCheckedChange={(v) => {
                    const next = v ? [...arr, original] : arr.filter((n) => n !== original);
                    onChange(next.sort((a, b) => a - b));
                  }}
                  className="mt-0.5"
                />
                <Label htmlFor={`mopt-${original}`} className="cursor-pointer flex-1">{text}</Label>
              </div>
            );
          })}
        </div>
      )}

      {question.question_type === "true_false" && (
        <RadioGroup
          value={answer === true ? "true" : answer === false ? "false" : ""}
          onValueChange={(v) => onChange(v === "true")}
          disabled={disabled}
          className="space-y-2"
        >
          {["true", "false"].map((v) => (
            <div key={v} className="flex items-center gap-3 rounded-md border border-border p-3 hover:bg-muted/50">
              <RadioGroupItem value={v} id={`tf-${v}`} />
              <Label htmlFor={`tf-${v}`} className="capitalize cursor-pointer flex-1">{v}</Label>
            </div>
          ))}
        </RadioGroup>
      )}

      {(question.question_type === "short_answer" || question.question_type === "fill_blank") && (
        <Input
          value={(answer as string) ?? ""}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Type your answer..."
          disabled={disabled}
          maxLength={500}
        />
      )}

      {question.question_type === "essay" && (
        <Textarea
          value={(answer as string) ?? ""}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Write your essay here..."
          disabled={disabled}
          rows={10}
          maxLength={10000}
          className="resize-y"
        />
      )}

      {question.question_type === "matching" && (
        <p className="text-sm text-muted-foreground italic">
          Matching questions are evaluated manually.
        </p>
      )}
    </div>
  );
};
