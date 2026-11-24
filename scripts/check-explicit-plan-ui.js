"use strict";
const assert=require("assert/strict");
const {chromium}=require(process.env.SPHERE_PLAYWRIGHT_MODULE||"playwright");
const {workbook}=require("./test-explicit-plan");
(async()=>{
  let input="";for await(const chunk of process.stdin)input+=chunk;
  const config=JSON.parse(input),browser=await chromium.launch({channel:"chrome",headless:true});
  try{
    const context=await browser.newContext({viewport:{width:1440,height:1100},reducedMotion:"reduce"});
    await context.addCookies([{name:"mvp_sphere_session",value:config.cookie,url:config.url,httpOnly:true,sameSite:"Strict"}]);
    await context.addInitScript(()=>{
      const files=new Map();window.__planFiles=files;
      const directory=(prefix="")=>({kind:"directory",name:prefix.split("/").filter(Boolean).at(-1)||"Synthetic output",queryPermission:async()=>"granted",requestPermission:async()=>"granted",
        getDirectoryHandle:async name=>directory(prefix+name+"/"),
        getFileHandle:async(name,options={})=>{
          const key=prefix+name;if(!files.has(key)&&!options.create)throw new DOMException("Not found","NotFoundError");
          return {kind:"file",name,getFile:async()=>new File([files.get(key)||""],name),createWritable:async()=>({write:async value=>files.set(key,typeof value==="string"?value:await value.text()),close:async()=>{}})};
        }});
      window.showDirectoryPicker=async()=>directory();
    });
    const page=await context.newPage(),errors=[],dialogs=[],jobs=[];
    page.on("pageerror",error=>errors.push(error.message));
    page.on("dialog",async dialog=>{dialogs.push(dialog.message());await dialog.accept();});
    page.on("request",request=>{if(request.method()==="POST"&&request.url().endsWith("/api/polling/jobs"))jobs.push(request.postDataJSON().plan);});
    await page.goto(config.url);await page.waitForSelector(".db-workspace");
    await page.getByRole("button",{name:"Загрузка данных и опрос устройств",exact:true}).click();
    await page.waitForSelector("[data-polling-plan-form]");
    const start=page.locator("[data-start-automatic-polling]");assert(await start.isDisabled());
    const upload=async duplicate=>{await page.locator('[name="managementTargetListFile"]').setInputFiles({name:"synthetic-targets.xlsx",mimeType:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",buffer:Buffer.from(workbook(duplicate))});await page.getByText("Выберите листы XLSX для работы",{exact:true}).waitFor();};
    await upload(false);
    assert.equal(await page.locator('[name="targetSheet"]:checked').count(),0);assert(await start.isDisabled());
    assert(await page.locator("[data-confirm-target-sheets]").isDisabled());
    await page.locator('[name="targetSheet"][value="Второй"]').check();
    await page.locator("[data-confirm-target-sheets]").click();
    await page.getByText("Принято устройств: 1",{exact:true}).waitFor();
    assert.equal(await page.locator('[name="collectJson"]').isChecked(),false);
    await page.locator('[name="collectJson"]').check();
    await upload(true);
    assert.equal(await page.locator('[name="collectJson"]').isChecked(),false,"New file must reset actions");
    for(const name of ["Первый","Второй"])await page.locator(`[name="targetSheet"][value="${name}"]`).check();
    await page.locator("[data-confirm-target-sheets]").click();
    await page.waitForFunction(()=>document.body.textContent.includes("повтор")||document.body.textContent.includes("дубликат"));
    assert(await start.isDisabled());
    await upload(false);
    for(const name of ["Первый","Второй"])await page.locator(`[name="targetSheet"][value="${name}"]`).check();
    await page.locator("[data-confirm-target-sheets]").click();
    await page.getByText("Принято устройств: 2",{exact:true}).waitFor();
    await page.locator('[name="te20AnswerMode"]').selectOption("manual");
    const past=new Date(Date.now()-86400000);past.setMinutes(past.getMinutes()-past.getTimezoneOffset());
    await page.locator('[name="scheduledAt"]').fill(past.toISOString().slice(0,16));
    await page.locator('[name="confirmNoInterval"]').check();
    await page.locator("[data-select-polling-output]").last().click();
    const credentialForm=page.locator("[data-credential-entry-form]");
    await credentialForm.locator('[name="username"]').fill("synthetic-user");
    await credentialForm.locator('[name="password"]').fill("synthetic-device-only");
    await credentialForm.locator('button[type="submit"]').click();
    await page.waitForFunction(()=>document.querySelector('[data-credential-entry-form] [name="password"]')?.value==="");
    await page.locator("[data-polling-target-preview] summary").click();
    assert.equal(await page.locator('[data-polling-target-preview] tbody tr').count(),2);
    assert((await page.locator('[data-polling-target-preview]').textContent()).includes('Synthetic TE20'));
    await page.locator('[data-polling-plan-form]').screenshot({path:config.preview});
    assert.equal(await start.isDisabled(),false);
    await start.click();
    try{await page.getByText(/План завершён\. Успешно: 2/).waitFor({timeout:20000});}
    catch(error){throw new Error(error.message+"\n"+JSON.stringify({jobs,errors,dialogs,body:(await page.locator("body").innerText()).slice(-6500),files:await page.evaluate(()=>[...window.__planFiles.keys()])}));}
    assert.equal(jobs.length,1);assert.deepEqual(jobs[0].selectedActions,["set_te20_auto_answer_manual"]);
    assert.deepEqual(jobs[0].targetSourceSheets,["Первый","Второй"]);
    assert(dialogs.some(message=>message.includes("Обычный JSON: нет. Логи: нет.")&&message.includes("Answer mode: Вручную")));
    const saved=await page.evaluate(()=>[...window.__planFiles.entries()]);
    assert.equal(saved.length,1);assert(saved[0][0].endsWith("/polling-recovery.json"));
    assert.equal(JSON.parse(saved[0][1]).outcomes.length,2);
    await page.waitForFunction(()=>document.querySelector('[name="managementTargetListFile"]')?.disabled===false);
    await page.locator('[name="targetSource"][value="sr"]').check();
    assert.equal(await page.locator('[name="te20AnswerMode"]').inputValue(),"","Source change must reset writes");
    assert.equal(await page.locator('[name="collectJson"]').isChecked(),false);
    assert(await start.isDisabled());
    assert.equal(errors.length,0,errors.join("; "));
    await page.setViewportSize({width:420,height:900});
    assert(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1),"Mobile layout overflows");
    console.log(JSON.stringify({ok:true,multipleSheetsExplicit:true,duplicateIpsBlocked:true,writeOnly:true,noDeviceJsonFiles:true,targets:2,errors}));
    await context.close();
  }finally{await browser.close();}
})().catch(error=>{console.error(error.stack||String(error));process.exitCode=1;});
