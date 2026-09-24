"use client";
import { useEffect, useState } from "react";
import { Plus, Trash2, ImagePlus, Save } from "lucide-react";
import { pt } from "./messages";
import {
  previewSchema,
  type PreviewResources,
  type PreviewConfig,
} from "./types";
import "./play.css";

export default function CharactersView({ projectId }: { projectId: string }) {
  const [resources, setResources] = useState<PreviewResources | null>(null),
    [draft, setDraft] = useState<PreviewConfig | null>(null);
  const [selected, setSelected] = useState(""),
    [newName, setNewName] = useState(""),
    [variant, setVariant] = useState("default");
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [saved, setSaved] = useState(false);
  const bridge =
    typeof window !== "undefined" ? window.yarnDesktop?.play : undefined;
  useEffect(() => {
    let cancelled = false;
    void bridge
      ?.resources()
      .then((r) => {
        if (!cancelled) {
          setResources(r);
          setDraft(r.config);
          setSelected(r.config.characters[0]?.name || "");
        }
      })
      .catch((e) => {
        if (!cancelled) setError(String(e));
      });
    return () => {
      cancelled = true;
    };
  }, [projectId, bridge]);
  const character = draft?.characters.find((c) => c.name === selected);
  const update = (change: (config: PreviewConfig) => void) => {
    if (!draft) return;
    const next = structuredClone(draft);
    change(next);
    setDraft(next);
    setSaved(false);
  };
  const save = async () => {
    if (!bridge || !draft) return;
    setBusy(true);
    setError("");
    try {
      const result = await bridge.save(previewSchema.parse(draft));
      setResources(result);
      setDraft(result.config);
      setSaved(true);
      window.dispatchEvent(new Event("spindle-preview-changed"));
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  };
  const importImage = async (
    kind: "portrait" | "portraits" | "sprites" | "backgrounds",
  ) => {
    if (!bridge || (kind !== "portrait" && !variant.trim())) return;
    setError("");
    try {
      const asset = await bridge.importImage();
      if (!asset) return;
      setResources(
        (r) => r && { ...r, images: { ...r.images, [asset.id]: asset.data } },
      );
      update((c) => {
        if (kind === "backgrounds") c.backgrounds[variant.trim()] = asset.id;
        else {
          const actor = c.characters.find((x) => x.name === selected)!;
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
    <div className="characters-view">
      <header>
        <div>
          <h1>{pt("characters")}</h1>
          <p>{pt("characterHelp")}</p>
        </div>
        <button disabled={!draft || busy} onClick={() => void save()}>
          <Save size={16} />
          {saved ? pt("saved") : pt("save")}
        </button>
      </header>
      {error && (
        <p className="play-notice error" role="alert">
          {error}
        </p>
      )}
      {draft && (
        <div className="characters-layout">
          <nav aria-label={pt("characters")}>
            {[
              ...new Set([
                ...draft.characters.map((c) => c.name),
                ...(resources?.speakers || []),
              ]),
            ].map((name) => (
              <button
                key={name}
                aria-pressed={selected === name}
                onClick={() => {
                  if (!draft.characters.some((c) => c.name === name))
                    update((c) =>
                      c.characters.push({
                        name,
                        displayName: name,
                        color: "#b9ccd7",
                        portraits: {},
                        sprites: {},
                      }),
                    );
                  setSelected(name);
                }}
              >
                {name}
              </button>
            ))}
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
                    portraits: {},
                    sprites: {},
                  }),
                );
                setSelected(name);
                setNewName("");
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
          </nav>
          <div className="characters-content">
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
                          (x) => x.name === selected,
                        )!.displayName = e.target.value;
                      })
                    }
                  />
                </label>
                <label>
                  {pt("color")}
                  <input
                    type="color"
                    value={character.color}
                    onChange={(e) =>
                      update((c) => {
                        c.characters.find((x) => x.name === selected)!.color =
                          e.target.value;
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
                                  (x) => x.name === selected,
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
                        (x) => x.name !== selected,
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
                    <select
                      value={binding.effect}
                      onChange={(e) =>
                        update((c) => {
                          c.bindings[i].effect = e.target
                            .value as typeof binding.effect;
                        })
                      }
                    >
                      {(
                        ["background", "show", "hide", "expression"] as const
                      ).map((kind) => (
                        <option key={kind} value={kind}>
                          {pt(kind)}
                        </option>
                      ))}
                    </select>
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
                      <select
                        value={binding.position}
                        onChange={(e) =>
                          update((c) => {
                            c.bindings[i].position = e.target
                              .value as typeof binding.position;
                          })
                        }
                      >
                        {(["left", "center", "right"] as const).map((value) => (
                          <option key={value} value={value}>
                            {pt(value)}
                          </option>
                        ))}
                      </select>
                    </label>
                  )}
                  <label>
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
