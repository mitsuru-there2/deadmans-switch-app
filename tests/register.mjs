import { registerHooks } from "node:module";
// Shared API TypeScript intentionally uses bundler-style relative imports.
// Resolve only these local files for Node's built-in test runner.
registerHooks({
  resolve(specifier, context, nextResolve) {
    try {
      return nextResolve(specifier, context);
    } catch (error) {
      if (
        error.code === "ERR_MODULE_NOT_FOUND" &&
        specifier.startsWith("./") &&
        context.parentURL?.includes("/deadmans-switch-api/src/") &&
        !specifier.endsWith(".ts")
      )
        return nextResolve(`${specifier}.ts`, context);
      throw error;
    }
  },
});
