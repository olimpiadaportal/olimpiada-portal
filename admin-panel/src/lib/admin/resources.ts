// Allowlisted registry of manageable taxonomy/config resources.
// Server actions only operate on tables/columns defined here — the slug and
// field names are never taken raw from the client. RLS is the final gate.
//
// NOTE: the internal `code` column (subjects/question_types/olympiad_types) is no
// longer a UI input — it is auto-generated server-side from `name` when a row is
// created (resources with `autoCode: true`). The "difficulty" feature has been
// removed from the platform, so there is no difficulty-levels resource.

export type FieldType = "text" | "number" | "boolean" | "select" | "reference";

export type ResourceField = {
  name: string;
  label: string;
  type: FieldType;
  required?: boolean;
  step?: string; // for number inputs
  options?: { value: string; label: string }[]; // for select
  ref?: { table: string; labelColumn: string; orderBy?: string }; // for reference
};

export type Resource = {
  slug: string;
  table: string;
  label: string; // singular
  labelPlural: string;
  group: string;
  adminOnly: boolean;
  orderBy: string;
  fields: ResourceField[];
  listColumns: string[];
  autoCode?: boolean; // auto-generate the stable `code` column from `name` on insert
};

const STATUS_OPTIONS = [
  { value: "active", label: "Public" },
  { value: "inactive", label: "Private" },
  { value: "archived", label: "Archived" },
];

export const RESOURCES: Record<string, Resource> = {
  grades: {
    slug: "grades",
    table: "grades",
    label: "Grade",
    labelPlural: "Grades",
    group: "Taxonomy",
    adminOnly: true,
    orderBy: "level",
    fields: [
      { name: "level", label: "Level (1–11)", type: "number", required: true, step: "1" },
      { name: "name", label: "Name", type: "text", required: true },
    ],
    listColumns: ["level", "name"],
  },
  subjects: {
    slug: "subjects",
    table: "subjects",
    label: "Subject",
    labelPlural: "Subjects",
    group: "Taxonomy",
    adminOnly: true,
    orderBy: "name",
    autoCode: true,
    fields: [
      { name: "name", label: "Name", type: "text", required: true },
      { name: "status", label: "Status", type: "select", options: STATUS_OPTIONS },
    ],
    listColumns: ["name", "status"],
  },
  topics: {
    slug: "topics",
    table: "topics",
    label: "Topic",
    labelPlural: "Topics",
    group: "Taxonomy",
    adminOnly: true,
    orderBy: "order_index",
    fields: [
      { name: "subject_id", label: "Subject", type: "reference", required: true, ref: { table: "subjects", labelColumn: "name", orderBy: "name" } },
      { name: "grade_id", label: "Grade", type: "reference", ref: { table: "grades", labelColumn: "name", orderBy: "level" } },
      { name: "name", label: "Name", type: "text", required: true },
      { name: "order_index", label: "Order", type: "number", step: "1" },
      { name: "status", label: "Status", type: "select", options: STATUS_OPTIONS },
    ],
    listColumns: ["subject_id", "grade_id", "name", "order_index", "status"],
  },
  subtopics: {
    slug: "subtopics",
    table: "subtopics",
    label: "Subtopic",
    labelPlural: "Subtopics",
    group: "Taxonomy",
    adminOnly: true,
    orderBy: "order_index",
    fields: [
      { name: "topic_id", label: "Topic", type: "reference", required: true, ref: { table: "topics", labelColumn: "name", orderBy: "name" } },
      { name: "name", label: "Name", type: "text", required: true },
      { name: "order_index", label: "Order", type: "number", step: "1" },
      { name: "status", label: "Status", type: "select", options: STATUS_OPTIONS },
    ],
    listColumns: ["topic_id", "name", "order_index", "status"],
  },
  // NOTE: question-types moved OUT of this registry to a dedicated advanced
  // page (/question-types + lib/admin/question-types.ts): the per-type
  // structure rules (status, options_required, correct_required) need range
  // validation, an immutable code and a delete guard the generic form
  // cannot express.
  "olympiad-types": {
    slug: "olympiad-types",
    table: "olympiad_types",
    label: "Olympiad type",
    labelPlural: "Olympiad types",
    group: "Content config",
    adminOnly: true,
    orderBy: "name",
    autoCode: true,
    fields: [
      { name: "name", label: "Name", type: "text", required: true },
    ],
    listColumns: ["name"],
  },
};

export function getResource(slug: string): Resource | null {
  return RESOURCES[slug] ?? null;
}
