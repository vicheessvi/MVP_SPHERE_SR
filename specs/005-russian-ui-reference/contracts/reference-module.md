# UI Contract: Модуль «Справочник»

## Route

- Navigation label: `Справочник`
- Internal route: `reference`
- No storage writes and no network requests.

## Search

- Input: arbitrary local text.
- Normalization: trim, case-insensitive, collapse spaces.
- Fields: title, summary, details, keywords.
- Empty query: all sections/entries.
- No match: Russian empty state and reset action.

## Context links

- Dashboard, VCS, Controllers and Panels provide `О модуле`.
- Link opens `reference` with matching `topicId` and highlights/places that entry first.

## Required uncertainty labels

- SR: exact expansion requires clarification.
- GCPlus: exact technical definition requires clarification.
- Reboot analytics: feature is in development until a verified rule exists.
