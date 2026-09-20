import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import type { Project } from "../app/workspace/types";
import { validateProject } from "../app/workspace/engine";
import { atomicWrite } from "./disk-io";
/** Draft caches are loaded on demand; the launcher never reads cached script bodies. */
export class WorkspaceCache {
  constructor(private profile: string) {}
  private file(id: string) {
    return path.join(
      this.profile,
      "workspace-cache",
      createHash("sha256").update(id).digest("hex") + ".json",
    );
  }
  save(project: Project) {
    atomicWrite(this.file(project.id), JSON.stringify(project));
  }
  load(id: string): Project | undefined {
    const file = this.file(id);
    if (!fs.existsSync(file)) return;
    return validateProject(JSON.parse(fs.readFileSync(file, "utf8")));
  }
}
