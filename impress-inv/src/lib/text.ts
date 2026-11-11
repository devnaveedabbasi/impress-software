// Short preview for table cells and form fields: the first few words only. The full text opens in a modal.
export function previewText(text: string | null | undefined, maxWords = 4, maxChars = 28) {
  const clean = String(text ?? "").replace(/\s+/g, " ").trim();
  if (!clean) return "";
  const words = clean.split(" ");
  let preview = words.slice(0, maxWords).join(" ");
  if (preview.length > maxChars) preview = preview.slice(0, maxChars).trimEnd();
  return preview.length < clean.length ? `${preview}…` : preview;
}
