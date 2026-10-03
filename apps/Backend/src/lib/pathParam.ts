import type { Request } from "express";

// Express 5 types route params as `string | string[]`, because a path is allowed
// to repeat a name (`/:id/:id`). None of our routes do, but every call site was
// written as `req.params.id!`, which strips `undefined` and not the array half --
// an unsound assertion that went unnoticed because tsconfig was not registering
// Bun's types, so `tsc` bailed on the test files and nobody ran it clean.
//
// A missing param means the route is wired wrong, not that the request was bad,
// so this throws and lands on the 500 path rather than inventing an empty string.
export function pathParam(req: Request, name: string): string {
  const value = req.params[name];
  if (typeof value === "string") return value;
  if (Array.isArray(value) && typeof value[0] === "string") return value[0];
  throw new Error(`route is missing the :${name} path parameter`);
}
