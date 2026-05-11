export default {
  "packages/webapp/**/*.{ts,tsx}": (files) => [
    `pnpm --filter webapp exec prettier --write --ignore-unknown ${files.join(" ")}`,
    `pnpm --filter webapp exec eslint --fix ${files.join(" ")}`,
  ],
}
