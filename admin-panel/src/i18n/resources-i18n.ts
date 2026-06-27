import type { T } from "./server";
import type { ResourceField } from "@/lib/admin/resources";

export function resourceTitle(t: T, slug: string, plural: boolean): string {
  return t(`resource.${slug}.${plural ? "plural" : "singular"}`);
}

// Returns fields with translated labels and (for status selects) translated option labels.
export function localizeFields(t: T, fields: ResourceField[]): ResourceField[] {
  return fields.map((f) => ({
    ...f,
    label: t(`field.${f.name}`),
    options: f.options?.map((o) => ({
      value: o.value,
      label: t(`status.${o.value}`),
    })),
  }));
}
