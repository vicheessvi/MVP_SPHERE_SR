# Implementation Plan: Answer mode Polycom RealPresence Group

**Branch**: `codex/secure-local-runtime` | **Date**: 2026-11-16 | **Spec**: [spec.md](spec.md)

## Summary

Добавить в действующий план два независимых выбора Point-to-Point и Multipoint для exact Group 300/310/500/700. «Не менять» не создаёт задачу. Один action ID с двумя nullable целями, одно или два изменённых поля в **одном** `POST /rest/config`, затем ограниченная read-only проверка обоих значений до двух последовательных совпадений. Exact Group 310 подтверждён контролируемыми переходами; остальные модели требуют собственных эксплуатационных проверок.

## Technical Context

- **Language/Version**: Python 3.11+ stdlib runtime, HTML/CSS/Vanilla JavaScript UI.
- **Dependencies**: Существующий HTTPS/443 guarded Polycom adapter, общий каталог action IDs, loopback runtime и актуальная SR.
- **Storage**: Только выбранные JSON; credentials и session cookie в памяти.
- **Testing**: Python `unittest`, `node tests.js`, `node scripts/validate-reference.js`, реальные контролируемые переходы Group 310.
- **Target Platform**: Windows локально.
- **Performance**: На устройство pre-read обоих полей, 0–1 POST, bounded повторные **только чтения** до устойчивого результата; неясная запись не повторяется.
- **Constraints**: Exact модели, pre/post-auth model/identity и bundle gates, TLS exception только по согласию, no HTTP fallback, только `Yes/No`; неизвестный `Do Not Disturb` блокирует изменение.
- **Scale/Scope**: Один IP либо совместимая группа exact Group из текущей SR; один action ID в плане, отдельное подтверждение с количеством целей.

## Constitution Check

- I–V PASS: результат записи имеет исходную пару, целевую пару, post-read, статус и безопасную причину; неясный исход не объявляется успехом.
- VI PASS: secrets не сохраняются, сертификат обходится только по явному разрешению текущего запуска, связь только с выбранными IP.
- Gate PASS: на Group 310 проверены однопараметрические и двухпараметрические переходы, `NOERROR` и два совпадающих чтения; исходное `Yes/No` восстановлено и подтверждено web-меню.
- Post-design recheck PASS: минимальный payload содержит только выбранные поля, каждый Group проходит свой exact model/identity/bundle gate, неизвестные прошивки и коды блокируют запись.

## Project Structure

```text
specs/057-polycom-group-answer-mode/    spec, research, model, contract, tasks
runtime/device-catalog.json              allowlist action ID
mvp_runtime/adapters/polycom_group.py     guarded write после обычного чтения
mvp_runtime/polling.py                    проверка плана и передача целей
app.js                                    два переключателя, экспорт и согласие
python_tests/, tests.js                   контрактные и отказные проверки
product-catalog.js, docs/                справочник и решение
```

## Phase 0 — Research

Точный web-код `RestConfigProxy` и `setConfiguration` прочитан на Group 310. Контрольные тесты одного и двух полей, включая возврат исходной пары, описаны в [research.md](research.md). Официальное руководство подтверждает отдельные пользовательские настройки, но не заменяет локальное подтверждение REST-контракта.

## Phase 1 — Design & Contracts

Плановая форма и результат описаны в [data-model.md](data-model.md), минимальный запрос/ответ — в [contracts/answer-mode.md](contracts/answer-mode.md), сценарии проверки — в [quickstart.md](quickstart.md). Два nullable выбора попадают в план только при action ID; `Do Not Disturb` не выбирается и не перезаписывается.

## Implementation

Сначала отказные и позитивные синтетические тесты, затем каталог/runtime/adapter/UI, справочник, документация и полная регрессия. Неуспешное или неустойчивое post-read даёт неопределённый результат без повтора POST. Group 300/500/700 отмечаются как предварительно поддерживаемые до самостоятельной реальной проверки.
