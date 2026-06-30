// Talk to Unity via the REAL chat window (Gee's exact verified flow):
//   load → consent → click "TALK TO UNITY" (#landing-chat-btn) → scroll down →
//   "WAKE UNITY UP" (#start-btn) → accept perms → click the bottom-right ✓
//   checkmark chat FAB → type my lines into the chat box. Headed, WebGPU +
//   mic/camera perms granted, browser stays open so Gee can watch.
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';
const SITE = process.env.UNITY_URL || 'https://if-only-i-had-a-brain.git.unityailab.com/';
const ORIGIN = new URL(SITE).origin;
const S = 'C:/Users/gfour/Desktop/If-Only-I-Had-A-Brain/server';
const lines = readFileSync(process.argv[2], 'utf8').split('\n').map(x=>x.trim()).filter(Boolean);
const log = (m)=>console.log(`[${new Date().toISOString().slice(11,19)}] ${m}`);

const browser = await chromium.launch({ headless:false,
  args:['--enable-unsafe-webgpu','--enable-features=Vulkan','--enable-unsafe-swiftshader',
        '--use-fake-ui-for-media-stream','--use-fake-device-for-media-stream'] });
const ctx = await browser.newContext();
await ctx.grantPermissions(['microphone','camera','geolocation','notifications'],{origin:ORIGIN});
const page = await ctx.newPage();
page.on('close', ()=>log('!! PAGE CLOSED'));
page.on('crash', ()=>log('!! PAGE CRASHED'));
page.on('pageerror', e=>log('pageerror: '+String(e).split('\n')[0]));
browser.on('disconnected', ()=>log('!! BROWSER DISCONNECTED'));
ctx.on('page', p=>log('!! NEW TAB OPENED: '+p.url()));
const consent = ()=>page.evaluate(()=>{const b=[...document.querySelectorAll('button,[role="button"],a')].find(x=>{const t=(x.innerText||'').toLowerCase(); if(/don'?t|leave|disagree|decline/.test(t))return false; return /understand|proceed|accept|continue/.test(t);}); if(b){b.click();return b.innerText.trim();}return null;}).catch(()=>null);

await page.goto(SITE,{waitUntil:'load',timeout:60000});
await page.waitForTimeout(2500);
log('consent: '+await consent());
await page.waitForTimeout(800);

// 0) TALK TO UNITY — reveals the chat section.
try{ await page.click('#landing-chat-btn',{timeout:15000}); log('clicked TALK TO UNITY'); }
catch(e){ log('talk btn: '+e.message.split('\n')[0]); }
await page.waitForTimeout(1200);
log('consent(after talk): '+await consent());
await page.waitForTimeout(1000);

// 1) scroll all the way down
await page.evaluate(()=>{ window.scrollTo(0,document.body.scrollHeight);
  document.querySelectorAll('*').forEach(e=>{ if(e.scrollHeight>e.clientHeight+50) e.scrollTop=e.scrollHeight; }); }).catch(()=>{});
await page.waitForTimeout(1000);

// 2) WAKE UNITY UP
try{ await page.click('#start-btn',{timeout:20000}); log('clicked WAKE UNITY UP'); }
catch(e){ log('wake: '+e.message.split('\n')[0]); }
await consent();
await page.waitForTimeout(12000); // boot
await page.screenshot({path:S+'/shot-woke.png'}).catch(()=>{});

// 3) click the bottom-right ✓ checkmark chat FAB with a REAL mouse click
// (the pink circle ~57px from each corner edge). JS .click() on the wrapper
// doesn't fire the toggle; a real pointer event at the button center does.
const vp = page.viewportSize() || { width:1280, height:720 };
const cx = vp.width-57, cy = vp.height-57;
await page.mouse.click(cx, cy).catch(()=>{});
log(`real-clicked checkmark FAB at (${cx},${cy})`);
await page.waitForTimeout(3000);
await page.screenshot({path:S+'/shot-chatopen.png'}).catch(()=>{});

// 4) find chat input (pierce shadow DOM) + type my lines
const allInputs = await page.evaluate(()=>{ const out=[]; const walk=(root)=>{
    root.querySelectorAll('textarea,input,[contenteditable]').forEach(e=>{const r=e.getBoundingClientRect();out.push({t:e.tagName,id:e.id,type:e.getAttribute('type')||'',ph:e.getAttribute('placeholder')||'',al:e.getAttribute('aria-label')||'',ce:e.getAttribute('contenteditable')||'',x:Math.round(r.left),y:Math.round(r.top),w:Math.round(r.width),vis:!!e.getClientRects().length});});
    root.querySelectorAll('*').forEach(e=>{if(e.shadowRoot)walk(e.shadowRoot);}); };
  walk(document); return out; }).catch(()=>[]);
log('ALL INPUTS: '+JSON.stringify(allInputs));
const inputSel = await page.evaluate(()=>{ const all=[]; const walk=(root)=>{
    root.querySelectorAll('textarea,[contenteditable="true"],input[type="text"],input:not([type])').forEach(e=>all.push(e));
    root.querySelectorAll('*').forEach(e=>{if(e.shadowRoot)walk(e.shadowRoot);}); };
  walk(document); const vis=all.filter(e=>e.getClientRects().length);
  const p=vis.find(e=>/chat|say|talk|message|ask|type|unity/i.test((e.getAttribute('placeholder')||'')+(e.getAttribute('aria-label')||'')+(e.id||'')))||vis.find(e=>e.tagName==='TEXTAREA')||vis[vis.length-1];
  if(!p)return null; if(!p.id)p.id='uchat-'+Math.floor(performance.now()); return '#'+p.id; }).catch(()=>null);
log('chat input: '+inputSel);
for (const line of (inputSel?lines:[])){
  try{ await page.click(inputSel); await page.fill(inputSel,line).catch(async()=>{await page.keyboard.type(line,{delay:6});});
    await page.keyboard.press('Enter'); log('SENT → '+line.slice(0,70)); await page.waitForTimeout(17500);
  }catch(e){ log('send failed: '+e.message.split('\n')[0]); break; }
}
await page.screenshot({path:S+'/shot-convo.png',fullPage:true}).catch(()=>{});
log('done — open 8s'); await page.waitForTimeout(8000); await browser.close();
