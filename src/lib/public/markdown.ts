import { marked, Renderer } from "marked";

/**
 * Renders article body_md to HTML for the public site. The generator's
 * markdown is deliberately plain (paragraphs + at most one "> " pull quote);
 * admins may edit, so raw HTML is escaped rather than passed through —
 * everything else (links, emphasis, lists) renders normally.
 */
const renderer = new Renderer();

const escapeHtml = (html: string) =>
  html
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");

renderer.html = ({ text }) => escapeHtml(text);

export function renderArticleHtml(bodyMd: string): string {
  return marked.parse(bodyMd, { renderer, async: false, breaks: false, gfm: true });
}
