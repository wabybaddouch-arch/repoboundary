import { describe, expect, it } from "vitest";
import { ConfigValidationError, validateConfig } from "../../src/config/config.schema.js";

describe("validateConfig", () => {
  it("accepts a valid empty config", () => {
    expect(validateConfig({ version: 1, rules: [] })).toEqual({
      version: 1,
      rules: []
    });
  });

  it("accepts a valid config with one rule", () => {
    const config = {
      version: 1,
      rules: [
        {
          id: "auth-core",
          match: ["src/auth/**"],
          actions: ["create", "modify", "delete", "rename"],
          mode: "block",
          reason: "Sensitive authentication logic"
        }
      ]
    };

    expect(validateConfig(config)).toEqual(config);
  });

  it("rejects missing version", () => {
    expect(() => validateConfig({ rules: [] })).toThrow(
      ConfigValidationError
    );
  });

  it("rejects unsupported version", () => {
    expect(() => validateConfig({ version: 2, rules: [] })).toThrow(
      /version/
    );
  });

  it("rejects missing rules", () => {
    expect(() => validateConfig({ version: 1 })).toThrow(/rules/);
  });

  it("rejects invalid actions", () => {
    expect(() =>
      validateConfig({
        version: 1,
        rules: [
          {
            id: "auth-core",
            match: ["src/auth/**"],
            actions: ["write"],
            mode: "block",
            reason: "Sensitive authentication logic"
          }
        ]
      })
    ).toThrow(/actions/);
  });

  it("rejects mode other than block", () => {
    expect(() =>
      validateConfig({
        version: 1,
        rules: [
          {
            id: "auth-core",
            match: ["src/auth/**"],
            actions: ["modify"],
            mode: "warn",
            reason: "Sensitive authentication logic"
          }
        ]
      })
    ).toThrow(/mode/);
  });

  it("rejects empty reason", () => {
    expect(() =>
      validateConfig({
        version: 1,
        rules: [
          {
            id: "auth-core",
            match: ["src/auth/**"],
            actions: ["modify"],
            mode: "block",
            reason: ""
          }
        ]
      })
    ).toThrow(/reason/);
  });
});
