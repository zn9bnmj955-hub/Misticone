/**
 * The only JavaScript of the public tournament page (~2 KB, ES5 for old
 * phones). Without it the page still works and reloads every 30 s.
 * - live: listens to Supabase Realtime broadcasts (plain WebSocket, no SDK)
 *   and refreshes the live part of the page; polls every 30 s as a fallback;
 * - offline: shows a banner and registers the service worker that keeps the
 *   last draw readable without network. Once the worker is ready it is asked
 *   (at most every 10 min per tournament) to keep this page and the teams page
 *   (/c/CODE/equipes), so even a first visit can be reopened offline.
 * Refreshes are spread at random (0.5 to 6 s after an update or when the
 * network comes back, 25 to 35 s for the fallback polling) so that every phone
 * does not hit the server at the same second. F5 always works.
 * Must stay ES5 (checked by acorn in live-script.test.ts).
 */
export const LIVE_SCRIPT = `(function(){
var d=document,b=d.body,root=d.documentElement,code=b.getAttribute("data-code"),ver=OS_V||0,busy=false,timer=null,wsOk=false,last=0;
function offline(on){var c=root.className.replace(/\\s*is-offline/g,"");root.className=on?c+" is-offline":c;}
function swap(text){var box=d.createElement("div");box.innerHTML=text;var n=box.firstElementChild||box.firstChild;var o=d.getElementById("live");if(n&&o&&n.id==="live"){o.parentNode.replaceChild(n,o);ver=parseInt(n.getAttribute("data-version"),10)||ver;}}
function refresh(){if(busy)return;busy=true;last=+new Date();var x=new XMLHttpRequest();var u=location.pathname+location.search;u+=(u.indexOf("?")<0?"?":"&")+"fragment=1";x.open("GET",u,true);x.onreadystatechange=function(){if(x.readyState!==4)return;busy=false;if(x.status===200){swap(x.responseText);offline(false);}else if(x.status===0||x.status===503){offline(true);}};x.send();}
function soon(){if(timer)return;timer=setTimeout(function(){timer=null;refresh();},Math.max(500+Math.random()*5500,last+10000-new Date()));}
function connect(){var url=b.getAttribute("data-ws");if(!url||!window.WebSocket||!window.JSON)return;var ws,ref=1,hb;try{ws=new WebSocket(url);}catch(e){return;}
ws.onopen=function(){wsOk=true;ws.send(JSON.stringify({topic:"realtime:tournament:"+code,event:"phx_join",payload:{config:{broadcast:{self:false},private:true}},ref:String(ref++)}));hb=setInterval(function(){try{ws.send(JSON.stringify({topic:"phoenix",event:"heartbeat",payload:{},ref:String(ref++)}));}catch(e){}},25000);};
ws.onmessage=function(e){try{var m=JSON.parse(e.data),v=m.event==="broadcast"&&m.payload&&m.payload.payload&&m.payload.payload.version;if(v>ver&&v<=ver+50)soon();}catch(err){}};
ws.onclose=function(){wsOk=false;clearInterval(hb);setTimeout(connect,5000);};}
function poll(){setTimeout(function(){if(!wsOk||d.hidden===false&&Math.random()<0.1)refresh();poll();},25000+Math.random()*10000);}
poll();
d.addEventListener("visibilitychange",function(){if(!d.hidden)refresh();});
window.addEventListener("online",function(){offline(false);soon();});
window.addEventListener("offline",function(){offline(true);});
if(navigator.onLine===false)offline(true);
connect();
function keep(){var k="os_sw_"+code,n=+new Date(),p=location.pathname;try{if(n-(parseInt(localStorage.getItem(k),10)||0)<600000)return;localStorage.setItem(k,String(n));}catch(e){}
navigator.serviceWorker.ready.then(function(r){if(r.active)r.active.postMessage({type:"cache-page",urls:[p,"/c/"+code+"/equipes"]});});}
if("serviceWorker" in navigator){navigator.serviceWorker.register("/sw.js").then(keep).catch(function(){});}
})();`;
