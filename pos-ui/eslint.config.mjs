import nextVitals from "eslint-config-next/core-web-vitals";
import nextTypeScript from "eslint-config-next/typescript";
import { globalIgnores } from "eslint/config";

const config = [
  ...nextVitals,
  ...nextTypeScript,
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
