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
  await page.waitForFunction(({workspace,section})=>workspace.current===({home:'permissions',login:'permissions',approvals:'permissions'}[section]??section),
    {workspace:await page.locator('govagentsec-workspace').elementHandle(),section});
}
export async function openSyntheticPanel(page) {
  await goWorkspace(page,'permissions');
  const details=page.locator('govagentsec-workspace').getByLabel('合成业务演示',{exact:true});
  if(await details.count()&&!await details.evaluate(el=>el.open))await details.locator('summary').click();
  await page.locator('govagentsec-workspace').getByRole('combobox',{name:'审批筛选',exact:true}).selectOption('all');
}
export async function loginDemo(page,user,{returnToSettings=true}={}) {
  const accounts={'office-test':['jingban','Demo#Jingban26'],'approver-test':['shenpi','Demo#Shenpi26'],'maintenance-test':['weihu','Demo#Weihu26'],'auditor-test':['shenji','Demo#Shenji26']};
  const credentials=accounts[user];if(!credentials)throw Error('NO_U25_DEMO_ACCOUNT_FOR_SUBJECT');
  await goWorkspace(page,'permissions');
  const current=await identityView(page);
  const card=page.locator('govagentsec-workspace').getByRole('region',{name:'演示身份源',exact:true});
  if(current.user)await card.getByRole('button',{name:'切换账号',exact:true}).click();
  await card.getByRole('textbox',{name:'账号',exact:true}).fill(credentials[0]);
  await card.getByLabel('密码',{exact:true}).fill(credentials[1]);
  await card.getByRole('button',{name:'登录',exact:true}).click();
  await card.getByRole('region',{name:'当前员工',exact:true}).waitFor();
  const actual=await identityView(page);if(actual.user?.id!==user)throw Error('UI_DELEGATE_USER_MISMATCH');
  if(returnToSettings)await openSyntheticPanel(page);
}
