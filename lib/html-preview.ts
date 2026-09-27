export function extractHtmlDocument(output: string): string | null {
  const fenced = output.match(/```html\s*([\s\S]*?)```/i);
  const candidate = (fenced ? fenced[1] : output).trim();
  if (/^<!doctype html/i.test(candidate) || /^<html[\s>]/i.test(candidate)) {
    return candidate;
  }
  return null;
}
