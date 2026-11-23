/* Real loopback API + synthetic SQLite only; no device network requests. */
"use strict";
const fs=require("fs"),os=require("os"),path=require("path");
const {chromium}=require(process.env.SPHERE_PLAYWRIGHT_MODULE||"playwright");
(async()=>{
  let input="";for await(const chunk of process.stdin)input+=chunk;
  const config=JSON.parse(input),browser=await chromium.launch({channel:"chrome",headless:true});
  const folder=fs.mkdtempSync(path.join(os.tmpdir(),"sphere-offhours-qa-"));
  try{
    const context=await browser.newContext({viewport:{width:1536,height:1100},reducedMotion:"reduce",acceptDownloads:true});
    await context.addCookies([{name:"mvp_sphere_session",value:config.cookie,url:config.url,httpOnly:true,sameSite:"Strict"}]);
    const page=await context.newPage(),errors=[],queries=[];
    page.on("pageerror",error=>errors.push(error.message));
    page.on("request",request=>{if(request.url().endsWith("/api/workspace/db")&&request.method()==="POST")queries.push(request.postDataJSON());});
    const ready=async()=>{await page.waitForFunction(()=>document.querySelector(".db-offhours-rings")&&!document.querySelector(".db-query-footnote")?.textContent.includes("выполняется"));};
    const clicked=async(action,predicate)=>{
      const response=page.waitForResponse(r=>r.url().endsWith("/api/workspace/db")&&r.request().method()==="POST"&&r.request().postDataJSON().name==="offhours"&&predicate(r.request().postDataJSON()));
      await action();const r=await response;if(r.status()!==200)throw new Error("Offhours API failed: "+r.status());await ready();return r.json();
    };
    await page.goto(config.url);await page.waitForSelector(".db-workspace");
    await page.getByRole("button",{name:"Анализ перезагрузок устройств",exact:true}).click();
    const initial=await clicked(()=>page.getByRole("button",{name:"ВКС «Учёт»: нерабочее время",exact:true}).click(),q=>q.filters.offhoursGroup==="none");
    if(initial.denominator!==5000||initial.matchedDevices!==1000)throw new Error("Wrong current SR cohort/denominator");
    if(await page.locator(".db-offhours-rings .db-ring-card").count()!==5)throw new Error("Missing disjoint cohort rings");
    if(await page.locator('[data-db-filters] [name="period"]').inputValue()!=="2m")throw new Error("Not a two-month default");
    await page.screenshot({path:path.join(folder,"overview.png"),fullPage:true});
    await page.screenshot({path:path.join(folder,"overview-top.png")});
    const once=await clicked(()=>page.locator('[data-db-offhours-group="once"]').click(),q=>q.filters.offhoursGroup==="once");
    if(once.matchedDevices!==1000||once.rows.some(row=>row.confirmed!==1))throw new Error("Exactly-one group is incorrect");
    await clicked(()=>page.locator('[data-db-cell="0:18"]').click(),q=>q.filters.day===0&&q.filters.hour===18);
    const downloadPromise=page.waitForEvent("download");await page.getByRole("button",{name:"Скачать выбранную группу XLSX",exact:true}).click();
    const download=await downloadPromise;await download.saveAs(path.join(folder,"offhours-once.xlsx"));
    const XLSX=require("../vendor/xlsx.full.min.js"),book=XLSX.read(fs.readFileSync(path.join(folder,"offhours-once.xlsx"))),sheet=book.Sheets["Нерабочее время"];
    const rows=XLSX.utils.sheet_to_json(sheet,{header:1});
    if(rows.length!==1001||rows.slice(1).some(row=>row[8]!=="Учёт"||row[10]!==1))throw new Error("All-page XLSX does not match real SQL cohort");
    if(!book.Sheets["Условия"])throw new Error("Missing exported period/calendar context");
    const exportCalls=queries.filter(q=>q.name==="offhours"&&q.size===100);
    if(exportCalls.length!==10||exportCalls.slice(1).some(q=>!q.filters.offhoursUntil))throw new Error("Export period not fixed for all pages");
    await page.setViewportSize({width:880,height:1100});await page.screenshot({path:path.join(folder,"once-narrow.png"),fullPage:true});
    const horizontal=await page.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth+2);
    if(horizontal)throw new Error("Page overflows viewport outside local table/heatmap scrollers");
    await page.locator('[data-db-filters] [name="offhoursTime"]').selectOption("holiday");
    await clicked(()=>page.getByRole("button",{name:"Применить",exact:true}).click(),q=>q.filters.offhoursTime==="holiday");
    await page.getByRole("button",{name:"Анализ перезагрузок",exact:true}).click();await page.waitForSelector(".db-event-menu");
    if(errors.length)throw new Error(errors.join("; "));
    console.log(JSON.stringify({ok:true,realPythonSqlite:true,denominator:5000,oneShutdownDevices:1000,xlsxRows:rows.length-1,calendar:"RF-5day",screenshots:folder}));
    await context.close();
  }finally{await browser.close();}
})().catch(error=>{console.error(error.stack||String(error));process.exitCode=1;});
