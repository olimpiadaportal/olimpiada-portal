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
  // NOTE (Round 52): "topics" and "subtopics" LEFT this registry. They are now
  // managed together on the dedicated Curriculum Structure screen
  // (/curriculum + lib/admin/curriculum.ts): a Subject › Topic › Subtopic tree
  // that the generic two-table CRUD could not express — a topic's Rüb cascades
  // to its subtopics AND its questions, a subtopic's Rüb is DB-inherited from
  // its parent, and deleting a topic silently cascades its subtopics while
  // SET-NULLing the taxonomy of any question that referenced it (so that delete
  // has to be blocked, not merely confirmed). Removing them from the registry
  // also removes /manage/topics and /manage/subtopics — the pages 404 by
  // design; nothing in the DB changed.
  //
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
