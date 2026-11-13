import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

vi.mock("@/routes/lazy-pages", () => ({ preloadPath: vi.fn(), preloadPortal: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
vi.mock("@/contexts/useAuth", () => ({ useAuth: () => ({ profile: { first_name: "Ada" } }) }));
vi.mock("@/lib/ai-flags", () => ({ useAiFeature: () => true, useAssistantName: () => "Barnabas" }));
const askAssistant = vi.fn();
vi.mock("@/lib/chat", () => ({ askAssistant: (...args: unknown[]) => askAssistant(...args) }));

import AssistantChat from "@/components/portal/AssistantChat";

describe("assistant chat", () => {
  it("opens from the entry card and shows record figures as figures", async () => {
    askAssistant.mockResolvedValue({
      answer: "One balance is left.",
      figures: [
        { label: "Paid", value: "₦45,000" },
        { label: "Balance", value: "₦15,000", tone: "warn" },
      ],
      items: [],
      page: { path: "/student/fees", label: "Fees" },
      source: "records",
    });
    render(
      <MemoryRouter>
        <AssistantChat audience="student" />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole("button", { name: /ask barnabas/i }));
    expect(screen.getByText(/hello ada/i)).toBeInTheDocument();
    expect(screen.getByText(/count toward today's limit/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "What do I owe?" }));
    expect(askAssistant).toHaveBeenCalledWith("What do I owe?", "student");
    expect(await screen.findByText("₦15,000")).toBeInTheDocument();
    expect(screen.getByText("From your records, not generated")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /fees/i })).toHaveAttribute("href", "/student/fees");

    // Closing keeps the conversation for when it is opened again.
    fireEvent.click(screen.getByRole("button", { name: /close barnabas/i }));
    fireEvent.click(screen.getByRole("button", { name: /ask barnabas/i }));
    expect(screen.getByText("₦15,000")).toBeInTheDocument();
  });

  it("opens itself when asked to", () => {
    render(
      <MemoryRouter>
        <AssistantChat audience="admin" openRequested />
      </MemoryRouter>,
    );
    expect(screen.getByRole("textbox", { name: /ask barnabas a question/i })).toBeInTheDocument();
    expect(screen.getAllByText(/the school's records/i).length).toBeGreaterThan(0);
  });
});
