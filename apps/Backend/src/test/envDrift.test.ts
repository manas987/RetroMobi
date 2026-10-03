// .env.example drifting out of date is the default state of every project: someone
// adds process.env.NEW_THING, it works on their machine, and the next person to
// clone gets a runtime error with no clue what to set. PLATFORM_GSTIN did exactly
// that -- read by the invoice writer, documented nowhere, and every platform
// invoice went out with a null GSTIN.
//
// So this is checked rather than remembered: scan the source for every env var it
// reads and assert .env.example documents all of them.
import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dir, "..", "..");
const SRC = join(ROOT, "src");
const ENV_EXAMPLE = join(ROOT, ".env.example");
// The entry point lives outside src/ and reads PORT, so it has to be scanned too.
const EXTRA_FILES = [join(ROOT, "index.ts")];

// Supplied by the runtime or the test harness, not by .env.
const NOT_CONFIGURED_BY_US = new Set(["NODE_ENV"]);

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules") continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      out.push(...sourceFiles(full));
    } else if (entry.endsWith(".ts") && !entry.endsWith(".test.ts")) {
      out.push(full);
    }
  }
  return out;
}

function envVarsReadByCode(): Map<string, string> {
  const found = new Map<string, string>();
  for (const file of [...sourceFiles(SRC), ...EXTRA_FILES]) {
    const text = readFileSync(file, "utf8");
    for (const match of text.matchAll(/process\.env\.([A-Z0-9_]+)/g)) {
      const name = match[1]!;
      if (!NOT_CONFIGURED_BY_US.has(name) && !found.has(name)) {
        found.set(name, file.slice(ROOT.length + 1));
      }
    }
  }
  return found;
}

function documentedKeys(): Set<string> {
  const text = readFileSync(ENV_EXAMPLE, "utf8");
  const keys = new Set<string>();
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const key = trimmed.split("=")[0]?.trim();
    if (key) keys.add(key);
  }
  return keys;
}

describe(".env.example", () => {
  test("documents every environment variable the code reads", () => {
    const documented = documentedKeys();
    const undocumented = [...envVarsReadByCode()]
      .filter(([name]) => !documented.has(name))
      .map(([name, file]) => `${name} (read in ${file})`);

    expect(undocumented).toEqual([]);
  });

  test("does not document variables nothing reads", () => {
    // Not a hard failure of correctness, but a stale key is a lie about what the
    // app needs, and someone will spend an afternoon sourcing a credential for it.
    const read = new Set(envVarsReadByCode().keys());
    // TEST_DATABASE_URL is read by the test files this scan deliberately skips.
    read.add("TEST_DATABASE_URL");

    const stale = [...documentedKeys()].filter((key) => !read.has(key));
    expect(stale).toEqual([]);
  });

  test("carries no real-looking secrets", () => {
    const text = readFileSync(ENV_EXAMPLE, "utf8");
    // Cashfree and Resend key prefixes, and anything that looks like a live token.
    expect(text).not.toMatch(/\bre_[A-Za-z0-9]{10,}/);
    expect(text).not.toMatch(/\bTEST\d{6,}|\bCF[A-Z0-9]{10,}/);
    expect(text).not.toMatch(/\bAC[0-9a-f]{32}\b/); // Twilio account SID shape
  });
});
