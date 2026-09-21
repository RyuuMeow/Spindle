/** Preserve identifiers/offsets while bounding diagnostic/context text and large nested lists. */
export function boundedResult(value: unknown) {
  let remaining = 120000;
  const truncated: string[] = [];
  function visit(value: unknown, path: string): unknown {
    if (typeof value === "string") {
      const size =
        value.length <= 512
          ? value.length
          : Math.min(32000, Math.max(0, remaining));
      const result = value.slice(0, size);
      remaining -= result.length;
      if (result.length < value.length) truncated.push(path);
      return result;
    }
    if (Array.isArray(value)) {
      if (value.length > 200) truncated.push(path);
      return value
        .slice(0, 200)
        .map((item, index) => visit(item, path + "[" + index + "]"));
    }
    if (value && typeof value === "object")
      return Object.fromEntries(
        Object.entries(value).map(([key, item]) => [
          key,
          visit(item, path + "." + key),
        ]),
      );
    return value;
  }
  const result = visit(value, "result") as Record<string, unknown>;
  return truncated.length
    ? {
        ...result,
        responseTruncated: true,
        truncatedFields: truncated.slice(0, 200),
      }
    : result;
}
