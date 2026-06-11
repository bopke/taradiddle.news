import Link from "next/link";
import { notFound } from "next/navigation";
import { desc, eq } from "drizzle-orm";
import * as schema from "@/db/schema";
import { getRequestContext } from "@/lib/request-context";
import { getSettings } from "@/lib/settings";
import {
  adminBtnClass,
  formatDateTime,
  PageHead,
  Panel,
  SourceTag,
  StatusPill,
} from "@/components/admin/ui";
import { cn } from "@/lib/utils";
import {
  addNoteAction,
  approveTopicsAction,
  generateTopicsAction,
  rejectTopicsAction,
} from "../../actions";
import { TopicEditForm } from "./topic-edit-form";

export const metadata = { title: "Topic — Taradiddle Admin" };

export default async function TopicDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: idRaw } = await params;
  const id = Number(idRaw);
  if (!Number.isInteger(id)) notFound();

  const { db } = await getRequestContext();
  const settings = await getSettings(db);

  const [topic] = await db.select().from(schema.topics).where(eq(schema.topics.id, id));
  if (!topic) notFound();

  const [notes, jobs, categories, profiles] = await Promise.all([
    db
      .select({ note: schema.topicNotes, author: schema.user.email })
      .from(schema.topicNotes)
      .leftJoin(schema.user, eq(schema.topicNotes.authorId, schema.user.id))
      .where(eq(schema.topicNotes.topicId, id))
      .orderBy(schema.topicNotes.createdAt),
    db
      .select()
      .from(schema.generationJobs)
      .where(eq(schema.generationJobs.topicId, id))
      .orderBy(desc(schema.generationJobs.createdAt)),
    db.select().from(schema.categoryTranslations),
    db.select().from(schema.generationProfiles),
  ]);

  const canApprove = topic.status === "suggested";
  const canGenerate = ["suggested", "approved", "failed"].includes(topic.status);

  return (
    <>
      <Link href="/admin/topics" className="mb-2.5 inline-block text-xs font-semibold text-admin-blue hover:underline">
        ← Topics
      </Link>
      <PageHead
        title={topic.title}
        sub={
          <>
            t-{topic.id} · <SourceTag source={topic.source} />{" "}
            {topic.submittedBy || "self-suggested"} · {formatDateTime(topic.createdAt)} ·{" "}
            <StatusPill status={topic.status} />
          </>
        }
        actions={
          <form className="flex gap-2">
            <input type="hidden" name="id" value={topic.id} />
            {canApprove && (
              <button formAction={approveTopicsAction} className={adminBtnClass({ kind: "primary" })}>
                Approve
              </button>
            )}
            {canApprove && (
              <button formAction={rejectTopicsAction} className={adminBtnClass()}>
                Reject
              </button>
            )}
            {canGenerate && (
              <button formAction={generateTopicsAction} className={adminBtnClass({ kind: "accent" })}>
                {topic.status === "failed" ? "Retry generation" : "Generate now"}
              </button>
            )}
          </form>
        }
      />

      <div className="grid grid-cols-[1.6fr_1fr] items-start gap-4 max-[980px]:grid-cols-1">
        <div>
          <TopicEditForm
            topic={{
              id: topic.id,
              title: topic.title,
              description: topic.description,
              categoryId: topic.categoryId,
              priority: topic.priority,
              scheduledFor: topic.scheduledFor?.toISOString() ?? null,
              profileId: topic.profileId,
            }}
            categories={categories
              .filter((c) => c.locale === settings.default_locale)
              .map((c) => ({ id: c.categoryId, name: c.name }))}
            profiles={profiles.map((p) => ({ id: p.id, name: p.name, isDefault: p.isDefault }))}
          />

          {topic.originalLocale && (
            <Panel
              title={`Original submission (${topic.originalLocale.toUpperCase()})`}
              className="bg-[#fbfaf6]"
            >
              <p className="font-serif text-base font-semibold italic">{topic.originalTitle}</p>
              {topic.originalDescription && (
                <p className="mt-1 text-[12.5px] italic text-admin-ink-dim">
                  {topic.originalDescription}
                </p>
              )}
              <p className="mt-2.5 text-[11.5px] text-admin-ink-dim">
                Normalized to {settings.default_locale.toUpperCase()} at ingestion by the moderation
                call. Admins triage in the primary language.
              </p>
            </Panel>
          )}

          <Panel title="Notes">
            <div className="flex flex-col gap-3">
              {notes.length === 0 && <p className="text-[12.5px] text-admin-ink-dim">No notes yet.</p>}
              {notes.map(({ note, author }) => (
                <div key={note.id} className="rounded border border-admin-border-soft bg-[#fafbfb] px-3 py-2.5">
                  <div className="mb-1 flex justify-between gap-2.5 text-[11px] text-admin-ink-dim">
                    <strong>{author ?? "(deleted admin)"}</strong>
                    <span>{formatDateTime(note.createdAt)}</span>
                  </div>
                  <p className="leading-normal">{note.body}</p>
                </div>
              ))}
              <form action={addNoteAction} className="flex items-end gap-2">
                <input type="hidden" name="topicId" value={topic.id} />
                <textarea
                  name="body"
                  rows={2}
                  required
                  placeholder="Leave a note for the other admins…"
                  className="flex-1 rounded border border-admin-border px-2.5 py-[7px] text-[13px] outline-none focus:border-admin-blue"
                />
                <button className={adminBtnClass({ kind: "primary", small: true })}>Post</button>
              </form>
            </div>
          </Panel>
        </div>

        <div>
          <Panel title="Job history">
            {jobs.length === 0 && <p className="text-[12.5px] text-admin-ink-dim">No generation jobs yet.</p>}
            {jobs.map((j) => (
              <div key={j.id} className="mb-2 rounded border border-admin-border-soft px-3 py-2 last:mb-0">
                <div className="flex items-center justify-between gap-2 text-[11.5px] font-semibold text-admin-ink-dim">
                  <span>
                    job-{j.id} · attempt {j.attempt} · {j.trigger}
                  </span>
                  <StatusPill status={j.status} />
                </div>
                {j.error && (
                  <p className={cn("mt-1.5 text-[11.5px] leading-snug text-[oklch(0.45_0.14_25)]")}>
                    {j.error}
                  </p>
                )}
              </div>
            ))}
          </Panel>
        </div>
      </div>
    </>
  );
}
