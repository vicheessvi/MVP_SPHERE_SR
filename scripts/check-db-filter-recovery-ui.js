/* Development-only: delayed shared metadata and timed-out analytics, no user data. */
"use strict";
process.env.SPHERE_TEST_DELAY_FACETS="1";
process.env.SPHERE_TEST_TIMEOUT_ANALYTICS="1";
const {server,chromium}=require("./check-db-workspace-ui.js");
(async()=>{
  await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));
  const browser=await chromium.launch({channel:"chrome",headless:true});
  const page=await browser.newPage({viewport:{width:1536,height:1100}}),errors=[],requests=[];
  page.on("pageerror",error=>errors.push(error.message));
  page.on("request",request=>{if(request.url().endsWith("/api/workspace/db"))requests.push(request.postDataJSON());});
  try{
    await page.goto("http://127.0.0.1:"+server.address().port);
    await page.waitForSelector(".db-workspace");
    await page.getByRole("button",{name:"Анализ перезагрузок устройств",exact:true}).click();
    await page.waitForSelector('.error-panel');
    await page.waitForFunction(()=>["domain","category","manufacturer","model","locationId","address"].every(name=>document.querySelector('[data-db-filters] [name="'+name+'"]')?.disabled===false));
    const fields=await page.locator('[data-db-filters] [data-db-cascade]').evaluateAll(nodes=>nodes.map(node=>({name:node.name,options:node.options.length,disabled:node.disabled})));
    if(fields.length!==6||fields.some(field=>field.disabled||field.options<2))throw new Error("Not all six filters recovered");
    const metadataUpdate=page.waitForResponse(response=>response.url().endsWith("/api/workspace/db")&&response.request().postDataJSON().name==="facets"&&response.request().postDataJSON().filters.search==="draft-preserved");
    await page.locator('[data-db-filters] [name="search"]').fill("draft-preserved");
    await (await metadataUpdate).finished();await page.waitForTimeout(50);
    if(await page.locator('[data-db-filters] [name="search"]').inputValue()!=="draft-preserved")throw new Error("Metadata reset search draft");
    if(await page.evaluate(()=>document.activeElement?.name)!=="search")throw new Error("Metadata reset focus");
    await page.locator('[data-db-filters] [name="model"]').selectOption("te40");
    await page.locator('[data-db-filters] [name="period"]').selectOption("7d");
    await page.getByRole("button",{name:"Применить",exact:true}).click();
    await page.waitForSelector(".db-table tbody tr");
    if(!requests.some(request=>request.name==="events"&&request.filters.period==="7d"&&request.filters.model==="te40"))throw new Error("Narrowing did not request filtered data");
    await page.waitForFunction(()=>document.querySelector('[data-db-filters] [name="manufacturer"]')?.disabled===false);
    process.env.SPHERE_TEST_FAIL_FACETS="1";
    await page.locator('[data-db-filters] [name="manufacturer"]').selectOption("huawei");
    await page.waitForSelector('[data-db-facets-retry]:visible');
    if(await page.getByRole("button",{name:"Применить",exact:true}).isDisabled())throw new Error("Metadata error blocked Apply");
    await page.locator('[data-db-filters] [name="period"]').selectOption("7d");
    await page.getByRole("button",{name:"Применить",exact:true}).click();
    await page.waitForSelector(".db-table tbody tr");
    process.env.SPHERE_TEST_FAIL_FACETS="0";
    await page.locator('[data-db-facets-retry]').click();
    await page.waitForFunction(()=>document.querySelector('[data-db-filters] [name="manufacturer"]')?.disabled===false);
    if(errors.length)throw new Error(errors.join("; "));
    process.stdout.write(JSON.stringify({ok:true,fields,timeoutRecovered:true,metadataErrorApply:true,errors}));
  }finally{await browser.close();server.close();}
})().catch(error=>{process.stderr.write(error.stack||String(error));server.close();process.exitCode=1;});
