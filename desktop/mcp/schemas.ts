import { z } from "zod";
const id = z.string().min(1).max(200);
const offset = z.number().int().nonnegative();
const target = { editorSessionId: id };
const paging = {
  offset: offset.optional(),
  limit: z.number().int().min(1).max(200).optional(),
};
const scope = {
  documentId: id.optional(),
  sceneName: z.string().min(1).max(200).optional(),
};
const command = z
  .object({
    name: z.string().min(1).max(200),
    displayName: z.string().max(500).optional(),
    description: z.string().max(10000),
    example: z.string().max(10000),
    params: z
      .array(
        z
          .object({
            name: z.string().min(1).max(200),
            type: z.enum(["string", "number", "boolean"]),
            required: z.boolean(),
            defaultValue: z.string().max(10000),
            displayName: z.string().max(500).optional(),
            description: z.string().max(10000).optional(),
          })
          .strict(),
      )
      .max(100),
  })
  .strict();
export const schemas = {
  list_editor_sessions: z.object({}).strict(),
  list_projects: z
    .object({ query: z.string().max(500).optional(), ...paging })
    .strict(),
  open_project: z
    .object({ projectId: id, focus: z.boolean().default(false) })
    .strict(),
  activate_editor_session: z
    .object({
      ...target,
      tabId: id.optional(),
      focus: z.boolean().default(false),
    })
    .strict(),
  reveal_location: z
    .object({
      ...target,
      documentId: id,
      from: offset,
      to: offset.optional(),
      focus: z.boolean().default(false),
    })
    .strict(),
  get_editor_context: z
    .object({
      ...target,
      surroundingLines: z.number().int().min(0).max(100).default(10),
    })
    .strict(),
  read_document: z
    .object({
      ...target,
      documentId: id,
      from: offset.default(0),
      to: offset.optional(),
    })
    .strict(),
  query_project: z
    .object({
      ...target,
      kind: z.enum([
        "documents",
        "scenes",
        "links",
        "variables",
        "references",
        "commands",
        "calls",
        "unknown_commands",
      ]),
      query: z.string().max(500).optional(),
      documentId: id.optional(),
      ...paging,
    })
    .strict(),
  validate_project: z
    .object({ ...target, documentId: id.optional(), ...paging })
    .strict(),
  get_statistics: z.object({ ...target, ...scope }).strict(),
  update_commands: z
    .object({
      ...target,
      snapshotId: id,
      operationId: id.optional(),
      preview: z.boolean().default(false),
      commands: z.array(command).min(1).max(200),
    })
    .strict(),
  apply_changes: z
    .object({
      ...target,
      snapshotId: id,
      operationId: id.optional(),
      preview: z.boolean().default(false),
      label: z.string().min(1).max(200).default("Agent 修改"),
      change: z.discriminatedUnion("kind", [
        z
          .object({
            kind: z.literal("edits"),
            documents: z
              .array(
                z
                  .object({
                    id,
                    version: offset,
                    edits: z
                      .array(
                        z
                          .object({
                            from: offset,
                            to: offset,
                            insert: z.string().max(200000),
                          })
                          .strict(),
                      )
                      .min(1)
                      .max(1000),
                  })
                  .strict(),
              )
              .min(1)
              .max(200),
          })
          .strict(),
        z
          .object({
            kind: z.literal("create_scene"),
            documentId: id,
            name: z.string().min(1).max(200),
          })
          .strict(),
        z
          .object({
            kind: z.literal("rename_scene"),
            documentId: id,
            fromName: z.string().min(1).max(200),
            name: z.string().min(1).max(200),
          })
          .strict(),
      ]),
    })
    .strict(),
  apply_quick_fixes: z
    .object({
      ...target,
      snapshotId: id,
      operationId: id.optional(),
      preview: z.boolean().default(false),
      fixIds: z.array(id).min(1).max(100),
    })
    .strict(),
};
export const descriptions: Record<keyof typeof schemas, string> = {
  list_editor_sessions:
    "List live editor windows and explicit session IDs. No global active project is assumed.",
  list_projects:
    "List known projects without loading their scripts; includes availability and live sessions.",
  open_project:
    "Open a known catalog project in a new window, or return its existing sessions. Does not replace another project. focus defaults false.",
  activate_editor_session:
    "Choose an editor session and optionally its active tab. Return context; pass this explicit session ID on later calls. focus defaults false.",
  reveal_location:
    "Reveal a source range in the selected editor session. Offsets are zero-based UTF-16 in the original document, end-exclusive. focus defaults false.",
  get_editor_context:
    "Read live active page, cursor, selections, visible source ranges and nearby text. Preserves selection after App loses focus; returns a versioned snapshot.",
  read_document:
    "Read current original source by document ID and UTF-16 range. Response is bounded and includes nextFrom when truncated.",
  query_project:
    "Query shared editor semantics. Results are static facts, not proof of runtime execution. Returns a versioned snapshot and pagination.",
  validate_project:
    "Get the same diagnostics as the editor, with individually selectable version-bound quick fixes. Read labels before applying defaults that could change intent.",
  get_statistics:
    "Get author statistics using the same definitions as the UI. Optional document and scene scope; English words and dialogue characters are separate metrics.",
  update_commands:
    "Upsert custom command definitions against a snapshot. Does not implement game runtime commands or overwrite unapplied UI drafts. Supports preview; writes require operationId.",
  apply_changes:
    "Apply a version-checked atomic text batch, create a scene, or rename a scene with static references. One Undo step. Supports preview; writes require unique operationId. Never silently overwrites stale versions.",
  apply_quick_fixes:
    "Apply only explicitly selected quick-fix IDs from a validation snapshot. Text and command fixes cannot be mixed. Supports preview; writes require operationId.",
};
