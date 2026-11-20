/* Development-only real API/browser check. Auth is synthetic and stays in memory. */
"use strict";
const {chromium}=require(process.env.SPHERE_PLAYWRIGHT_MODULE||"playwright");
(async()=>{
  let input="";for await(const chunk of process.stdin)input+=chunk;
  const config=JSON.parse(input),browser=await chromium.launch({channel:"chrome",headless:true}),results=[];
  try{
    for(const delayedCancellation of [false,true]){
      const context=await browser.newContext({viewport:{width:1536,height:1100},reducedMotion:"reduce"});
      await context.addCookies([{name:"mvp_sphere_session",value:config.cookie,url:config.url,httpOnly:true,sameSite:"Strict"}]);
      const page=await context.newPage(),errors=[],statuses=[];
      page.on("dialog",dialog=>dialog.message().startsWith("Подключение другой рабочей базы")?dialog.accept():dialog.dismiss());
      if(config.clientScript)await page.route("**/runtime/db-views.js",route=>route.fulfill({status:200,contentType:"text/javascript",body:config.clientScript}));
      page.on("pageerror",error=>errors.push(error.message));
      page.on("response",response=>{const request=response.request();if(request.url().endsWith("/api/workspace/db")&&request.method()==="POST"&&request.postDataJSON().name==="facets")statuses.push(response.status());});
      if(delayedCancellation)await page.addInitScript(()=>{
        const original=window.fetch;let first=true;
        window.fetch=function(resource,options){
          let facet=false;try{facet=JSON.parse(options?.body||"{}").name==="facets";}catch{}
          if(!facet||!first)return original.apply(this,arguments);
          first=false;
          // Real HTTP/JSON response, controlled delivery of the first cancellation only.
          return new Promise((resolve,reject)=>{
            let cancelled=false,timer;
            const abort=()=>{if(cancelled)return;cancelled=true;clearTimeout(timer);setTimeout(()=>reject(new DOMException("synthetic delayed cancellation","AbortError")),2500);};
            options.signal?.addEventListener("abort",abort,{once:true});
            original(resource,options).then(response=>{if(!cancelled)timer=setTimeout(()=>{if(!cancelled)resolve(response);},5000);},error=>{if(error.name==="AbortError")abort();else reject(error);});
          });
        };
      });
      const firstFacet=page.waitForRequest(request=>request.url().endsWith("/api/workspace/db")&&request.method()==="POST"&&request.postDataJSON().name==="facets");
      await page.goto(config.url);await page.waitForSelector(".db-workspace");await firstFacet;
      if(delayedCancellation){
        await page.getByRole("button",{name:"Загрузка данных и опрос устройств",exact:true}).click();
        await page.waitForSelector("[data-workspace-select-form]");
        const path=page.locator('[data-workspace-select-form] [name="workspacePath"]');
        await path.fill((await path.inputValue())+"/."); // Same real folder, same data revision, explicit reconnect.
        const bootstrap=page.waitForResponse(response=>response.url().endsWith("/api/workspace/db")&&response.request().method()==="POST"&&response.request().postDataJSON().action==="bootstrap");
        await page.getByRole("button",{name:"Подключить папку",exact:true}).click();
        await (await bootstrap).finished();await page.waitForTimeout(50);
      }
      await page.getByRole("button",{name:"Анализ перезагрузок устройств",exact:true}).click();
      const ready=()=>["domain","category","manufacturer","model","locationId","address"].every(name=>document.querySelector('[data-db-filters] [name="'+name+'"]')?.disabled===false);
      await page.waitForFunction(ready);
      if(delayedCancellation){
        await page.waitForTimeout(2800);
        if(!(await page.evaluate(ready))||(await page.locator(".db-filter-state").textContent()).includes("metadata_timeout"))throw new Error("Late old abort disabled successful real-API filters");
      }
      await page.locator('[data-db-filters] [name="domain"]').selectOption("domain-0");
      await page.waitForFunction(()=>document.querySelector('[data-db-filters] [name="manufacturer"]')?.disabled===false);
      const makers=await page.locator('[data-db-filters] [name="manufacturer"] option').allTextContents();
      if(!makers.includes("Huawei")||makers.includes("Polycom"))throw new Error("Real SR cascade is incorrect");
      await page.locator('[data-db-filters] [name="manufacturer"]').selectOption("huawei");
      await page.waitForFunction(()=>document.querySelector('[data-db-filters] [name="model"]')?.disabled===false);
      await page.locator('[data-db-filters] [name="model"]').selectOption("te40");
      await page.getByRole("button",{name:"Применить",exact:true}).click();
      await page.waitForSelector(".db-heatmap");
      if(errors.length)throw new Error("Browser errors: "+errors.join("; "));
      if(statuses.some(status=>status!==200))throw new Error("Real facets API failed");
      results.push({delayedCancellation,enabledFields:6,facetResponses:statuses.length,httpStatuses:[...new Set(statuses)]});
      await context.close();
    }
    process.stdout.write(JSON.stringify({ok:true,realPythonSqlite:true,results}));
  }finally{await browser.close();}
})().catch(error=>{process.stderr.write(error.stack||String(error));process.exitCode=1;});
