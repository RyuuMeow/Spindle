export const validPlaySceneName = (value: unknown): value is string =>
  typeof value === "string" &&
  value.length <= 160 &&
  value.trim() === value &&
  value.length > 0 &&
  !/[\x00-\x1f\x7f]/.test(value);
/** Application-wide presentation preferences; omitted patch fields never reset peers. */
export type PresentationPreferences = {
  playLaunch?: {
    mode?: "default" | "document" | "line";
    defaultScene?: string;
  };
  editorCharacters?: {
    showPortraits?: boolean;
    useNameColors?: boolean;
    sourceNameColors?: boolean;
  };
  playPresentation?: { showPortraits?: boolean; useNameColors?: boolean };
  dialogueLength?: { enabled?: boolean; limit?: number };
};
export function resolvePresentation(value?: PresentationPreferences) {
  return {
    playLaunch: {
      mode: (["default", "document", "line"] as const).includes(
        value?.playLaunch?.mode as "default",
      )
        ? value!.playLaunch!.mode!
        : ("default" as const),
      defaultScene: validPlaySceneName(value?.playLaunch?.defaultScene)
        ? value!.playLaunch!.defaultScene!
        : "Start",
    },
    editorCharacters: {
      showPortraits: value?.editorCharacters?.showPortraits === true,
      useNameColors: value?.editorCharacters?.useNameColors !== false,
      sourceNameColors: value?.editorCharacters?.sourceNameColors === true,
    },
    playPresentation: {
      showPortraits: value?.playPresentation?.showPortraits !== false,
      useNameColors: value?.playPresentation?.useNameColors !== false,
    },
    dialogueLength: {
      enabled: value?.dialogueLength?.enabled !== false,
      limit:
        Number.isInteger(value?.dialogueLength?.limit) &&
        value!.dialogueLength!.limit! >= 1 &&
        value!.dialogueLength!.limit! <= 1000
          ? value!.dialogueLength!.limit!
          : 80,
    },
  };
}
export function patchPresentation(
  current: PresentationPreferences,
  patch: PresentationPreferences,
) {
  const next = resolvePresentation(current);
  const launch = patch.playLaunch;
  if (launch && typeof launch === "object") {
    if (
      launch.mode === "default" ||
      launch.mode === "document" ||
      launch.mode === "line"
    )
      next.playLaunch.mode = launch.mode;
    if (validPlaySceneName(launch.defaultScene))
      next.playLaunch.defaultScene = launch.defaultScene;
  }
  for (const group of [
    "editorCharacters",
    "playPresentation",
    "dialogueLength",
  ] as const) {
    const incoming = patch[group];
    if (!incoming || typeof incoming !== "object") continue;
    for (const key of Object.keys(next[group])) {
      const value = (incoming as Record<string, unknown>)[key];
      if (key === "limit") {
        if (
          typeof value === "number" &&
          Number.isInteger(value) &&
          value >= 1 &&
          value <= 1000
        )
          next.dialogueLength.limit = value;
      } else if (typeof value === "boolean") {
        (next[group] as Record<string, unknown>)[key] = value;
      }
    }
  }
  return next;
}
