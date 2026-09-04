"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { EllipsisVertical } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";

type QuestionSummary = {
  id: string;
  name: string;
  question: string;
};

function QuestionActions({
  question,
  onDelete,
}: {
  question: QuestionSummary;
  onDelete: () => void;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [menuPosition, setMenuPosition] = useState({ top: 0, left: 0 });
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  function toggleMenu() {
    const rect = buttonRef.current?.getBoundingClientRect();
    if (!open && rect) {
      const menuWidth = 144;
      const menuHeight = 120;
      const left = Math.min(
        Math.max(8, rect.right - menuWidth),
        window.innerWidth - menuWidth - 8,
      );
      const openAbove = rect.bottom + menuHeight > window.innerHeight - 8;
      const top = openAbove
        ? Math.max(8, rect.top - menuHeight - 4)
        : rect.bottom + 4;
      setMenuPosition({ top, left });
    }
    setOpen((current) => !current);
  }

  useEffect(() => {
    if (!open) {
      return;
    }

    function onPointerDown(event: PointerEvent) {
      const target = event.target as Node;
      if (
        buttonRef.current?.contains(target) ||
        menuRef.current?.contains(target)
      ) {
        return;
      }
      setOpen(false);
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
      }
    }

    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div className="flex justify-end">
      <Button
        ref={buttonRef}
        type="button"
        variant="ghost"
        size="icon"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Actions for ${question.name}`}
        onClick={toggleMenu}
      >
        <EllipsisVertical />
      </Button>
      {open
        ? createPortal(
            <div
              ref={menuRef}
              role="menu"
              className="fixed z-50 min-w-36 rounded-lg bg-popover p-1 text-popover-foreground shadow-md ring-1 ring-foreground/10"
              style={{ top: menuPosition.top, left: menuPosition.left }}
            >
              <button
                type="button"
                role="menuitem"
                className={cn(
                  "flex w-full cursor-default items-center rounded-md px-1.5 py-1 text-left text-sm outline-none hover:bg-accent hover:text-accent-foreground",
                )}
                onClick={() => {
                  setOpen(false);
                  router.push(`/test-bank/questions/${question.id}/edit`);
                }}
              >
                Edit
              </button>
              <button
                type="button"
                role="menuitem"
                className={cn(
                  "flex w-full cursor-default items-center rounded-md px-1.5 py-1 text-left text-sm outline-none hover:bg-accent hover:text-accent-foreground",
                )}
                onClick={() => {
                  setOpen(false);
                  router.push(`/test-bank/questions/${question.id}/preview`);
                }}
              >
                Preview
              </button>
              <button
                type="button"
                role="menuitem"
                className={cn(
                  "flex w-full cursor-default items-center rounded-md px-1.5 py-1 text-left text-sm text-destructive outline-none hover:bg-destructive/10",
                )}
                onClick={() => {
                  setOpen(false);
                  onDelete();
                }}
              >
                Delete
              </button>
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}

export function QuestionTable() {
  const router = useRouter();
  const [questions, setQuestions] = useState<QuestionSummary[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<QuestionSummary | null>(
    null,
  );
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function loadQuestions() {
      try {
        const response = await fetch("/api/questions");
        if (!response.ok) {
          throw new Error("Could not load questions.");
        }
        const body = (await response.json()) as { questions?: QuestionSummary[] };
        if (!cancelled) {
          setQuestions(body.questions ?? []);
          setLoadError(null);
        }
      } catch {
        if (!cancelled) {
          setLoadError("Could not load questions.");
        }
      }
    }

    void loadQuestions();
    return () => {
      cancelled = true;
    };
  }, []);

  async function confirmDelete() {
    if (!pendingDelete) {
      return;
    }

    setDeleting(true);
    try {
      const response = await fetch(`/api/questions/${pendingDelete.id}`, {
        method: "DELETE",
      });
      if (!response.ok) {
        setLoadError("Could not delete the question.");
        return;
      }
      setQuestions((current) =>
        current.filter((question) => question.id !== pendingDelete.id),
      );
      setPendingDelete(null);
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="flex h-full min-h-0 w-full flex-1 flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          Create, edit, delete, and preview multiple-choice questions.
        </p>
        <Button
          type="button"
          onClick={() => router.push("/test-bank/questions/new")}
        >
          Create
        </Button>
      </div>

      {loadError ? (
        <p className="text-sm text-destructive" role="alert">
          {loadError}
        </p>
      ) : null}

      {questions.length === 0 && !loadError ? (
        <p className="text-sm text-muted-foreground">
          No questions yet. Use Create to add the first one.
        </p>
      ) : null}

      {questions.length > 0 ? (
        <table className="w-full table-fixed caption-bottom text-sm">
          <TableHeader>
            <TableRow>
              <TableHead className="w-[22%]">Name</TableHead>
              <TableHead>Question</TableHead>
              <TableHead className="w-14 text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {questions.map((question) => (
              <TableRow key={question.id}>
                <TableCell className="whitespace-normal font-medium">
                  {question.name}
                </TableCell>
                <TableCell className="whitespace-normal">
                  {question.question}
                </TableCell>
                <TableCell className="overflow-visible text-right">
                  <QuestionActions
                    question={question}
                    onDelete={() => setPendingDelete(question)}
                  />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </table>
      ) : null}

      <Dialog
        open={pendingDelete !== null}
        onOpenChange={(open) => {
          if (!open) {
            setPendingDelete(null);
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remove this question?</DialogTitle>
            <DialogDescription>
              {pendingDelete?.name} will be removed from the test bank. This
              cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setPendingDelete(null)}
              disabled={deleting}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={() => void confirmDelete()}
              disabled={deleting}
            >
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
