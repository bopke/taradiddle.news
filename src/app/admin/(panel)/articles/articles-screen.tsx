"use client";

import { useState } from "react";
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
  formatDateTime,
  LocChip,
  PageHead,
  StatusPill,
  tableClass,
  tdClass,
  thClass,
} from "@/components/admin/ui";
import { cn } from "@/lib/utils";
import {
  deleteArticleAction,
  regenerateArticleAction,
  toggleArticleStatusAction,
} from "../actions";

export type ArticleRow = {
  id: number;
  title: string;
  generatedAt: string;
  model: string;
  edited: boolean;
  category: string;
  status: "published" | "unpublished";
  locales: { locale: string; ok: boolean }[];
};

type Confirm = { type: "regenerate" | "delete"; article: ArticleRow };

export function ArticlesScreen({ articles }: { articles: ArticleRow[] }) {
  const router = useRouter();
  const [confirm, setConfirm] = useState<Confirm | null>(null);

  return (
    <>
      <PageHead
        title="Articles"
        sub="Everything the pipeline has published. Edits are audit-logged; the site shows no human-edited badge."
      />

      {confirm && (
        <ConfirmActionDialog confirm={confirm} onClose={() => setConfirm(null)} />
      )}

      <div className="overflow-hidden rounded-md border border-admin-border">
        <table className={tableClass}>
          <thead>
            <tr>
              <th className={thClass}>Article</th>
              <th className={thClass}>Category</th>
              <th className={thClass}>Translations</th>
              <th className={thClass}>Status</th>
              <th className={thClass}></th>
            </tr>
          </thead>
          <tbody>
            {articles.length === 0 && (
              <tr>
                <td colSpan={5} className={cn(tdClass, "text-admin-ink-dim")}>
                  Nothing published yet — approve a topic and hit Generate.
                </td>
              </tr>
            )}
            {articles.map((a) => (
              <tr
                key={a.id}
                className="cursor-pointer last:[&>td]:border-b-0 hover:[&>td]:bg-[#f7f9fa]"
                onClick={() => router.push(`/admin/articles/${a.id}`)}
              >
                <td className={tdClass}>
                  <CellTitle>{a.title}</CellTitle>
                  <CellMeta>
                    {formatDateTime(new Date(a.generatedAt))} · {a.model}
                    {a.edited ? " · human-edited" : ""}
                  </CellMeta>
                </td>
                <td className={cn(tdClass, "text-xs text-admin-ink-dim")}>{a.category}</td>
                <td className={tdClass}>
                  <span className="flex gap-1">
                    {a.locales.map((l) => (
                      <LocChip key={l.locale} locale={l.locale} ok={l.ok} />
                    ))}
                  </span>
                </td>
                <td className={tdClass}>
                  <StatusPill status={a.status} />
                </td>
                <td
                  className={cn(tdClass, "whitespace-nowrap text-right")}
                  onClick={(e) => e.stopPropagation()}
                >
                  <form className="inline-flex gap-1.5">
                    <input type="hidden" name="articleId" value={a.id} />
                    <input
                      type="hidden"
                      name="next"
                      value={a.status === "published" ? "unpublished" : "published"}
                    />
                    <button formAction={toggleArticleStatusAction} className={adminBtnClass({ small: true })}>
                      {a.status === "published" ? "Unpublish" : "Publish"}
                    </button>
                  </form>
                  <button
                    className={cn(adminBtnClass({ small: true }), "ml-1.5")}
                    onClick={() => setConfirm({ type: "regenerate", article: a })}
                  >
                    Regenerate
                  </button>
                  <button
                    className={cn(adminBtnClass({ small: true }), "ml-1.5")}
                    onClick={() => setConfirm({ type: "delete", article: a })}
                  >
                    Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function ConfirmActionDialog({ confirm, onClose }: { confirm: Confirm; onClose: () => void }) {
  const { type, article } = confirm;
  const action = type === "regenerate" ? regenerateArticleAction : deleteArticleAction;
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-[420px]">
        <form action={action} onSubmit={onClose}>
          <input type="hidden" name="articleId" value={article.id} />
          <DialogHeader>
            <DialogTitle className="text-sm font-bold">
              {type === "regenerate" ? "Regenerate article?" : "Delete article?"}
            </DialogTitle>
          </DialogHeader>
          <p className="py-4 text-[13px] leading-relaxed">
            {type === "regenerate" ? (
              <>
                This re-enqueues the topic behind <strong>“{article.title}”</strong>. On success,
                the new text and hero image <strong>replace the current article</strong>. The
                published URL stays the same; the old content is not kept.
              </>
            ) : (
              <>
                <strong>“{article.title}”</strong> will be removed from the site, feeds, and
                sitemap. Its topic and job history are kept. This cannot be undone.
              </>
            )}
          </p>
          <DialogFooter>
            <button type="button" className={adminBtnClass()} onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className={adminBtnClass({ kind: "accent" })}>
              {type === "regenerate" ? "Regenerate" : "Delete article"}
            </button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
