# Research: Browser-only анализ изменений

## 1. Архитектурный эталон

**Decision**: Следовать runtime-паттерну `drthalas/MVP_DEMO`.

**Evidence**: Эталон состоит из `index.html`, `styles.css`, `app.js`; открывается напрямую, не содержит `package.json`, backend или network dependencies, хранит versioned state в `localStorage` и поддерживает JSON backup.

**Adaptation**: Сохранить тот же стек и способ запуска, заменив roadmap domain на snapshots/projects/assets/changes.

## 2. Static browser-only runtime

**Decision**: HTML5 + CSS3 + Vanilla JavaScript, plain `<script src="app.js">`, без ES modules.

**Rationale**: Plain scripts и относительный CSS соответствуют direct `file://` запуску эталона и не требуют local server, build step или origin-dependent module loading.

**Alternatives considered**: Django/PostgreSQL, React/Vue, Electron/Tauri, local HTTP launcher. Отклонены текущим требованием пользователя.

## 3. Local state

**Decision**: Единый state schema version 1 под ключом `mvpSphereSrState.v1` в `localStorage`.

**Rationale**: Повторяет эталон, поддерживает простой atomic save whole-state и reload persistence.

**Limitations**: Quota и долговечность зависят от browser profile; пользователь/DevTools может изменить state. Поэтому import делает preflight, ошибки не повреждают текущий state, а backup является обязательным recovery mechanism.

## 4. Raw snapshot representation

**Decision**: Хранить original JSON text, content hash, filename, size, capturedAt/uploadedAt, schema profile и processing status внутри Snapshot object.

**Rationale**: Text достаточно для byte-stable UTF-8 JSON demo fixtures и повторной обработки, а hash выявляет duplicate. Приложение не предоставляет edit action.

**Limitation**: Это application-level immutability, не tamper-resistant evidence.

## 5. File intake

**Decision**: Использовать `<input type="file" multiple accept="application/json,.json">` и `FileReader`/`File.text()`; не читать каталоги автоматически.

**Rationale**: Browser File API разрешает доступ только к файлам, которые выбрал пользователь, и работает без backend.

## 6. Validation

**Decision**: Реализовать внутренний deterministic validator для обязательного подмножества Extron v1 contract и отдельный legacy detector.

**Rationale**: Внешний JSON Schema package нарушил бы no-dependencies constraint. Нормативный schema artifact остаётся источником требований, а tests фиксируют соответствие обязательным полям/enums.

## 7. Normalization and provenance

**Decision**: Pure functions нормализуют MAC, IP, boolean, dates, whitespace и unordered collections; каждое canonical field хранит raw value и JSON path.

**Rationale**: Одинаковый input и ruleset version должны давать одинаковый result без formatting noise.

## 8. Identity and matching

**Decision**: Stable identifiers first; fallback signals создают explainable confidence. Ambiguous match блокирует definitive field event до local user decision.

**Rationale**: Имя/IP/MAC являются изменяемыми и не могут быть единственным identity key.

## 9. Change history

**Decision**: Хранить versioned ChangeSets и ChangeEvents в state. Late snapshot создаёт новые adjacent ChangeSets и помечает прежние superseded.

**Rationale**: Сохраняет explainability в рамках локального state и соответствует domain contract.

## 10. UI model

**Decision**: Один `index.html`, DOM rendering из `app.js`, client-side screen state, event delegation и доступные native forms.

**Rationale**: Повторяет эталон без framework и позволяет реализовать dashboard, projects, upload, comparisons, baselines, reviews и settings.

## 11. Demo roles

**Decision**: Локальные Administrator/AV Engineer accounts и UI filtering, как в эталоне.

**Rationale**: Полезно для демонстрации workflow.

**Limitation**: Credentials/state доступны локальному пользователю и не являются настоящей security boundary. Постоянный warning обязателен.

## 12. Backup and restore

**Decision**: Экспортировать UTF-8 JSON с version/exportedAt/full state; импортировать только после полной shape/domain validation и quota preflight.

**Rationale**: Backup компенсирует хрупкость browser storage и переносит state между profiles/computers.

## 13. Retention

**Decision**: `retentionDays=1095` в settings; проверка при startup и вручную. Active baseline получает expiration_pending и не удаляется без решения.

**Rationale**: Закрытая browser page не может гарантировать background schedule.

## 14. Tests without tooling

**Decision**: `tests.html` загружает fixtures/expectations и `tests.js`, показывает PASS/FAIL в browser; manual quickstart дополняет tests. `node --check` optional.

**Rationale**: Constitution требует regression evidence, а no-package constraint запрещает добавлять test framework только ради MVP.

## 15. Security boundary

**Decision**: MVP не делает network requests и принимает только synthetic/sanitized data.

**Rationale**: `file://` + `localStorage` не обеспечивает авторизацию, централизованный audit или гарантированное secure deletion. Эти ограничения задокументированы как временное исключение в ADR-0003.

## Sources

- Reference repository: <https://github.com/drthalas/MVP_DEMO>
- MDN File API: <https://developer.mozilla.org/en-US/docs/Web/API/File_API>
- MDN Web Storage API: <https://developer.mozilla.org/en-US/docs/Web/API/Web_Storage_API>
- MDN same-origin policy and file origins: <https://developer.mozilla.org/en-US/docs/Web/Security/Defenses/Same-origin_policy>
