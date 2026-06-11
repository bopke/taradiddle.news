"use client";

import { useActionState } from "react";
import { adminBtnClass, Field, fieldClass, Panel } from "@/components/admin/ui";
import { updateTopicAction } from "../../actions";
import type { CategoryOption, ProfileOption } from "../topics-screen";

/** datetime-local wants "YYYY-MM-DDTHH:MM" (no timezone). */
function toLocalInput(iso: string | null): string {
  if (!iso) return "";
  return iso.slice(0, 16);
}

export function TopicEditForm({
  topic,
  categories,
  profiles,
}: {
  topic: {
    id: number;
    title: string;
    description: string | null;
    categoryId: number | null;
    priority: number;
    scheduledFor: string | null;
    profileId: number | null;
  };
  categories: CategoryOption[];
  profiles: ProfileOption[];
}) {
  const [state, formAction, pending] = useActionState(updateTopicAction, null);
  const defaultProfile = profiles.find((p) => p.isDefault);

  return (
    <form action={formAction}>
      <Panel
        title="Details"
        actions={
          <button type="submit" disabled={pending} className={adminBtnClass({ small: true })}>
            {pending ? "Saving…" : "Save"}
          </button>
        }
      >
        <input type="hidden" name="topicId" value={topic.id} />
        <div className="flex flex-col gap-3.5">
          <Field label="Title">
            <input name="title" type="text" defaultValue={topic.title} required className={fieldClass} />
          </Field>
          <Field label="Description (context for the generator)">
            <textarea
              name="description"
              rows={3}
              defaultValue={topic.description ?? ""}
              className={fieldClass}
            />
          </Field>
          <div className="flex flex-wrap gap-3.5 [&>label]:min-w-36 [&>label]:flex-1">
            <Field label="Category">
              <select name="categoryId" defaultValue={topic.categoryId ?? ""} className={fieldClass}>
                <option value="">Let the AI pick</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Priority" hint="Higher = sooner">
              <input name="priority" type="number" defaultValue={topic.priority} className={fieldClass} />
            </Field>
            <Field label="Don't generate before">
              <input
                name="scheduledFor"
                type="datetime-local"
                defaultValue={toLocalInput(topic.scheduledFor)}
                className={fieldClass}
              />
            </Field>
            <Field label="Generation profile">
              <select name="profileId" defaultValue={topic.profileId ?? ""} className={fieldClass}>
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
          {state && !state.ok && (
            <p role="alert" className="text-xs font-semibold text-accent">
              {state.error}
            </p>
          )}
        </div>
      </Panel>
    </form>
  );
}
