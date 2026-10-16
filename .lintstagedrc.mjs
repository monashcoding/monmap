// Quote each path: lint-staged splits a command string on spaces, and
// a checkout can live under a folder with spaces in its name.
const quoted = (files) => files.map((f) => JSON.stringify(f)).join(" ")

export default {
  "packages/webapp/**/*.{ts,tsx}": (files) => [
    `pnpm --filter webapp exec prettier --write --ignore-unknown ${quoted(files)}`,
    `pnpm --filter webapp exec eslint --fix ${quoted(files)}`,
  ],
}
