"use strict";
const {chromium}=require(process.env.SPHERE_PLAYWRIGHT_MODULE||"playwright");
(async()=>{
  let input="";for await(const chunk of process.stdin)input+=chunk;
  const config=JSON.parse(input),browser=await chromium.launch({channel:"chrome",headless:true});
  try{
    const context=await browser.newContext({viewport:{width:1536,height:1100},reducedMotion:"reduce"});
    await context.addCookies([{name:"mvp_sphere_session",value:config.cookie,url:config.url,httpOnly:true,sameSite:"Strict"}]);
    const page=await context.newPage(),errors=[];let paused=false,checkpointDone=false;
    page.on("pageerror",error=>errors.push(error.message));
    await page.addInitScript(()=>{
      const Original=window.Worker;window.__shutdownScans=[];
      window.Worker=class extends Original{postMessage(message,...rest){
        const send=()=>{if(message.type==="scan")window.__shutdownScans.push(message.file.webkitRelativePath);return super.postMessage(message,...rest);};
        // Delay delivery only, not parsing/results: one lane finishes before refresh.
        if(message.type==="scan"&&message.file.webkitRelativePath.includes("run-two")){setTimeout(send,5000);return;}
        return send();
      }};
    });
    await page.route("**/api/workspace/log-file",async route=>{
      if(route.request().method()!=="POST"||paused){await route.continue();return;}
      paused=true;const response=await route.fetch();if(response.status()!==200)throw new Error("Synthetic checkpoint failed");checkpointDone=true;
      await new Promise(resolve=>setTimeout(resolve,1500));try{await route.fulfill({response});}catch{/* Simulated refresh closes the old request. */}
    });
    const navigateUpload=async()=>{await page.getByRole("button",{name:"Загрузка данных и опрос устройств",exact:true}).click();await page.waitForFunction(()=>!document.querySelector('[name="logFiles"]')?.disabled);};
    await page.goto(config.url);await page.waitForSelector(".db-workspace");
    await page.getByRole("button",{name:"Анализ перезагрузок устройств",exact:true}).click();
    await page.getByText("Для журналов нужна перепроверка по новым правилам Shut down.",{exact:true}).waitFor();
    await navigateUpload();await page.locator('[name="logFiles"]').setInputFiles(config.sources);
    await page.getByRole("button",{name:"Импортировать папку логов",exact:true}).click();
    for(let i=0;i<200&&!checkpointDone;i++)await new Promise(resolve=>setTimeout(resolve,25));
    if(!checkpointDone)throw new Error("First completed file was not checkpointed");
    await page.reload();await page.waitForSelector(".db-workspace");
    // Last published analysis must survive a refresh before replacement finish.
    const before=await page.evaluate(async()=>{const session=await (await fetch("/api/session")).json(),status=await (await fetch("/api/workspace/status")).json();
      const request=async body=>{const r=await fetch("/api/workspace/db",{method:"POST",headers:{"Content-Type":"application/json","X-MVP-CSRF":session.csrfToken},body:JSON.stringify({workspace:status.workspaceId,...body})});if(!r.ok)throw new Error("Synthetic API check failed");return r.json();};
      const info=await request({action:"bootstrap"});return request({action:"view",revision:info.revision,name:"summary",filters:{source:"logs"}});});
    if(before.groups.some(row=>row.kind==="power_off"&&row.events))throw new Error("Incomplete replacement was published");
    await navigateUpload();await page.locator('[name="logFiles"]').setInputFiles(config.sources);
    await page.getByRole("button",{name:"Продолжить импорт логов",exact:true}).click();
    await page.getByText(/Перепроверка по новым правилам Shut down завершена/).first().waitFor({timeout:30000});
    const scans=await page.evaluate(()=>window.__shutdownScans);
    if(scans.length!==1||!scans[0].includes("run-two"))throw new Error("Unexpected resumed scans: "+JSON.stringify({scans,feedback:await page.locator('[data-log-import-feedback]').textContent()}));
    await page.getByRole("button",{name:"Анализ перезагрузок устройств",exact:true}).click();
    await page.getByRole("button",{name:"Анализ отключения питания",exact:true}).click();await page.waitForSelector(".db-heatmap");
    if(await page.getByText("Для журналов нужна перепроверка по новым правилам Shut down.",{exact:true}).count())throw new Error("Upgrade warning did not clear");
    await page.locator('.db-event-menu [data-db-kind="power_off"]').click();
    await page.waitForFunction(()=>document.querySelector(".db-table")?.textContent.includes("Инициатор: не установлен"));
    if(errors.length)throw new Error(errors.join("; "));
    console.log(JSON.stringify({ok:true,realPythonSqlite:true,checkpointSurvivedRefresh:true,rescannedBodies:scans.length,confirmedShutdowns:1}));
    await context.close();
  }finally{await browser.close();}
})().catch(error=>{console.error(error.stack||String(error));process.exitCode=1;});
