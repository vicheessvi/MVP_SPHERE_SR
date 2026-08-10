# Contract: Product catalog and Reference synchronization

## Module descriptor

Every accessible module MUST declare:

```text
route, renderer, title, summary, details, keywords, order, helpId
```

`category` and `contextHelp` are optional. `title` is the single label used by navigation and the generated module card in Reference.

## Projections

- Navigation: all modules sorted by `order`, one button per `route`.
- Reference / modules: all modules sorted by `order`, one entry per `helpId`.
- Context help: only descriptors with `contextHelp=true`, mapping `route → helpId`.
- Inventory routes: descriptors with a `category` value.
- Reference / statuses: status descriptors resolve their visible titles through `UI_TERMS`.

Adding, renaming or removing a descriptor changes all projections immediately when the application is loaded. There is no generated persistent copy.

## Validation

`validateProductCatalog()` returns a deterministic report and MUST reject:

- duplicate route, helpId or order;
- empty/non-Russian title, summary or details;
- renderer not present in the allowed renderer set;
- context help without a generated help entry;
- missing required presentation group/code;
- empty label/tooltip;
- duplicate Reference entry IDs.

The validator MUST inspect catalog metadata only and MUST NOT read application state, imports, network addresses or secrets.

## Narrative boundary

Explicit definitions remain required for concepts whose meaning is not encoded by a trusted descriptor. Tests enforce stable links; the application MUST NOT invent explanations from arbitrary function names or raw codes.
