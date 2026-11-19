'use strict';

// Tests with the stock debug tap guard disabled require no wait. Keep UI input
// real; do not bypass the chooser by mutating the session in a page script.
module.exports=async function startWithCompanion(page,{touch=false,waitForGuard=false}={}){
 const activate=element=>touch?element.tap():element.click();
 await activate(page.locator('#bStart'));
 const dialog=page.locator('#companionPick[open]');
 if(await dialog.count()){
  if(waitForGuard)await page.waitForFunction(()=>!window.__pz.state().guarded);
  await activate(dialog.locator('button[data-cat-id="white"]'));
 }
};
