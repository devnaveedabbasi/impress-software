type ClassValue = string | number | null | boolean | undefined;

export function cn(...values: ClassValue[]) {
  return values.filter(Boolean).join(" ");
}
