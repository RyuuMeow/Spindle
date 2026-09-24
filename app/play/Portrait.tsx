import type { PlaySession } from "./types";
import { characterColor } from "./character-presentation";
export function Portrait({
  name,
  session,
  expression,
}: {
  name: string;
  session: PlaySession;
  expression?: string;
}) {
  const character = session.resources.config.characters.find(
      (c) => c.name === name,
    ),
    id =
      (expression && character?.portraits[expression]) || character?.portrait;
  const image = id && session.resources.images[id];
  return (
    <span
      className="play-avatar"
      style={{
        backgroundColor: image ? undefined : characterColor(name, character),
      }}
      aria-hidden="true"
    >
      {image ? <img src={image} alt="" /> : null}
    </span>
  );
}
