# Quickstart / Acceptance

1. Запустить `START_MVP_SPHERE_SR.py`, загрузить актуальную SR, ввести учётные данные только в форму.
2. В плане выбрать один exact TE40 по IP и Answer Mode «Автоматически», подтвердить влияние на входящие вызовы; проверить `before=manual`, `after=automatic` и web-меню.
3. Отдельно повторить «Вручную» только после явного согласия администратора.
4. Администратор отдельно проверил TE30/TE50/TE60 и TE40 в обоих направлениях, по одному и массово; новые write-результаты подтверждены.
5. Запустить `python -m unittest discover -s python_tests -v`, `node tests.js`, `node scripts/validate-reference.js`.
