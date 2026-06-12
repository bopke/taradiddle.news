"use client";

import { useActionState, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  adminBtnClass,
  CellTitle,
  Field,
  fieldClass,
  fieldMonoClass,
  formatDateTime,
  PageHead,
  Panel,
  tableClass,
  tdClass,
  thClass,
} from "@/components/admin/ui";
import { cn } from "@/lib/utils";
import {
  createApiKeyAction,
  createProfileAction,
  deleteProfileAction,
  inviteAdminAction,
  makeDefaultProfileAction,
  removeAdminAction,
  resetModerationPromptAction,
  revokeApiKeyAction,
  saveCategoryAction,
  saveModerationSettingsAction,
  savePipelineSettingsAction,
  updateProfileAction,
} from "../actions";

const TABS = ["Admins", "API keys", "Categories", "Generation"] as const;
type Tab = (typeof TABS)[number];

type AdminEntry = { email: string; hasAccount: boolean; isSelf: boolean; added: string };
type ApiKeyEntry = { id: number; name: string; createdAt: string; revokedAt: string | null };
type CategoryEntry = {
  id: number;
  translations: { locale: string; name: string; slug: string }[];
};
type ProfileEntry = {
  id: number;
  name: string;
  model: string;
  temperature: number | null;
  maxOutputTokens: number;
  instructions: string;
  isDefault: boolean;
};
type SettingsValues = {
  autoGenerateEnabled: boolean;
  autoGenerateBatchSize: number;
  selfSuggestEnabled: boolean;
  selfSuggestCount: number;
  selfSuggestHints: string;
  moderationEnabled: boolean;
  moderationModel: string;
  moderationPrompt: string;
  locales: string[];
  defaultLocale: string;
};

const MODEL_OPTIONS = ["claude-haiku-4-5", "claude-sonnet-4-6", "claude-opus-4-8"];

export function SettingsScreen(props: {
  admins: AdminEntry[];
  apiKeys: ApiKeyEntry[];
  categories: CategoryEntry[];
  profiles: ProfileEntry[];
  settings: SettingsValues;
}) {
  const [tab, setTab] = useState<Tab>("Generation");

  return (
    <>
      <PageHead title="Settings" />
      <div className="mb-4 flex flex-wrap items-center gap-0.5 border-b border-admin-border">
        {TABS.map((t) => (
          <button
            key={t}
            className={cn(
              "border-b-2 border-transparent px-3 py-2 text-[12.5px] font-semibold text-admin-ink-dim hover:text-admin-ink",
              tab === t && "border-accent text-admin-ink",
            )}
            onClick={() => setTab(t)}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === "Admins" && <AdminsTab admins={props.admins} />}
      {tab === "API keys" && <ApiKeysTab apiKeys={props.apiKeys} />}
      {tab === "Categories" && <CategoriesTab categories={props.categories} locales={props.settings.locales} />}
      {tab === "Generation" && <GenerationTab profiles={props.profiles} settings={props.settings} />}
    </>
  );
}

/* ── Admins ───────────────────────────────────────────────────────────────── */

function AdminsTab({ admins }: { admins: AdminEntry[] }) {
  const [state, formAction, pending] = useActionState(inviteAdminAction, null);
  return (
    <Panel title="Allowlisted admins" flush>
      <div className="border-b border-admin-border-soft p-4">
        <form action={formAction} className="flex items-end gap-2">
          <Field label="Invite admin (email)">
            <input name="email" type="email" required placeholder="colleague@example.com" className={cn(fieldClass, "w-72")} />
          </Field>
          <button disabled={pending} className={adminBtnClass({ kind: "primary" })}>
            {pending ? "Inviting…" : "+ Invite admin"}
          </button>
          {state && !state.ok && (
            <p role="alert" className="pb-2 text-xs font-semibold text-accent">
              {state.error}
            </p>
          )}
        </form>
        <p className="mt-2 text-xs text-admin-ink-dim">
          Existing accounts are promoted immediately; everyone else becomes admin on their first
          sign-in with this email.
        </p>
      </div>
      <table className={tableClass}>
        <thead>
          <tr>
            <th className={thClass}>Email</th>
            <th className={thClass}>Account</th>
            <th className={thClass}>Added</th>
            <th className={thClass}></th>
          </tr>
        </thead>
        <tbody>
          {admins.map((a) => (
            <tr key={a.email} className="last:[&>td]:border-b-0">
              <td className={tdClass}>
                <CellTitle>
                  {a.email}
                  {a.isSelf ? " (you)" : ""}
                </CellTitle>
              </td>
              <td className={cn(tdClass, "text-xs text-admin-ink-dim")}>
                {a.hasAccount ? "signed up" : "invited, not signed up yet"}
              </td>
              <td className={cn(tdClass, "text-xs text-admin-ink-dim")}>
                {formatDateTime(new Date(a.added))}
              </td>
              <td className={cn(tdClass, "text-right")}>
                {!a.isSelf && (
                  <form action={removeAdminAction}>
                    <input type="hidden" name="email" value={a.email} />
                    <button className={adminBtnClass({ small: true })}>Remove</button>
                  </form>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Panel>
  );
}

/* ── API keys ─────────────────────────────────────────────────────────────── */

function ApiKeysTab({ apiKeys }: { apiKeys: ApiKeyEntry[] }) {
  const [showCreate, setShowCreate] = useState(false);
  return (
    <Panel
      title="Bot submission keys"
      flush
      actions={
        <button className={adminBtnClass({ kind: "primary", small: true })} onClick={() => setShowCreate(true)}>
          + Create key
        </button>
      }
    >
      {showCreate && <CreateKeyDialog onClose={() => setShowCreate(false)} />}
      <p className="border-b border-admin-border-soft p-4 text-xs text-admin-ink-dim">
        Key value is shown once on creation, then stored hashed. Bots POST /api/suggestions with
        it, rate-limited to 60 requests/hour.
      </p>
      <table className={tableClass}>
        <thead>
          <tr>
            <th className={thClass}>Name</th>
            <th className={thClass}>Created</th>
            <th className={thClass}>Status</th>
            <th className={thClass}></th>
          </tr>
        </thead>
        <tbody>
          {apiKeys.length === 0 && (
            <tr>
              <td colSpan={4} className={cn(tdClass, "text-admin-ink-dim")}>
                No keys yet.
              </td>
            </tr>
          )}
          {apiKeys.map((k) => (
            <tr key={k.id} className={cn("last:[&>td]:border-b-0", k.revokedAt && "opacity-55")}>
              <td className={cn(tdClass, "font-mono text-xs font-semibold")}>{k.name}</td>
              <td className={cn(tdClass, "text-xs text-admin-ink-dim")}>
                {formatDateTime(new Date(k.createdAt))}
              </td>
              <td className={tdClass}>
                {k.revokedAt ? (
                  <span className="rounded-[3px] bg-[#ececec] px-2 py-0.5 text-[10.5px] font-bold uppercase text-admin-ink-dim">
                    Revoked
                  </span>
                ) : (
                  <span className="rounded-[3px] bg-[oklch(0.93_0.05_150)] px-2 py-0.5 text-[10.5px] font-bold uppercase text-[oklch(0.38_0.09_150)]">
                    Active
                  </span>
                )}
              </td>
              <td className={cn(tdClass, "text-right")}>
                {!k.revokedAt && (
                  <form action={revokeApiKeyAction}>
                    <input type="hidden" name="keyId" value={k.id} />
                    <button className={adminBtnClass({ small: true })}>Revoke</button>
                  </form>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Panel>
  );
}

function CreateKeyDialog({ onClose }: { onClose: () => void }) {
  const [state, formAction, pending] = useActionState(createApiKeyAction, null);
  const [copied, setCopied] = useState(false);
  const created = state?.ok && state.plainKey;

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-[480px]">
        {!created ? (
          <form action={formAction}>
            <DialogHeader>
              <DialogTitle className="text-sm font-bold">Create API key</DialogTitle>
            </DialogHeader>
            <div className="flex flex-col gap-3.5 py-4">
              <Field label="Key name" hint="Shown as the submitter on topics this bot creates.">
                <input name="name" type="text" required placeholder="e.g. reddit-trawler" autoFocus className={fieldClass} />
              </Field>
              <p className="text-[11.5px] leading-relaxed text-admin-ink-dim">
                The key authorizes <span className="font-mono">POST /api/suggestions</span>,
                rate-limited to 60 requests/hour. Submissions pass AI moderation before reaching
                the topic queue.
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
                {pending ? "Creating…" : "Create key"}
              </button>
            </DialogFooter>
          </form>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle className="text-sm font-bold">Key created — copy it now</DialogTitle>
            </DialogHeader>
            <div className="flex flex-col gap-2.5 py-4">
              <div className="flex items-center gap-2 rounded border border-admin-border bg-[#fafbfb] px-3 py-2.5">
                <span className="flex-1 break-all font-mono text-[12.5px]">{state.plainKey}</span>
                <button
                  className={adminBtnClass({ small: true })}
                  onClick={async () => {
                    await navigator.clipboard.writeText(state.plainKey!);
                    setCopied(true);
                  }}
                >
                  {copied ? "Copied ✓" : "Copy"}
                </button>
              </div>
              <p className="rounded border border-[oklch(0.85_0.07_85)] bg-[oklch(0.96_0.04_85)] px-3 py-2 text-xs font-semibold leading-relaxed text-[oklch(0.45_0.10_70)]">
                This is the only time the key is shown. It&apos;s stored hashed — if it&apos;s
                lost, revoke it and create a new one.
              </p>
            </div>
            <DialogFooter>
              <button className={adminBtnClass({ kind: "primary" })} onClick={onClose}>
                Done, I saved it
              </button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

/* ── Categories ───────────────────────────────────────────────────────────── */

function CategoriesTab({
  categories,
  locales,
}: {
  categories: CategoryEntry[];
  locales: string[];
}) {
  const [editing, setEditing] = useState<CategoryEntry | "new" | null>(null);
  return (
    <Panel
      title="Categories"
      flush
      actions={
        <button className={adminBtnClass({ kind: "primary", small: true })} onClick={() => setEditing("new")}>
          + Add category
        </button>
      }
    >
      {editing && (
        <CategoryDialog
          category={editing === "new" ? null : editing}
          locales={locales}
          onClose={() => setEditing(null)}
        />
      )}
      <table className={tableClass}>
        <thead>
          <tr>
            {locales.map((l) => (
              <th key={l} className={thClass}>
                {l.toUpperCase()} name / slug
              </th>
            ))}
            <th className={thClass}></th>
          </tr>
        </thead>
        <tbody>
          {categories.map((c) => (
            <tr key={c.id} className="last:[&>td]:border-b-0">
              {c.translations.map((t) => (
                <td key={t.locale} className={tdClass}>
                  <CellTitle>{t.name || "—"}</CellTitle>
                  <span className="font-mono text-[11px] text-admin-ink-dim">/{t.slug}</span>
                </td>
              ))}
              <td className={cn(tdClass, "text-right")}>
                <button className={adminBtnClass({ small: true })} onClick={() => setEditing(c)}>
                  Edit
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Panel>
  );
}

function CategoryDialog({
  category,
  locales,
  onClose,
}: {
  category: CategoryEntry | null;
  locales: string[];
  onClose: () => void;
}) {
  const [state, formAction, pending] = useActionState(
    async (prev: Awaited<ReturnType<typeof saveCategoryAction>> | null, formData: FormData) => {
      const result = await saveCategoryAction(prev, formData);
      if (result.ok) onClose();
      return result;
    },
    null,
  );
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-[480px]">
        <form action={formAction}>
          {category && <input type="hidden" name="categoryId" value={category.id} />}
          <DialogHeader>
            <DialogTitle className="text-sm font-bold">
              {category ? "Edit category" : "Add category"}
            </DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-3.5 py-4">
            {locales.map((locale) => {
              const t = category?.translations.find((x) => x.locale === locale);
              return (
                <div key={locale} className="flex gap-3.5">
                  <Field label={`${locale.toUpperCase()} name`}>
                    <input name={`name_${locale}`} defaultValue={t?.name ?? ""} required className={fieldClass} />
                  </Field>
                  <Field label={`${locale.toUpperCase()} slug`}>
                    <input name={`slug_${locale}`} defaultValue={t?.slug ?? ""} required className={fieldMonoClass} />
                  </Field>
                </div>
              );
            })}
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
              {pending ? "Saving…" : "Save"}
            </button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/* ── Generation (profiles + pipeline + moderation) ────────────────────────── */

function GenerationTab({
  profiles,
  settings,
}: {
  profiles: ProfileEntry[];
  settings: SettingsValues;
}) {
  return (
    <>
      <ProfilesPanel profiles={profiles} />
      <div className="grid grid-cols-2 items-start gap-4 max-[980px]:grid-cols-1">
        <form action={savePipelineSettingsAction}>
          <Panel
            title="Pipeline"
            actions={
              <button type="submit" className={adminBtnClass({ kind: "primary", small: true })}>
                Save
              </button>
            }
          >
            <div className="flex flex-col gap-3.5">
              <div className="flex gap-3.5">
                <Field label="Auto-generate">
                  <select name="autoGenerate" defaultValue={settings.autoGenerateEnabled ? "on" : "off"} className={fieldClass}>
                    <option value="on">Enabled</option>
                    <option value="off">Disabled</option>
                  </select>
                </Field>
                <Field label="Per-run cap">
                  <input name="autoGenerateBatchSize" type="number" min={1} defaultValue={settings.autoGenerateBatchSize} className={fieldClass} />
                </Field>
              </div>
              <div className="flex gap-3.5">
                <Field label="Self-suggestion (daily)">
                  <select name="selfSuggest" defaultValue={settings.selfSuggestEnabled ? "on" : "off"} className={fieldClass}>
                    <option value="on">Enabled</option>
                    <option value="off">Disabled</option>
                  </select>
                </Field>
                <Field label="Topics per run">
                  <input name="selfSuggestCount" type="number" min={1} defaultValue={settings.selfSuggestCount} className={fieldClass} />
                </Field>
              </div>
              <Field label="Self-suggestion hints" hint="Free-text steering for the daily brainstorm.">
                <textarea name="selfSuggestHints" rows={3} defaultValue={settings.selfSuggestHints} className={fieldClass} />
              </Field>
              <div className="flex gap-3.5">
                <Field label="Locales">
                  <input type="text" defaultValue={settings.locales.join(", ")} disabled className={fieldClass} />
                </Field>
                <Field label="Default locale">
                  <input type="text" defaultValue={settings.defaultLocale} disabled className={fieldClass} />
                </Field>
              </div>
            </div>
          </Panel>
        </form>

        <form action={saveModerationSettingsAction}>
          <Panel
            title="Moderation"
            actions={
              <div className="flex gap-2">
                <button formAction={resetModerationPromptAction} className={adminBtnClass({ small: true })}>
                  Reset to default
                </button>
                <button type="submit" className={adminBtnClass({ kind: "primary", small: true })}>
                  Save
                </button>
              </div>
            }
          >
            <div className="flex flex-col gap-3.5">
              <div className="flex gap-3.5">
                <Field label="Moderation">
                  <select name="moderation" defaultValue={settings.moderationEnabled ? "on" : "off"} className={fieldClass}>
                    <option value="on">Enabled</option>
                    <option value="off">Disabled</option>
                  </select>
                </Field>
                <Field label="Model">
                  <select name="moderationModel" defaultValue={settings.moderationModel} className={fieldClass}>
                    {MODEL_OPTIONS.map((m) => (
                      <option key={m}>{m}</option>
                    ))}
                  </select>
                </Field>
              </div>
              <Field
                label="Moderation prompt"
                hint="Screens API submissions and AI self-suggestions. Admin-added topics skip it. Fails open."
              >
                <textarea name="moderationPrompt" rows={9} defaultValue={settings.moderationPrompt} className={fieldMonoClass} />
              </Field>
            </div>
          </Panel>
        </form>
      </div>
    </>
  );
}

function ProfilesPanel({ profiles }: { profiles: ProfileEntry[] }) {
  const [selectedId, setSelectedId] = useState<number | "new">(profiles[0]?.id ?? "new");
  const selected = selectedId === "new" ? null : profiles.find((p) => p.id === selectedId) ?? null;
  const [state, formAction, pending] = useActionState(
    selected ? updateProfileAction : createProfileAction,
    null,
  );

  return (
    <Panel
      title="Generation profiles"
      flush
      actions={
        <button className={adminBtnClass({ kind: "primary", small: true })} onClick={() => setSelectedId("new")}>
          + New profile
        </button>
      }
    >
      <div className="grid grid-cols-[280px_1fr] items-start max-[980px]:grid-cols-1">
        <div className="flex flex-col gap-1.5 border-r border-admin-border-soft p-3.5 max-[980px]:border-b max-[980px]:border-r-0">
          {profiles.map((p) => (
            <button
              key={p.id}
              className={cn(
                "flex flex-col gap-1 rounded border border-admin-border-soft px-3 py-2.5 text-left hover:border-admin-border hover:bg-[#fafbfb]",
                selectedId === p.id && "border-admin-blue bg-[#f2f6fa]",
              )}
              onClick={() => setSelectedId(p.id)}
            >
              <span className="flex items-center gap-2 text-[13px] font-semibold">
                {p.name}
                {p.isDefault && (
                  <span className="rounded-[3px] bg-[oklch(0.93_0.03_250)] px-2 py-0.5 text-[10.5px] font-bold uppercase text-[oklch(0.40_0.10_250)]">
                    Default
                  </span>
                )}
              </span>
              <span className="font-mono text-[11px] text-admin-ink-dim">
                {p.model} · temp {p.temperature === null ? "model default" : p.temperature.toFixed(1)}
              </span>
            </button>
          ))}
          <p className="pt-1 text-xs text-admin-ink-dim">
            Topics use the default profile unless one is set on the topic.
          </p>
        </div>

        <form action={formAction} key={selectedId} className="flex flex-col gap-3.5 p-4">
          {selected && <input type="hidden" name="profileId" value={selected.id} />}
          <div className="flex gap-3.5">
            <Field label="Profile name">
              <input name="name" defaultValue={selected?.name ?? ""} required placeholder="e.g. Long-form opinion" className={fieldClass} />
            </Field>
            <Field label="Model">
              <select name="model" defaultValue={selected?.model ?? "claude-sonnet-4-6"} className={fieldClass}>
                {MODEL_OPTIONS.map((m) => (
                  <option key={m}>{m}</option>
                ))}
              </select>
            </Field>
          </div>
          <div className="flex gap-3.5">
            <Field label="Temperature" hint="Leave empty for the model default (required for Opus 4.7+).">
              <input
                name="temperature"
                type="number"
                step="0.1"
                min="0"
                max="1"
                defaultValue={selected?.temperature ?? ""}
                className={fieldClass}
              />
            </Field>
            <Field label="Max output tokens">
              <input name="maxOutputTokens" type="number" defaultValue={selected?.maxOutputTokens ?? 4096} className={fieldClass} />
            </Field>
          </div>
          <Field label="Writing instructions" hint="Appended to the generation prompt for articles using this profile.">
            <textarea name="instructions" rows={5} defaultValue={selected?.instructions ?? ""} className={fieldClass} />
          </Field>
          {state && !state.ok && (
            <p role="alert" className="text-xs font-semibold text-accent">
              {state.error}
            </p>
          )}
          <div className="flex items-center gap-2">
            <button type="submit" disabled={pending} className={adminBtnClass({ kind: "primary", small: true })}>
              {pending ? "Saving…" : selected ? "Save profile" : "Create profile"}
            </button>
            {selected && !selected.isDefault && (
              <>
                <button formAction={makeDefaultProfileAction} className={adminBtnClass({ small: true })}>
                  Make default
                </button>
                <button formAction={deleteProfileAction} className={adminBtnClass({ small: true })}>
                  Delete
                </button>
              </>
            )}
            {selected?.isDefault && (
              <span className="text-xs text-admin-ink-dim">The default profile can&apos;t be deleted.</span>
            )}
          </div>
        </form>
      </div>
    </Panel>
  );
}
