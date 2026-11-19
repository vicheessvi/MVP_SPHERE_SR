/* Development-only regression probe. All files/API data are synthetic. */
"use strict";
const fs=require("fs"),path=require("path"),os=require("os");
const {server,chromium}=require("./check-db-workspace-ui.js");
(async()=>{
  process.env.SPHERE_TEST_IMPORT_CONTEXT="1";
  const logs=await fs.promises.mkdtemp(path.join(os.tmpdir(),"sphere-import-"));
  await Promise.all(Array.from({length:3192},(_,i)=>fs.promises.writeFile(path.join(logs,`10.248.${Math.floor(i/250)}.${i%250+1}.xml`),"<?xml version='1.0'?><LogModule>\n</LogModule>")));
  await new Promise((resolve)=>server.listen(0,"127.0.0.1",resolve));
  const browser=await chromium.launch({channel:"chrome",headless:true});
  const page=await browser.newPage({viewport:{width:1536,height:1100}});
  const errors=[];page.on("pageerror",(error)=>errors.push(error.message));
  try{
    await page.goto("http://127.0.0.1:"+server.address().port);
    await page.waitForSelector(".db-workspace");
    await page.getByRole("button",{name:"Загрузка данных и опрос устройств",exact:true}).click();
    const input=page.locator('input[name="logFiles"]');
    await input.setInputFiles(logs);
    await page.evaluate(()=>{
      window.__probe={submits:0,invalid:[]};
      document.addEventListener("submit",()=>window.__probe.submits++,true);
      document.addEventListener("invalid",(event)=>window.__probe.invalid.push(event.target.name),true);
    });
    const validity=await input.evaluate((element)=>({files:element.files.length,owner:element.form?.dataset,
      valid:element.form?.checkValidity(),controls:[...element.form?.elements||[]].map((control)=>({name:control.name,required:control.required,valid:control.validity?.valid}))}));
    await page.getByRole("button",{name:"Импортировать папку логов",exact:true}).click();
    await page.waitForTimeout(400);
    const outcome=await page.evaluate(()=>({...window.__probe,progress:document.querySelector("[data-log-import-progress]")?.textContent||null}));
    process.stdout.write(JSON.stringify({validity,outcome,errors}));
    if(!validity.valid||outcome.submits!==1||errors.length)throw new Error("Import form failed");
    if(process.env.SPHERE_TEST_DB_ERROR==="1"){
      const feedback=page.locator("[data-log-import-feedback]");
      await feedback.waitFor({state:"visible"});
      if(!(await feedback.textContent()).includes("Не удалось начать импорт"))throw new Error("Preparation error was not visible next to button");
    }else{
      if(!outcome.progress)throw new Error("Import button did not start a visible operation");
      await page.getByRole("button",{name:"Остановить импорт",exact:true}).click();
      await page.waitForFunction(()=>!document.querySelector("[data-log-import-progress]"));
    }
    process.env.SPHERE_TEST_DB_ERROR="0";
    process.env.SPHERE_TEST_DELAY_FINISH="1";
    const run=path.join(logs,"2026-11-19_10-00-00");await fs.promises.mkdir(run);
    await fs.promises.writeFile(path.join(run,"192.0.2.40.json"),JSON.stringify({ok:true,webBlocks:{"Device Info":{Model:"TE40"}}}));
    await page.locator('input[name="pollingFiles"]').setInputFiles(run);
    const publish=page.waitForRequest((request)=>request.url().endsWith("/api/workspace/db")&&request.postDataJSON().action==="finish");
    await page.locator('[data-polling-import-form] button[type="submit"]').click();
    await publish;
    const first=await page.locator('[data-import-live="json"] progress').getAttribute("value");
    await page.waitForFunction(()=>document.querySelector('[data-import-live="json"]')?.textContent.includes("Осталось примерно"));
    const saving=await page.evaluate(()=>({
      percent:Number(document.querySelector('[data-import-live="json"] progress')?.value),
      eta:document.querySelector('[data-import-live="json"]')?.textContent,
      blocked:document.querySelector('[data-log-import-form] button[type="submit"]')?.disabled,
      feedback:document.querySelector('[data-log-import-feedback]')?.textContent,
      global:document.querySelector('[data-operation-strip]')?.textContent
    }));
    if(!(saving.percent>Number(first)&&saving.percent<100)||!saving.blocked||!saving.global.includes("%")||!saving.eta.includes("Осталось"))throw new Error("Publishing lacks progressing percent and ETA");
    await page.waitForFunction(()=>document.querySelector('[data-log-import-form] button[type="submit"]')?.disabled===false);
    if(!(await page.locator('[data-operation-strip]').textContent()).includes("сохранены в базе"))throw new Error("Completion not visible");
    if(!(await page.locator('[data-import-live="json"]').textContent()).includes("Успешно завершено"))throw new Error("JSON success not visible");
    require("../app.js");const api=global.MvpSphereSR,xlsx=require("../vendor/xlsx.full.min.js");
    const row={"SmartRoom ID локации":"synthetic-location","Наименование локации":"Synthetic room","Адрес локации":"Synthetic address","Признак VIP":"Нет","SmartRoom ID оборудования":"synthetic-poly","Класс оборудования":"vcs","Наименование оборудования":"Synthetic terminal","Общий статус оборудования":"Учёт","Тип":"Терминал ВКС","Производитель":"Polycom","Модель":"RealPresence Group 310","IP адрес":"192.0.2.40","MAC адрес":"02:00:00:00:00:40","Серийный номер":"SYNTHETIC-PROGRESS","Инвентарный номер":"SYNTHETIC-PROGRESS"};
    const book=xlsx.utils.book_new();xlsx.utils.book_append_sheet(book,xlsx.utils.aoa_to_sheet([api.SR_CANONICAL_HEADERS,api.SR_CANONICAL_HEADERS.map((key)=>row[key]||"")]),"SR");
    const srFile=path.join(logs,"synthetic-sr.xlsx");await fs.promises.writeFile(srFile,xlsx.write(book,{type:"buffer",bookType:"xlsx"}));
    await page.locator('[name="srFile"]').setInputFiles(srFile);
    const srPublish=page.waitForRequest((request)=>request.url().endsWith("/api/workspace/db")&&request.postDataJSON().action==="finish");
    await page.locator('[data-sr-import-form] button[type="submit"]').click();await srPublish;
    const srPercent=Number(await page.locator('[data-import-live="sr"] progress').getAttribute("value"));
    if(!(srPercent>0&&srPercent<100))throw new Error("SR write percentage missing");
    await page.waitForFunction(()=>document.querySelector('[data-import-live="sr"]')?.textContent.includes("Успешно завершено"));
    const logFolder=path.join(logs,"metadata-only");await fs.promises.mkdir(logFolder);
    await fs.promises.writeFile(path.join(logFolder,"192.0.2.40.tgz"),Buffer.from([0x1f,0x8b,0x08,0,0,0,0,0]));
    await page.waitForFunction(()=>document.querySelector('[data-log-import-form] button[type="submit"]')?.disabled===false);
    await page.locator('[name="logFiles"]').setInputFiles(logFolder);
    const logPublish=page.waitForRequest((request)=>request.url().endsWith("/api/workspace/db")&&request.postDataJSON().action==="finish");
    await page.locator('[data-log-import-form] button[type="submit"]').click();await logPublish;
    const logPercent=Number(await page.locator('[data-import-live="logs"] progress').getAttribute("value"));
    if(!(logPercent>0&&logPercent<100))throw new Error("Log write percentage missing");
    await page.waitForFunction(()=>document.querySelector('[data-import-live="logs"]')?.textContent.includes("Успешно завершено"));
    if((await page.locator('[data-import-live="logs"] progress').getAttribute("value"))!=="100")throw new Error("Log completion lacks 100%");
    const images=await fs.promises.mkdtemp(path.join(os.tmpdir(),"sphere-progress-ui-"));
    await page.locator('[data-import-live="logs"]').screenshot({path:path.join(images,"success.png")});
    process.env.SPHERE_TEST_FAIL_FINISH="1";
    await page.waitForFunction(()=>document.querySelector('[data-polling-import-form] button[type="submit"]')?.disabled===false);
    await page.locator('[name="pollingFiles"]').setInputFiles(run);
    await page.locator('[data-polling-import-form] button[type="submit"]').click();
    await page.waitForFunction(()=>document.querySelector('[data-import-live="json"]')?.classList.contains("import-live-failed"));
    if(Number(await page.locator('[data-import-live="json"] progress').getAttribute("value"))>=100)throw new Error("Failed commit falsely reached 100%");
    if((await page.locator('[data-import-live="json"]').textContent()).includes("Успешно завершено"))throw new Error("Failed commit falsely reported success");
    if(errors.length)throw new Error(errors.join("; "));
    process.stdout.write(JSON.stringify({saving,images,failureVisible:true,ok:true}));
  }catch(error){process.stderr.write(JSON.stringify({errors,text:(await page.locator('body').innerText()).slice(-7000)}));throw error;}
  finally{
    await browser.close();server.close();
    const resolved=path.resolve(logs),parent=path.resolve(os.tmpdir());
    if(path.dirname(resolved)===parent&&path.basename(resolved).startsWith("sphere-import-"))await fs.promises.rm(resolved,{recursive:true,force:true});
  }
})().catch((error)=>{process.stderr.write(error.stack||String(error));server.close();process.exitCode=1;});
