/** Message on the `article-generation` queue requesting a full article generation. */
export type GenerateArticleMessage = {
  kind: "generate";
  topicId: number;
  trigger: "manual" | "cron" | "batch";
  requestedBy?: string;
  /** Set on regeneration: replace this article's content in place. */
  replaceArticleId?: number;
};

/** Message requesting (re)translation of an existing article into one locale. */
export type TranslateArticleMessage = {
  kind: "translate";
  articleId: number;
  locale: string;
};

export type GenerationMessage = GenerateArticleMessage | TranslateArticleMessage;
