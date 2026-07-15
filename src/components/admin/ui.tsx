import { cn } from "@/lib/utils";
import type { JobStatus, TopicSource, TopicStatus } from "@/db/schema";

/* Pixel reference: docs/superpowers/design/…/Taradiddle Admin.html */

type PillTone = "blue" | "teal" | "amber" | "green" | "red" | "gray";

const PILL_TONES: Record<PillTone, string> = {
  blue: "bg-[oklch(0.93_0.03_250)] text-[oklch(0.40_0.10_250)]",
  teal: "bg-[oklch(0.93_0.04_195)] text-[oklch(0.38_0.08_195)]",
  amber: "bg-[oklch(0.94_0.06_85)] text-[oklch(0.45_0.10_70)]",
  green: "bg-[oklch(0.93_0.05_150)] text-[oklch(0.38_0.09_150)]",
  red: "bg-[oklch(0.93_0.04_25)] text-[oklch(0.42_0.14_25)]",
  gray: "bg-[#ececec] text-admin-ink-dim",
};

export const STATUS_META: Record<string, { label: string; tone: PillTone }> = {
  suggested: { label: "Suggested", tone: "blue" },
  approved: { label: "Approved", tone: "teal" },
  queued: { label: "Queued", tone: "amber" },
  generating: { label: "Generating", tone: "amber" },
  done: { label: "Done", tone: "green" },
  rejected: { label: "Rejected", tone: "gray" },
  failed: { label: "Failed", tone: "red" },
  /** A failed job whose topic was later regenerated successfully. */
  resolved: { label: "Failed · rerun ok", tone: "gray" },
  running: { label: "Running", tone: "amber" },
  succeeded: { label: "Succeeded", tone: "green" },
  published: { label: "Published", tone: "green" },
  unpublished: { label: "Unpublished", tone: "gray" },
};

export function StatusPill({ status }: { status: TopicStatus | JobStatus | string }) {
  const meta = STATUS_META[status] ?? { label: status, tone: "gray" as PillTone };
  return (
    <span
      className={cn(
        "inline-block whitespace-nowrap rounded-[3px] px-2 py-0.5 text-[10.5px] font-bold uppercase tracking-[0.05em]",
        PILL_TONES[meta.tone],
      )}
    >
      {meta.label}
    </span>
  );
}

const SOURCE_STYLES: Record<TopicSource, string> = {
  admin: "border-admin-border text-admin-ink-dim",
  api: "border-[oklch(0.75_0.07_250)] text-[oklch(0.42_0.10_250)]",
  ai: "border-[oklch(0.75_0.08_300)] text-[oklch(0.45_0.12_300)]",
};

export function SourceTag({ source }: { source: TopicSource }) {
  const labels: Record<TopicSource, string> = { admin: "Admin", api: "API", ai: "AI" };
  return (
    <span
      className={cn(
        "inline-block rounded-[3px] border px-1.5 py-px text-[10px] font-bold tracking-[0.08em]",
        SOURCE_STYLES[source],
      )}
    >
      {labels[source]}
    </span>
  );
}

export function Panel({
  title,
  actions,
  children,
  className,
  flush,
}: {
  title?: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  /** Skip the body padding (for tables). */
  flush?: boolean;
}) {
  return (
    <section
      className={cn(
        "mb-4 overflow-hidden rounded-md border border-admin-border bg-admin-panel",
        className,
      )}
    >
      {title && (
        <div className="flex items-center justify-between gap-3 border-b border-admin-border-soft px-4 py-2.5">
          <h2 className="text-[13px] font-bold">{title}</h2>
          {actions}
        </div>
      )}
      {flush ? children : <div className="p-4">{children}</div>}
    </section>
  );
}

export function PageHead({
  title,
  sub,
  actions,
}: {
  title: string;
  sub?: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    <div className="mb-[18px] flex items-start gap-4">
      <div>
        <h1 className="text-xl font-bold leading-tight tracking-tight text-pretty">{title}</h1>
        {sub && (
          <p className="mt-[5px] flex flex-wrap items-center gap-1.5 text-xs text-admin-ink-dim">
            {sub}
          </p>
        )}
      </div>
      {actions && <div className="ml-auto flex shrink-0 gap-2">{actions}</div>}
    </div>
  );
}

export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-[5px]">
      <span className="text-[11px] font-bold uppercase tracking-[0.06em] text-admin-ink-dim">
        {label}
      </span>
      {children}
      {hint && <span className="text-[11px] text-admin-ink-dim">{hint}</span>}
    </label>
  );
}

/** Shared input styling matching the design's form fields. */
export const fieldClass =
  "w-full rounded border border-admin-border bg-white px-2.5 py-[7px] text-[13px] text-admin-ink outline-none focus:border-admin-blue disabled:bg-[#f5f5f5] disabled:text-admin-ink-dim";

export const fieldMonoClass = cn(fieldClass, "font-mono text-xs leading-relaxed");

/** Buttons per the design: default / primary (ink) / accent (red). */
export function adminBtnClass(opts?: { kind?: "default" | "primary" | "accent"; small?: boolean }) {
  const kind = opts?.kind ?? "default";
  return cn(
    "inline-flex cursor-pointer items-center justify-center rounded border font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50",
    opts?.small ? "px-2.5 py-1 text-[11.5px]" : "px-3.5 py-[7px] text-[12.5px]",
    kind === "default" && "border-admin-border bg-admin-panel text-admin-ink hover:border-admin-ink-dim",
    kind === "primary" && "border-admin-ink bg-admin-ink text-white hover:bg-[#34393d]",
    kind === "accent" && "border-accent bg-accent text-white hover:opacity-90",
  );
}

export const tableClass = "w-full border-collapse bg-admin-panel text-[13px]";
export const thClass =
  "border-b border-admin-border bg-[#fafbfb] px-3.5 py-[9px] text-left text-[10.5px] font-bold uppercase tracking-[0.08em] text-admin-ink-dim";
export const tdClass = "border-b border-admin-border-soft px-3.5 py-2.5 align-middle";

export function CellTitle({ children }: { children: React.ReactNode }) {
  return <span className="block font-semibold leading-[1.35] text-pretty">{children}</span>;
}

export function CellMeta({ children }: { children: React.ReactNode }) {
  return (
    <span className="mt-[3px] flex flex-wrap items-center gap-[5px] text-[11px] text-admin-ink-dim">
      {children}
    </span>
  );
}

export function LocChip({ locale, ok }: { locale: string; ok: boolean }) {
  return (
    <span
      className={cn(
        "rounded-[3px] px-1.5 py-0.5 text-[10px] font-bold",
        ok
          ? "bg-[oklch(0.93_0.05_150)] text-[oklch(0.38_0.09_150)]"
          : "border border-dashed border-[oklch(0.75_0.08_25)] bg-[oklch(0.94_0.03_25)] text-[oklch(0.45_0.13_25)]",
      )}
    >
      {locale.toUpperCase()}
    </span>
  );
}

/** "2026-06-09 07:42" (UTC) like the design's timestamps; em dash when null. */
export function formatDateTime(date: Date | null | undefined): string {
  if (!date) return "—";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())} ${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}`;
}
