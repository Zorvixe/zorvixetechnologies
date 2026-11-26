import DOMPurify from "dompurify";
import linkifyHtml from "linkify-html";

const ALLOWED_TAGS = [
  "b", "i", "u", "em", "strong", "a", "p", "ul", "ol", "li", "br", "span", "div", "code", "blockquote", "h1", "h2", "h3", "h4"
];
const ALLOWED_ATTR = ["href", "title", "target", "rel", "class", "style"];

const truncateUrl = (url, maxLength = 45) => {
  if (!url) return "";
  if (url.length <= maxLength) return url;
  return url.slice(0, maxLength) + "...";
};

/**
 * Sanitizes rich-text HTML (or preserves plain-text newlines safely) and linkifies URLs.
 */
export function renderSafeHtml(input) {
  if (!input) return "";
  const raw = String(input);
  const hasHtml = /<\/?[a-z][\s\S]*>/i.test(raw);
  const normalized = hasHtml ? raw : raw.replace(/\r?\n/g, "<br/>");

  const sanitized = DOMPurify.sanitize(normalized, {
    ALLOWED_TAGS,
    ALLOWED_ATTR,
  });

  const linkified = linkifyHtml(sanitized, {
    defaultProtocol: "https",
    attributes: {
      rel: "noopener noreferrer",
      target: "_blank",
    },
    format: (value, type) => (type === "url" ? truncateUrl(value) : value),
  });

  return DOMPurify.sanitize(linkified, {
    ALLOWED_TAGS,
    ALLOWED_ATTR,
  });
}

/**
 * Extracts plain text from HTML (useful for validation and compact table snippets).
 */
export function stripHtmlText(input) {
  if (!input) return "";
  return DOMPurify.sanitize(String(input), { ALLOWED_TAGS: [], ALLOWED_ATTR: [] })
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
