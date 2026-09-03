"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
    <Card className="w-full max-w-lg">
      <CardHeader>
        <CardTitle>
          <h1>MCQ test bank</h1>
        </CardTitle>
        <CardDescription>
          Question authoring and teacher collaboration are coming later. This
          page is only a starting point after login.
        </CardDescription>
      </CardHeader>
      <CardContent className="text-muted-foreground">
        {user ? (
          <p>
            Signed in as {user.firstName} {user.lastName} ({user.email}).
          </p>
        ) : (
          <p>Signed in for this visit. A refresh will not restore this page.</p>
        )}
      </CardContent>
      <CardFooter>
        <Button type="button" variant="outline" onClick={onLogout} disabled={pending}>
          Log out
        </Button>
      </CardFooter>
    </Card>
  );
}
