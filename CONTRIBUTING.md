# Contributing

Thanks for your interest in improving react-native-deeplink-devtools! A little structure up front keeps review fast and keeps the project coherent.

## Before you write code

- **Open or find an issue first** for anything beyond a typo or doc fix. The project follows a roadmap, and a change that fights the current direction can be hard to merge even when it's well built, so a quick issue discussion saves everyone time.
- **Out of scope** (won't be accepted): attribution/marketing links (Branch/Adjust territory), push-notification deep links, and anything that modifies a user's linking config. The toolkit inspects and validates; it doesn't rewrite your app.

## PR requirements

1. **Title** in [Conventional Commits](https://www.conventionalcommits.org/) form, scoped to the package:
   `fix(core): handle optional catch-all params in matchUrl`
2. **Fill in the PR template.** Keep its headings (write "None" where a section is empty):
   - **Problem**: what's broken or missing, with a link to the issue.
   - **Solution**: what you changed and why this approach.
   - **Testing**: what you ran and what you added. New logic needs unit tests; bug fixes need a regression test that fails without the fix.
   - **New Dependencies**: any new runtime/peer/dev dependency, with justification. This project has a strong zero-dependency bias; undeclared new deps will be flagged.
   - **Checklist**: tick the boxes honestly.
3. **One concern per PR.** Please don't mix drive-by refactors, reformatting, or dependency bumps into a feature or fix; they make review much harder.
4. **Add a changeset** (`npx changeset`) for any user-facing change.
5. **Green checks locally** before pushing: typecheck, lint, tests, and build (commands are in each package's README).

## Coding standards

- **TypeScript strict**, no `any` in public API, TSDoc on exported symbols.
- New Architecture only (React Native >= 0.76).
- Match the style of the surrounding code; the linter is the source of truth for formatting.

## License

By contributing, you agree your contributions are licensed under the [MIT License](LICENSE).
