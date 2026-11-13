/** A line of a comparison between two texts. */
export interface DiffLine {
  kind: "same" | "removed" | "added";
  text: string;
}

/**
 * Compares two texts line by line: the lines of `before` that `after`
 * lacks are removed, the ones it gains are added. Lines the two share at
 * the start and the end are compared first, so long pages stay quick.
 */
export function diffLines(before: string, after: string): DiffLine[] {
  const a = before.split("\n");
  const b = after.split("\n");
  let start = 0;
  while (start < a.length && start < b.length && a[start] === b[start]) start++;
  let endA = a.length;
  let endB = b.length;
  while (endA > start && endB > start && a[endA - 1] === b[endB - 1]) {
    endA--;
    endB--;
  }
  const head = a.slice(0, start).map((text): DiffLine => ({ kind: "same", text }));
  const tail = a.slice(endA).map((text): DiffLine => ({ kind: "same", text }));
  const x = a.slice(start, endA);
  const y = b.slice(start, endB);

  // Too many lines to compare one by one: all of the one out, all of the other in.
  if (x.length * y.length > 4_000_000) {
    return [
      ...head,
      ...x.map((text): DiffLine => ({ kind: "removed", text })),
      ...y.map((text): DiffLine => ({ kind: "added", text })),
      ...tail,
    ];
  }

  // The longest run of lines both keep, from the end of each.
  const width = y.length + 1;
  const common = new Uint32Array((x.length + 1) * width);
  for (let i = x.length - 1; i >= 0; i--) {
    for (let j = y.length - 1; j >= 0; j--) {
      common[i * width + j] =
        x[i] === y[j]
          ? common[(i + 1) * width + j + 1] + 1
          : Math.max(common[(i + 1) * width + j], common[i * width + j + 1]);
    }
  }
  const middle: DiffLine[] = [];
  let i = 0;
  let j = 0;
  while (i < x.length && j < y.length) {
    if (x[i] === y[j]) {
      middle.push({ kind: "same", text: x[i] });
      i++;
      j++;
    } else if (common[(i + 1) * width + j] >= common[i * width + j + 1]) {
      middle.push({ kind: "removed", text: x[i++] });
    } else {
      middle.push({ kind: "added", text: y[j++] });
    }
  }
  while (i < x.length) middle.push({ kind: "removed", text: x[i++] });
  while (j < y.length) middle.push({ kind: "added", text: y[j++] });
  return [...head, ...middle, ...tail];
}

/** How many lines differ: added and removed. */
export function diffCount(lines: DiffLine[]): { added: number; removed: number } {
  let added = 0;
  let removed = 0;
  for (const line of lines) {
    if (line.kind === "added") added++;
    else if (line.kind === "removed") removed++;
  }
  return { added, removed };
}
