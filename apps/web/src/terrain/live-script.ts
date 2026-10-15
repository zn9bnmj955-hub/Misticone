/**
 * The only JavaScript of the public tournament page (~2 KB, ES5 for old
 * phones). Without it the page still works and reloads every 30 s.
 * - live: listens to Supabase Realtime broadcasts (plain WebSocket, no SDK)
 *   and refreshes the live part of the page; polls every 30 s as a fallback;
 * - offline: shows a banner and registers the service worker that keeps the
 *   last draw readable without network.
 */
export const LIVE_SCRIPT = `(function(){
var d=document,b=d.body,root=d.documentElement,code=b.getAttribute("data-code"),ver=OS_V||0,busy=false,timer=null,wsOk=false,last=0;
function offline(on){var c=root.className.replace(/\\s*is-offline/g,"");root.className=on?c+" is-offline":c;}
function swap(text){var box=d.createElement("div");box.innerHTML=text;var n=box.firstElementChild||box.firstChild;var o=d.getElementById("live");if(n&&o&&n.id==="live"){o.parentNode.replaceChild(n,o);ver=parseInt(n.getAttribute("data-version"),10)||ver;}}
function refresh(){if(busy)return;busy=true;last=+new Date();var x=new XMLHttpRequest();var u=location.pathname+location.search;u+=(u.indexOf("?")<0?"?":"&")+"fragment=1";x.open("GET",u,true);x.onreadystatechange=function(){if(x.readyState!==4)return;busy=false;if(x.status===200){swap(x.responseText);offline(false);}else if(x.status===0||x.status===503){offline(true);}};x.send();}
function soon(){if(timer)return;timer=setTimeout(function(){timer=null;refresh();},Math.max(800,last+10000-new Date()));}
function connect(){var url=b.getAttribute("data-ws");if(!url||!window.WebSocket||!window.JSON)return;var ws,ref=1,hb;try{ws=new WebSocket(url);}catch(e){return;}
ws.onopen=function(){wsOk=true;ws.send(JSON.stringify({topic:"realtime:tournament:"+code,event:"phx_join",payload:{config:{broadcast:{self:false},private:true}},ref:String(ref++)}));hb=setInterval(function(){try{ws.send(JSON.stringify({topic:"phoenix",event:"heartbeat",payload:{},ref:String(ref++)}));}catch(e){}},25000);};
ws.onmessage=function(e){try{var m=JSON.parse(e.data),v=m.event==="broadcast"&&m.payload&&m.payload.payload&&m.payload.payload.version;if(v>ver&&v<=ver+50)soon();}catch(err){}};
ws.onclose=function(){wsOk=false;clearInterval(hb);setTimeout(connect,5000);};}
setInterval(function(){if(!wsOk||d.hidden===false&&Math.random()<0.1)refresh();},30000);
d.addEventListener("visibilitychange",function(){if(!d.hidden)refresh();});
window.addEventListener("online",function(){offline(false);refresh();});
window.addEventListener("offline",function(){offline(true);});
if(navigator.onLine===false)offline(true);
connect();
if("serviceWorker" in navigator){navigator.serviceWorker.register("/sw.js").catch(function(){});}
})();`;
