"use client";

import { useActionState, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  adminBtnClass,
  CellMeta,
  CellTitle,
  Field,
  fieldClass,
  formatDateTime,
  PageHead,
  SourceTag,
  StatusPill,
  STATUS_META,
  tableClass,
  tdClass,
  thClass,
} from "@/components/admin/ui";
import { cn } from "@/lib/utils";
import type { TopicSource, TopicStatus } from "@/db/schema";
import {
  addTopicAction,
  approveTopicsAction,
  generateTopicsAction,
  rejectTopicsAction,
} from "../actions";

export type TopicRow = {
  id: number;
  title: string;
  status: TopicStatus;
  source: TopicSource;
  priority: number;
  scheduledFor: string | null;
  createdAt: string;
  originalLocale: string | null;
};

export type CategoryOption = { id: number; name: string };
export type ProfileOption = { id: number; name: string; isDefault: boolean };

const TABS: ("all" | TopicStatus)[] = [
  "all",
  "suggested",
  "approved",
  "queued",
  "generating",
  "done",
  "failed",
  "rejected",
];

export function TopicsScreen({
  topics,
  categories,
  profiles,
}: {
  topics: TopicRow[];
  categories: CategoryOption[];
  profiles: ProfileOption[];
}) {
  const router = useRouter();
  const [tab, setTab] = useState<"all" | TopicStatus>("suggested");
  const [selected, setSelected] = useState<number[]>([]);
  const [showAdd, setShowAdd] = useState(false);

  const visible = topics.filter((t) => tab === "all" || t.status === tab);
  const toggle = (id: number) =>
    setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));

  return (
    <>
      <PageHead
        title="Topics"
        sub="Suggestions arrive from bots, admins, and the AI itself. Nothing generates without approval."
        actions={
          <button className={adminBtnClass({ kind: "primary" })} onClick={() => setShowAdd(true)}>
            + Add topic
          </button>
        }
      />

      <AddTopicDialog
        open={showAdd}
        onClose={() => setShowAdd(false)}
        categories={categories}
        profiles={profiles}
      />

      <div className="mb-4 flex flex-wrap items-center gap-0.5 border-b border-admin-border">
        {TABS.map((s) => (
          <button
            key={s}
            className={cn(
              "flex items-center gap-1.5 border-b-2 border-transparent px-3 py-2 text-[12.5px] font-semibold text-admin-ink-dim hover:text-admin-ink",
              tab === s && "border-accent text-admin-ink",
            )}
            onClick={() => {
              setTab(s);
              setSelected([]);
            }}
          >
            {s === "all" ? "All" : STATUS_META[s].label}
            <span className="rounded-lg bg-[#ececec] px-1.5 py-px text-[10px] font-bold text-admin-ink-dim">
              {s === "all" ? topics.length : topics.filter((t) => t.status === s).length}
            </span>
          </button>
        ))}
      </div>

      {selected.length > 0 && (
        <form
          className="mb-3 flex items-center gap-3.5 rounded-md border border-admin-border bg-admin-active px-3.5 py-2 text-[12.5px] font-semibold"
          onSubmit={() => setSelected([])}
        >
          {selected.map((id) => (
            <input key={id} type="hidden" name="id" value={id} />
          ))}
          <span>{selected.length} selected</span>
          <div className="ml-auto flex gap-2">
            <button formAction={approveTopicsAction} className={adminBtnClass({ kind: "primary", small: true })}>
              Approve
            </button>
            <button formAction={rejectTopicsAction} className={adminBtnClass({ small: true })}>
              Reject
            </button>
            <button formAction={generateTopicsAction} className={adminBtnClass({ kind: "accent", small: true })}>
              Generate now
            </button>
          </div>
        </form>
      )}

      <div className="overflow-hidden rounded-md border border-admin-border">
        <table className={tableClass}>
          <thead>
            <tr>
              <th className={cn(thClass, "w-[34px] text-center")}></th>
              <th className={thClass}>Topic</th>
              <th className={thClass}>Source</th>
              <th className={thClass}>Priority</th>
              <th className={thClass}>Scheduled</th>
              <th className={thClass}>Status</th>
            </tr>
          </thead>
          <tbody>
            {visible.length === 0 && (
              <tr>
                <td colSpan={6} className={cn(tdClass, "text-admin-ink-dim")}>
                  Nothing here.
                </td>
              </tr>
            )}
            {visible.map((t) => (
              <tr
                key={t.id}
                tabIndex={0}
                className="cursor-pointer last:[&>td]:border-b-0 hover:[&>td]:bg-[#f7f9fa] focus-visible:outline-2 focus-visible:outline-admin-blue"
                onClick={() => router.push(`/admin/topics/${t.id}`)}
                onKeyDown={(e) => {
                  if (e.target !== e.currentTarget) return; // checkbox handles its own keys
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    router.push(`/admin/topics/${t.id}`);
                  }
                }}
              >
                <td className={cn(tdClass, "text-center")} onClick={(e) => e.stopPropagation()}>
                  <input
                    type="checkbox"
                    aria-label={`Select "${t.title}"`}
                    checked={selected.includes(t.id)}
                    onChange={() => toggle(t.id)}
                  />
                </td>
                <td className={tdClass}>
                  <CellTitle>{t.title}</CellTitle>
                  <CellMeta>
                    t-{t.id} · {formatDateTime(new Date(t.createdAt))}
                    {t.originalLocale ? ` · submitted in ${t.originalLocale.toUpperCase()}` : ""}
                  </CellMeta>
                </td>
                <td className={tdClass}>
                  <SourceTag source={t.source} />
                </td>
                <td className={cn(tdClass, "tabular-nums")}>{t.priority}</td>
                <td className={cn(tdClass, "whitespace-nowrap text-xs text-admin-ink-dim")}>
                  {t.scheduledFor ? formatDateTime(new Date(t.scheduledFor)) : "—"}
                </td>
                <td className={tdClass}>
                  <StatusPill status={t.status} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function AddTopicDialog({
  open,
  onClose,
  categories,
  profiles,
}: {
  open: boolean;
  onClose: () => void;
  categories: CategoryOption[];
  profiles: ProfileOption[];
}) {
  const [state, formAction, pending] = useActionState(
    async (prev: Awaited<ReturnType<typeof addTopicAction>> | null, formData: FormData) => {
      const result = await addTopicAction(prev, formData);
      if (result.ok) onClose();
      return result;
    },
    null,
  );
  const defaultProfile = profiles.find((p) => p.isDefault);

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-[560px]">
        <form action={formAction}>
          <DialogHeader>
            <DialogTitle className="text-sm font-bold">Add topic</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-3.5 py-4">
            <Field label="Title">
              <input
                name="title"
                type="text"
                className={fieldClass}
                placeholder="e.g. Office Printer Granted One Day of Absolute Power"
                autoFocus
                required
              />
            </Field>
            <Field label="Description (context for the generator)">
              <textarea
                name="description"
                rows={3}
                className={fieldClass}
                placeholder="Optional angle, tone, or details to work in…"
              />
            </Field>
            <div className="flex gap-3.5">
              <Field label="Category">
                <select name="categoryId" className={fieldClass} defaultValue="">
                  <option value="">Let the AI pick</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Priority">
                <input name="priority" type="number" defaultValue={0} className={fieldClass} />
              </Field>
            </div>
            <div className="flex gap-3.5">
              <Field label="Don't generate before">
                <input name="scheduledFor" type="datetime-local" className={fieldClass} />
              </Field>
              <Field label="Generation profile">
                <select name="profileId" className={fieldClass} defaultValue="">
                  <option value="">Site default ({defaultProfile?.name ?? "—"})</option>
                  {profiles
                    .filter((p) => !p.isDefault)
                    .map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                </select>
              </Field>
            </div>
            <p className="text-[11.5px] leading-relaxed text-admin-ink-dim">
              Admin-added topics skip AI moderation — admins are trusted. The topic is created as{" "}
              <strong>Suggested</strong>; approve it to make it eligible for generation.
            </p>
            {state && !state.ok && (
              <p role="alert" className="text-xs font-semibold text-accent">
                {state.error}
              </p>
            )}
          </div>
          <DialogFooter>
            <button type="button" className={adminBtnClass()} onClick={onClose}>
              Cancel
            </button>
            <button type="submit" disabled={pending} className={adminBtnClass({ kind: "primary" })}>
              {pending ? "Creating…" : "Create topic"}
            </button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
