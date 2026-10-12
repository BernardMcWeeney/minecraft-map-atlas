const {chromium}=require('playwright');
const originalCount=JSON.parse(require('fs').readFileSync('public/annotations.json','utf8')).features.length;
(async()=>{
const browser=await chromium.launch({executablePath:process.env.ATLAS_CHROMIUM_PATH || '/usr/bin/chromium',headless:true,args:['--no-sandbox']});
const page=await browser.newPage({viewport:{width:1280,height:800}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
try {
 await page.goto('http://127.0.0.1:8787/',{waitUntil:'networkidle'});
 await page.getByRole('button',{name:'Enable editing',exact:true}).waitFor();
 if(await page.locator('#realm-map-toolbar').count())throw Error('Toolbar visible in browse');
 await page.getByRole('button',{name:'Enable editing',exact:true}).click();
 await page.locator('#realm-map-toolbar').waitFor();
 await page.waitForFunction(()=>document.querySelector('#atlas-edit-toggle').disabled===false);
 await page.getByRole('button',{name:'Boundary',exact:true}).click();
 page.once('dialog',d=>d.accept('Browser smoke boundary'));
 await page.mouse.click(450,350);await page.mouse.click(550,350);await page.mouse.dblclick(500,450);
 await page.waitForFunction(()=>JSON.parse(localStorage.getItem('realm-map-annotations-v1')||'{"features":[]}').features.some(f=>f.name==='Browser smoke boundary'));
 const downloadEvent=page.waitForEvent('download');await page.getByRole('button',{name:'Export for Publishing',exact:true}).click();const download=await downloadEvent;
 const saved=await download.path();const exported=JSON.parse(require('fs').readFileSync(saved,'utf8'));
 if(exported.features.length!==originalCount+1)throw Error('Expected all original annotations plus the new boundary');
 await page.getByRole('button',{name:'Finish editing and browse published map',exact:true}).click();await page.waitForFunction(()=>document.querySelector('#atlas-edit-toggle').disabled===false);
 if(await page.locator('#realm-map-toolbar').count())throw Error('Toolbar remains after finish');
 await page.reload({waitUntil:'networkidle'});await page.getByRole('button',{name:'Enable editing',exact:true}).click();await page.waitForFunction(()=>document.querySelector('#atlas-edit-toggle').disabled===false);
 const draft=await page.evaluate(()=>JSON.parse(localStorage.getItem('realm-map-annotations-v1')));
 if(draft.features.length!==originalCount+1)throw Error('Draft lost after refresh');
 await page.setViewportSize({width:390,height:844});
 const bounds=await page.locator('#realm-map-toolbar').boundingBox();if(bounds.x<0||bounds.x+bounds.width>390)throw Error('Mobile toolbar overflow');
 if(errors.length)throw Error(errors.join('; '));
 console.log('Real Chromium/uNmINeD smoke passed: browse, pencil, boundary drawing, full annotation export, finish, draft reload and mobile toolbar bounds.');
}finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
