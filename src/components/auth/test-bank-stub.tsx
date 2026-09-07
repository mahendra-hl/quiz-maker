"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { QuestionTable } from "@/components/questions/question-table";
import { getCurrentUser, setCurrentUser } from "@/lib/current-user";

export function TestBankStub() {
  const router = useRouter();
  const [user] = useState(() => getCurrentUser());
  const [pending, setPending] = useState(false);

  async function onLogout() {
    setPending(true);
    try {
      await fetch("/api/logout", { method: "POST" });
      setCurrentUser(null);
      router.push("/login");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex min-h-screen w-full flex-col">
      <header className="flex items-start justify-between gap-4 border-b px-6 py-4">
        <div className="space-y-1">
          <h1 className="font-heading text-base leading-snug font-medium">
            MCQ test bank
          </h1>
          <p className="text-sm text-muted-foreground">
            {user ? (
              <>
                Signed in as {user.firstName} {user.lastName} ({user.email}).
              </>
            ) : (
              <>Signed in for this visit. A refresh will not restore this page.</>
            )}
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          onClick={onLogout}
          disabled={pending}
        >
          Log out
        </Button>
      </header>
      <div className="flex min-h-0 flex-1 flex-col px-6 py-4">
        <QuestionTable />
      </div>
    </div>
  );
}
