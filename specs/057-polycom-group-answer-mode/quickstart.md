# Проверка Answer mode Polycom Group

1. Запустить `python -m unittest discover -s python_tests -v`, `node tests.js`, `node scripts/validate-reference.js` и `python -m compileall -q mvp_runtime python_tests START_MVP_SPHERE_SR.py`.
2. На локальном Group 310 создать план по одному IP из актуальной SR. Выбрать только Point-to-Point, убедиться в отдельном согласии, одном POST и сохранении Multipoint; затем отдельно вернуть исходное состояние.
3. Аналогично проверить только Multipoint; учесть переходный post-read и убедиться, что POST не повторяется.
4. Выбрать оба поля: план должен создать один action ID, один POST максимум с двумя `vars`, затем подтвердить оба значения двумя последовательными чтениями. После теста отдельно вернуть исходную пару.
5. Выбрать совместимую группу Group 300/310/500/700; проверить число целей, отдельное согласие, индивидуальные model/identity gates. Смешанная группа, старый HTTP-only Group 300, неизвестный `Do Not Disturb`, drift bundle и неясный ответ должны отказать до записи или без её повтора.
6. Проверить, что обычный опрос, логи и исторические JSON не изменились; реальные credentials, IP, serial/MAC и сырые ответы не попали в Git.
