import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
export function atomicWrite(
  file: string,
  content: string,
  beforeCommit?: () => void,
) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temporary = file + "." + randomUUID() + ".tmp";
  try {
    const fd = fs.openSync(temporary, "wx");
    try {
      fs.writeFileSync(fd, content, "utf8");
      fs.fsyncSync(fd);
    } finally {
      fs.closeSync(fd);
    }
    beforeCommit?.();
    fs.renameSync(temporary, file);
  } finally {
    if (fs.existsSync(temporary)) fs.unlinkSync(temporary);
  }
}
