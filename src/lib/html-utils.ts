/**
 * Converts rich text HTML (from WYSIWYG / Quill) into clean plain text
 * with natural line breaks and preserved intentional blank lines,
 * preventing unwanted extra gaps between lines when copied/pasted.
 */
export function htmlToCleanPlainText(html: string): string {
  if (!html) return "";

  // Normalize line breaks
  let text = html.replace(/\r\n/g, "\n");

  // Handle explicit <br> tags
  text = text.replace(/<br\s*[\/]?>/gi, "\n");

  // Handle empty paragraphs like <p><br></p> or <p></p> -> single newline
  text = text.replace(/<p[^>]*>(\s*|\n*|&nbsp;*)<\/p>/gi, "\n");

  // Closing block elements convert to a single newline
  text = text.replace(/<\/(p|div|li|h[1-6]|tr)>/gi, "\n");

  // List item bullets
  text = text.replace(/<li[^>]*>/gi, "- ");

  // Strip all other HTML tags
  text = text.replace(/<[^>]+>/g, "");

  // Decode common HTML entities
  text = text
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");

  // Normalize excessive consecutive newlines: collapse 3+ into max 2 (\n\n = one blank line)
  text = text.replace(/\n{3,}/g, "\n\n");

  return text.trim();
}

