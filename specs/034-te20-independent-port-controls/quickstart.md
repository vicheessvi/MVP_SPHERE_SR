# Validation guide

1. Запустить `python -m unittest discover -s python_tests -v`, `node tests.js`, `node scripts/validate-reference.js`, `python -m compileall -q mvp_runtime python_tests START_MVP_SPHERE_SR.py`.
2. В локальном Python runtime войти администратором, загрузить актуальную SR и выбрать ровно один exact TE20 по IP.
3. Проверить девять сочетаний полей HTTP и Telnet. При «Не менять» план не должен содержать соответствующую write-задачу; попытка совместить со старой групповой задачей блокируется.
4. В синтетических ответах проверить `already_compliant`, один одноэлементный write и post-read, отсутствие записи при неверной модели, marker/schema drift и ошибку без автоматического повтора.
5. Только в отдельном согласованном эксплуатационном тесте проверить открытие/закрытие на реальном TE20, сверяя состояние меню после каждого действия. Не включать реальные IP, credentials или ответы устройства в fixtures и Git.
