# Implementation Plan: Загрузка и план автоматического опроса

**Branch**: `codex/secure-local-runtime` | **Date**: 2026-09-01 | **Spec**: [spec.md](spec.md)

## Summary

Перестроить «Загрузку» вокруг четырёх операционных секций, добавить чистую каскадную проекцию SR, безопасную XLSX-валидацию credentials и расширить локальный последовательный runner интервалом, немедленной атомарной записью, отменой и явным пропуском неподдерживаемых устройств.

## Technical Context

**Language/Version**: HTML5, CSS3, Vanilla JavaScript; Node.js 24 LTS только для разработки и локального polling

**Primary Dependencies**: browser File API, vendored SheetJS CE 0.20.3, built-in Node modules

**Storage**: UI — память вкладки; результаты — локальные JSON; credential pool — память процесса

**Testing**: `node tests.js`, `node runtime-tests.js`, `node server-tests.js`, `node --check`, reference validator, secret scan

**Target Platform**: Windows, Chromium-compatible browser, прямой `file://index.html`

**Project Type**: статическое локальное приложение + отдельный локальный CLI polling

**Performance Goals**: пересчёт фильтров без заметной задержки на текущем масштабе SR; строго один активный device poll

**Constraints**: нет CDN/telemetry/browser persistence; нет реальных secrets/IP fixtures; неподтверждённые vendor protocols fail-closed

**Scale/Scope**: один администратор, одна актуальная SR, сотни/тысячи устройств, один последовательный запуск

## Constitution Check

- PASS: raw SR/JSON не изменяются.
- PASS: выбор плана использует стабильные SR device IDs и точные IP.
- PASS: нормализация и порядок детерминированы.
- PASS: unsupported и ошибки сохранения не превращаются в успех.
- PASS: прогресс разделяет success/error/unsupported.
- PASS WITH DOCUMENTED AMENDMENT: feature 011 сохраняла scoped credentials в DPAPI vault; новый явно запрошенный workflow использует только текущий XLSX в памяти процесса. Секреты не входят в browser state или результаты.
- PASS: интерфейс остаётся `file://`, сетевой доступ только у существующего локального runner к allowlist IP.

Повторная проверка после дизайна: PASS; исключений, требующих Complexity Tracking, нет.

## Project Structure

```text
app.js                         # UI, импорт SR, каскад и экспорт snapshot-плана
styles.css                     # компактный multi-select/chips и четыре секции
product-catalog.js             # русские подписи и Справочник
runtime/credential-pool.js     # XLSX records -> безопасный общий пул
runtime/extron-web-poller.js   # последовательные credential attempts без утечки
runtime/polling.js             # snapshot, unsupported skip, interval/cancel callbacks
scripts/poll-devices.js        # обязательный XLSX, per-result atomic save, progress
poll-extron.ps1                # явные обязательные параметры
tests.js                       # UI/domain regression
runtime-tests.js               # runner/credentials/interval/security regression
specs/012-automatic-polling-plan/
```

**Structure Decision**: сохранить существующий монолитный файловый UI и локальные CommonJS runtime-модули; новая зависимость или служба не нужна.
