"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";

export function SignOutButton() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  async function signOut() {
    setError(null);
    try {
      await authClient.signOut();
      router.push("/admin/login");
      router.refresh();
    } catch (e) {
      console.error("sign-out failed", e);
      setError("Sign-out failed — please try again.");
    }
  }

  return (
    <div className="flex flex-col items-center gap-2">
      <Button variant="outline" size="sm" onClick={signOut}>
        Sign out
      </Button>
      {error && (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
