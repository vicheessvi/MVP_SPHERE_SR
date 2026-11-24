(function(root){
  "use strict";
  const RULESET="vcs-terminal-shutdown-2026-11-24-v1";
  const COMMAND=/\bshut[ \t]+down\b/i;
  const FAILURE=/\b(?:fail(?:ed|ure)?|error|denied|cancel(?:led|ed)?|abort(?:ed)?|reject(?:ed)?|unsuccessful|invalid|unable|cannot|can't|couldn't|queued|pending)\b|\b(?:no|not|never|don't|do not|did not)\b.{0,30}\bshut[ \t]+down\b/i;
  const NON_ACTION=/\b(?:configuration|config|settings?|parameter|capability|menu|dialog|option|timer|policy|prompt|help|enabled|disabled|select(?:ed)?)\b|\b(?:will|would|should)\b.{0,30}\bshut[ \t]+down\b/i;
  const COMPONENT=/\b(?:port|interface|application|process|component|module|service|camera|microphone|speaker|display)\b[^:;]{0,40}$/i;
  function isTerminalShutdown(value){
    if(typeof value!=="string"||value.length>4096||/[\r\n\u0000\uFFFD]/.test(value))return false;
    if(!COMMAND.test(value))return false;
    const text=value.replace(/[ \t]+/g," ").trim(),match=COMMAND.exec(text);
    if(!match||FAILURE.test(text)||NON_ACTION.test(text))return false;
    const before=text.slice(0,match.index),after=text.slice(match.index+match[0].length).trim();
    if(COMPONENT.test(before))return false;
    if(/^(?:the )?(?:terminal|codec|device)\s+(?:port|interface|application|process|component|module|service|camera|microphone|speaker|display)\b/i.test(after))return false;
    return !after||/^[.!;,)]/.test(after)||/^(?:the )?(?:terminal|codec|device)\b/i.test(after)
      ||/^(?:success(?:ful(?:ly)?)?|succeeded|completed|done|by|from|via)\b/i.test(after);
  }
  function preceding(shutdowns,at,previousStart=-Infinity){
    let low=0,high=shutdowns.length;
    while(low<high){const middle=(low+high)>>>1;if(shutdowns[middle].timeMs<=at)low=middle+1;else high=middle;}
    const found=shutdowns[low-1];
    return found&&found.timeMs>previousStart&&at-found.timeMs<=315360000000?found:null;
  }
  function reconcileStarts(events){
    const at=item=>Date.parse(item.deviceLocalTime?item.deviceLocalTime.replace(" ","T")+"Z":item.estimatedAt);
    const ordered=[...events].sort((a,b)=>String(a.deviceId).localeCompare(String(b.deviceId))||String(a.ip).localeCompare(String(b.ip))||at(a)-at(b)||(b.kind==="power_off")-(a.kind==="power_off")||String(a.id).localeCompare(String(b.id)));
    const changed=new Map();let group=null,off=null;
    for(const item of ordered){
      const key=JSON.stringify([item.deviceId,item.ip]);if(key!==group){group=key;off=null;}
      if(item.kind==="power_off"){if(item.shutdownBasis==="registered_terminal_shutdown")off=item;continue;}
      if(!["unknown_start","start_after_shutdown","confirmed_reboot"].includes(item.kind))continue;
      const saved=item._shutdownLink,prior=item.kind==="start_after_shutdown"&&saved?.version===1&&saved.previousKind==="unknown_start"?saved:null,base=prior?.previousKind||item.kind;
      const delta=off?at(item)-at(off):0;
      if(base==="unknown_start"&&off&&delta>0&&delta<=315360000000){
        changed.set(item.id,{...item,kind:"start_after_shutdown",silenceGap:null,_shutdownLink:{version:1,eventId:off.id,at:off.deviceLocalTime,
          previousKind:"unknown_start",previousGap:prior?prior.previousGap:item.silenceGap||null}});
      }else if(prior){const restored={...item,kind:prior.previousKind,silenceGap:prior.previousGap};delete restored._shutdownLink;changed.set(item.id,restored);}
      off=null;
    }
    return events.map(item=>changed.get(item.id)||item);
  }
  const isRejected=value=>typeof value==="string"&&FAILURE.test(value);
  const api=Object.freeze({RULESET,isTerminalShutdown,isRejected,preceding,reconcileStarts});
  if(typeof module==="object"&&module.exports)module.exports=api;
  root.MVP_VCS_SHUTDOWN=api;
})(typeof window!=="undefined"?window:globalThis);
