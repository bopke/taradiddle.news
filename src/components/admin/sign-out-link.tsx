"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";

export function SignOutLink() {
  const router = useRouter();
  const [error, setError] = useState(false);
  return (
    <button
      className="text-left text-xs font-semibold text-admin-blue hover:underline"
      onClick={async () => {
        setError(false);
        try {
          await authClient.signOut();
          // Navigate only on success — a failed sign-out leaves the session
          // alive, and bouncing to the login page would just mask that.
          router.push("/admin/login");
          router.refresh();
        } catch (e) {
          console.error("sign-out failed", e);
          setError(true);
        }
      }}
    >
      {error ? "Sign out failed — retry" : "Sign out"}
    </button>
  );
}
