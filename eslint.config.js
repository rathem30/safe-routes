import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";

export default [
    { ignores: ["dist", "data"] },
    js.configs.recommended,
    {
        files: ["src/**/*.{js,jsx}"],
        languageOptions: {
            globals: { ...globals.browser },
            parserOptions: { ecmaFeatures: { jsx: true } },
        },
        plugins: { "react-hooks": reactHooks, "react-refresh": reactRefresh },
        rules: {
            ...reactHooks.configs.recommended.rules,
            "react-refresh/only-export-components": "warn",
        },
    },
    {
        files: ["src/worker/**/*.js"],
        languageOptions: { globals: { ...globals.worker } },
    },
    {
        files: ["scripts/**/*.mjs", "test/**/*.js", "*.config.js"],
        languageOptions: { globals: { ...globals.node } },
    },
];
