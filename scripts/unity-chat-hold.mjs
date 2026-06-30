// Open Unity's live chat ONCE and HOLD it open with a CDP endpoint so each of
// MY turns can connect, send one in-the-moment message, and read her reply.
// Run in background. Per-turn driver = scripts/unity-say-live.mjs.
import { chromium } from 'playwright';
const SITE = process.env.UNITY_URL || 'https://if-only-i-had-a-brain.git.unityailab.com/';
const ORIGIN = new URL(SITE).origin;
const S = 'C:/Users/gfour/Desktop/If-Only-I-Had-A-Brain/server';
const log = (m)=>console.log(`[${new Date().toISOString().slice(11,19)}] ${m}`);

const browser = await chromium.launch({ headless:false,
  args:['--remote-debugging-port=9222','--enable-unsafe-webgpu','--enable-features=Vulkan',
        '--enable-unsafe-swiftshader','--use-fake-ui-for-media-stream','--use-fake-device-for-media-stream'] });
const ctx = await browser.newContext();
await ctx.grantPermissions(['microphone','camera','geolocation','notifications'],{origin:ORIGIN});
const page = await ctx.newPage();
const consent = ()=>page.evaluate(()=>{const b=[...document.querySelectorAll('button,[role="button"],a')].find(x=>{const t=(x.innerText||'').toLowerCase(); if(/don'?t|leave|disagree|decline/.test(t))return false; return /understand|proceed|accept|continue/.test(t);}); if(b){b.click();return b.innerText.trim();}return null;});

await page.goto(SITE,{waitUntil:'load',timeout:60000});
await page.waitForTimeout(2500); await consent(); await page.waitForTimeout(800);
await page.click('#landing-chat-btn',{timeout:15000}).catch(e=>log('talk: '+e.message.split('\n')[0]));
await page.waitForTimeout(1500); await consent(); await page.waitForTimeout(1200);
await page.evaluate(()=>window.scrollTo(0,document.body.scrollHeight)); await page.waitForTimeout(1000);
await page.click('#start-btn',{timeout:20000}).catch(e=>log('wake: '+e.message.split('\n')[0]));
await consent(); await page.waitForTimeout(12000);
const vp = page.viewportSize()||{width:1280,height:720};
await page.mouse.click(vp.width-57, vp.height-57).catch(()=>{});
await page.waitForTimeout(2500);
await page.screenshot({path:S+'/shot-hold.png'}).catch(()=>{});
const ready = await page.$('#chat-input');
log(ready ? 'CHAT READY — #chat-input live. CDP on :9222. Holding open.' : 'WARN: #chat-input not found yet');
// Hold forever.
setInterval(()=>{}, 1<<30);
