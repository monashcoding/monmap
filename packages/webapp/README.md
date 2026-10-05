# webapp

The MonMap web app: the planner, the handbook pages, search and
reviews. It is a Next.js app in the monorepo.

- Setup, commands and conventions: the [root README](../../README.md)
  and [`CLAUDE.md`](../../CLAUDE.md).
- Handbook pages, search and caching: [`docs/handbook-pages.md`](../../docs/handbook-pages.md).
- Reviews and moderation: [`docs/reviews.md`](../../docs/reviews.md).
- SEO: [`docs/seo.md`](../../docs/seo.md).
- Handbook data quirks: [`docs/handbook-internals.md`](../../docs/handbook-internals.md).
- Analytics: client code sends PostHog events only through
  `lib/analytics.ts` (an eslint rule enforces it), which loads
  posthog-js on demand. Events never carry an email, a name, a plan
  name or a grade.

UI components come from shadcn/ui. Add one with:

```bash
pnpm dlx shadcn@latest add button
```
