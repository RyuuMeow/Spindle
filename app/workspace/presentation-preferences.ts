/** Application-wide presentation preferences; omitted patch fields never reset peers. */
export type PresentationPreferences = {
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
