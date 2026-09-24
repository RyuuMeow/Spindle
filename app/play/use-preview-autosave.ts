"use client";
import { useEffect, useState } from "react";
import {
  PreviewAutosave,
  registerPreviewDraft,
  type PreviewSaveState,
} from "./preview-autosave";

export function usePreviewAutosave(projectKey: string) {
  const [state, setState] = useState<PreviewSaveState>({
    resources: null,
    draft: null,
    error: "",
    busy: false,
    dirty: false,
  });
  const [controller, setController] = useState<PreviewAutosave | null>(null);
  const [loadedKey, setLoadedKey] = useState("");
  useEffect(() => {
    const bridge = window.yarnDesktop?.play;
    if (!bridge) return;
    const current = new PreviewAutosave(bridge, (value) => {
      setController(current);
      setLoadedKey(projectKey);
      setState(value);
    });
    const unregister = registerPreviewDraft(current, projectKey);
    const off = bridge.onResources(() => {
      void current.refresh();
    });
    void current.load();
    return () => {
      off();
      unregister();
      current.dispose();
    };
  }, [projectKey]);
  return loadedKey === projectKey
    ? { ...state, controller }
    : {
        resources: null,
        draft: null,
        error: "",
        busy: false,
        dirty: false,
        controller: null,
      };
}
