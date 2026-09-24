import { z } from "zod";

export type PlaySource = {
  documentId: string;
  version: number;
  line: number;
  column: number;
  from: number;
};
export type PlayEvent = {
  id: number;
  kind:
    | "line"
    | "command"
    | "options"
    | "choice"
    | "variable"
    | "override"
    | "condition"
    | "scene"
    | "transfer"
    | "error";
  text: string;
  source?: PlaySource | null;
};
export type PlayState = {
  protocolVersion: 1;
  revision: number;
  status:
    "idle" | "ready" | "line" | "options" | "completed" | "stopped" | "error";
  scene: string;
  canBack: boolean;
  events: PlayEvent[];
  options: {
    id: number;
    text: string;
    available: boolean;
    source?: PlaySource;
  }[];
  variables: {
    name: string;
    type: string;
    value: string | number | boolean;
    initial: string | number | boolean;
    editable: boolean;
    source?: PlaySource;
  }[];
  scenes: string[];
  diagnostics: { message: string; severity: string; source?: PlaySource }[];
};
const name = z.string().trim().min(1).max(160);
const assetId = z.string().regex(/^[a-f0-9]{64}\.(png|jpg|webp)$/);
export const characterSchema = z.object({
  name,
  displayName: z.string().max(160),
  color: z.string().regex(/^#[a-fA-F0-9]{6}$/),
  colorMode: z.enum(["auto", "custom"]).optional(),
  portrait: assetId.optional(),
  portraits: z.record(name, assetId),
  sprites: z.record(name, assetId),
});
export const bindingSchema = z.object({
  command: name,
  effect: z.enum(["background", "show", "hide", "expression"]),
  characterArgument: z.number().int().min(0).max(31).default(0),
  assetArgument: z.number().int().min(0).max(31).default(1),
  position: z.enum(["left", "center", "right"]).default("center"),
  fade: z.boolean().default(true),
});
export const previewSchema = z
  .object({
    version: z.literal(1),
    revision: z.number().int().min(0),
    characters: z.array(characterSchema).max(1000),
    backgrounds: z.record(name, assetId),
    bindings: z.array(bindingSchema).max(1000),
  })
  .superRefine((value, ctx) => {
    for (const entries of [
      value.characters.map((c) => c.name),
      value.bindings.map((b) => b.command),
    ])
      if (new Set(entries).size !== entries.length)
        ctx.addIssue({ code: "custom", message: "DUPLICATE_PREVIEW_NAME" });
  });
export type PreviewConfig = z.infer<typeof previewSchema>;
export type Character = PreviewConfig["characters"][number];
export const emptyPreview = (): PreviewConfig => ({
  version: 1,
  revision: 0,
  characters: [],
  backgrounds: {},
  bindings: [],
});
export type PreviewResources = {
  config: PreviewConfig;
  images: Record<string, string>;
  speakers: string[];
  commands: string[];
  commandDefinitions: import("../parser").Command[];
};
export type PlaySession = {
  runId: string;
  id: string;
  editorSessionId: string;
  projectId: string;
  projectName: string;
  capturedAt: number;
  stale: boolean;
  startScene?: string;
  state: PlayState;
  documents: { id: string; name: string; version: number; text: string }[];
  resources: PreviewResources;
};
export type PlayAction =
  | { action: "state" | "next" | "back" | "stop" | "latest" }
  | { action: "start"; scene: string }
  | { action: "choose"; optionId: number }
  | { action: "setVariable"; name: string; value: string | number | boolean };
export type PlayBridge = {
  preferences(): Promise<{ showPortraits: boolean; useNameColors: boolean }>;
  onPreferences(
    callback: (value: {
      showPortraits: boolean;
      useNameColors: boolean;
    }) => void,
  ): () => void;
  isWindow: boolean;
  open(): Promise<void>;
  action(action: PlayAction, revision?: number): Promise<PlaySession>;
  subscribe(callback: (session: PlaySession | null) => void): () => void;
  reveal(
    source: PlaySource,
  ): Promise<{ snapshot?: string; name?: string; line?: number }>;
  characters(): Promise<void>;
  onCharacters(callback: () => void): () => void;
  onResources(callback: () => void): () => void;
  resources(): Promise<PreviewResources>;
  save(config: PreviewConfig): Promise<PreviewResources>;
  importImage(): Promise<{ id: string; data: string } | null>;
};
