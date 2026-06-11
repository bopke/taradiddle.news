"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { SignOutLink } from "./sign-out-link";

const NAV: { href: string; label: string; icon: string; exact?: boolean }[] = [
  { href: "/admin", label: "Dashboard", icon: "▦", exact: true },
  { href: "/admin/topics", label: "Topics", icon: "≔" },
  { href: "/admin/articles", label: "Articles", icon: "¶" },
  { href: "/admin/jobs", label: "Generation jobs", icon: "⟳" },
  { href: "/admin/settings", label: "Settings", icon: "⚙" },
];

export function AdminSidebar({
  userEmail,
  suggestedCount,
  failedJobsCount,
}: {
  userEmail: string;
  suggestedCount: number;
  failedJobsCount: number;
}) {
  const pathname = usePathname();
  const counts: Record<string, { value: number; red?: boolean } | undefined> = {
    "/admin/topics": suggestedCount > 0 ? { value: suggestedCount } : undefined,
    "/admin/jobs": failedJobsCount > 0 ? { value: failedJobsCount, red: true } : undefined,
  };

  return (
    <aside className="sticky top-0 flex h-screen w-[216px] shrink-0 flex-col border-r border-admin-border bg-white max-[980px]:w-16">
      <Link
        href="/admin"
        className="flex flex-wrap items-baseline gap-px border-b border-admin-border-soft px-4 pb-3.5 pt-4 max-[980px]:hidden"
      >
        <span className="font-serif text-[19px] font-extrabold tracking-tight">Taradiddle</span>
        <span className="font-serif text-[15px] font-semibold italic text-accent">.news</span>
        <span className="ml-2 self-center border border-admin-border px-1.5 py-0.5 text-[9px] font-bold tracking-[0.18em] text-admin-ink-dim">
          ADMIN
        </span>
      </Link>
      <nav className="flex flex-col gap-0.5 p-2">
        {NAV.map((item) => {
          const active = item.exact ? pathname === item.href : pathname.startsWith(item.href);
          const count = counts[item.href];
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-2.5 rounded px-2.5 py-2 text-[13px] font-medium text-admin-ink-dim hover:bg-admin-bg hover:text-admin-ink max-[980px]:justify-center",
                active && "bg-admin-active font-semibold text-admin-ink",
              )}
            >
              <span className="w-4 text-center">{item.icon}</span>
              <span className="max-[980px]:hidden">{item.label}</span>
              {count && (
                <span
                  className={cn(
                    "ml-auto rounded-full px-[7px] py-px text-[10px] font-bold text-white max-[980px]:hidden",
                    count.red ? "bg-accent" : "bg-admin-blue",
                  )}
                >
                  {count.value}
                </span>
              )}
            </Link>
          );
        })}
      </nav>
      <div className="mt-auto flex flex-col gap-1 border-t border-admin-border-soft px-4 py-3.5 text-xs max-[980px]:hidden">
        <span className="truncate text-admin-ink-dim">{userEmail}</span>
        <SignOutLink />
      </div>
    </aside>
  );
}
