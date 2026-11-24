"use strict";
const assert=require("assert/strict"),fs=require("fs/promises"),path=require("path");
const {chromium}=require(process.env.SPHERE_PLAYWRIGHT_MODULE||"playwright");
(async()=>{
  let input="";for await(const chunk of process.stdin)input+=chunk;
  const config=JSON.parse(input),browser=await chromium.launch({channel:"chrome",headless:true});
  try{
    const context=await browser.newContext({viewport:{width:1536,height:1100},reducedMotion:"reduce"});
    await context.addCookies([{name:"mvp_sphere_session",value:config.cookie,url:config.url,httpOnly:true,sameSite:"Strict"}]);
    await context.addInitScript(()=>{const Original=Worker;window.__recheckScans=[];window.Worker=class extends Original{postMessage(message,...rest){if(message.type==="scan")window.__recheckScans.push(message.file.webkitRelativePath);return super.postMessage(message,...rest);}};});
    const page=await context.newPage(),errors=[];page.on("pageerror",error=>errors.push(error.message));
    const status=()=>page.evaluate(async()=>{
      const session=await(await fetch("/api/session")).json(),workspace=await(await fetch("/api/workspace/status")).json();
      const query=async data=>{const response=await fetch("/api/workspace/db",{method:"POST",headers:{"Content-Type":"application/json","X-MVP-CSRF":session.csrfToken},body:JSON.stringify({workspace:workspace.workspaceId,...data})});if(!response.ok)throw Error("Synthetic API failure");return response.json();};
      const bootstrap=await query({action:"bootstrap"});const summary=await query({action:"view",revision:bootstrap.revision,name:"summary",filters:{source:"logs"}});
      return {revision:bootstrap.revision,pending:workspace.pendingLogFiles,groups:summary.groups,rules:bootstrap.logRulesets};
    });
    const upload=async()=>{await page.getByRole("button",{name:"Загрузка данных и опрос устройств",exact:true}).click();await page.waitForFunction(()=>!document.querySelector('[name="logFiles"]')?.disabled);await page.locator('[name="logFiles"]').setInputFiles(config.sources);};
    await page.goto(config.url);await page.waitForSelector(".db-workspace");const before=await status();
    await upload();await page.getByRole("button",{name:"Импортировать папку логов",exact:true}).click();
    await page.waitForFunction(()=>document.querySelector('[data-log-import-problems]')?.textContent.includes("Код: incomplete_log"));
    const report=await page.locator('[data-log-import-problems]').textContent(),firstScans=await page.evaluate(()=>window.__recheckScans);
    assert(report.includes("Проверено: 4 из 4"));assert(report.includes("Сохранено готовых разборов: 2"));assert(report.includes("run-one/198.18.0.1.xml"));
    assert.equal(firstScans.length,3,"A bad first file must not prevent the other scans");
    const interrupted=await status();assert.equal(interrupted.revision,before.revision);assert.deepEqual(interrupted.groups,before.groups);assert.equal(interrupted.pending,2);
    await page.locator('[name="collectJson"]').check();await page.locator('[name="confirmNoInterval"]').check();
    assert.equal(await page.locator('[data-start-automatic-polling]').isDisabled(),false,"Finished failed log validation must not lock a plan based on published SR");
    await page.locator('[name="collectJson"]').uncheck();
    await page.locator('[data-log-import-problems]').screenshot({path:config.preview});
    await page.setViewportSize({width:420,height:900});
    assert(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1),"Problem report must not overflow the mobile screen");
    await page.setViewportSize({width:1536,height:1100});
    const broken=path.join(config.sources,"run-one","198.18.0.1.xml");await fs.appendFile(broken,"</LogModule>\n");
    await page.reload();await page.waitForSelector(".db-workspace");assert.equal((await status()).revision,before.revision);
    await upload();await page.getByRole("button",{name:"Продолжить импорт логов",exact:true}).click();
    await page.getByText(/Перепроверка по новым правилам Shut down завершена/).first().waitFor({timeout:30000});
    const resumedScans=await page.evaluate(()=>window.__recheckScans);assert.equal(resumedScans.length,1);assert(resumedScans[0].includes("run-one"));
    const finished=await status();assert.notEqual(finished.revision,before.revision);assert.equal(finished.pending,0);assert(finished.groups.some(row=>row.kind==="power_off"&&row.events===1));
    assert(finished.rules.every(row=>row.ruleset));
    // A metadata-only auxiliary file must not restart a full rules-upgrade loop.
    await page.locator('[name="logFiles"]').setInputFiles(config.sources);await page.getByRole("button",{name:"Импортировать папку логов",exact:true}).click();
    await page.waitForFunction(()=>document.querySelector('[data-log-import-feedback]')?.textContent.includes("без повторного чтения: 4"));
    assert.equal((await page.evaluate(()=>window.__recheckScans)).length,1);
    assert.equal(errors.length,0,errors.join("; "));
    console.log(JSON.stringify({ok:true,allFilesCheckedAfterFailure:true,problemPathAndReasonVisible:true,oldRevisionPreserved:true,checkpointsSurvivedRefresh:2,resumedBodyReads:1,noRepeatLoop:true,errors}));
    await context.close();
  }finally{await browser.close();}
})().catch(error=>{console.error(error.stack||String(error));process.exitCode=1;});
