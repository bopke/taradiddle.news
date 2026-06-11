"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import {
  adminBtnClass,
  Field,
  fieldClass,
  fieldMonoClass,
  formatDateTime,
  PageHead,
  Panel,
  StatusPill,
} from "@/components/admin/ui";
import { cn } from "@/lib/utils";
import { retryTranslationAction, saveSharedAction, saveTranslationAction } from "../../actions";

type TranslationFields = {
  title: string;
  slug: string;
  summary: string;
  metaDescription: string;
  bodyMd: string;
  imageAlt: string | null;
  translatedAt: string;
};

type LocaleEntry =
  | { locale: string; ok: true; fields: TranslationFields }
  | { locale: string; ok: false; fields: null };

export function EditorScreen({
  article,
  locales,
  categories,
  primaryLocale,
}: {
  article: {
    id: number;
    status: string;
    model: string;
    generatedAt: string;
    categoryId: number;
    imageKey: string | null;
    tags: string[];
  };
  locales: LocaleEntry[];
  categories: { id: number; name: string }[];
  primaryLocale: string;
}) {
  const primary = locales.find((l) => l.locale === primaryLocale);
  const [active, setActive] = useState(primaryLocale);
  const current = locales.find((l) => l.locale === active) ?? locales[0];

  return (
    <>
      <Link
        href="/admin/articles"
        className="mb-2.5 inline-block text-xs font-semibold text-admin-blue hover:underline"
      >
        ← Articles
      </Link>
      <PageHead
        title={primary?.ok ? primary.fields.title : "(untitled)"}
        sub={
          <>
            a-{article.id} · {article.model} · generated {formatDateTime(new Date(article.generatedAt))} ·{" "}
            <StatusPill status={article.status} />
          </>
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-0.5 border-b border-admin-border">
        {locales.map((l) => (
          <button
            key={l.locale}
            className={cn(
              "flex items-center gap-1.5 border-b-2 border-transparent px-3 py-2 text-[12.5px] font-semibold text-admin-ink-dim hover:text-admin-ink",
              active === l.locale && "border-accent text-admin-ink",
            )}
            onClick={() => setActive(l.locale)}
          >
            {l.locale.toUpperCase()}
            <span
              className={cn(
                "inline-block size-[7px] rounded-full",
                l.ok ? "bg-[oklch(0.62_0.13_150)]" : "bg-[oklch(0.62_0.16_25)]",
              )}
            />
          </button>
        ))}
        {active !== primaryLocale && (
          <form action={retryTranslationAction} className="ml-auto pb-1">
            <input type="hidden" name="articleId" value={article.id} />
            <input type="hidden" name="locale" value={active} />
            <button className={adminBtnClass({ small: true })}>
              {current.ok ? "Retry translation" : "Translate now"}
            </button>
          </form>
        )}
      </div>

      {current.ok ? (
        <TranslationEditor key={current.locale} articleId={article.id} locale={current.locale} fields={current.fields} article={article} categories={categories} />
      ) : (
        <Panel title={`No ${current.locale.toUpperCase()} translation yet`}>
          <p className="text-[12.5px] text-admin-ink-dim">
            Readers currently get the {primaryLocale.toUpperCase()} version with a “not yet
            translated” notice. Use “Translate now” to queue it.
          </p>
        </Panel>
      )}
    </>
  );
}

function TranslationEditor({
  articleId,
  locale,
  fields,
  article,
  categories,
}: {
  articleId: number;
  locale: string;
  fields: TranslationFields;
  article: { categoryId: number; imageKey: string | null; tags: string[] };
  categories: { id: number; name: string }[];
}) {
  const [trState, trAction, trPending] = useActionState(saveTranslationAction, null);
  const [shState, shAction, shPending] = useActionState(saveSharedAction, null);
  const [metaLength, setMetaLength] = useState(fields.metaDescription.length);

  return (
    <div className="grid grid-cols-[1.6fr_1fr] items-start gap-4 max-[980px]:grid-cols-1">
      <form action={trAction}>
        <input type="hidden" name="articleId" value={articleId} />
        <input type="hidden" name="locale" value={locale} />
        <Panel
          title={`Content (${locale.toUpperCase()})`}
          actions={
            <button type="submit" disabled={trPending} className={adminBtnClass({ kind: "primary", small: true })}>
              {trPending ? "Saving…" : "Save changes"}
            </button>
          }
        >
          <div className="flex flex-col gap-3.5">
            <Field label="Title">
              <input name="title" type="text" defaultValue={fields.title} required className={fieldClass} />
            </Field>
            <Field label="Lede / summary">
              <textarea name="summary" rows={2} defaultValue={fields.summary} className={fieldClass} />
            </Field>
            <Field label="Body (markdown)">
              <textarea name="bodyMd" rows={16} defaultValue={fields.bodyMd} className={fieldMonoClass} />
            </Field>
            {trState && !trState.ok && (
              <p role="alert" className="text-xs font-semibold text-accent">
                {trState.error}
              </p>
            )}
          </div>
        </Panel>

        <Panel title={`Metadata (${locale.toUpperCase()})`}>
          <div className="flex flex-col gap-3.5">
            <Field label="Slug">
              <input name="slug" type="text" defaultValue={fields.slug} className={fieldMonoClass} />
            </Field>
            <Field label="Meta description" hint={`${metaLength}/155 characters`}>
              <textarea
                name="metaDescription"
                rows={3}
                defaultValue={fields.metaDescription}
                className={fieldClass}
                onChange={(e) => setMetaLength(e.target.value.length)}
              />
            </Field>
            <Field label="Image alt">
              <input name="imageAlt" type="text" defaultValue={fields.imageAlt ?? ""} className={fieldClass} />
            </Field>
            <Field label="Translated at">
              <input type="text" defaultValue={formatDateTime(new Date(fields.translatedAt))} disabled className={fieldClass} />
            </Field>
          </div>
        </Panel>
      </form>

      <form action={shAction}>
        <input type="hidden" name="articleId" value={articleId} />
        <Panel
          title="Shared across locales"
          actions={
            <button type="submit" disabled={shPending} className={adminBtnClass({ small: true })}>
              {shPending ? "Saving…" : "Save"}
            </button>
          }
        >
          <div className="flex flex-col gap-3.5">
            <Field label="Category">
              <select name="categoryId" defaultValue={article.categoryId} className={fieldClass}>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Tags" hint="Comma-separated, in the primary locale.">
              <input name="tags" type="text" defaultValue={article.tags.join(", ")} className={fieldClass} />
            </Field>
            <Field label="Hero image (R2)">
              <input type="text" defaultValue={article.imageKey ?? "(none — placeholder renders)"} disabled className={fieldMonoClass} />
            </Field>
            {shState && !shState.ok && (
              <p role="alert" className="text-xs font-semibold text-accent">
                {shState.error}
              </p>
            )}
          </div>
        </Panel>
      </form>
    </div>
  );
}
