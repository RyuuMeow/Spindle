"use client";
import { useEffect, useLayoutEffect, useId, useRef, useState } from "react";
import { CompactSelect } from "@/components/CompactSelect";
import { usePreviewAutosave } from "./use-preview-autosave";

import { Plus, Trash2, ImagePlus, PanelLeft, X } from "lucide-react";
import { pt } from "./messages";
import type { PreviewConfig } from "./types";
import "./play.css";
import "./characters.css";
import { characterColor } from "./character-presentation";

export default function CharactersView({ projectId }: { projectId: string }) {
  return <CharactersEditor key={projectId} projectId={projectId} />;
}
function CharactersEditor({ projectId }: { projectId: string }) {
  const host = useRef<HTMLDivElement>(null);
  const sidebar = useRef<HTMLElement>(null);
  const sidebarToggle = useRef<HTMLButtonElement>(null);
  const restoreSidebarFocus = useRef(false);
  const sidebarId = useId();
  const [narrow, setNarrow] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  useEffect(() => {
    const element = host.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => {
      const compact = entry.contentRect.width < 720;
      setNarrow(compact);
      if (!compact) setSidebarOpen(false);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  const closeSidebar = () => {
    restoreSidebarFocus.current = true;
    setSidebarOpen(false);
  };
  useLayoutEffect(() => {
    if (!sidebarOpen && restoreSidebarFocus.current) {
      restoreSidebarFocus.current = false;
      sidebarToggle.current?.focus();
    }
  }, [sidebarOpen]);
  useEffect(() => {
    if (narrow && sidebarOpen)
      sidebar.current?.querySelector<HTMLInputElement>("input")?.focus();
  }, [narrow, sidebarOpen]);
  const {
    resources,
    draft,
    error: saveError,
    busy,
    controller,
  } = usePreviewAutosave(projectId);
  const [selected, setSelected] = useState(""),
    [query, setQuery] = useState(""),
    [newName, setNewName] = useState(""),
    [variant, setVariant] = useState("default");
  const [error, setError] = useState("");
  const bridge =
    typeof window !== "undefined" ? window.yarnDesktop?.play : undefined;
  const activeName =
    selected || draft?.characters[0]?.name || resources?.speakers[0] || "";
  const character =
    draft && activeName
      ? draft.characters.find((c) => c.name === activeName) || {
          name: activeName,
          displayName: activeName,
          color: "#b9ccd7",
          colorMode: "auto" as const,
          portraits: {},
          sprites: {},
        }
      : undefined;
  const update = (change: (config: PreviewConfig) => void) =>
    controller?.update((c) => {
      const provisional =
        character && !c.characters.some((x) => x.name === activeName);
      if (provisional) c.characters.push(structuredClone(character));
      change(c);
      if (
        provisional &&
        JSON.stringify(c.characters.find((x) => x.name === activeName)) ===
          JSON.stringify(character)
      )
        c.characters = c.characters.filter((x) => x.name !== activeName);
    });
  const importImage = async (
    kind: "portrait" | "portraits" | "sprites" | "backgrounds",
  ) => {
    if (!bridge || (kind !== "portrait" && !variant.trim())) return;
    setError("");
    try {
      const asset = await bridge.importImage();
      if (!asset) return;
      controller?.addImage(asset.id, asset.data);
      update((c) => {
        if (kind === "backgrounds") c.backgrounds[variant.trim()] = asset.id;
        else {
          const actor = c.characters.find((x) => x.name === activeName)!;
          if (kind === "portrait") actor.portrait = asset.id;
          else actor[kind][variant.trim()] = asset.id;
        }
      });
    } catch (e) {
      setError(String(e));
    }
  };
  if (!bridge) return <p>{pt("projectOnly")}</p>;
  return (
    <div
      ref={host}
      className={`characters-view ${narrow ? "characters-narrow" : ""}`}
      onKeyDown={(event) => {
        if (!narrow || !sidebarOpen || event.nativeEvent.isComposing) return;
        if (event.key === "Escape") {
          event.preventDefault();
          event.stopPropagation();
          closeSidebar();
        }
        if (event.key === "Tab") {
          const items = [
            ...(sidebar.current?.querySelectorAll<HTMLElement>(
              'button:not(:disabled), input:not(:disabled), [tabindex="0"]',
            ) || []),
          ].filter((item) => item.getClientRects().length > 0);
          const first = items[0],
            last = items.at(-1);
          if (event.shiftKey && document.activeElement === first) {
            event.preventDefault();
            last?.focus();
          } else if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault();
            first?.focus();
          }
        }
      }}
      onCompositionStart={() => controller?.composition(true)}
      onCompositionEnd={() => controller?.composition(false)}
      onBlur={(event) => {
        if (
          event.relatedTarget instanceof HTMLElement &&
          event.relatedTarget.closest('[role="alert"]')
        )
          return;
        void controller?.flush();
      }}
    >
      {(error || saveError) && (
        <div className="play-notice error" role="alert">
          <p>{error || saveError}</p>
          <button disabled={busy} onClick={() => void controller?.flush()}>
            {pt("retry")}
          </button>
          {saveError.includes("PREVIEW_FIELD_CONFLICT") && (
            <button disabled={busy} onClick={() => void controller?.resubmit()}>
              {pt("resubmitChanges")}
            </button>
          )}
          <button disabled={busy} onClick={() => void controller?.reload()}>
            {pt("reloadSaved")}
          </button>
        </div>
      )}
      {draft && (
        <div className="characters-layout">
          {narrow && sidebarOpen && (
            <button
              className="characters-sidebar-backdrop"
              type="button"
              tabIndex={-1}
              aria-label={pt("close")}
              onClick={closeSidebar}
            />
          )}
          <nav
            ref={sidebar}
            id={sidebarId}
            hidden={narrow && !sidebarOpen}
            role={narrow && sidebarOpen ? "dialog" : undefined}
            aria-modal={narrow && sidebarOpen ? true : undefined}
            aria-label={pt("characters")}
          >
            {narrow && (
              <button
                className="characters-sidebar-close"
                type="button"
                aria-label={pt("close")}
                onClick={closeSidebar}
              >
                <X size={16} />
              </button>
            )}
            <h2 className="characters-list-heading">{pt("characters")}</h2>
            <input
              aria-label={pt("searchCharacters")}
              placeholder={pt("searchCharacters")}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const name = newName.trim();
                if (!name || draft.characters.some((c) => c.name === name))
                  return;
                update((c) =>
                  c.characters.push({
                    name,
                    displayName: name,
                    color: "#b9ccd7",
                    colorMode: "auto",
                    portraits: {},
                    sprites: {},
                  }),
                );
                setSelected(name);
                setNewName("");
                if (narrow) closeSidebar();
              }}
            >
              <input
                aria-label={pt("name")}
                placeholder={pt("name")}
                maxLength={160}
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
              />
              <button
                title={pt("addCharacter")}
                aria-label={pt("addCharacter")}
              >
                <Plus size={16} />
              </button>
            </form>
            <div className="characters-list">
              {[
                ...new Set([
                  ...draft.characters.map((c) => c.name),
                  ...(resources?.speakers || []),
                ]),
              ]
                .filter((name) =>
                  name.toLocaleLowerCase().includes(query.toLocaleLowerCase()),
                )
                .map((name) => (
                  <button
                    key={name}
                    aria-pressed={activeName === name}
                    onClick={() => {
                      void controller?.flush().then((ok) => {
                        if (ok) {
                          setSelected(name);
                          if (narrow) closeSidebar();
                        }
                      });
                    }}
                  >
                    {name}
                  </button>
                ))}
            </div>
          </nav>
          <div className="characters-content" inert={narrow && sidebarOpen}>
            <header className="characters-heading">
              {narrow && (
                <button
                  ref={sidebarToggle}
                  type="button"
                  aria-label={pt("characters")}
                  aria-expanded={sidebarOpen}
                  aria-controls={sidebarId}
                  onClick={() => setSidebarOpen((value) => !value)}
                >
                  <PanelLeft size={18} />
                </button>
              )}
              <div>
                <h1>{pt("characters")}</h1>
                <p>{pt("characterHelp")}</p>
              </div>
            </header>
            {character && (
              <section>
                <h2>{character.name}</h2>
                <label>
                  {pt("display")}
                  <input
                    value={character.displayName}
                    onChange={(e) =>
                      update((c) => {
                        c.characters.find(
                          (x) => x.name === activeName,
                        )!.displayName = e.target.value;
                      })
                    }
                  />
                </label>
                <label>
                  {pt("colorMode")}
                  <CompactSelect
                    value={character.colorMode || "custom"}
                    label={pt("colorMode")}
                    options={[
                      { value: "auto", label: pt("autoColor") },
                      { value: "custom", label: pt("customColor") },
                    ]}
                    onChange={(value) =>
                      update((c) => {
                        c.characters.find(
                          (x) => x.name === activeName,
                        )!.colorMode = value as "auto" | "custom";
                      })
                    }
                  />
                </label>
                <label>
                  {pt("color")}
                  <input
                    disabled={character.colorMode === "auto"}
                    type="color"
                    value={characterColor(activeName, character)}
                    onChange={(e) =>
                      update((c) => {
                        c.characters.find((x) => x.name === activeName)!.color =
                          e.target.value;
                        c.characters.find(
                          (x) => x.name === activeName,
                        )!.colorMode = "custom";
                      })
                    }
                  />
                </label>
                <div className="preview-assets">
                  <h3>{pt("portrait")}</h3>
                  {character.portrait &&
                  resources?.images[character.portrait] ? (
                    <img
                      src={resources.images[character.portrait]}
                      alt={character.displayName}
                    />
                  ) : (
                    <span>{pt("missing")}</span>
                  )}
                  <button onClick={() => void importImage("portrait")}>
                    <ImagePlus size={16} />
                    {pt("import")}
                  </button>
                </div>
                <label>
                  {pt("variant")}
                  <input
                    value={variant}
                    onChange={(e) => setVariant(e.target.value)}
                    maxLength={160}
                  />
                </label>
                {(["portraits", "sprites"] as const).map((kind) => (
                  <div className="preview-assets" key={kind}>
                    <h3>{pt(kind)}</h3>
                    {Object.entries(character[kind]).map(([name, id]) => (
                      <figure key={name}>
                        {resources?.images[id] ? (
                          <img src={resources.images[id]} alt={name} />
                        ) : (
                          <span>{pt("missing")}</span>
                        )}
                        <figcaption>
                          {name}
                          <button
                            aria-label={pt("remove")}
                            onClick={() =>
                              update((c) => {
                                delete c.characters.find(
                                  (x) => x.name === activeName,
                                )![kind][name];
                              })
                            }
                          >
                            <Trash2 size={14} />
                          </button>
                        </figcaption>
                      </figure>
                    ))}
                    <button onClick={() => void importImage(kind)}>
                      <ImagePlus size={16} />
                      {pt("import")}
                    </button>
                  </div>
                ))}
                <button
                  onClick={() => {
                    update((c) => {
                      c.characters = c.characters.filter(
                        (x) => x.name !== activeName,
                      );
                    });
                    setSelected("");
                  }}
                >
                  <Trash2 size={16} />
                  {pt("remove")}
                </button>
              </section>
            )}
            <section>
              <h2>{pt("backgrounds")}</h2>
              <label>
                {pt("variant")}
                <input
                  value={variant}
                  onChange={(e) => setVariant(e.target.value)}
                  maxLength={160}
                />
              </label>
              <div className="preview-assets">
                {Object.entries(draft.backgrounds).map(([name, id]) => (
                  <figure key={name}>
                    {resources?.images[id] ? (
                      <img src={resources.images[id]} alt={name} />
                    ) : (
                      <span>{pt("missing")}</span>
                    )}
                    <figcaption>
                      {name}
                      <button
                        aria-label={pt("remove")}
                        onClick={() =>
                          update((c) => {
                            delete c.backgrounds[name];
                          })
                        }
                      >
                        <Trash2 size={14} />
                      </button>
                    </figcaption>
                  </figure>
                ))}
                <button onClick={() => void importImage("backgrounds")}>
                  <ImagePlus size={16} />
                  {pt("import")}
                </button>
              </div>
            </section>
            <section>
              <h2>{pt("effects")}</h2>
              <p>{pt("effectHelp")}</p>
              {draft.bindings.map((binding, i) => (
                <fieldset className="preview-binding" key={i}>
                  <legend>{binding.command || pt("command")}</legend>
                  <label>
                    {pt("command")}
                    <input
                      list="preview-commands"
                      value={binding.command}
                      onChange={(e) =>
                        update((c) => {
                          c.bindings[i].command = e.target.value;
                        })
                      }
                    />
                  </label>
                  <label>
                    {pt("effect")}
                    <CompactSelect
                      value={binding.effect}
                      label={pt("effect")}
                      options={(
                        ["background", "show", "hide", "expression"] as const
                      ).map((kind) => ({ value: kind, label: pt(kind) }))}
                      onChange={(value) =>
                        update((c) => {
                          c.bindings[i].effect = value as typeof binding.effect;
                        })
                      }
                    />
                  </label>
                  {binding.effect !== "background" && (
                    <label>
                      {pt("characterArg")}
                      <input
                        type="number"
                        min={0}
                        max={31}
                        value={binding.characterArgument}
                        onChange={(e) =>
                          update((c) => {
                            c.bindings[i].characterArgument = Number(
                              e.target.value,
                            );
                          })
                        }
                      />
                    </label>
                  )}
                  {binding.effect !== "hide" && (
                    <label>
                      {pt("assetArg")}
                      <input
                        type="number"
                        min={0}
                        max={31}
                        value={binding.assetArgument}
                        onChange={(e) =>
                          update((c) => {
                            c.bindings[i].assetArgument = Number(
                              e.target.value,
                            );
                          })
                        }
                      />
                    </label>
                  )}
                  {binding.effect === "show" && (
                    <label>
                      {pt("position")}
                      <CompactSelect
                        value={binding.position}
                        label={pt("position")}
                        options={(["left", "center", "right"] as const).map(
                          (value) => ({ value, label: pt(value) }),
                        )}
                        onChange={(value) =>
                          update((c) => {
                            c.bindings[i].position =
                              value as typeof binding.position;
                          })
                        }
                      />
                    </label>
                  )}
                  <label className="preview-check">
                    <input
                      type="checkbox"
                      checked={binding.fade}
                      onChange={(e) =>
                        update((c) => {
                          c.bindings[i].fade = e.target.checked;
                        })
                      }
                    />
                    {pt("fade")}
                  </label>
                  <button
                    onClick={() =>
                      update((c) => {
                        c.bindings.splice(i, 1);
                      })
                    }
                  >
                    <Trash2 size={16} />
                    {pt("remove")}
                  </button>
                </fieldset>
              ))}
              <datalist id="preview-commands">
                {resources?.commands.map((name) => (
                  <option key={name}>{name}</option>
                ))}
              </datalist>
              <button
                onClick={() =>
                  update((c) =>
                    c.bindings.push({
                      command: "",
                      effect: "background",
                      assetArgument: 0,
                      characterArgument: 0,
                      position: "center",
                      fade: true,
                    }),
                  )
                }
              >
                <Plus size={16} />
                {pt("add")}
              </button>
            </section>
          </div>
        </div>
      )}
    </div>
  );
}
