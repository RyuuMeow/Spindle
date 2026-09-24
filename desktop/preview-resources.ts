import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { atomicWrite } from "./disk-io";
import {
  emptyPreview,
  previewSchema,
  type PreviewConfig,
  type PreviewResources,
} from "../app/play/types";
import type { Project } from "../app/workspace/types";
import { readingStructure } from "../app/reading/structure";

export class PreviewResourcesStore {
  private directory(project: Project) {
    if (!project.root || project.kind === "standalone")
      throw Error("PREVIEW_REQUIRES_PROJECT");
    const root = fs.realpathSync(project.root),
      directory = path.join(root, ".spindle");
    for (const file of [
      directory,
      path.join(directory, "preview-assets"),
      path.join(directory, "preview.json"),
    ])
      if (fs.existsSync(file) && fs.lstatSync(file).isSymbolicLink())
        throw Error("PREVIEW_SYMLINK_NOT_ALLOWED");
    return directory;
  }
  config(project: Project): PreviewConfig {
    if (!project.root || project.kind === "standalone") return emptyPreview();
    const file = path.join(this.directory(project), "preview.json");
    if (!fs.existsSync(file)) return emptyPreview();
    if (fs.statSync(file).size > 2_000_000)
      throw Error("PREVIEW_CONFIG_TOO_LARGE");
    return previewSchema.parse(JSON.parse(fs.readFileSync(file, "utf8")));
  }
  read(project: Project): PreviewResources {
    const config = this.config(project),
      images: Record<string, string> = {};
    if (project.root && project.kind !== "standalone") {
      const directory = this.directory(project);
      const refs = new Set(
        [
          ...Object.values(config.backgrounds),
          ...config.characters.flatMap((c) => [
            c.portrait,
            ...Object.values(c.portraits),
            ...Object.values(c.sprites),
          ]),
        ].filter((v): v is string => !!v),
      );
      let total = 0;
      for (const id of refs) {
        const file = path.join(directory, "preview-assets", id);
        if (!fs.existsSync(file) || fs.lstatSync(file).isSymbolicLink())
          continue;
        const size = fs.statSync(file).size;
        if (size > 20_000_000 || total + size > 100_000_000) continue;
        total += size;
        images[id] =
          `data:image/${id.endsWith(".jpg") ? "jpeg" : id.split(".").at(-1)};base64,${fs.readFileSync(file).toString("base64")}`;
      }
    }
    const speakers = [
      ...new Set(
        project.documents.flatMap((d) =>
          readingStructure(d.text)
            .filter((l) => l.kind === "dialogue")
            .map((l) => /^\s*([^\n<>#:$]+):\s+.+$/.exec(l.text)?.[1]?.trim())
            .filter((s): s is string => !!s),
        ),
      ),
    ].sort();
    return {
      config,
      images,
      speakers,
      commands: project.commands.map((c) => c.name),
      commandDefinitions: structuredClone(project.commands),
    };
  }
  save(project: Project, input: unknown) {
    const value = previewSchema.parse(input),
      current = this.config(project);
    if (value.revision !== current.revision)
      throw Error("PREVIEW_VERSION_CONFLICT");
    value.revision++;
    atomicWrite(
      path.join(this.directory(project), "preview.json"),
      JSON.stringify(value, null, 2),
    );
    return this.read(project);
  }
  import(project: Project, selected: string) {
    if (fs.statSync(selected).size > 20_000_000)
      throw Error("PREVIEW_IMAGE_TOO_LARGE");
    const data = fs.readFileSync(selected);
    if (data.length > 20_000_000) throw Error("PREVIEW_IMAGE_TOO_LARGE");
    const ext = data
      .subarray(0, 8)
      .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
      ? "png"
      : data[0] === 255 && data[1] === 216 && data[2] === 255
        ? "jpg"
        : data.toString("ascii", 0, 4) === "RIFF" &&
            data.toString("ascii", 8, 12) === "WEBP"
          ? "webp"
          : null;
    if (!ext) throw Error("PREVIEW_IMAGE_UNSUPPORTED");
    const id = createHash("sha256").update(data).digest("hex") + "." + ext;
    const dir = path.join(this.directory(project), "preview-assets");
    fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, id);
    if (fs.existsSync(file)) {
      if (
        fs.lstatSync(file).isSymbolicLink() ||
        !fs.readFileSync(file).equals(data)
      )
        throw Error("PREVIEW_ASSET_CONFLICT");
    } else fs.writeFileSync(file, data, { flag: "wx" });
    return {
      id,
      data: `data:image/${ext === "jpg" ? "jpeg" : ext};base64,${data.toString("base64")}`,
    };
  }
}
