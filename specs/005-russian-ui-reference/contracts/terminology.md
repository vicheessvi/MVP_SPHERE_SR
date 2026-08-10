# UI Contract: Терминология

## Категории

| Internal | User label |
|---|---|
| `vcs` | Терминалы ВКС |
| `controller` | Контроллеры |
| `panel` | Панели управления |

## Опрос

| Internal | User label |
|---|---|
| `success` / `SUCCESS` | Успешно |
| `failed` / `error` / `FAILED` | Ошибка |
| `not_polled` / `NOT_POLLED` / `never` | Не опрашивалось |
| `unsupported` / `UNSUPPORTED` | Автоматический опрос не поддерживается |
| `unknown` / `UNKNOWN` | Данные отсутствуют |
| ping `failed` | Нет ответа по сети |

Любое неизвестное значение MUST отображаться как «Данные отсутствуют», а не как внутренний код.

## Presentation-only boundary

- Raw SR/JSON and persisted enums remain byte/semantic compatible.
- Manufacturer/model names remain original.
- Technical values may appear only inside explicitly marked «Как формируются данные» help text.
