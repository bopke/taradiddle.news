"use client";

import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";

export function SignOutLink() {
  const router = useRouter();
  return (
    <button
      className="text-left text-xs font-semibold text-admin-blue hover:underline"
      onClick={async () => {
        try {
          await authClient.signOut();
        } finally {
          router.push("/admin/login");
          router.refresh();
        }
      }}
    >
      Sign out
    </button>
  );
}
