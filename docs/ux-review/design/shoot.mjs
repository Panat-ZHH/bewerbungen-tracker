// Design review screenshots. Stubbed Supabase (nothing real). Usage: node shoot.mjs
import { mkdirSync } from "node:fs";
const H = process.env.HOME;
const { chromium } = await import(`${H}/.npm/_npx/705bc6b22212b352/node_modules/playwright-core/index.mjs`);
const CHROME = `${H}/Library/Caches/ms-playwright/chromium-1248/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing`;
const OUT = `${H}/Projects/bewerbungen-tracker/docs/ux-review/design/`;
const main = await import(`${H}/Projects/bewerbungen-tracker/scripts/lib/mock-supabase.mjs`);
const teach = await import(`${H}/Projects/bewerbungen-tracker-wt/teacher-role/scripts/lib/mock-supabase.mjs`);
const B_MAIN = "http://localhost:3411", B_T = "http://localhost:3413";
const names = ["Swisscom","UBS","Migros","Google","Post","ZKB","SBB","Roche"], pos = ["Applikationsentwickler:in EFZ","Praktikum Finanzen","Informatikerin EFZ","Software Engineering Intern","Mediamatikerin","Kaufmann/-frau EFZ","Lokführer:in","Laborant:in"];
const filled = (m) => Array.from({length:8},(_,i)=>m.makeApplication(i+1,{company:names[i],position:pos[i],notes:"Rückruf am Donnerstag."}));
const profile = { full_name:"Lena Müller", location:"Bern", target_roles:["Informatikerin EFZ"], skills:["React"], bio:"Ich suche eine Lehrstelle." };
const R = (name,path,o={}) => ({name,path,...o});
const S = [ // [name, path, teacherBuild?, mockOpts, kind]
  R("01-landing","/",{mock:{authed:false}}),
  R("02-login","/login",{mock:{authed:false}}),
  R("03-dashboard-empty","/dashboard",{mock:{apps:[]}}),
  R("04-dashboard","/dashboard",{f:1}),
  R("05-search","/search",{f:1}),
  R("06-applications","/applications",{f:1}),
  R("07-application-detail","/applications/a1",{f:1}),
  R("08-application-new","/applications/new",{f:1}),
  R("09-map","/map",{f:1,kind:"map"}),
  R("10-friends","/friends",{f:1}),
  R("11-settings","/settings",{f:1}),
  R("12-profile","/profile",{f:1,pr:1}),
  R("13-analytics","/analytics",{f:1}),
  R("14-cvs","/cvs",{f:1}),
  R("20-classes-student","/classes",{f:1,t:1,role:"student"}),
  R("21-class-join","/classes/join",{t:1,role:"student",f:1}),
  R("22-classes-teacher","/classes",{t:1,role:"teacher"}),
  R("23-class-detail-teacher","/classes/c1",{t:1,role:"teacher"}),
  R("24-teacher-dashboard","/dashboard",{t:1,role:"teacher"}),
  R("25-teacher-settings","/settings",{t:1,role:"teacher"}),
  R("26-404","/gibt-es-nicht",{mock:{apps:[]}}),
];
const VP = [["desktop",1280,800,false],["iphone",390,844,true]];
const browser = await chromium.launch({executablePath:CHROME,args:["--use-gl=angle","--use-angle=swiftshader","--enable-unsafe-swiftshader","--ignore-gpu-blocklist"]});
const log=[]; 
async function one(s,[vn,w,h,mob],dark){
  const m = s.t?teach:main;
  const mo = {...(s.mock||{}),...(s.role?{role:s.role}:{}),...(s.f?{apps:filled(m),cvs:[]}:{}),...(s.pr?{profile}:{})};
  const ctx = await browser.newContext({viewport:{width:w,height:h},hasTouch:mob,isMobile:mob,deviceScaleFactor:mob?2:1,colorScheme:dark?"dark":"light"});
  await ctx.addInitScript(([t])=>localStorage.setItem("wendapply-theme",t),[dark?"dark":"light"]);
  await m.createMockSupabase(mo).install(ctx);
  ctx.setDefaultTimeout(90000);
  const page = await ctx.newPage(); const errs=[]; page.on("pageerror",e=>errs.push(e.message.slice(0,120)));
  const f=`${OUT}${s.name}-${vn}-${dark?"dark":"light"}.png`;
  try{
    await page.goto((s.t?B_T:B_MAIN)+s.path,{waitUntil:"load"});
    if(s.kind==="map") {await page.waitForSelector("[data-map-fullscreen] canvas, [data-map-fullscreen] [data-map-renderer]",{timeout:90000}); await page.waitForTimeout(2500);}
    else {await page.waitForLoadState("networkidle").catch(()=>{}); await page.waitForTimeout(1200);}
    await page.addStyleTag({content:"nextjs-portal{display:none!important}"});
    const url=page.url().replace(/https?:\/\/[^/]+/,"");
    await page.screenshot({path:f,fullPage:s.kind!=="map"});
    log.push(`${s.name} ${vn} ${dark?"dark":"light"} -> ${url}${errs.length?" ERR "+errs[0]:""}`);
  }catch(e){log.push(`${s.name} ${vn} FAIL ${e.message.slice(0,100)}`)}
  await ctx.close();
}
const jobs=[]; for(const s of S)for(const v of VP)for(const d of [false,true])jobs.push(()=>one(s,v,d));
let i=0; await Promise.all(Array.from({length:3},async()=>{while(i<jobs.length)await jobs[i++]()}));
await browser.close(); console.log(log.sort().join("\n"));
