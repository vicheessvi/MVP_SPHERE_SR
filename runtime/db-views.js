(function (root) {
  "use strict";
  const KIND_LABELS = { confirmed_reboot: "Перезагрузки", power_off: "Штатные выключения",
    suspected_power_loss: "Предполагаемые паузы", unknown_start: "Причина запуска неизвестна", start_after_shutdown: "Запуски после выключения" };
  const OFFHOURS_LABELS={none:"Выключения не зафиксированы",once:"Одно штатное выключение",repeated:"Два и более штатных выключения",suspected:"Только предполагаемые паузы",unknown:"Недостаточно данных"};
  const CATEGORY_LABELS = { vcs: "Терминалы ВКС", controller: "Контроллеры", panel: "Панели", switch: "Коммутаторы",
    matrix_switch: "Матрицы", scaler: "Скалеры", audio_processor: "Аудиопроцессоры",other:"Не классифицировано" };
  const STATUS = { success: "Успешно", never: "Не опрашивалось", authorization_error: "Ошибка авторизации",
    network_unreachable: "Недоступно по сети", processing_error: "Ошибка обработки", unmatched: "Не сопоставлено" };
  const escape = (value) => String(value ?? "").replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]);
  const number = (value) => Number(value || 0).toLocaleString("ru-RU");
  const parse = (body) => { try { return JSON.parse(body || "{}"); } catch { return {}; } };

  function createController(options) {
    let revision = null, generation = 0, activeKey = "", activeDescriptor = null, controller=null;
    let bootstrap = null,facetInputTimer=null;
    const states = new Map(), cache = new Map(), pending = new Map();
    const facetCache=new Map();
    const dimensions=["domain","category","manufacturer","model","locationId","address"];
    const stateFor = (route) => {
      if (!states.has(route)) states.set(route, { filters: { period: "all",source:"logs" }, page: 0, kind: "confirmed_reboot", table: "events" });
      return states.get(route);
    };
    function setRevision(info) {
      if(facetInputTimer){clearTimeout(facetInputTimer);facetInputTimer=null;}
      for(const entry of new Set(facetCache.values())){entry.cancelled=true;entry.controller?.abort();}
      revision = info.revision; bootstrap = info;
      controller?.abort(); controller=null;
      generation += 1; activeKey = ""; cache.clear(); pending.clear();
      facetCache.clear();
    }
    function normalizeFilters(values,data){
      const result={...values};
      for(const key of dimensions) {
        if(data.selected?.[key])result[key]=data.selected[key];else delete result[key];
      }
      return result;
    }
    function facetKey(descriptor,values){
      return JSON.stringify([revision,descriptor.category||"",...["current","vip","search","accounted",...dimensions].map((key)=>values[key]||"")]);
    }
    function fetchFacets(descriptor,values){
      const key=facetKey(descriptor,values);
      if(facetCache.has(key)&&!facetCache.get(key).cancelled)return facetCache.get(key);
      const entry={};
      entry.controller=typeof root.AbortController==="function"?new root.AbortController():null;
      facetCache.set(key,entry);
      while(facetCache.size>12)facetCache.delete(facetCache.keys().next().value);
      const version=revision;
      const notify=()=>{
        const current=activeDescriptor;
        if(entry.cancelled||facetCache.get(key)!==entry||version!==revision||!current)return;
        const state=stateFor(current.route);
        if(facetKey(current,state.draftFilters||state.filters)!==key)return;
        if(entry.data){
          if(state.draftFilters)state.draftFilters=normalizeFilters(state.draftFilters,entry.data);
          else state.filters=normalizeFilters(state.filters,entry.data);
          facetCache.set(facetKey(current,state.draftFilters||state.filters),entry);
        }
        let updated=false;
        try{updated=options.updateFilters?.(filters(state,current.renderer==="reboots",current.renderer==="inventory",entry))===true;}catch{/* Keep a successful database response even if partial DOM update fails. */}
        if(!updated)options.render();
      };
      const timer=entry.controller?setTimeout(()=>{entry.timedOut=true;entry.controller.abort();},options.facetTimeoutMs||10000):null;
      const metadataFilters=Object.fromEntries(["current","vip","search","accounted",...dimensions].filter(name=>values[name]!==undefined).map(name=>[name,values[name]]));
      entry.promise=options.request("view",{revision,name:"facets",page:0,size:50,filters:{...metadataFilters,scopeCategory:descriptor.category||""}},{signal:entry.controller?.signal})
        .then((data)=>{
          if(entry.cancelled||facetCache.get(key)!==entry)return null;
          if(!data||!["domains","categories","manufacturers","models","locations","addresses"].every(name=>Array.isArray(data[name])))throw Object.assign(new Error("metadata_response_invalid"),{safeCode:"metadata_response_invalid"});
          entry.data=data;return data;
        })
        .catch((error)=>{
          if(entry.cancelled||facetCache.get(key)!==entry)return null;
          const reasons={db_query_timeout:"Сервер не успел подготовить списки",db_query_failed:"Ошибка чтения списков из БД",db_filter_invalid:"Не приняты условия списков",db_query_invalid:"Не принят запрос списков",
            workspace_revision_conflict:"База обновилась — получите актуальную версию",db_preparation_required:"Не завершена подготовка БД",admin_login_required:"Требуется вход в инструмент",
            local_session_required:"Локальный сеанс завершён — войдите снова",csrf_or_origin_rejected:"Проверка локального сеанса отклонила запрос",workspace_not_configured:"Рабочая БД не подключена",
            workspace_selection_changed:"Изменилось подключение к БД",workspace_id_invalid:"Не подтверждён идентификатор БД",workspace_missing:"Папка БД недоступна",workspace_corrupt:"Ошибка целостности БД",
            workspace_locator_invalid:"Не удалось прочитать путь рабочей БД",workspace_write_failed:"Исполнитель не смог обработать запрос БД",
            not_found:"Исполнитель не поддерживает запрос списков",local_runtime_error:"Исполнитель не вернул ожидаемый ответ",metadata_response_invalid:"Неполный ответ списков от исполнителя"};
          const code=error?.name==="AbortError"?(entry.timedOut?"metadata_timeout":"metadata_cancelled"):Object.prototype.hasOwnProperty.call(reasons,error?.safeCode)?error.safeCode:"metadata_read_failed";
          entry.code=code;entry.conflict=["workspace_revision_conflict","db_preparation_required"].includes(code);
          const http=Number.isInteger(error?.status)&&error.status>=100&&error.status<=599?" · HTTP "+error.status:"";
          entry.error=(code==="metadata_timeout"?"Превышено время ожидания списков":code==="metadata_cancelled"?"Запрос списков был отменён — повторите загрузку":reasons[code]||"Не удалось загрузить списки")+". Код: "+code+http+". Поиск и период остаются доступны.";
          return null;
        })
        .then((data)=>{
          try{notify();}catch{entry.code="metadata_ui_update_failed";entry.error="Списки прочитаны, но поля не обновились. Код: metadata_ui_update_failed. Откройте модуль повторно.";}
          return data;
        })
        .finally(()=>{if(timer)clearTimeout(timer);});
      return entry;
    }
    function ensureFacets(descriptor,state){
      const values=state.draftFilters||state.filters, key=facetKey(descriptor,values);
      const found=facetCache.get(key);
      if(found&&!found.cancelled)return found;
      return fetchFacets(descriptor,values);
    }
    function request(name, state, extra = {}, scope = null) {
      return options.request("view", { revision:scope?.revision||revision, name, page: state.page, size: 50,
        filters: { ...state.filters, kind: state.kind, ...(state.deviceId ? { deviceId: state.deviceId } : {}) }, ...extra }, {signal:scope?.signal||controller?.signal});
    }
    function routeView(descriptor, state) {
      if(descriptor.renderer==="reboots"&&state.offhours)return "offhours";
      if (descriptor.renderer === "reboots") return state.table || "events";
      if (descriptor.renderer === "inventory") return state.deviceId ? "polls" : state.site ? "site-name" : "inventory";
      if (descriptor.renderer === "equipment" || descriptor.renderer === "dashboard") return "dashboard";
      return descriptor.renderer;
    }
    function schedule(descriptor, state, key) {
      if (pending.has(key) || cache.has(key)) return;
      const epoch = generation;
      const entry={epoch,revision,signal:controller?.signal};
      pending.set(key,entry);
      setTimeout(() => {
        if(pending.get(key)!==entry)return;
        if(epoch!==generation || key!==activeKey) {
          pending.delete(key);
          if(key===activeKey)options.render();
          return;
        }
        const main = routeView(descriptor, state);
        const names = state.offhours&&descriptor.renderer==="reboots" ? ["offhours"] : descriptor.renderer === "reboots"
          ? [main, "summary", "accounted", "heatmap", "tops", ...(state.kind === "power_off" ? ["duration"] : [])]
          : [main];
        const view = { loading: true };
        cache.set(key, view);
        while (cache.size > 8) cache.delete(cache.keys().next().value);
        const read=async (name) => {
          if(generation!==epoch||activeKey!==key)return;
          try { view[name] = await request(name, state,{},entry); }
          catch (error) { if(error?.name==="AbortError")return;
            view.conflict=view.conflict||["workspace_revision_conflict","db_preparation_required"].includes(error?.safeCode);
            view.error = view.conflict ? "База изменилась. Нажмите «Повторить», чтобы получить опубликованную версию."
              : error?.safeCode==="calendar_year_unsupported" ? "Для выбранного года нет проверенного календаря РФ. Доступны 2024–2027 годы; выберите период в этом диапазоне."
              : error?.safeCode==="offhours_period_invalid" ? "Начало периода должно быть раньше его окончания и текущего времени."
              : error?.safeCode==="db_filter_invalid"&&state.offhours ? "Проверьте даты и условия нерабочего времени, затем нажмите «Применить»."
              : error?.safeCode==="db_query_timeout" ? "Расчёт не завершён по времени. Фильтры доступны: выберите период или нужные устройства и нажмите «Применить»."
              : "Не удалось получить данные. Можно повторить запрос, не перезапуская инструмент."; }
          if (generation === epoch && activeKey === key) publish();
        };
        // Keep SR metadata independent and avoid five simultaneous full-history scans.
        let cursor=0;
        const lane=async()=>{while(cursor<names.length){if(generation!==epoch||activeKey!==key)return;await read(names[cursor++]);}};
        Promise.all(Array.from({length:Math.min(2,names.length)},lane)).finally(() => {
          if(pending.get(key)===entry)pending.delete(key);
          view.loading = false;
          if(generation!==epoch && cache.get(key)===view)cache.delete(key);
          if(activeKey===key && (generation===epoch || !pending.has(key)))publish();
        });
      }, 0);
    }
    function publish(){if(!options.update?.())options.render();}
    function deactivate(){
      if(facetInputTimer){clearTimeout(facetInputTimer);facetInputTimer=null;}
      if(!activeKey)return;
      controller?.abort();controller=null;generation+=1;activeKey="";activeDescriptor=null;pending.clear();
      for(const [key,view] of cache)if(view.loading)cache.delete(key);
    }
    function ring(title, count, total, color, attrs) {
      const fraction = total ? Math.min(100, Math.max(0, Number(count || 0) / total * 100)) : 0;
      return `<button type="button" class="db-ring-card" ${attrs}><span class="db-ring"><svg viewBox="0 0 100 100" aria-hidden="true"><circle cx="50" cy="50" r="42" fill="none" stroke="#e4eaf3" stroke-width="9"/><circle cx="50" cy="50" r="42" fill="none" stroke="${color}" stroke-width="9" stroke-linecap="round" stroke-dasharray="${(fraction*2.639).toFixed(2)} 264" transform="rotate(-90 50 50)"/></svg><span><b>${number(count)}</b><small>из ${number(total)}</small></span></span><span><strong>${escape(title)}</strong><small>${fraction.toFixed(1)}% выбранных устройств</small></span></button>`;
    }
    function filters(state, events, inventory=false, facets={}) {
      const f = state.draftFilters||state.filters, data=facets.data;
      const outside=events&&state.offhours;
      const select=(name,items,fallback="")=>`<select name="${name}" title="${escape(items.find(([value])=>value===(f[name]||fallback))?.[1]||"")}">${items.map(([value,label])=>`<option value="${value}"${(f[name]||fallback)===value?" selected":""}>${label}</option>`).join("")}</select>`;
      const choices=(name,list,all)=>`<select name="${name}" data-db-cascade${data?"":" disabled"}><option value="">${data?all:facets.error?"Списки недоступны":"Загрузка значений…"}</option>${(data?.[list]||[]).map((row)=>`<option value="${escape(row.value)}"${String(f[name]||"")===String(row.value)?" selected":""}>${escape(name==="category"?(CATEGORY_LABELS[row.value]||row.label):name==="locationId"&&row.address?row.label+" — "+row.address:row.label)}</option>`).join("")}</select>`;
      return `<form class="db-filter-bar${outside?" db-filter-offhours":""}" data-db-filters aria-busy="${Boolean(state.applyingFilters)}"><fieldset class="db-filter-fields"${state.applyingFilters?" disabled":""}>
        <label class="db-search"><span>Поиск устройства</span><input name="search" type="search" value="${escape(f.search)}" placeholder="Название, модель или IP"></label>
        <label><span>Домен</span>${choices("domain","domains","Все домены")}</label>
        <div class="db-device-filters${inventory?" db-device-filters-two":""}">
        ${inventory?"":outside?'<label><span>Тип устройства</span><input type="hidden" name="category" value="vcs"><span class="db-fixed-filter">Терминалы ВКС</span></label>':`<label><span>Тип устройства</span>${choices("category","categories","Все типы")}</label>`}
        <label><span>Производитель</span>${choices("manufacturer","manufacturers","Все производители")}</label>
        <label><span>Модель</span>${choices("model","models","Все модели")}</label>
        </div>
        <label><span>VIP</span><select name="vip"><option value="">Все</option><option value="yes"${f.vip === "yes" ? " selected" : ""}>VIP</option><option value="no"${f.vip === "no" ? " selected" : ""}>Не VIP</option></select></label>
        ${events ? `${outside?'<label><span>Источник и статус SR</span><span class="db-fixed-filter">Журналы ВКС · Учёт</span></label>':`<label><span>Источник событий</span><select name="source">${[["logs","Журналы ВКС"],["json","JSON: Date − Uptime"],["all","Все источники"]].map(([v,t])=>`<option value="${v}"${(f.source||"logs")===v?" selected":""}>${t}</option>`).join("")}</select></label>`}
        <label><span>Период событий</span><select name="period">${(outside?[["2m","Последние 2 месяца"],["today","Сегодня"],["7d","7 дней"],["30d","30 дней"],["custom","По датам"]]:[["all","Вся история"],["today","Сегодня"],["7d","7 дней"],["30d","30 дней"],["custom","По датам"]]).map(([v,t])=>`<option value="${v}"${f.period===v?" selected":""}>${t}</option>`).join("")}</select></label>
        <label><span>Дата от</span><input name="dateFrom" type="date" value="${escape(f.dateFrom)}"></label>
        <label><span>Дата до</span><input name="dateTo" type="date" value="${escape(f.dateTo)}"></label>
        <label><span>Пауза без логов, мин</span><input name="logSilenceMinutes" type="number" min="15" max="10080" value="${escape(f.logSilenceMinutes || "60")}"></label>
        ${outside?`<label><span>Нерабочее время</span>${select("offhoursTime",[["all","Всё нерабочее время"],["night","Рабочие дни: 18:00–07:00"],["weekend","Выходные, весь день"],["holiday","Праздники и переносы, весь день"]],"all")}</label>
        <label><span>Группа устройств</span>${select("offhoursGroup",[["all","Все ВКС «Учёт»"],...Object.entries(OFFHOURS_LABELS)],"none")}</label>
        <label><span>События на тепловой карте</span>${select("offhoursMetric",[["all","Все зарегистрированные"],...Object.entries(KIND_LABELS)],"all")}</label>`:`<label class="db-check"><input type="checkbox" name="accounted"${f.accounted ? " checked" : ""}>Только ВКС «Учёт»</label>`}` : ""}
        <button type="submit" class="button primary">Применить</button><button type="button" class="text-button" data-db-reset>Сбросить</button>
        <span class="db-filter-state" role="status">${facets.error?escape(facets.error):!data?"Обновляем доступные значения…":state.draftFilters?"Изменения фильтров ещё не применены":""}</span>
        <button type="button" class="text-button" data-db-facets-retry${facets.error?"":" hidden"}>Повторить загрузку списков</button>
        <details class="db-advanced"><summary>Локация, адрес и дополнительные условия</summary><div>
          <label><span>Наименование локации</span>${choices("locationId","locations","Все локации")}</label>
          <label><span>Адрес локации</span>${choices("address","addresses","Все адреса")}</label>
          ${inventory?`<label><span>Область SR</span>${select("current",[["yes","Актуальная SR"],["no","Исторические устройства"],["all","Вся история"]],"yes")}</label>
          <label><span>Результат опроса</span>${select("status",[["","Все"],["never","Не опрашивалось"],["success","Успешно"],["authorization_error","Ошибка авторизации"],["network_unreachable","Недоступно по сети"],["processing_error","Ошибка обработки"],["unmatched","Не сопоставлено"]])}</label>
          <label><span>Доступность по сети</span>${select("ping",[["","Все"],["ok","Доступно"],["failed","Нет ответа"],["unknown","Нет данных"]])}</label>
          <label><span>Изменения</span>${select("changed",[["","Все"],["yes","Есть изменения"],["no","Без изменений"]])}</label>
          <label><span>Поддержка опроса</span>${select("support",[["","Все"],["supported","Поддерживается"],["not_implemented","Не реализован"],["protocol_required","Требует контракта"]])}</label>`:""}
        </div></details>
      </fieldset></form>`;
    }
    function table(headers, rows) {
      if (!rows.length) return '<div class="db-empty"><span aria-hidden="true">◎</span><h3>Нет записей по выбранным условиям</h3><p>Измените фильтры или выберите другой вид событий.</p></div>';
      return `<div class="table-wrap db-table"><table><thead><tr>${headers.map((item)=>`<th>${escape(item)}</th>`).join("")}</tr></thead><tbody>${rows.map((row)=>`<tr>${row.map((cell)=>`<td>${cell}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`;
    }
    function pager(state, data) {
      return `<div class="db-pagination"><button class="button secondary" type="button" data-db-page="-1"${state.page ? "" : " disabled"}>← Назад</button><span>Страница ${number(state.page + 1)} · до 50 записей</span><button class="button secondary" type="button" data-db-page="1"${data?.hasNext ? "" : " disabled"}>Далее →</button></div>`;
    }
    function eventTable(state, data) {
      if (!data) return skeleton();
      const rows = data.rows.map((row) => {
        const raw = parse(row.payload);
        const evidence = (raw.sources || []).slice(0, 3).map((item) => `${item.path}:${item.line}`).join("; ");
        return [`<button type="button" class="text-button" data-db-device="${escape(row.device)}">${escape(row.name)}</button><small>${escape(row.model)} · ${escape(row.ip)}</small>`,
          escape(row.stamp), escape(KIND_LABELS[row.event_kind]), escape(row.locationName), escape(row.address),
          raw.basis==="date_minus_uptime" ? "Расчёт Date − Uptime" : row.event_kind === "suspected_power_loss" ? "Предположение · низкая" : row.event_kind === "unknown_start" ? "Причина неизвестна" : "Подтверждено логом",
          escape(evidence)+(raw.sourceCount?`<small>Источников: ${raw.sourceCountIsMinimum?"не менее ":""}${number(raw.sourceCount)}</small>`:"")
            +(row.event_kind==="power_off"?`<small>Канал: ${{web:"Web",remote_control:"Пульт ДУ"}[raw.shutdownMethod]||"Не установлен"}. Инициатор: не установлен.</small>`:"")];
      });
      return table(["Устройство", "Время терминала", "Событие", "Локация", "Адрес", "Достоверность", "Источники"], rows) + pager(state, data);
    }
    function heatmap(data, state, outside=false) {
      if (!data) return skeleton();
      const cells = new Map((data.cells || []).filter((c) => c.day != null && c.hour != null).map((cell) => [`${cell.day}:${cell.hour}`, cell]));
      const maximum = Math.max(1, ...(data.cells || []).map((cell) => cell.devices));
      return `<section class="db-section"><div class="db-section-title"><h2>${outside?"Нерабочее время: карта событий":"Ритм событий"}</h2><span>Дни недели × часы · уникальные устройства</span></div>${outside?'<p class="muted">Показано время зарегистрированных событий выбранной группы. Пустая ячейка не доказывает выключение или непрерывную работу. Нажмите час для списка устройств.</p>':""}<div class="power-heatmap-scroll"><div class="db-heatmap">
      <span></span>${Array.from({length:24},(_,h)=>`<small>${h}</small>`).join("")}
      ${["Пн","Вт","Ср","Чт","Пт","Сб","Вс"].map((day, d) => `<small>${day}</small>${Array.from({length:24},(_,h)=> {
        const cell = cells.get(`${d}:${h}`); const count = cell?.devices || 0;
        return `<button type="button" class="db-heat-${count?Math.max(1,Math.ceil(count/maximum*9)):0}" data-db-cell="${d}:${h}" title="${day}, ${h}:00 · ${number(count)} устройств · ${number(cell?.events)} событий" aria-label="${day}, ${h}:00, ${count} устройств">${count || "·"}</button>`;
      }).join("")}`).join("")}</div></div>${state.filters.hour != null ? `<button type="button" class="text-button" data-db-clear-cell>Снять выбор часа</button>` : ""}</section>`;
    }
    function skeleton() {
      return '<div class="db-skeleton" role="status" aria-label="Запрос к базе"><i></i><i></i><i></i><span>Получаем данные из базы…</span></div>';
    }
    function eventView(state, data) {
      const groups = new Map((data.summary?.groups || []).map((row) => [row.kind, row]));
      const total = data.summary?.denominator || 0;
      const cohort = data.accounted?.counts;
      const unavailable=Boolean(data.error&&!data.loading);
      const power=["power_off","suspected_power_loss","start_after_shutdown"].includes(state.kind);
      const tabs=`<nav class="db-submodules" aria-label="Раздел анализа"><button type="button" data-db-kind="confirmed_reboot" aria-pressed="${!state.offhours&&!power}">Анализ перезагрузок</button><button type="button" data-db-kind="power_off" aria-pressed="${!state.offhours&&power}">Анализ отключения питания</button><button type="button" data-db-offhours aria-pressed="${!!state.offhours}">ВКС «Учёт»: нерабочее время</button></nav>`;
      if(state.offhours)return tabs+offhoursView(state,data.offhours,data.error&&!data.loading);
      const menu = Object.entries(KIND_LABELS).filter(([kind])=>power?["power_off","suspected_power_loss","start_after_shutdown"].includes(kind):["confirmed_reboot","unknown_start"].includes(kind)).map(([kind, label]) => `<button type="button" data-db-kind="${kind}" aria-pressed="${state.kind===kind}">${label}<b>${data.summary?number(groups.get(kind)?.events):unavailable?"—":"…"}</b></button>`).join("");
      const rebootLabel=state.filters.source==="json"?"С рассчитанным временем запуска":state.filters.source==="all"?"С событиями перезагрузки / запуска":"С подтверждённой перезагрузкой";
      const cards = data.summary ? `<div class="db-ring-grid">${ring(rebootLabel,groups.get("confirmed_reboot")?.devices,total,"#4e74df",'data-db-kind="confirmed_reboot"')}${ring("Со штатным выключением",groups.get("power_off")?.devices,total,"#13968f",'data-db-kind="power_off"')}${ring("С предполагаемой паузой",groups.get("suspected_power_loss")?.devices,total,"#ac6fbd",'data-db-kind="suspected_power_loss"')}</div>` : unavailable?'<p class="muted">Сводка не получена. Отсутствие ответа не означает отсутствие событий.</p>':skeleton();
      const accounted = cohort ? `<section class="db-section db-cohort"><div><p class="eyebrow">Актуальная SR · оборудование «Учёт»</p><h2>${number(cohort.denominator)} терминалов ВКС</h2><p>Отсутствие события не доказывает исправность. Предположение по паузе не является подтверждённой потерей питания.</p></div><div class="db-cohort-numbers">${[["Перезагружались",cohort.reboots],["Штатно выключались",cohort.confirmed],["Предполагаемые паузы",cohort.suspected]].map(([label,count])=>`<div><b>${number(count)}</b><span>${label}</span></div>`).join("")}</div>
        <div class="db-cohort-rings">${ring("ВКС «Учёт»: перезагрузки",cohort.reboots,cohort.denominator,"#4e74df",'data-db-kind="confirmed_reboot" data-db-accounted="yes"')}${ring("ВКС «Учёт»: штатные выключения",cohort.confirmed,cohort.denominator,"#13968f",'data-db-kind="power_off" data-db-accounted="yes"')}</div></section>` : "";
      const tops = data.tops ? `<div class="db-top-grid">${[["devices","Устройства"],["locations","Локации"],["addresses","Адреса"],["dates","Даты"],["hours","Часы"]].map(([key,label])=>`<section class="db-top"><p class="eyebrow">TOP 5</p><h3>${label}</h3>${(data.tops[key]||[]).map((row)=>`<button type="button" title="${escape(row.address||"")} · ${number(row.events)} событий" ${key==="devices"?`data-db-device="${escape(row.deviceId)}"`:`data-db-dimension="${{locations:"locationId",addresses:"address",dates:"date",hours:"hour"}[key]}" data-db-value="${escape(key==="locations"?row.groupKey:row.label)}"${row.label?"":" disabled"}`}><span>${escape(row.label || "Не указано")}</span><b>${number(["locations","addresses"].includes(key)?row.devices:row.events)}</b></button>`).join("") || '<p class="muted">Нет событий</p>'}</section>`).join("")}</div>` : "";
      const duration = data.duration ? durationView(data.duration) : "";
      return `${tabs}${cards}${accounted}${cohort&&state.filters.source!=="logs"?'<p class="muted">Срез ВКС «Учёт» рассчитывается по журналам, отдельно от JSON-оценок.</p>':""}<div class="db-event-menu" aria-label="Виды событий">${menu}</div>${duration}${!data.heatmap&&unavailable?'<p class="muted">Тепловая карта не получена.</p>':heatmap(data.heatmap,state)}${tops}
        <section class="db-section"><div class="db-section-title"><h2>${escape(KIND_LABELS[state.kind])}</h2>${state.table==="events"?`<div class="button-row"><button class="button secondary" type="button" data-db-export="reboot">ВКС «Учёт»: перезагрузки XLSX</button><button class="button secondary" type="button" data-db-export="power">ВКС «Учёт»: питание XLSX</button></div>`:""}</div>
        <p class="muted">Все итоги рассчитаны по базе. Ниже — текущая страница, а не весь журнал.${state.deviceId ? " Выбрано одно устройство." : ""}</p>
        ${state.deviceId ? '<button type="button" class="text-button" data-db-clear-device>Все устройства</button>' : ""}
        ${state.table!=="events" ? genericTable(data[state.table],state) : eventTable(state,data.events)}</section>`;
    }
    function offhoursView(state,data,failed) {
      if(!data)return failed?'<section class="db-section"><h2>ВКС «Учёт»: нерабочее время</h2><p>Расчёт не получен. Исправьте условия или повторите запрос. Данные базы не изменены.</p></section>':skeleton();
      const counts=new Map(data.groups.map(row=>[row.group,row.devices]));
      const colors={none:"#d38a32",once:"#4576d9",repeated:"#22938a",suspected:"#a96bbb",unknown:"#8290a5"};
      const selected=state.filters.offhoursGroup||"all";
      const rings=`<div class="db-offhours-rings">${Object.entries(OFFHOURS_LABELS).map(([group,label])=>ring(label,counts.get(group),data.denominator,colors[group],`data-db-offhours-group="${group}" aria-pressed="${selected===group}"`)).join("")}</div>`;
      const rows=(data.rows||[]).map(r=>[
        `<button type="button" class="text-button" data-db-device="${escape(r.device)}">${escape(r.name)}</button><small>${escape(r.model)}</small>`,
        ...[r.ip,r.mac,r.locationName,r.address,r.domain,OFFHOURS_LABELS[r.cohort],r.confirmed,r.suspected,r.reboots,r.firstPower||"—",r.lastPower||"—",r.observedEvents].map(escape)]);
      return `<section class="db-section db-offhours-intro"><div><p class="eyebrow">Актуальная SR · статус оборудования «Учёт» · календарь РФ</p><h2>Выключения в нерабочее время</h2><p>${escape(data.period.from)} — ${escape(data.period.toExclusive)} <small>(окончание не включается)</small></p></div><div class="db-offhours-total"><b>${number(data.denominator)}</b><span>терминалов в фильтре</span></div>
        <p class="db-offhours-rule">Пятидневка с переносами. Выходные и праздники — весь день, рабочие дни — 18:00–07:00. Время локальное для каждого терминала.</p></section>
        ${rings}<p class="db-offhours-note">«Выключения не зафиксированы» — в периоде есть события, но нет штатных выключений или предполагаемых пауз в выбранное нерабочее время. Это не доказательство непрерывной работы. Полнота журнала неизвестна. Архивы Polycom без событийного разбора — «Недостаточно данных».</p>
        ${heatmap(data,state,true)}
        ${data.tops?.length?`<section class="db-section"><div class="db-section-title"><h2>TOP 5 по перезагрузкам в выбранной группе</h2><span>Только подтверждённые события в нерабочее время</span></div><div class="db-offhours-top">${data.tops.map(r=>`<button type="button" data-db-device="${escape(r.device)}"><span>${escape(r.name)}</span><b>${number(r.reboots)}</b></button>`).join("")}</div></section>`:""}
        <section class="db-section"><div class="db-section-title"><div><h2>${escape(OFFHOURS_LABELS[selected]||"Все ВКС «Учёт»")}</h2><p>Устройств в списке: ${number(data.matchedDevices)}</p></div><button type="button" class="button secondary" data-db-export="offhours">Скачать выбранную группу XLSX</button></div>
        <p class="muted">Счётчики — за весь выбранный период и вид нерабочего времени. Ровно одно выключение = одна подтверждённая штатная команда, без предположений. Нули не доказывают отсутствие выключений вне видимых записей.</p>
        ${state.deviceId?'<button type="button" class="text-button" data-db-clear-device>Все устройства группы</button>':""}
        ${table(["Устройство","IP","MAC","Локация","Адрес","Домен","Группа","Штатные выключения","Предполагаемые паузы","Перезагрузки","Первое выключение","Последнее выключение","Событий в периоде"],rows)}${pager(state,data)}</section>`;
    }
    function durationView(data) {
      const labels=["До 1 часа","1 час — сутки","Сутки — неделя","Неделя — месяц","1 — 3 месяца","3 — 6 месяцев","6 месяцев — год","Более года"];
      const colors=["#3ca7ba","#438fc2","#667ccb","#836dc0","#a46daf","#bf819a","#d48d71","#ba666d"];
      const counts=new Map(data.buckets.map((r)=>[r.bucket,r.devices]));
      let offset=0;
      const circles=labels.map((label,index)=>{const angle=data.denominator?(counts.get(index)||0)/data.denominator*263.9:0;
        const element=`<circle cx="50" cy="50" r="42" fill="none" stroke="${colors[index]}" stroke-width="10" stroke-dasharray="${angle} 264" stroke-dashoffset="-${offset}" transform="rotate(-90 50 50)"/>`;offset+=angle;return element;}).join("");
      return `<section class="db-section db-duration"><div><p class="eyebrow">Завершённые интервалы · не текущее состояние</p><h2>Длительность выключения и пауз</h2><div class="db-ring"><svg viewBox="0 0 100 100" aria-hidden="true"><circle cx="50" cy="50" r="42" fill="none" stroke="#e4eaf3" stroke-width="10"/>${circles}</svg><span><b>${number(data.denominator)}</b><small>100% фильтра</small></span></div></div><div class="db-duration-items">${labels.map((label,index)=>`<button type="button" data-db-duration="${index}"><span>${label}</span><b>${number(counts.get(index))}</b></button>`).join("")}</div></section>`;
    }
    function genericTable(data, state) {
      if (!data) return skeleton();
      if(state.table==="duration-rows")return table(["Устройство","Модель","IP","Локация","Адрес","Длительность, минут","Основание"],
        data.rows.map((r)=>[r.name,r.model,r.ip,r.locationName,r.address,Math.round(r.seconds/60),r.basis==="confirmed"?"Штатная команда → запуск":"Предполагаемая пауза"].map(escape)))+pager(state,data);
      if(state.site && !state.deviceId) return table(["Наименование устройства","Site name","IP","MAC","Адрес","Наименование локации","Домен"],
        data.rows.map((r)=>[r.name,r.siteName,r.ip,parse(r.payload).macNormalized||parse(r.payload).macRaw||"",r.address,r.locationName,r.domain].map(escape)))+pager(state,data);
      const statusText=(value)=>STATUS[value]||options.formatStatus?.(value)||value||"Нет данных";
      if(activeDescriptor?.renderer==="connection-errors")return table(["Устройство","Модель","IP","Последний случай","Тип ошибки","Случаев"],
        data.rows.map((r)=>[r.name,r.model,r.ip,r.lastAt,statusText(r.status),r.cases].map(escape)))+pager(state,data);
      if(["project-versions","firmware-versions"].includes(activeDescriptor?.renderer))return table(["Устройство","Модель","IP","Дата опроса","Версия","Предыдущая версия","Изменение"],
        data.rows.map((r)=>[...([r.name,r.model,r.ip,r.stamp,r.value,r.previous||"—"].map(escape)),
          `<span class="db-change db-change-${r.change==="changed"?"changed":r.change==="first"?"first":"same"}">${{first:"Первое значение",changed:"Изменилось",unchanged:"Без изменений"}[r.change]||"Неизвестно"}</span>`]))+pager(state,data);
      if(state.deviceId && activeDescriptor?.renderer==="inventory")return table(["Устройство","Модель","IP","Дата опроса","Прошивка","Версия проекта","Результат"],
        data.rows.map((r)=>[r.name,r.model,r.ip,r.stamp,r.firmware||"Нет данных",r.project||"Нет данных",statusText(r.status)].map(escape)))+pager(state,data);
      const rows = (data.rows || []).map((row) => {
        if (row.payload) {
          const payload = parse(row.payload);
          if (!row.name && payload.path) return [escape(payload.path), escape(payload.format), escape(payload.ip), escape(payload.analysisStatus), escape(payload.matchStatus)];
        }
        return [row.id ? `<button type="button" class="text-button" data-db-device="${escape(row.id)}">${escape(row.name)}</button>` : escape(row.name || row.device),
          escape(row.model || ""), escape(row.ip || ""), escape(row.stamp || row.lastAt || ""),
          escape(row.value ?? row.firmware ?? (row.status!==undefined?statusText(row.status):row.events??"")),
          escape(row.previous ?? row.cases ?? row.locationName ?? ""), escape(row.address ?? row.change ?? "")];
      });
      return table(data.rows?.[0]?.payload && !data.rows?.[0]?.name && parse(data.rows[0].payload).path
        ? ["Источник","Формат","IP","Анализ","Сопоставление"] : ["Устройство","Модель","IP","Время","Значение / состояние","Локация / ранее / случаи","Адрес / изменение"], rows) + pager(state,data);
    }
    function render(descriptor) {
      if (!revision) return "";
      activeDescriptor = descriptor;
      const state = stateFor(descriptor.route);
      if (descriptor.category) state.filters.category = descriptor.category;
      const facets=descriptor.compact?{}:ensureFacets(descriptor,state);
      const clock=state.offhours||["today","7d","30d"].includes(state.filters.period)?Math.floor(Date.now()/60000):0;
      const queryState={...state};delete queryState.draftFilters;delete queryState.applyingFilters;
      const key = JSON.stringify([revision,descriptor.route,queryState,clock]);
      if(activeKey!==key){controller?.abort();controller=typeof root.AbortController==="function"?new root.AbortController():null;generation+=1;}
      activeKey = key;
      schedule(descriptor, JSON.parse(JSON.stringify(state)), key);
      const data = cache.get(key) || {};
      const oldLogRules=options.logRuleset&&(bootstrap?.logRulesets||[]).some(item=>item.files>0&&item.ruleset!==options.logRuleset);
      const slices=[];
      if(state.deviceId)slices.push(data[routeView(descriptor,state)]?.rows?.[0]?.name||state.deviceName||"Выбрано устройство");
      if(state.filters.locationId)slices.push(state.drillLabel||"Выбрана локация");
      if(state.filters.date)slices.push("Дата: "+state.filters.date);
      if(state.filters.day!=null)slices.push(["Пн","Вт","Ср","Чт","Пт","Сб","Вс"][state.filters.day]||"День недели");
      if(state.filters.hour!=null)slices.push("Час: "+String(state.filters.hour).padStart(2,"0")+":00");
      if(state.table==="duration-rows")slices.push(state.drillLabel||"Выбран интервал");
      let content = "";
      if (descriptor.renderer === "reboots") content = eventView(state,data);
      else if (data.dashboard) {
        const summary = data.dashboard;
        content = `<div class="db-stat-grid">${[["Оборудование",summary.devices],["JSON-опросы",summary.counts.pollingResults],["Логи",summary.counts.logRows],
          ["События ВКС",Object.entries(summary.counts).filter(([k])=>k.startsWith("events:")).reduce((n,[,v])=>n+v,0)]].map(([t,v])=>`<article><span>${t}</span><b>${number(v)}</b></article>`).join("")}</div><section class="db-section"><h2>Оборудование в актуальной SR</h2><div class="db-category-grid">${summary.categories.map((row)=>`<article><span>${escape(CATEGORY_LABELS[row.label] || row.label)}</span><strong>${number(row.devices)}</strong></article>`).join("")}</div></section>`;
      } else content = genericTable(data[routeView(descriptor,state)],state);
      if(data.error&&!data.loading&&!data[routeView(descriptor,state)]&&!(descriptor.renderer==="reboots"&&state.offhours))content='<div class="db-empty"><h3>Запрос не подтверждён</h3><p>Данные не удалены. Повторите запрос или откройте другой раздел.</p></div>';
      return `<div class="db-workspace">${descriptor.compact ? `<h2>${escape(descriptor.title)}</h2>` : `<header class="db-hero page-header"><div><p class="eyebrow">Локальная аналитика · SQLite</p><h1>${escape(descriptor.title)}</h1><p>${escape(descriptor.summary||"Данные из выбранной локальной базы.")}</p></div><div class="db-live"><span></span>База подключена<small>Ревизия ${escape(revision)}</small></div></header>`}
        ${descriptor.renderer==="reboots"&&oldLogRules?'<aside class="error-panel" role="status"><strong>Для журналов нужна перепроверка по новым правилам Shut down.</strong><p>Пока показана прежняя опубликованная аналитика. Выберите полную исходную папку логов в модуле загрузки: результаты сохраняются по файлам, продолжение после сбоя поддерживается. Нового опроса устройств не требуется. Polycom RPG пока остаётся метаданными.</p><button type="button" class="button secondary" data-route="upload">Открыть импорт логов</button></aside>':""}
        ${descriptor.compact ? "" : filters(state,descriptor.renderer==="reboots",descriptor.renderer==="inventory",facets)}
        <section data-db-panel>
        ${slices.length?`<div class="db-drill-chips">${slices.map((label)=>`<span>${escape(label)}</span>`).join("")}<button type="button" data-db-clear-slice>Снять выбор</button></div>`:""}
        ${data.error ? `<div class="error-panel" role="alert">${escape(data.error)} <button type="button" class="text-button" data-db-retry>Повторить</button></div>` : ""}
        ${descriptor.renderer==="inventory" && descriptor.category==="vcs" ? `<div class="button-row section-gap"><button type="button" class="button secondary" data-db-site>${state.site?"Обычная таблица":"Site name"}</button><button type="button" class="button secondary" data-db-export="site">Скачать Site name</button></div>` : ""}
        ${state.deviceId && descriptor.renderer!=="reboots" ? '<button type="button" class="text-button" data-db-clear-device>← Все устройства</button>' : ""}
        ${content}<footer class="db-query-footnote">Данные выдаются страницами. ${data.loading?"Запрос выполняется; навигация доступна.":"Можно изменить фильтры или открыть другой модуль."}</footer></section></div>`;
    }
    function refresh() { controller?.abort();controller=typeof root.AbortController==="function"?new root.AbortController():null;
      cache.delete(activeKey); pending.delete(activeKey); generation += 1; options.render(); }
    function handleClick(target) {
      const button = target.closest("[data-db-kind],[data-db-cell],[data-db-page],[data-db-reset],[data-db-retry],[data-db-device],[data-db-clear-device],[data-db-clear-cell],[data-db-site],[data-db-export],[data-db-duration],[data-db-dimension],[data-db-clear-slice],[data-db-facets-retry],[data-db-offhours],[data-db-offhours-group]");
      if (!button || !activeDescriptor) return false;
      const state = stateFor(activeDescriptor.route), d = button.dataset;
      if("dbFacetsRetry" in d){const key=facetKey(activeDescriptor,state.draftFilters||state.filters),entry=facetCache.get(key);if(entry?.conflict&&options.reload){void options.reload();return true;}if(entry){entry.cancelled=true;entry.controller?.abort();}facetCache.delete(key);options.render();return true;}
      if("dbRetry" in d && cache.get(activeKey)?.conflict && options.reload){void options.reload();return true;}
      if (d.dbExport) { void exportRows(d.dbExport, state); return true; }
      if("dbOffhours" in d && !state.offhours){
        state.beforeOffhours={...state.filters};state.offhours=true;
        state.filters={...(state.savedOffhours||state.filters),period:state.savedOffhours?.period||"2m",source:"logs",accounted:true,category:"vcs",offhoursGroup:state.savedOffhours?.offhoursGroup||"none"};
        delete state.draftFilters;delete state.deviceId;
        for(const key of ["date","day","hour","durationBucket"])delete state.filters[key];
      }
      if(d.dbOffhoursGroup){state.filters.offhoursGroup=d.dbOffhoursGroup;delete state.filters.day;delete state.filters.hour;delete state.deviceId;delete state.draftFilters;}
      if(d.dbKind&&state.offhours){state.savedOffhours={...state.filters};state.filters={...(state.beforeOffhours||{period:"all",source:"logs"})};state.offhours=false;delete state.deviceId;delete state.draftFilters;}
      if (d.dbKind) { state.kind=d.dbKind; state.table="events";delete state.filters.durationBucket; delete state.filters.day; delete state.filters.hour;
        if(state.filters.source==="json"&&["power_off","suspected_power_loss","start_after_shutdown"].includes(state.kind))state.filters.source="logs"; }
      if(d.dbAccounted==="yes")state.filters.accounted=true;
      if ("dbDuration" in d) {state.table="duration-rows";state.filters.durationBucket=Number(d.dbDuration);state.drillLabel=button.querySelector?.("span")?.textContent;}
      if (d.dbCell) { const [day,hour]=d.dbCell.split(":").map(Number); state.filters.day=day; state.filters.hour=hour; }
      if (d.dbDimension && ["locationId","address","date","hour"].includes(d.dbDimension)) {
        state.filters[d.dbDimension]=d.dbDimension==="hour"?Number(d.dbValue):d.dbValue;state.table="events";
        state.drillLabel=button.querySelector?.("span")?.textContent;
      }
      if (d.dbPage) state.page=Math.max(0,state.page+Number(d.dbPage)); else state.page=0;
      if ("dbDevice" in d) {state.deviceId=d.dbDevice;state.deviceName=button.querySelector?.("span")?.textContent||button.textContent?.trim();}
      if ("dbClearDevice" in d) delete state.deviceId;
      if ("dbClearCell" in d) { delete state.filters.day; delete state.filters.hour; }
      if("dbClearSlice" in d){delete state.deviceId;delete state.deviceName;for(const key of ["date","day","hour","locationId","durationBucket"])delete state.filters[key];state.table="events";}
      if ("dbReset" in d) { state.filters=state.offhours?{period:"2m",source:"logs",category:"vcs",accounted:true,offhoursGroup:"none"}:{period:"all",source:"logs"}; delete state.draftFilters;delete state.deviceId; }
      if ("dbSite" in d) { state.site=!state.site; delete state.deviceId; }
      refresh(); return true;
    }
    function handleSubmit(form) {
      if (!form.matches("[data-db-filters]") || !activeDescriptor) return false;
      const descriptor=activeDescriptor,state = stateFor(descriptor.route);
      const values={...(state.draftFilters||state.filters),...Object.fromEntries(new FormData(form))};
      values.accounted=state.offhours||form.querySelector('[name="accounted"]')?.checked===true;
      if(state.offhours){values.source="logs";values.category="vcs";values.current="yes";}
      const entry=facetCache.get(facetKey(descriptor,values));
      state.filters=entry?.data?normalizeFilters(values,entry.data):values;
      delete state.draftFilters;state.applyingFilters=false;
      if(state.filters.source==="json"&&["power_off","suspected_power_loss","start_after_shutdown"].includes(state.kind)){state.kind="confirmed_reboot";state.table="events";}
      state.page=0;delete state.filters.day;delete state.filters.hour;
      refresh();
      return true;
    }
    function handleChange(element,form){
      if(!form?.matches("[data-db-filters]")||!activeDescriptor)return false;
      const state=stateFor(activeDescriptor.route);
      if(state.applyingFilters)return true;
      const values={...(state.draftFilters||state.filters),...Object.fromEntries(new FormData(form))};
      values.accounted=state.offhours||form.querySelector('[name="accounted"]')?.checked===true;
      if(state.offhours){values.source="logs";values.category="vcs";values.current="yes";}
      const index=dimensions.indexOf(element.name);
      if(index>=0)for(const name of dimensions.slice(index+1))delete values[name];
      state.draftFilters=values;
      // A blur/change must not replace the button the user is about to click.
      if(element.tagName==="INPUT"&&element.type!=="checkbox"){
        const status=form.querySelector(".db-filter-state");
        if(status)status.textContent="Изменения фильтров ещё не применены";
        if(element.name==="search"){
          if(facetInputTimer)clearTimeout(facetInputTimer);
          const descriptor=activeDescriptor,version=revision,key=facetKey(descriptor,values);
          facetInputTimer=setTimeout(()=>{facetInputTimer=null;if(version===revision&&activeDescriptor?.route===descriptor.route&&facetKey(descriptor,state.draftFilters||state.filters)===key)fetchFacets(descriptor,state.draftFilters||state.filters);},250);
        }
        return true;
      }
      options.render();
      return true;
    }
    async function exportRows(kind, state) {
      if (!root.XLSX) return;
      state={...state,filters:{...state.filters}};
      const startRevision=revision,startSource=options.sourceIdentity?.(),rows=[];
      let offhoursMeta=null;
      const sourceChanged=()=>revision!==startRevision||options.sourceIdentity?.()!==startSource;
      options.activity?.({label:"Экспорт Excel",detail:"Получение всех строк выборки из БД"});
      try {
        for(let page=0;;page+=1) {
          if(sourceChanged())throw new Error("changed");
          const name=kind==="offhours"?"offhours":kind==="site"?"site-name":"export-devices";
          const data=await options.request("view",{revision:startRevision,name,page,size:100,filters:{...state.filters,...(state.deviceId?{deviceId:state.deviceId}:{}),accounted:kind!=="site",kind:kind==="power"?"power_off":"confirmed_reboot"}});
          if(sourceChanged())throw new Error("changed");
          if(kind==="offhours"&&!offhoursMeta){offhoursMeta=data;state.filters.offhoursUntil=data.period.toExclusive;}
          rows.push(...data.rows);
          options.activity?.({label:"Экспорт Excel",detail:"Получено строк: "+number(rows.length)});
          if(!data.hasNext)break;
        }
        const commonHeaders=["Устройство","Модель","IP","MAC","Домен","VIP","Локация","Адрес"];
        const headers=kind==="site"?["Наименование устройства","Site name","IP","MAC","Адрес","Наименование локации","Домен"]
          :kind==="offhours"?[...commonHeaders,"Статус SR","Группа","Штатные выключения","Предполагаемые паузы","Перезагрузки","Первое выключение","Последнее выключение","Событий за период","Первое наблюдение","Последнее наблюдение"]
          :kind==="reboot"?[...commonHeaders,"Перезагрузки","Первое событие","Последнее событие","Основание","Статус SR"]
          :[...commonHeaders,"Штатные выключения","Предполагаемые паузы","Первое штатное","Последнее штатное","Первая пауза","Последняя пауза","Достоверность","Статус SR"];
        const common=r=>[r.name,r.model||"",r.ip,r.mac,r.domain||"",r.vip?"Да":"Нет",r.locationName,r.address];
        const matrix=[headers,...rows.map(r=>kind==="site"?[r.name,r.siteName,r.ip,parse(r.payload).macNormalized||parse(r.payload).macRaw||"",r.address,r.locationName,r.domain]
          :kind==="offhours"?[...common(r),"Учёт",OFFHOURS_LABELS[r.cohort]||"Недостаточно данных",r.confirmed,r.suspected,r.reboots,r.firstPower||"",r.lastPower||"",r.observedEvents,r.firstObserved||"",r.lastObserved||""]
          :kind==="reboot"?[...common(r),r.reboots,r.firstReboot||"",r.lastReboot||"","Подтверждено логом","Учёт"]
          :[...common(r),r.confirmed,r.suspected,r.firstPower||"",r.lastPower||"",r.firstSuspected||"",r.lastSuspected||"",[r.confirmed?"штатное выключение: подтверждено":"",r.suspected?"пауза: предположение":""].filter(Boolean).join("; "),"Учёт"])];
        const sheet=root.XLSX.utils.aoa_to_sheet(matrix);
        Object.keys(sheet).filter((key)=>!key.startsWith("!")).forEach((key)=>{if(typeof sheet[key].v==="string"){sheet[key].t="s";delete sheet[key].f;}});
        sheet["!autofilter"]={ref:sheet["!ref"]};
        if(kind!=="site")sheet["!cols"]=headers.map((_,index)=>({wch:kind==="offhours"?([32,24,18,20,22,8,30,36,12,40][index]||26):[32,24,18,20,22,8,30,36][index]||(index===headers.length-1?12:index===headers.length-2?(kind==="power"?70:32):26)}));
        const book=root.XLSX.utils.book_new();root.XLSX.utils.book_append_sheet(book,sheet,kind==="offhours"?"Нерабочее время":kind==="site"?"Данные":kind==="reboot"?"Перезагрузки":"Питание");
        if(kind==="offhours"){
          const terms=[["Условие","Значение"],["Статус оборудования в актуальной SR","Учёт"],["Категория","Терминалы ВКС"],
            ["Период от (включительно)",offhoursMeta.period.from],["Период до (не включая)",offhoursMeta.period.toExclusive],
            ["Группа",OFFHOURS_LABELS[state.filters.offhoursGroup]||"Все ВКС «Учёт»"],
            ["Нерабочее время",{all:"Всё нерабочее время",night:"Рабочие дни: 18:00–07:00",weekend:"Выходные, весь день",holiday:"Праздники и переносы, весь день"}[state.filters.offhoursTime||"all"]],
            ["Календарь",offhoursMeta.calendarVersion],["Источник календаря",offhoursMeta.calendarSource],
            ["Правило","Выходные и праздники целиком, рабочие дни 18:00–07:00. Локальное время терминала."],
            ["Счётчики действий","Выключения, паузы и перезагрузки — в выбранное нерабочее время."],
            ["Событий за период","Все валидные события периода, включая рабочее время."],
            ["Доказательность","Отсутствие записи не доказывает непрерывную работу. Полнота журнала неизвестна."],
            ["Паузы","Только предположение, не подтверждённое отключение питания."],
            ["Наблюдения","Времена первого/последнего события, не границы полного журнала."],
            ...Object.entries({domain:"Домен",manufacturer:"Производитель",model:"Модель",locationId:"ID локации",address:"Адрес",vip:"VIP",search:"Поиск",day:"День недели (0=пн)",hour:"Час",logSilenceMinutes:"Порог паузы, минут",offhoursMetric:"События карты"}).filter(([key])=>state.filters[key]!==undefined&&state.filters[key]!=="").map(([key,label])=>[label,String(state.filters[key])]),
            ["Устройство",state.deviceId||"Все"],["Ревизия базы",startRevision]];
          const notes=root.XLSX.utils.aoa_to_sheet(terms);notes["!cols"]=[{wch:42},{wch:115}];
          Object.keys(notes).filter(key=>!key.startsWith("!")).forEach(key=>{if(typeof notes[key].v==="string"){notes[key].t="s";delete notes[key].f;}});
          root.XLSX.utils.book_append_sheet(book,notes,"Условия");
        }
        options.activity?.({label:"Экспорт Excel",detail:"Формирование файла XLSX"});
        await new Promise((resolve)=>setTimeout(resolve,0));
        if(sourceChanged())throw new Error("changed");
        if(options.download(root.XLSX.write(book,{type:"array",bookType:"xlsx",compression:true}),`vcs-${kind}${kind==="offhours"?"-"+(state.filters.offhoursGroup||"all"):""}.xlsx`)===false)throw new Error("download_failed");
        options.activity?.({completed:true,detail:"XLSX сформирован и передан браузеру · "+number(rows.length)+" строк"});
      }catch{options.message?.("Экспорт не завершён. Повторите после обновления раздела.");}
      finally{options.activity?.(null);}
    }
    return {setRevision,render,handleClick,handleSubmit,handleChange,refresh,stateFor,deactivate,get revision(){return revision;},get bootstrap(){return bootstrap;}};
  }
  const api={createController,escape, KIND_LABELS,OFFHOURS_LABELS};
  if(typeof module==="object"&&module.exports)module.exports=api;
  root.MVP_DB_VIEWS=api;
})(typeof window!=="undefined"?window:globalThis);
