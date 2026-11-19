/* Development-only headless visual check with synthetic API responses; no user DB. */
"use strict";
const http=require("http"),fs=require("fs"),path=require("path"),os=require("os");
const {chromium}=require(process.env.SPHERE_PLAYWRIGHT_MODULE||"playwright");
const root=path.resolve(__dirname,"..");
const allowed=new Set(["/index.html","/styles.css","/app.js","/product-catalog.js","/vendor/xlsx.full.min.js",
  ...["credential-pool","polling-recovery","huawei-te-log-events","huawei-310-log-events","huawei-300-log-events",
      "log-scan-worker","log-scan-client","sphere","db-views"].map((name)=>"/runtime/"+name+".js")]);
const counts={inventoryDevices:5000,pollingResults:25000,logRows:5000,"events:te":1000000};
const revision="1:0";
let publication={status:"pending",percent:0,stage:"preparing"};
function respond(data){
  if(data.action==="prepare")return {ready:true,processed:1001,total:1001,revision};
  if(data.action==="bootstrap")return {revision,counts,settings:{}};
  if(data.action==="context"){
    const rows=process.env.SPHERE_TEST_IMPORT_CONTEXT==="1"?{
      inventoryDevices:[{id:"synthetic-poly",nameRaw:"Synthetic terminal",category:"vcs",manufacturerRaw:"Polycom",manufacturerNormalized:"polycom",modelRaw:"RealPresence Group 310",modelNormalized:"realpresence group 310",ipNormalized:"192.0.2.40",inCurrentSr:true,locationId:"synthetic-location"}],
      locations:[{id:"synthetic-location",name:"Synthetic room",address:"Synthetic address"}],
      srImports:[{id:"synthetic-sr",rawSha256:"a".repeat(64),importedAt:"2026-11-19T10:00:00Z"}]
    }[data.label]||[]:[];
    return {revision,rows,next:null};
  }
  if(data.action==="progress")return publication;
  if(data.action==="files")return {skip:data.files.map(()=>false)};
  if(data.action==="begin")return {token:"b".repeat(32)};
  if(data.action==="neighbors-batch")return {seeds:data.results.map((row)=>({id:row.id,duplicate:false,rows:[]}))};
  if(data.action==="neighbors")return {duplicate:false,rows:[]};
  if(["batch","finish","clear"].includes(data.action))return {revision,pending:0};
  if(data.name==="facets"){
    const f=data.filters||{},item=(value,label)=>({value,label});
    const categories=[item("vcs","Терминалы ВКС"),item("controller","Контроллеры"),item("panel","Панели")];
    const makers=f.category==="vcs"?[item("huawei","Huawei"),item("polycom","Polycom")]:f.category?[item("extron","Extron")]:[item("huawei","Huawei"),item("polycom","Polycom"),item("extron","Extron")];
    const models=f.manufacturer==="huawei"?[item("te40","TE40"),item("bar 310","Bar 310")]:f.manufacturer==="polycom"?[item("realpresence group 310","RealPresence Group 310")]:f.manufacturer==="extron"?[item("ipl pro","IPL Pro")]:[item("te40","TE40"),item("bar 310","Bar 310"),item("realpresence group 310","RealPresence Group 310"),item("ipl pro","IPL Pro")];
    const all={domains:[item("synthetic","Тестовый домен")],categories,manufacturers:makers,models,locations:[item("loc","Локация")],addresses:[item("address","Тестовый адрес")]};
    const selected={};
    for(const [key,list] of [["domain","domains"],["category","categories"],["manufacturer","manufacturers"],["model","models"],["locationId","locations"],["address","addresses"]])if(all[list].some((row)=>row.value===f[key]))selected[key]=f[key];
    return {revision,...all,selected};
  }
  const common={revision,page:0,pageSize:50,elapsedMs:12};
  if(data.name==="dashboard")return {...common,counts,devices:5000,categories:[{label:"vcs",devices:3200},{label:"controller",devices:900},{label:"panel",devices:900}]};
  if(data.name==="summary")return {...common,denominator:5000,groups:[{kind:"confirmed_reboot",events:1000000,devices:4200},{kind:"power_off",events:1380,devices:600},{kind:"suspected_power_loss",events:620,devices:350},{kind:"unknown_start",events:790,devices:420}]};
  if(data.name==="accounted")return {...common,counts:{denominator:3400,reboots:2100,confirmed:360,suspected:170,suspectedOnly:130}};
  if(data.name==="heatmap")return {...common,cells:Array.from({length:168},(_,i)=>({day:Math.floor(i/24),hour:i%24,devices:(i*13+7)%30,events:(i*31+2)%100}))};
  if(data.name==="tops")return {...common,...Object.fromEntries(["devices","locations","addresses","dates","hours"].map((key)=>[key,Array.from({length:5},(_,i)=>({label:key==="hours"?String(9+i):key==="dates"?"2026-11-"+(19-i):key==="devices"?"Тестовый терминал "+(i+1):key==="locations"?"Локация "+(i+1):"Тестовый адрес "+(i+1),events:4500-i*870,devices:42-i*6,deviceId:"synthetic-"+i,groupKey:"loc-"+i,address:"Тестовый адрес"}))]))};
  if(data.name==="duration")return {...common,denominator:5000,buckets:Array.from({length:8},(_,bucket)=>({bucket,devices:(8-bucket)*37}))};
  return {...common,hasNext:true,rows:Array.from({length:50},(_,i)=>({key:"event-"+i,device:"synthetic-"+i,name:"Тестовый терминал "+(i+1),model:"TE40",ip:"192.0.2."+(i+1),stamp:"2026-11-19 12:15:00",event_kind:data.filters?.kind||"confirmed_reboot",locationName:"Локация "+(i+1),address:"Тестовый адрес",payload:JSON.stringify({sources:[{path:"synthetic/run/device.xml",line:7}],sourceCount:3})}))};
}
const server=http.createServer(async(req,res)=>{
  if(process.env.SPHERE_TEST_OMIT_RECOVERY==="1"&&req.url==="/runtime/polling-recovery.js"){res.writeHead(404);res.end();return;}
  if(req.url==="/runtime-config.js"){res.writeHead(200,{"Content-Type":"text/javascript"});res.end('globalThis.__MVP_SECURE_RUNTIME__=true;globalThis.__MVP_CSRF__="synthetic";');return;}
  const json=(value)=>{res.writeHead(200,{"Content-Type":"application/json"});res.end(JSON.stringify(value));};
  if(req.url==="/api/session"){json({adminConfigured:true,adminUnlocked:true});return;}
  if(req.url==="/api/workspace/status"){json({status:"ready",workspaceId:"a".repeat(32),revision:1,partCount:1001,hasSnapshot:true});return;}
  if(req.url.startsWith("/api/workspace/log-list/")){json({value:[]});return;}
  if(req.url==="/api/workspace/db"){
    let body="";for await(const chunk of req)body+=chunk;const data=JSON.parse(body);
    if(process.env.SPHERE_TEST_DB_ERROR==="1"&&data.action==="context"&&data.label==="logRows"){
      res.writeHead(503,{"Content-Type":"application/json"});res.end(JSON.stringify({error:"db_query_timeout"}));return;
    }
    if(process.env.SPHERE_TEST_FAIL_FINISH==="1"&&data.action==="finish"){
      res.writeHead(503,{"Content-Type":"application/json"});res.end(JSON.stringify({error:"workspace_write_failed"}));return;
    }
    if(data.name==="tops")await new Promise((resolve)=>setTimeout(resolve,200));
    if(data.action==="finish"&&process.env.SPHERE_TEST_DELAY_FINISH==="1"){
      publication={status:"running",percent:0,stage:"preparing"};
      for(const percent of [15,30,50,70,90,99]){await new Promise((resolve)=>setTimeout(resolve,300));publication={status:"running",percent,stage:percent<90?"records":"commit"};}
      publication={status:"completed",percent:100,stage:"completed"};
    }
    json(respond(data));return;
  }
  let route=decodeURIComponent((req.url||"/").split("?")[0]);
  if(route==="/")route="/index.html";
  if(!allowed.has(route)){res.writeHead(404);res.end();return;}
  const filename=path.resolve(root,"."+ (route==="/" ? "/index.html" : route));
  if(!filename.startsWith(root+path.sep)||!fs.existsSync(filename)||fs.statSync(filename).isDirectory()){res.writeHead(404);res.end();return;}
  const mime={".html":"text/html",".css":"text/css",".js":"text/javascript",".svg":"image/svg+xml"}[path.extname(filename)]||"application/octet-stream";
  res.writeHead(200,{"Content-Type":mime,"Content-Security-Policy":"default-src 'self'; script-src 'self'; worker-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; object-src 'none'"});fs.createReadStream(filename).pipe(res);
});
if(require.main===module)(async()=>{
  await new Promise((resolve)=>server.listen(0,"127.0.0.1",resolve));
  const browser=await chromium.launch({channel:"chrome",headless:true});
  const images=await fs.promises.mkdtemp(path.join(os.tmpdir(),"sphere-db-ui-"));
  const page=await browser.newPage({viewport:{width:1536,height:1100},reducedMotion:"reduce"});
  const errors=[];page.on("pageerror",(error)=>errors.push(error.message));
  page.on("console",(message)=>{if(message.type()==="error"&&message.text().includes("Content Security Policy"))errors.push(message.text());});
  try{
    await page.goto("http://127.0.0.1:"+server.address().port);
    await page.waitForSelector(".db-workspace");
    await page.getByRole("button",{name:"Анализ перезагрузок устройств",exact:true}).click();
    await page.waitForSelector(".db-heatmap");
    await page.waitForFunction(()=>!document.querySelector('[data-db-filters] select[name="category"]').disabled);
    const group=await page.locator('.db-device-filters label span').allTextContents();
    if(group.join("|")!=="Тип устройства|Производитель|Модель")throw new Error("Device filters order regressed");
    let dataRequests=0;
    page.on("request",(request)=>{if(request.url().endsWith("/api/workspace/db")){const data=request.postDataJSON();if(data.action==="view"&&data.name!=="facets")dataRequests++;}});
    await page.locator('[data-db-filters] select[name="category"]').selectOption("vcs");
    await page.waitForFunction(()=>!document.querySelector('[data-db-filters] select[name="manufacturer"]').disabled);
    const makers=await page.locator('[data-db-filters] select[name="manufacturer"] option').allTextContents();
    if(makers.includes("Extron")||!makers.includes("Huawei")||!makers.includes("Polycom"))throw new Error("Manufacturer choices not cascaded");
    await page.locator('[data-db-filters] select[name="manufacturer"]').selectOption("huawei");
    await page.waitForFunction(()=>!document.querySelector('[data-db-filters] select[name="model"]').disabled);
    const models=await page.locator('[data-db-filters] select[name="model"] option').allTextContents();
    if(models.join("|")!=="Все модели|TE40|Bar 310")throw new Error("Model choices not cascaded");
    if(dataRequests)throw new Error("Draft filter triggered heavy analytics before Apply");
    await page.getByRole("button",{name:"Применить",exact:true}).click();
    await page.waitForTimeout(250);
    if(!dataRequests)throw new Error("Apply did not request analytics");
    await page.locator('[data-db-filters] input[name="search"]').fill("черновик");
    await page.waitForTimeout(250);
    if(await page.locator('[data-db-filters] input[name="search"]').inputValue()!=="черновик")throw new Error("Async update erased draft filter");
    await page.waitForSelector(".module-sphere canvas");
    await page.screenshot({path:path.join(images,"events.png"),fullPage:true});
    await page.screenshot({path:path.join(images,"events-top.png")});
    await page.getByRole("button",{name:"Анализ отключения питания",exact:true}).click();
    if(await page.locator('.db-submodules [data-db-kind="power_off"]').getAttribute("aria-pressed")!=="true")throw new Error("Blur swallowed the next submodule click");
    await page.waitForSelector(".db-duration");
    await page.screenshot({path:path.join(images,"power.png"),fullPage:true});
    await page.screenshot({path:path.join(images,"power-top.png")});
    await page.setViewportSize({width:780,height:1100});
    await page.screenshot({path:path.join(images,"narrow.png"),fullPage:true});
    await page.getByRole("button",{name:"Загрузка данных и опрос устройств",exact:true}).click();
    await page.waitForSelector("[data-polling-plan-form]");
    if(errors.length)throw new Error(errors.join("; "));
    process.stdout.write(JSON.stringify({ok:true,images,errors}));
  }catch(error){process.stderr.write(JSON.stringify({errors,text:(await page.locator('body').innerText()).slice(-7000)}));throw error;}
  finally{await browser.close();server.close();}
})().catch((error)=>{process.stderr.write(error.stack||String(error));server.close();process.exitCode=1;});
module.exports={server,chromium};
