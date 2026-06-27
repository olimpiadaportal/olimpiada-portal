"use server";

// Generic, allowlisted create/update/delete for taxonomy/config resources.
// Security: the slug must exist in RESOURCES; only registry-defined columns are
// written; access is re-checked server-side; RLS is the final gate.
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getResource, type Resource } from "@/lib/admin/resources";
import { requireAdmin, requirePanelAccess } from "@/lib/admin/guards";

export type SaveState = { error?: string } | null;

async function authorize(res: Resource) {
  if (res.adminOnly) await requireAdmin();
  else await requirePanelAccess();
}

function buildPayload(res: Resource, formData: FormData) {
  const payload: Record<string, unknown> = {};
  for (const f of res.fields) {
    if (f.type === "boolean") {
      payload[f.name] = formData.get(f.name) != null;
      continue;
    }
    const raw = formData.get(f.name);
    const val = typeof raw === "string" ? raw.trim() : "";
    if (f.type === "number") payload[f.name] = val === "" ? null : Number(val);
    else if (f.type === "reference" || f.type === "select")
      payload[f.name] = val === "" ? null : val;
    else payload[f.name] = val;
  }
  return payload;
}

export async function saveRow(
  _prev: SaveState,
  formData: FormData,
): Promise<SaveState> {
  const slug = String(formData.get("__slug") ?? "");
  const id = String(formData.get("__id") ?? "");
  const res = getResource(slug);
  if (!res) return { error: "Unknown resource." };
  await authorize(res);

  const supabase = await createClient();
  const payload = buildPayload(res, formData);

  if (id) {
    const { error } = await supabase.from(res.table).update(payload).eq("id", id);
    if (error) return { error: error.message };
    revalidatePath(`/manage/${slug}`);
    redirect(`/manage/${slug}`);
  } else {
    const { error } = await supabase.from(res.table).insert(payload);
    if (error) return { error: error.message };
    revalidatePath(`/manage/${slug}`);
    return null;
  }
}

export async function deleteRow(formData: FormData): Promise<void> {
  const slug = String(formData.get("__slug") ?? "");
  const id = String(formData.get("__id") ?? "");
  const res = getResource(slug);
  if (!res || !id) return;
  await authorize(res);

  const supabase = await createClient();
  await supabase.from(res.table).delete().eq("id", id);
  revalidatePath(`/manage/${slug}`);
}
