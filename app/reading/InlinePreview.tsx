import { Fragment, type CSSProperties } from "react";
import { useAppearance } from "../appearance/context";
import { highlightInlineRange } from "./inline-reveal";
import { commandLabel, parameterLabel } from "../command-hints";
import type { Command } from "../parser";
import { inlinePresentation, inlineRangeStyle } from "./inline-presentation";

/** Compact graph summaries share marker names and scopes with reading editors. */
export function InlinePreview({
  text,
  commands = [],
  onReveal,
}: {
  text: string;
  commands?: Command[];
  onReveal?: (index: number) => void;
}) {
  const { appearance } = useAppearance("graph");
  const { groups, markers, scopes } = inlinePresentation(
    text,
    commands,
    appearance.inlinePalette,
  );
  const boundaries = [
    ...new Set([
      0,
      text.length,
      ...markers.flatMap(({ tag }) => [tag.from, tag.to]),
      ...scopes.flatMap((scope) => [scope.from, scope.to]),
    ]),
  ].sort((a, b) => a - b);
  return (
    <span
      className="inline-presentation"
      onMouseOver={(event) =>
        highlightInlineRange(event.currentTarget, event.target)
      }
      onMouseOut={(event) =>
        highlightInlineRange(event.currentTarget, event.relatedTarget)
      }
    >
      {boundaries.slice(0, -1).map((from, index) => {
        const to = boundaries[index + 1];
        const marker = markers.find(
          ({ tag }) => tag.from === from && tag.to === to,
        );
        if (marker) {
          const { tag, command, group } = marker;
          if (tag.closing) return null;
          if (!tag.selfClosing && !group.closing)
            return <Fragment key={from}>{text.slice(from, to)}</Fragment>;
          return (
            <span
              key={from}
              className="reading-inline-marker"
              data-inline-groups={group.tag.from}
              style={{ "--inline-color": group.color } as CSSProperties}
              title={text.slice(from, to)}
            >
              <span
                className="reading-inline-name nodrag nopan"
                onClick={
                  onReveal
                    ? (event) => {
                        event.stopPropagation();
                        onReveal(groups.indexOf(group));
                      }
                    : undefined
                }
              >
                {commandLabel(command)}
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
            data-inline-groups={
              scopes
                .filter((scope) => from >= scope.from && to <= scope.to)
                .map((scope) => scope.group.tag.from)
                .join(" ") || undefined
            }
            className={
              scopes.some((scope) => from >= scope.from && to <= scope.to)
                ? "reading-inline-scope"
                : undefined
            }
            style={
              scopes.some((scope) => from >= scope.from && to <= scope.to)
                ? inlineRangeStyle(
                    scopes
                      .filter((scope) => from >= scope.from && to <= scope.to)
                      .map((scope) => scope.group),
                  )
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
