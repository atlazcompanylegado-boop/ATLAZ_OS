import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";

const eslintConfig = [
  ...nextCoreWebVitals,
  ...nextTypescript,
  {
    ignores: ["src/server/db/migrations/**"],
  },
  {
    rules: {
      "no-console": ["warn", { allow: ["warn", "error"] }],
    },
  },
  {
    // Scripts de linha de comando (seed/migrate) — console.log é a própria UX da ferramenta.
    files: ["src/server/db/seed.ts", "src/server/db/migrate.ts"],
    rules: {
      "no-console": "off",
    },
  },
];

export default eslintConfig;
