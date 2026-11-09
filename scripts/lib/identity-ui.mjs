// Test helpers use the same page-memory delegate as the product, never a token getter.
export async function identityView(page, operation='refresh', payload={}) {
  return page.locator('openclaw-app-shell').evaluate(async(el,{operation,payload})=>{
    const {getIdentitySession}=await import('/plugins/govagentsec/identity-session.mjs');
    const session=getIdentitySession(el.context.gateway.snapshot.client);
    if(operation==='snapshot')return session.snapshot();
    if(operation==='refresh')return session.refresh();
    return session.request(operation,payload);
  },{operation,payload});
}
export async function goWorkspace(page, section, extra='') {
  // Chat startup can expose the gateway before the plugin shell has mounted.
  await page.locator('govagentsec-shell .inspect').waitFor();
  await page.waitForFunction(shell=>shell.isConnected&&typeof shell.navigate==='function'&&shell.shadowRoot?.querySelector('.dock'),
    await page.locator('govagentsec-shell').elementHandle());
  await page.evaluate(({section,extra})=>window.dispatchEvent(new CustomEvent('gov-navigate',{
    detail:{section,requestId:new URLSearchParams(extra).get('request')},
  })),{section,extra});
  await page.locator('govagentsec-workspace').waitFor();
  await page.waitForFunction(({workspace,section})=>workspace.current===section,
    {workspace:await page.locator('govagentsec-workspace').elementHandle(),section});
}
export async function openSyntheticPanel(page) {
  await goWorkspace(page,'settings');
  const details=page.locator('govagentsec-workspace').getByLabel('合成业务演示',{exact:true});
  await details.waitFor();
  if(!await details.evaluate(el=>el.open))await details.locator('summary').click();
  await page.locator('govagentsec-workspace').getByRole('combobox',{name:'审批筛选',exact:true}).selectOption('all');
}
export async function loginDemo(page,user,{returnToSettings=true}={}) {
  await goWorkspace(page,'login');
  const card=page.locator('govagentsec-workspace').getByRole('region',{name:'演示身份源',exact:true});
  await card.getByRole('combobox',{name:'选择演示用户'}).selectOption(user);
  await card.getByRole('button',{name:'进入工作台',exact:true}).click();
  await page.locator('govagentsec-workspace').getByRole('heading',{name:'工作台',exact:true}).waitFor();
  const actual=await identityView(page);if(actual.user?.id!==user)throw Error('UI_DELEGATE_USER_MISMATCH');
  if(returnToSettings)await openSyntheticPanel(page);
}
