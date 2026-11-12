import nextVitals from "eslint-config-next/core-web-vitals";
import nextTypeScript from "eslint-config-next/typescript";
import react from "eslint-plugin-react";
import reactHooks from "eslint-plugin-react-hooks";
import { globalIgnores } from "eslint/config";

const config = [
  ...nextVitals,
  ...nextTypeScript,
  { plugins: { react, "react-hooks": reactHooks } },
  globalIgnores([".next/**", ".next-*/**", ".local/**", "temp/**", "out/**", "build/**", "next-env.d.ts"]),
  {
    rules: {
      // Keep existing React 18 effect patterns visible while we modernize pages incrementally.
      "react-hooks/set-state-in-effect": "warn",
      "react-hooks/static-components": "warn",
      "react/no-unescaped-entities": "warn",
    },
  },
];

export default config;
