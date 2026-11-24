# Research

У прежнего run_plan один root managementTasks передавался каждому адаптеру.
Обе проверки UI/runtime требовали единственный action и поддержку каждой целью.
Vendor adapters уже независимы и guarded, схема их минимальных writes не меняется.

Выбраны explicit per-device bindings вместо implicit угадывания по root: UI и
runtime независимо проверяют каталог, а journal фиксирует фактический scope.
Root список — выбор оператора; он остаётся при resume, даже если семейство уже
завершено. Отдельные per-device targets фильтруются только по saved/review.

Для No-change без collectors выбран offline notRequested, не ложный success и
не read ради выяснения состояния. Неизвестные exact модели блокируются как раньше.
Никакого общего vendor-кода значения: Huawei 310 manual=0, Huawei 300/TE manual=1,
Polycom No; эти детали остаются только в проверенных adapters.
