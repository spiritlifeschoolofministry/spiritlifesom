import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { parseMatchingQuestion, sanitizeHtml } from "@/lib/exam-utils";

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

  // Matching prompts carry their pairs as "A) …" / "1) …" lines inside the text.
  // When they parse, the pairs become controls below and only the stem is shown
  // here — printing them twice would just be noise.
  const matching =
    question.question_type === "matching"
      ? parseMatchingQuestion(question.question_text || "")
      : null;
  const matchValue: Record<string, string> =
    answer && typeof answer === "object" && !Array.isArray(answer)
      ? (answer as Record<string, string>)
      : {};

  return (
    <div className="space-y-4 select-none">
      {/* pre-line: prompts are written with real line breaks, and without this
          a multi-line question collapses into one run-on paragraph. */}
      <div
        className="prose prose-sm dark:prose-invert max-w-none whitespace-pre-line"
        dangerouslySetInnerHTML={{
          __html: sanitizeHtml(
            (matching?.stem || question.question_text || "").trim(),
          ),
        }}
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
        matching ? (
          <div className="space-y-2">
            {matching.left.map((item) => (
              <div key={item.key} className="flex flex-col sm:flex-row sm:items-center gap-2 rounded-md border border-border p-3">
                <p className="flex-1 text-sm">
                  <span className="font-medium mr-1.5">{item.key})</span>
                  {item.text}
                </p>
                <Select
                  value={matchValue[item.key] ?? ""}
                  onValueChange={(v) => onChange({ ...matchValue, [item.key]: v })}
                  disabled={disabled}
                >
                  <SelectTrigger className="w-full sm:w-[280px]">
                    <SelectValue placeholder="Choose a match" />
                  </SelectTrigger>
                  <SelectContent>
                    {matching.right.map((opt) => (
                      <SelectItem key={opt.key} value={opt.key}>
                        {opt.key}) {opt.text}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ))}
            <p className="text-xs text-muted-foreground italic">
              Your lecturer marks this question by hand.
            </p>
          </div>
        ) : (
          // The prompt did not hold parseable pairs, so give somewhere to write
          // the matching out rather than leaving the question unanswerable.
          <div className="space-y-1">
            <Label className="text-xs">Write your pairs, e.g. A-1, B-2</Label>
            <Input
              value={typeof answer === "string" ? answer : ""}
              onChange={(e) => onChange(e.target.value)}
              disabled={disabled}
              placeholder="A-1, B-2"
            />
          </div>
        )
      )}
    </div>
  );
};
