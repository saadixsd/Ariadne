import { TaskRunError } from "@/lib/errors";

/** Throws a 400 with a message the UI can show as-is when `value` is over `max` characters. */
export function assertMaxLength(label: string, value: string, max: number) {
  if (value.length > max) {
    throw new TaskRunError(
      `${label} is too long (${value.length.toLocaleString("en-US")} characters). The limit is ${max.toLocaleString("en-US")}.`,
      400,
      { field: label.toLowerCase(), limit: max, length: value.length },
    );
  }
}
