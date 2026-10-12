import { Fragment } from "react";
import { commandLabel, parameterLabel } from "../command-hints";
import type { Command } from "../parser";
import { inlinePresentation } from "./inline-presentation";

/** Compact graph summaries share marker names and scopes with reading editors. */
export function InlinePreview({
  text,
  commands = [],
}: {
  text: string;
  commands?: Command[];
}) {
  const { markers, scopes } = inlinePresentation(text, commands);
  const boundaries = [
    ...new Set([
      0,
      text.length,
      ...markers.flatMap(({ tag }) => [tag.from, tag.to]),
      ...scopes.flatMap((scope) => [scope.from, scope.to]),
    ]),
  ].sort((a, b) => a - b);
  return (
    <span className="inline-presentation">
      {boundaries.slice(0, -1).map((from, index) => {
        const to = boundaries[index + 1];
        const marker = markers.find(
          ({ tag }) => tag.from === from && tag.to === to,
        );
        if (marker) {
          const { tag, command } = marker;
          return (
            <span
              key={from}
              className={
                tag.closing ? "reading-inline-close" : "reading-inline-marker"
              }
              title={text.slice(from, to)}
            >
              <span className="reading-inline-name">
                {tag.closing
                  ? tag.name
                    ? "/" + commandLabel(command)
                    : "/"
                  : commandLabel(command)}
              </span>
              {tag.properties.map((property) => {
                const parameter = command.params.find(
                  (p) => p.name === property.name,
                );
                return (
                  <Fragment key={property.from}>
                    {" "}
                    {(text[property.from] !== "=" ||
                      (parameter?.displayName &&
                        parameter.displayName !== property.name)) && (
                      <span className="reading-parameter-hint">
                        {parameter ? parameterLabel(parameter) : property.name}:
                      </span>
                    )}
                    {property.value}
                  </Fragment>
                );
              })}
            </span>
          );
        }
        return (
          <span
            key={from}
            className={
              scopes.some((scope) => from >= scope.from && to <= scope.to)
                ? "reading-inline-scope"
                : undefined
            }
          >
            {text.slice(from, to)}
          </span>
        );
      })}
    </span>
  );
}
