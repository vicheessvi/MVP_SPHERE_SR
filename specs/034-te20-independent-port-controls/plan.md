# Implementation Plan: Независимое управление HTTP и Telnet TE20

**Branch**: `codex/secure-local-runtime` | **Date**: 2026-11-02 | **Spec**: [spec.md](spec.md)

## Summary

Добавить два независимых трёхпозиционных поля плана для exact Huawei TE20. Ненулевой выбор транслируется в отдельное фиксированное действие runtime; каждое действие использует уже проверенный HTTPS/CGI-контракт с exact-model/identity gates, одним pre-read, максимум одной одноэлементной записью и post-read. Старый групповой opt-in сохраняется для совместимости.

## Technical Context

**Language/Version**: Python 3.11+ standard library; HTML/CSS/Vanilla JavaScript
**Primary Dependencies**: Нет новых; локальный runtime и существующий catalog
**Storage**: Только память плана/сеанса; готовый JSON в выбранной папке
**Testing**: unittest, `node tests.js`, reference validator
**Target Platform**: Windows, loopback browser runtime
**Project Type**: Локальное веб-приложение с Python runtime
**Performance Goals**: Не увеличивать число сетевых записей более одного на выбранный параметр
**Constraints**: Только exact TE20, HTTPS/443/TLS1.1 profile, подтверждение перед запуском, без новых зависимостей и секретов в state
**Scale/Scope**: Один IP из SR для write-задачи; два независимых параметра

## Constitution Check

- I–III: raw SR и результаты опроса не меняются, сопоставление остаётся exact IP/model; PASS.
- IV–V: отдельные подтверждённые события действий и безопасные статусы; PASS.
- VI: локальные credentials только в памяти, Python admin gate перед планом, HTTPS без fallback; PASS.
- Workflow: рискованное write-изменение проходит Full SpecKit, synthetic fail-closed проверки и отдельную эксплуатационную проверку; PASS.
- Повторная проверка после проектирования: те же условия выполнены; исключений нет.

## Project Structure

```text
app.js; index.html; product-catalog.js; runtime/device-catalog.json
mvp_runtime/adapters/huawei_te40.py; mvp_runtime/polling.py; mvp_runtime/server.py
python_tests/test_huawei_te40.py; python_tests/test_polling.py; python_tests/test_server.py; tests.js
specs/034-te20-independent-port-controls/; docs/decisions/; docs/implementation-log.md
```

**Structure Decision**: Использовать существующие пути plan v3, catalog и адаптер TE20 без нового runtime или transport.

## Complexity Tracking

Нарушений constitution нет. Раздельные действия нужны для явной границы записи и самостоятельной диагностики каждого порта.
