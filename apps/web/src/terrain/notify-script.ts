/**
 * « Me prévenir quand c'est à moi » on the terrain pages (plain HTML, no
 * framework). The block is fully hidden by default: without JS, or on a
 * browser that cannot receive push, the page is unchanged. The script reveals
 * the button only where push works, asks permission only from the click, and
 * on an iPhone not yet "installed" shows the one-step home-screen help.
 * Same protocol as src/lib/push-client.ts (localStorage `os_push_teams` with
 * "CODE:number" entries, POST /api/push/subscribe). ES5 syntax only.
 */
import { getMessages } from "@/i18n";
import { html, jsonForScript, raw, type SafeHtml } from "./html";

const vapidKey = () => process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "";

/** Head links that make a tournament page installable (iPhone push needs it); no start_url, so it reopens on that page. */
export const TERRAIN_HEAD_LINKS = '<link rel="manifest" href="/terrain.webmanifest"><link rel="apple-touch-icon" href="/icons/apple-touch-icon.png">';

export const NOTIFY_SCRIPT = `(function(){
var w=window,d=document,n=navigator,C=w.OS_N,K="os_push_teams";
if(!C||!d.querySelector||!w.JSON)return;
function ios(){return /iP(hone|ad|od)/.test(n.userAgent)||(n.platform==="MacIntel"&&n.maxTouchPoints>1);}
function standalone(){return n.standalone===true||!!(w.matchMedia&&w.matchMedia("(display-mode: standalone)").matches);}
function support(){if(!("serviceWorker" in n)||!w.PushManager||!w.Notification)return ios()&&!standalone()?"ios":"no";return Notification.permission==="denied"?"denied":"ok";}
function get(k){try{return w.localStorage.getItem(k);}catch(e){return null;}}
function put(k,v){try{w.localStorage.setItem(k,v);}catch(e){}}
function teams(){try{var a=JSON.parse(get(K)||"[]");return a instanceof Array?a:[];}catch(e){return [];}}
function has(id){var a=teams();for(var i=0;i<a.length;i++){if(a[i]===id)return true;}return false;}
function bytes(s){s=(s+"===".slice(0,(4-s.length%4)%4)).replace(/-/g,"+").replace(/_/g,"/");var r=atob(s),o=new Uint8Array(r.length);for(var i=0;i<r.length;i++)o[i]=r.charCodeAt(i);return o;}
function say(box,t){var p=box.querySelector("[data-msg]");p.textContent=t;p.hidden=!t;}
function setup(box){
if(box.getAttribute("data-on"))return;box.setAttribute("data-on","1");
var code=box.getAttribute("data-code"),team=parseInt(box.getAttribute("data-team"),10),id=code+":"+team,wrap=box.querySelector("[data-btn]"),btn=wrap.querySelector("button"),s=support();
if(s==="ios"){box.querySelector("[data-ios]").hidden=false;var to="/c/"+code+"?equipe="+team;
if(w.history&&history.replaceState&&(location.pathname!=="/c/"+code||!/[?&]equipe=/.test(location.search))){try{history.replaceState(null,"",to);}catch(e){}}return;}
if(s==="no")return;
if(s==="denied"){say(box,C.denied);return;}
if(Notification.permission==="granted"&&has(id)){say(box,C.enabled);return;}
wrap.hidden=false;
btn.onclick=function(){
var done=false;btn.disabled=true;say(box,C.asking);
function fail(t){btn.disabled=false;say(box,t);}
function answer(p){if(done)return;done=true;
if(p==="denied"){wrap.hidden=true;say(box,C.denied);return;}
if(p!=="granted"){fail("");return;}
n.serviceWorker.register("/sw.js",{scope:"/"}).then(function(){return n.serviceWorker.ready;}).then(function(reg){return reg.pushManager.getSubscription().then(function(sub){return sub||reg.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:bytes(C.key)});});}).then(function(sub){return fetch("/api/push/subscribe",{method:"POST",credentials:"same-origin",headers:{"content-type":"application/json"},body:JSON.stringify({subscription:sub.toJSON(),code:code,team:team})});}).then(function(r){if(!r.ok)throw r;var a=teams();if(!has(id))a.push(id);put(K,JSON.stringify(a));put("os_push_device","1");wrap.hidden=true;say(box,C.enabled);})["catch"](function(){fail(C.error);});}
try{var r=Notification.requestPermission(answer);if(r&&r.then)r.then(answer);}catch(e){fail(C.error);}
};}
function scan(){var l=d.querySelectorAll("[data-notify]");for(var i=0;i<l.length;i++)setup(l[i]);}
scan();
if(w.MutationObserver&&d.body)new MutationObserver(scan).observe(d.body,{childList:true,subtree:true});
})();`;

/** Push needs the server's VAPID key; without it nothing is rendered. */
export function notifyEnabled(): boolean {
  return vapidKey() !== "";
}

/** Hidden block for one team (the script reveals what applies). */
export function notifyBlock(code: string, team: number): SafeHtml {
  if (!notifyEnabled()) return html``;
  const n = getMessages().notifications;
  return html`<div class="no-print" data-notify data-code="${code}" data-team="${team}">
<div class="note" data-btn hidden><button type="button" style="margin:0">${n.button}</button></div>
<p class="note" data-msg role="status" hidden></p>
<div class="note" data-ios hidden><b>${n.iosTitle}</b><br>${n.iosText}<br><svg width="22" height="22" viewBox="0 0 24 24" role="img" aria-label="${n.iosShare}" style="vertical-align:-5px"><path d="M12 15V3M7.5 7.5 12 3l4.5 4.5M8 10H5v11h14V10h-3" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg> ${n.iosStep}</div>
</div>`;
}

/** The script, with its texts; include once per page, after the blocks. */
export function notifyScriptTag(): SafeHtml {
  if (!notifyEnabled()) return html``;
  const n = getMessages().notifications;
  const texts = { key: vapidKey(), asking: n.asking, enabled: n.enabled, denied: n.denied, error: n.error };
  return html`<script>var OS_N=${jsonForScript(texts)};${raw(NOTIFY_SCRIPT)}</script>`;
}
