"use strict";
const assert=require('assert/strict'),fs=require('fs/promises'),path=require('path'),crypto=require('crypto');
const {chromium}=require(process.env.SPHERE_PLAYWRIGHT_MODULE||'playwright');
(async()=>{
  let input='';for await(const chunk of process.stdin)input+=chunk;const config=JSON.parse(input),browser=await chromium.launch({channel:'chrome',headless:true});
  try{
    const context=await browser.newContext({viewport:{width:1536,height:1100},reducedMotion:'reduce'});
    await context.addCookies([{name:'mvp_sphere_session',value:config.cookie,url:config.url,httpOnly:true,sameSite:'Strict'}]);
    await context.addInitScript(()=>{const Original=Worker;window.__legacyEOF=false;window.__fragmentScans=[];window.Worker=class extends Original{postMessage(message,...rest){if(message.type==='scan'){window.__fragmentScans.push(message.file.webkitRelativePath);if(window.__legacyEOF&&message.file.webkitRelativePath.includes('run-one')){queueMicrotask(()=>this.onmessage?.({data:{type:'result',taskId:message.taskId,scan:{ok:false,reason:'incomplete_log',markers:[],bootGaps:[],coverage:{lines:2,oversizedLines:0,malformedCandidates:0}}}}));return;}}return super.postMessage(message,...rest);}};});
    const page=await context.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message));
    // Old complete checkpoints had no quality enum. Preserve that old shape to test compatibility.
    await page.route('**/api/workspace/log-file',async route=>{const data=route.request().postDataJSON();if(data?.result?.scan?.sourceCompleteness==='complete'){delete data.result.scan.sourceCompleteness;await route.continue({postData:JSON.stringify(data)});}else await route.continue();});
    const original=path.join(config.sources,'run-one','198.18.0.1.xml'),beforeHash=crypto.createHash('sha256').update(await fs.readFile(original)).digest('hex');
    const upload=async()=>{await page.getByRole('button',{name:'Загрузка данных и опрос устройств',exact:true}).click();await page.waitForFunction(()=>!document.querySelector('[name="logFiles"]')?.disabled);await page.locator('[name="logFiles"]').setInputFiles(config.sources);};
    const snapshot=()=>page.evaluate(async()=>{const session=await(await fetch('/api/session')).json(),workspace=await(await fetch('/api/workspace/status')).json();const q=async data=>{const r=await fetch('/api/workspace/db',{method:'POST',headers:{'Content-Type':'application/json','X-MVP-CSRF':session.csrfToken},body:JSON.stringify({workspace:workspace.workspaceId,...data})});if(!r.ok)throw Error('Synthetic DB query failed');return r.json();};const b=await q({action:'bootstrap'});return {revision:b.revision,pending:workspace.pendingLogFiles,events:await q({action:'view',revision:b.revision,name:'events',filters:{source:'logs',kind:'power_off'}})};});
    await page.goto(config.url);await page.waitForSelector('.db-workspace');const initial=await snapshot();
    await upload();await page.evaluate(()=>window.__legacyEOF=true);await page.getByRole('button',{name:'Импортировать папку логов',exact:true}).click();
    await page.waitForFunction(()=>document.querySelector('[data-log-import-problems]')?.textContent.includes('Код: incomplete_log'));
    assert.equal((await snapshot()).revision,initial.revision);assert.equal((await snapshot()).pending,2);
    await page.reload();await page.waitForSelector('.db-workspace');await upload();await page.getByRole('button',{name:'Продолжить импорт логов',exact:true}).click();
    await page.getByText(/Перепроверка по новым правилам Shut down завершена/).first().waitFor({timeout:30000});
    const scans=await page.evaluate(()=>window.__fragmentScans);assert.equal(scans.length,1);assert(scans[0].includes('run-one'));
    const now=await snapshot();assert.notEqual(now.revision,initial.revision);assert.equal(now.pending,0);
    const report=await page.locator('[data-log-import-problems]').textContent();assert(report.includes('Код: fragment_log'));assert(report.includes('блокируют замену прежних доказательств: 0'));
    assert(now.events.rows.some(row=>JSON.parse(row.payload).sourceFragment===true),'Published positive event must retain fragment provenance');
    assert.equal(crypto.createHash('sha256').update(await fs.readFile(original)).digest('hex'),beforeHash,'Original source must remain byte-identical');
    await page.locator('[data-log-import-problems]').screenshot({path:config.preview});assert.equal(errors.length,0,errors.join('; '));
    console.log(JSON.stringify({ok:true,sourceUnchanged:true,oldCompleteCheckpointsReused:2,bodyReadsAfterResume:1,fragmentPublishedWithWarning:true,positiveEventPreserved:true,errors}));await context.close();
  }finally{await browser.close();}
})().catch(error=>{console.error(error.stack||String(error));process.exitCode=1;});
