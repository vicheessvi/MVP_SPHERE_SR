# Answer Mode Contract

Только exact TE30/40/50/60 через существующий `huawei_te_web_cgi_v1`. После pre-auth и post-auth model/identity проверяются текущие маркеры `WEB_GetCfgParamAPI`, `WEB_SaveCfgParamAPI`, `autoreply` и exact options `1=manual`, `0=automatic`. Pre-read запрашивает только `CfgIDString=["autoreply"]` и принимает целое 0/1. При отличии целевого значения допускается одна `WEB_SaveCfgParamAPI` с единственным `CfgItemInt` для `autoreply`, затем точный post-read. Любой drift — fail-closed. Не сочетать с другими write-задачами, не запускать при обычном опросе.
