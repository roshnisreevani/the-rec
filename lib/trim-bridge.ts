// expo-router doesn't have a "push a screen and await its return value"
// primitive, so this tiny in-memory bridge stands in for one: the caller
// (create-highlight.tsx) registers a resolver before pushing /trim-highlight,
// and the trim screen calls resolveTrimResult() when the user confirms or
// cancels, which settles that same promise. Module-scoped state is fine
// here since there's only ever one trim flow in progress at a time — this
// isn't meant to be a general navigation pattern, just a narrow escape
// hatch for this one picker-then-edit flow.
export type TrimResult = { uri: string; trimStartSeconds: number } | null;

let pendingResolve: ((result: TrimResult) => void) | null = null;

export function awaitTrimResult(): Promise<TrimResult> {
  return new Promise((resolve) => {
    pendingResolve = resolve;
  });
}

export function resolveTrimResult(result: TrimResult): void {
  pendingResolve?.(result);
  pendingResolve = null;
}
