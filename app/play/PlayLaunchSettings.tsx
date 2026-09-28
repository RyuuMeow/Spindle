import { SearchableSelect } from "@/components/SearchableSelect";
import { pt } from "./messages";
export default function PlayLaunchSettings({
  value,
  change,
  scenes,
}: {
  value: string;
  change?: (value: string) => void;
  scenes?: readonly { name: string; file: string }[];
}) {
  const grouped = new Map<string, Set<string>>();
  for (const scene of scenes ?? []) {
    if (!scene.name.trim()) continue;
    const files = grouped.get(scene.name) ?? new Set<string>();
    files.add(scene.file);
    grouped.set(scene.name, files);
  }
  const options = [...grouped].map(([name, files]) => ({
    value: name,
    label: name,
    description: [...files].join(" · "),
  }));
  const unavailable = options.length > 0 && !grouped.has(value);
  return (
    <div className="setting-field" data-setting="playLaunch.defaultScene">
      <div className="setting-row">
        <label htmlFor="play-default-scene">
          {pt("defaultScene")}
          <small>{pt("defaultSceneHelp")}</small>
        </label>
        <SearchableSelect
          id="play-default-scene"
          value={value}
          options={options}
          label={pt("defaultScene")}
          searchLabel={pt("searchScenes")}
          emptyLabel={pt("noMatchingScenes")}
          disabled={!change || options.length === 0}
          onChange={(next) => change?.(next)}
        />
      </div>
      {(!options.length || unavailable) && (
        <p className="setting-help">
          {scenes === undefined
            ? pt("scenePickerNoWorkspace")
            : !options.length
              ? pt("scenePickerEmpty")
              : pt("scenePickerUnavailable")}
        </p>
      )}
    </div>
  );
}
