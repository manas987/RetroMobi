// Bun inlines `process.env.BUN_PUBLIC_*` only when the variable is set at build
// time. An unset one stays a real `process` reference, which browsers don't
// have ("process is not defined"). Pass the read as a closure so the literal
// text is still there for Bun to inline when it is set.
export function publicEnv(read: () => string | undefined): string {
  try {
    return read() ?? "";
  } catch {
    return "";
  }
}
