"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";

type PreviewChoice = {
  id: string;
  label: string;
  position: number;
};

type PreviewQuestion = {
  id: string;
  name: string;
  question: string;
  choices: PreviewChoice[];
};

export function QuestionPreview({ questionId }: { questionId: string }) {
  const router = useRouter();
  const [question, setQuestion] = useState<PreviewQuestion | null>(null);
  const [selectedChoiceId, setSelectedChoiceId] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [pending, setPending] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function loadPreview() {
      try {
        const response = await fetch(`/api/questions/${questionId}/preview`);
        const body = (await response.json()) as {
          error?: string;
          question?: PreviewQuestion & {
            choices: Array<PreviewChoice & { isCorrect?: boolean }>;
          };
        };

        if (cancelled) {
          return;
        }

        if (!response.ok || !body.question) {
          setNotFound(true);
          setError(body.error ?? "Question not found.");
          return;
        }

        setQuestion({
          id: body.question.id,
          name: body.question.name,
          question: body.question.question,
          choices: body.question.choices.map((choice) => ({
            id: choice.id,
            label: choice.label,
            position: choice.position,
          })),
        });
        setNotFound(false);
      } catch {
        if (!cancelled) {
          setNotFound(true);
          setError("Question not found.");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void loadPreview();
    return () => {
      cancelled = true;
    };
  }, [questionId]);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedChoiceId) {
      return;
    }

    setError(null);
    setMessage(null);
    setPending(true);

    try {
      const response = await fetch("/api/attempts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          questionId,
          choiceId: selectedChoiceId,
        }),
      });
      const body = (await response.json()) as {
        error?: string;
        message?: string;
      };

      if (!response.ok) {
        setError(body.error ?? "Unable to submit the attempt.");
        return;
      }

      setMessage(body.message ?? null);
    } catch {
      setError("Unable to submit the attempt.");
    } finally {
      setPending(false);
    }
  }

  if (notFound) {
    return (
      <div className="flex w-full max-w-3xl flex-col items-start gap-4 rounded-xl bg-card p-8 text-card-foreground ring-1 ring-foreground/10 sm:p-10">
        <p className="text-base text-destructive">Question not found.</p>
        <Button
          type="button"
          variant="outline"
          onClick={() => router.push("/test-bank")}
        >
          Back to test bank
        </Button>
      </div>
    );
  }

  return (
    <form
      className="flex w-full max-w-3xl flex-col gap-8 rounded-xl bg-card p-8 text-card-foreground ring-1 ring-foreground/10 sm:p-10"
      onSubmit={onSubmit}
    >
      <div className="space-y-2">
        <h1 className="font-heading text-2xl leading-tight font-medium">
          Preview question
        </h1>
        {question?.name ? (
          <p className="text-sm text-muted-foreground">{question.name}</p>
        ) : null}
        <p className="text-sm text-muted-foreground">
          Choose an answer and submit to see if it is correct.
        </p>
      </div>

      {loading ? (
        <p className="text-base text-muted-foreground">Loading question…</p>
      ) : null}

      {question ? (
        <FieldGroup className="gap-6">
          <p className="text-xl leading-relaxed font-medium">{question.question}</p>
          <RadioGroup
            value={selectedChoiceId}
            onValueChange={setSelectedChoiceId}
            className="gap-3"
          >
            {question.choices.map((choice) => (
              <Field
                key={choice.id}
                orientation="horizontal"
                className="items-center rounded-lg border border-border px-4 py-3"
              >
                <RadioGroupItem
                  value={choice.id}
                  id={choice.id}
                  disabled={pending}
                />
                <FieldLabel htmlFor={choice.id} className="text-base">
                  {choice.label}
                </FieldLabel>
              </Field>
            ))}
          </RadioGroup>
        </FieldGroup>
      ) : null}

      {message ? (
        <p role="status" className="text-base font-medium">
          {message}
        </p>
      ) : null}
      {error ? <FieldError errors={[{ message: error }]} /> : null}

      <div className="flex flex-wrap gap-3">
        <Button
          type="submit"
          size="lg"
          disabled={!selectedChoiceId || pending || loading}
        >
          Submit
        </Button>
        <Button
          type="button"
          variant="outline"
          size="lg"
          onClick={() => router.push("/test-bank")}
          disabled={pending}
        >
          Back to test bank
        </Button>
      </div>
    </form>
  );
}
