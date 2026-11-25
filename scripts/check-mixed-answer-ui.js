"use strict";
const assert=require("assert/strict"),{fixture}=require("./test-mixed-answer-plan"),{row}=require("./test-explicit-plan");
const {chromium}=require(process.env.SPHERE_PLAYWRIGHT_MODULE||"playwright");
(async()=>{
  let input="";for await(const chunk of process.stdin)input+=chunk;const config=JSON.parse(input);
  const browser=await chromium.launch({channel:"chrome",headless:true});
  try{
    const context=await browser.newContext({viewport:{width:1536,height:1100},reducedMotion:"reduce"});
    await context.addCookies([{name:"mvp_sphere_session",value:config.cookie,url:config.url,httpOnly:true,sameSite:"Strict"}]);
    await context.addInitScript(()=>{
      const files=new Map();window.__mixedFiles=files;let picks=0;
      const directory=prefix=>({kind:"directory",name:prefix.split('/').filter(Boolean).at(-1),queryPermission:async()=>"granted",requestPermission:async()=>"granted",getDirectoryHandle:async name=>directory(prefix+name+'/'),getFileHandle:async(name,options={})=>{
        const key=prefix+name;if(!options.create&&!files.has(key))throw new DOMException('Missing','NotFoundError');
        return {kind:'file',name,getFile:async()=>new File(files.get(key)||[],name),createWritable:async()=>{files.set(key,[]);return {write:async value=>files.get(key).push(value),close:async()=>{}};}};
      }});window.showDirectoryPicker=async()=>directory(picks++?'logs/':'json/');
    });
    const page=await context.newPage(),errors=[],dialogs=[],accepted=[];
    page.on('pageerror',error=>errors.push(error.message));page.on('dialog',async dialog=>{dialogs.push(dialog.message());await dialog.accept();});
    page.on('response',response=>{if(response.status()===202&&response.url().endsWith('/api/polling/jobs'))accepted.push(response.request().postDataJSON().plan);});
    await page.goto(config.url);await page.waitForSelector('.db-workspace');await page.getByRole('button',{name:'Загрузка данных и опрос устройств',exact:true}).click();
    await page.waitForSelector('[data-polling-plan-form]');
    const f=fixture(),api=global.MvpSphereSR,book=global.XLSX.utils.book_new(),headers=api.SR_CANONICAL_HEADERS;
    const rows=f.input.managementTargetDevices.map(device=>({...row(device.ipNormalized),'Модель':device.modelRaw,'Производитель':device.manufacturerRaw}));
    global.XLSX.utils.book_append_sheet(book,global.XLSX.utils.aoa_to_sheet([headers,...rows.map(r=>headers.map(key=>r[key]||''))]),'Devices');
    const bytes=Buffer.from(global.XLSX.write(book,{type:'array',bookType:'xlsx'}));
    const upload=async()=>{await page.locator('[name="managementTargetListFile"]').setInputFiles({name:'mixed-targets.xlsx',mimeType:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',buffer:bytes});await page.getByText('Принято устройств: 15',{exact:true}).waitFor();};
    const credentials=async()=>{const form=page.locator('[data-credential-entry-form]');await form.locator('[name="username"]').fill('synthetic-user');await form.locator('[name="password"]').fill('synthetic-only');await form.locator('button[type="submit"]').click();await page.waitForFunction(()=>document.querySelector('[data-credential-entry-form] [name="password"]')?.value==='');};
    const setup=async()=>{const past=new Date(Date.now()-86400000);past.setMinutes(past.getMinutes()-past.getTimezoneOffset());await page.locator('[name="scheduledAt"]').fill(past.toISOString().slice(0,16));await page.locator('[name="confirmNoInterval"]').check();};
    const finish=async(success,noop)=>{await page.locator('[data-start-automatic-polling]').click();await page.waitForFunction(([s,n])=>document.querySelector('[data-polling-completion]')?.textContent.includes('Успешно: '+s+'; без выбранных действий: '+n),[success,noop]);await page.waitForFunction(()=>document.querySelector('[name="managementTargetListFile"]')?.disabled===false);};
    await upload();for(const name of ['te20AnswerMode','teFamilyAnswerMode','huawei310AnswerMode','huawei300AnswerMode','polycomPointToPointAnswerMode','polycomMultipointAnswerMode'])await page.locator(`[name="${name}"]`).selectOption('manual');
    assert.equal(accepted.length,0,'Loading and selecting Answer modes never launches a job');
    assert.equal(await page.locator('[name="te20HttpMode"]').inputValue(),'');assert.equal(await page.locator('[name="te20TelnetMode"]').inputValue(),'');
    await setup();await page.locator('[data-select-polling-output]').last().click();await credentials();
    // The real API must reject a cross-contract binding before starting a job.
    const bad=api.createPollingPlan(f.state,f.input);const badPlan=api.buildPollingPlanExport(bad.state,bad.plan.id).payload;badPlan.devices[0].managementTasks=['set_te20_auto_answer_manual'];
    const rejected=await page.evaluate(async plan=>{const s=await(await fetch('/api/session')).json();const response=await fetch('/api/polling/jobs',{method:'POST',headers:{'Content-Type':'application/json','X-MVP-CSRF':s.csrfToken},body:JSON.stringify({plan})});return {status:response.status,body:await response.json()};},badPlan);
    assert.equal(rejected.status,400);assert.equal(rejected.body.error,'plan_invalid');await credentials();
    await page.locator('[data-polling-target-preview] summary').click();assert.equal(await page.locator('[data-polling-target-preview] tbody tr').count(),15);
    await page.locator('[data-polling-target-preview]').screenshot({path:config.preview});
    await finish(15,0);assert.equal(accepted[0].managementTasks.length,5);assert(accepted[0].devices.every(d=>d.managementTasks.length===1));
    assert(accepted[0].managementTasks.every(task=>!task.includes('http')&&!task.includes('telnet')&&!task.includes('insecure')));
    assert(dialogs.some(d=>d.includes('Huawei TE30/40/50/60')&&d.includes('Polycom Group')&&d.includes('устройств: 4')));
    let names=await page.evaluate(()=>[...window.__mixedFiles.keys()]);assert.equal(names.length,1);assert(names[0].endsWith('/polling-recovery.json'));
    await upload();await page.locator('[name="te20AnswerMode"]').selectOption('automatic');await setup();await credentials();await finish(1,14);
    const second=accepted[1];assert.equal(second.devices.filter(d=>d.managementTasks.length).length,1);
    const noopOutcomes=await page.evaluate(async()=>{const journals=[];for(const[name,chunks]of window.__mixedFiles)if(name.endsWith('/polling-recovery.json'))journals.push(JSON.parse(await new Blob(chunks).text()));return journals.map(j=>j.outcomes.filter(o=>o.notRequested).length);});assert(noopOutcomes.includes(14));
    names=await page.evaluate(()=>[...window.__mixedFiles.keys()]);assert.equal(names.length,2,'No device JSON/log files when only writes are selected');
    await page.locator('[name="te20AnswerMode"]').selectOption('manual');await page.locator('[name="collectJson"]').check();await page.locator('[name="collectLogs"]').check();await page.locator('[data-select-log-output]').click();await setup();await credentials();await finish(15,0);
    names=await page.evaluate(()=>[...window.__mixedFiles.keys()]);assert.equal(names.filter(name=>name.endsWith('.json')&&!name.endsWith('/polling-recovery.json')).length,15);assert.equal(names.filter(name=>name.endsWith('.xml')||name.endsWith('.tgz')).length,15);
    assert.equal(accepted.length,3);assert.equal(errors.length,0,errors.join('; '));await page.setViewportSize({width:420,height:900});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
    console.log(JSON.stringify({ok:true,contracts:5,models:15,forgedBindingRejected:true,independentRouting:true,noChangeWithoutNetwork:14,optionalJsonFiles:15,optionalLogFiles:15,errors}));await context.close();
  }finally{await browser.close();}
})().catch(error=>{console.error(error.stack||String(error));process.exitCode=1;});
