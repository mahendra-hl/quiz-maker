"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Textarea } from "@/components/ui/textarea";

type ChoiceDraft = {
  label: string;
  isCorrect: boolean;
};

type QuestionFormProps = {
  mode: "create" | "edit";
  questionId?: string;
};

function emptyChoices(): ChoiceDraft[] {
  return [
    { label: "", isCorrect: true },
    { label: "", isCorrect: false },
  ];
}

export function QuestionForm({ mode, questionId }: QuestionFormProps) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [question, setQuestion] = useState("");
  const [choices, setChoices] = useState<ChoiceDraft[]>(emptyChoices);
  const [error, setError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [pending, setPending] = useState(false);
  const [loading, setLoading] = useState(mode === "edit");

  useEffect(() => {
    if (mode !== "edit" || !questionId) {
      return;
    }

    let cancelled = false;

    async function loadQuestion() {
      try {
        const response = await fetch(`/api/questions/${questionId}`);
        const body = (await response.json()) as {
          error?: string;
          question?: {
            name: string;
            question: string;
            choices: Array<{ label: string; isCorrect: boolean }>;
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

        setName(body.question.name);
        setQuestion(body.question.question);
        setChoices(
          body.question.choices.map((choice) => ({
            label: choice.label,
            isCorrect: choice.isCorrect,
          })),
        );
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

    void loadQuestion();
    return () => {
      cancelled = true;
    };
  }, [mode, questionId]);

  function addChoice() {
    if (choices.length >= 6) {
      return;
    }
    setChoices((current) => [...current, { label: "", isCorrect: false }]);
  }

  function removeChoice(index: number) {
    if (choices.length <= 2) {
      return;
    }

    setChoices((current) => {
      const next = current.filter((_, choiceIndex) => choiceIndex !== index);
      if (!next.some((choice) => choice.isCorrect)) {
        next[0] = { ...next[0], isCorrect: true };
      }
      return next;
    });
  }

  function setChoiceLabel(index: number, label: string) {
    setChoices((current) =>
      current.map((choice, choiceIndex) =>
        choiceIndex === index ? { ...choice, label } : choice,
      ),
    );
  }

  function markCorrect(index: number) {
    setChoices((current) =>
      current.map((choice, choiceIndex) => ({
        ...choice,
        isCorrect: choiceIndex === index,
      })),
    );
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setPending(true);

    try {
      const url =
        mode === "create" ? "/api/questions" : `/api/questions/${questionId}`;
      const response = await fetch(url, {
        method: mode === "create" ? "POST" : "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          question,
          choices: choices.map((choice) => ({
            label: choice.label,
            isCorrect: choice.isCorrect,
          })),
        }),
      });
      const body = (await response.json()) as { error?: string };

      if (!response.ok) {
        setError(body.error ?? "Unable to save the question.");
        return;
      }

      router.push("/test-bank");
    } catch {
      setError("Unable to save the question.");
    } finally {
      setPending(false);
    }
  }

  if (notFound) {
    return (
      <p className="mx-auto w-full max-w-3xl text-sm text-destructive">
        Question not found.
      </p>
    );
  }

  const correctIndex = String(
    Math.max(
      0,
      choices.findIndex((choice) => choice.isCorrect),
    ),
  );
  const canRemove = choices.length > 2;

  return (
    <form className="mx-auto flex w-full max-w-3xl flex-col gap-6" onSubmit={onSubmit}>
      <div>
        <h1 className="font-heading text-base leading-snug font-medium">
          {mode === "create" ? "Create question" : "Edit question"}
        </h1>
        <p className="text-sm text-muted-foreground">
          Two to six choices. Mark exactly one as correct.
        </p>
      </div>

      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="name">Name</FieldLabel>
          <Input
            id="name"
            name="name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            disabled={loading || pending}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="question">Question</FieldLabel>
          <Textarea
            id="question"
            name="question"
            value={question}
            onChange={(event) => setQuestion(event.target.value)}
            disabled={loading || pending}
          />
        </Field>

        <RadioGroup
          className="gap-3"
          value={correctIndex}
          onValueChange={(value) => markCorrect(Number(value))}
        >
          {choices.map((choice, index) => {
            const choiceNumber = index + 1;
            const choiceId = `choice-${choiceNumber}`;
            return (
              <Field
                key={choiceId}
                orientation="horizontal"
                className="items-start"
              >
                <div className="flex min-w-0 flex-1 flex-col gap-2">
                  <FieldLabel htmlFor={choiceId}>Choice {choiceNumber}</FieldLabel>
                  <Input
                    id={choiceId}
                    name={choiceId}
                    value={choice.label}
                    onChange={(event) =>
                      setChoiceLabel(index, event.target.value)
                    }
                    disabled={loading || pending}
                  />
                </div>
                <div className="flex items-center gap-2 pt-7">
                  <RadioGroupItem
                    value={String(index)}
                    id={`${choiceId}-correct`}
                    aria-label={`Mark choice ${choiceNumber} as correct`}
                    disabled={loading || pending}
                  />
                  {canRemove ? (
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={() => removeChoice(index)}
                      disabled={pending}
                    >
                      Remove choice {choiceNumber}
                    </Button>
                  ) : null}
                </div>
              </Field>
            );
          })}
        </RadioGroup>

        {choices.length < 6 ? (
          <Button type="button" variant="outline" onClick={addChoice}>
            Add choice
          </Button>
        ) : null}

        {error ? <FieldError errors={[{ message: error }]} /> : null}
      </FieldGroup>

      <div className="flex gap-3">
        <Button type="submit" disabled={loading || pending}>
          Save
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => router.push("/test-bank")}
          disabled={pending}
        >
          Cancel
        </Button>
      </div>
    </form>
  );
}
