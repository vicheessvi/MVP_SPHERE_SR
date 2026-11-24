# Контракт: изменение Answer mode exact Polycom Group

Только после стандартных HTTPS/443 pre-auth Polycom login/bundle checks, session login, совпадения build и exact post-auth `RealPresence Group <model>` плюс serial/MAC. Текущий `main.js` должен содержать обе привязки `autoAnswerSingleCall` / `autoAnswerMultiPointCall` к точным config FQ names, `generateWriteJsonData`, `processJsonWriteValue` и `setConfiguration` для `POST /rest/config`. Drift → `protocol_required` без POST. Group 300 с HTTP-only прошивкой не получает fallback.

Pre-read: два отдельных `POST /rest/config` вида `{"names":["<exact-name>"]}`. Каждая строка ответа должна содержать ровно одно точное имя и строку `Yes` либо `No`. `Do_Not_Disturb` и иные строки не разрешают запись.

Write: максимум один `POST /rest/config` с `{"vars":[{"name":"<exact-selected-name>","value":"Yes|No"},...]}`. В список входят только выбранные и действительно изменяемые поля; максимум две записи. Ответ HTTP 200, `vars` содержит ровно соответствующие строки с точными именами и `result=NOERROR`. Неизвестный ответ не повторяется.

Post-read: оба поля узко перечитываются; до bounded timeout требуются два последовательных совпадения заданных целевых значений и неизменённого соседнего поля. Повторяются **только чтения**. Если timeout, код/модель или соседнее значение не сходятся, результат не считается успехом и POST не повторяется автоматически.

В обычном JSON-опросе новых writes нет. Массовый план содержит один action ID, общий набор целей из актуальной SR с проверенным digest, уникальными IP и поддержкой action на каждом устройстве; каждый отдельный результат независим.

Эксплуатационная актуализация 2026-11-24: администратор подтвердил Answer mode
всех четырёх exact Group в обоих направлениях, по одному IP и массово. Новые
write-результаты получают confirmed_user_validation; прежние JSON, форма запроса,
HTTPS-only и проверки каждого устройства не меняются. Подтверждение не разрешает
произвольные прошивки, HTTP fallback либо другие параметры записи.
