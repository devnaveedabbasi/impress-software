// Price format of Pakistan: the last three digits, then groups of two (5,00,000). Whole rupees only.

const groupDigits = (clean: string) => {
  if (clean.length <= 3) return clean;
  const lastThree = clean.slice(-3);
  const rest = clean.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ",");
  return `${rest},${lastThree}`;
};

// "500000" -> "5,00,000"   "-500000" -> "-5,00,000"
export function formatPrice(value: string | number | null | undefined): string {
  const text = String(value ?? "");
  const negative = text.trim().startsWith("-");
  const clean = text.replace(/\D/g, "").replace(/^0+(?=\d)/, "");
  return (negative ? "-" : "") + groupDigits(clean);
}

// "5,00,000" -> "500000" (what the form keeps and the server gets). A minus is kept only when allowNegative.
export function parsePrice(text: string, allowNegative = false): string {
  const negative = allowNegative && text.trim().startsWith("-");
  const clean = text.replace(/\D/g, "").replace(/^0+(?=\d)/, "");
  return negative ? `-${clean}` : clean;
}
