# Implementation Plan: Answer mode CloudLink 300

**Branch**: `codex/secure-local-runtime` | **Date**: 2026-11-15 | **Spec**: [spec.md](spec.md)

## Summary

Добавить standalone Answer mode для exact Bar 300, Box 300 и Box 600 в существующий план. Один IP либо совместимая группа текущей SR, одна action ID на направление, отдельное согласие. После model/identity и точных web-маркеров — pre-read, максимум одна минимальная запись и post-read. Bar 300 служит источником контрольного write-контракта; Box write остаётся предварительным до отдельной эксплуатации.

## Technical Context

- **Language/Version**: Python 3.11+ stdlib runtime; Vanilla JavaScript UI.
- **Dependencies**: Только существующий HTTPS CGI adapter, каталог устройств и same-origin loopback.
- **Storage**: Только выбранные JSON результата; credentials и сессионные токены в памяти задания.
- **Testing**: Python `unittest`, `node tests.js`, `node scripts/validate-reference.js`, контролируемый Bar 300.
- **Target Platform**: Windows, локальная Python-среда и браузер.
- **Project Type**: Локальный инструмент автоматического опроса и ограниченного управления.
- **Performance Goals**: На устройство один pre-read, 0–1 write, один post-read; без автоматического повторения неясного write.
- **Constraints**: Exact Bar 300/Box 300/Box 600, HTTPS/443, отдельный opt-in для самоподписанного сертификата, текущая SR/digest/IP, один action на план, никаких других полей конфигурации в записи.
- **Scale/Scope**: Один IP или совместимая группа точных моделей серии 300; не переносить обратную кодировку 310 и не расширять другие write-задачи.

## Constitution Check

- I–V PASS при отдельном action result с исходным и повторно прочитанным значением; неизвестный/неясный исход — отказ, не ложный успех.
- VI PASS при отсутствии секретов в плане/JSON/логах, TLS-послаблении только по разрешению текущего запуска и запрете внешней передачи.
- Gate PASS: текущий Bar 300 bundle подтвердил форму `0=Авто/1=Вручную`; контролируемые переходы `0→1→0` прошли с одним узким `WEB_SaveCfgParamAPI` на переход и точным post-read без повтора. Box write остаётся preliminary до отдельной проверки.
- Post-design recheck PASS: минимальный payload затрагивает только `autoreply`, исходный режим восстановлен машинно; точные model/identity gates и отдельное UI-согласие сохраняются.

## Project Structure

```text
specs/053-cloudlink-300-answer-mode/    spec, plan, research, data-model, contracts, tasks
runtime/device-catalog.json              allowlist двух action ID
mvp_runtime/adapters/huawei_300.py        guarded модельный write core
mvp_runtime/polling.py                    проверка плана и маршрутизация
app.js                                    выбор рядом с существующим Answer mode
python_tests/, tests.js                   отказные, model drift и групповые проверки
product-catalog.js, docs/                Справочник и решение
```

## Phase 0 — Research

1. На подключённом exact Bar 300 проверить текущий режим и bundle-маркеры формы/сохранения без записи.
2. После отдельного согласия выполнить один контролируемый переход «Авто → Вручную», проверить точный post-read и подтверждение web-меню.
3. Отдельно согласовать возврат «Вручную → Авто» и проверить его тем же методом.
4. Box 300/600 оставить предварительными до самостоятельных реальных write-проверок; user read-only validation не заменяет их.

## Phase 1 — Design

После research определить действие/результат в [data-model.md](data-model.md), минимальный CGI-контракт в [contracts/answer-mode.md](contracts/answer-mode.md) и испытания в [quickstart.md](quickstart.md). Подтвердить Конституцию повторно.

## Implementation

Сначала синтетические тесты fail-closed, затем action allowlist, модельная запись, план/UI, Справочник и полная регрессия. Неизвестный write-контракт остаётся `protocol_required`, не угадывать endpoint.
