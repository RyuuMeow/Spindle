"use client";
import {
  createContext,
  useContext,
  useMemo,
  type ReactNode,
  type CSSProperties,
} from "react";
import {
  defaultAppearance,
  normalizeAppearance,
  resolveAppearance,
  fontStack,
  type EditorAppearance,
  type AppearanceMode,
  type Typography,
} from "./model";
const Context = createContext<EditorAppearance>(defaultAppearance());
export function AppearanceProvider({
  value,
  children,
}: {
  value?: EditorAppearance;
  children: ReactNode;
}) {
  const signature = JSON.stringify(value);
  const appearance = useMemo(
    () => normalizeAppearance(signature ? JSON.parse(signature) : undefined),
    [signature],
  );
  return <Context.Provider value={appearance}>{children}</Context.Provider>;
}
export function useAppearance(mode: AppearanceMode) {
  const appearance = useContext(Context);
  const style = useMemo(
    () => resolveAppearance(appearance, mode),
    [appearance, mode],
  );
  return { appearance, style };
}
export function appearanceVariables(style: Typography): CSSProperties {
  return {
    "--editor-font": fontStack(style.fontFamily),
    "--editor-size": `${style.fontSize}px`,
    "--editor-line": String(style.lineHeight),
    "--editor-text": style.foreground,
    "--editor-bg": style.background,
    "--editor-selection": style.selection,
    "--reading-size": `${style.fontSize}px`,
    "--reading-height": `${style.fontSize * style.lineHeight}px`,
  } as CSSProperties;
}
