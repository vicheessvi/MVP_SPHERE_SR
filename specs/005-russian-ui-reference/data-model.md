# Data Model: Пользовательская терминология

## UserTerm

- `id`: стабильный внутренний идентификатор карточки
- `section`: идентификатор раздела Справочника
- `title`: основное русское название
- `summary`: короткое пользовательское определение
- `details`: необязательное расширенное объяснение
- `keywords`: поисковые сокращения, исходные технические значения и синонимы
- `status`: `confirmed`, `needs_clarification` или `in_development`

Validation: `id`, `section`, `title`, `summary` обязательны; неизвестные расшифровки не могут иметь `confirmed`.

## ReferenceSection

- `id`: стабильный идентификатор
- `title`: русский заголовок
- `description`: цель раздела
- `entries`: упорядоченные `UserTerm`

Разделы идут в порядке требований 41; глоссарий и сокращения сортируются по русскому заголовку.

## PresentationDictionary

- `categories`: `vcs/controller/panel` → обязательные названия
- `pollStatuses`: внутренние статусы → русские подписи
- `pingStatuses`: внутренние признаки → русские подписи
- `capabilities`: внутренние признаки поддержки → русские подписи
- `runStatuses` и `importOutcomes`: внутренние результаты → русские подписи
- `tooltips`: идентификатор показателя → краткое объяснение

Не сохраняется в state. Не изменяет raw values, enums или API.

## ReferenceNavigation

- `query`: текущее несохраняемое значение поиска
- `topicId`: необязательная карточка, выбранная контекстным переходом

State transition: module → `reference(topicId)`; search input → filtered entries; reset → all entries.
