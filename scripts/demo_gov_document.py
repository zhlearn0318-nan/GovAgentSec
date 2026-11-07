"""Isolated synthetic-data demo with real OPA, HMAC, ticket ledger and adapter."""
import json
import copy
from test_gov_document import Documents

case=Documents();case.setUp()
try:
    g=case.gateway
    def show(label, result):
        print(json.dumps({'case':label,'status':result['status'],'reason':result['reason_code'],
                          'rules':result.get('policy_reason_codes',[]),'read_count':case.reader.read_count},ensure_ascii=False))
    show('合成公开通知放行',g.invoke(case.request()))
    show('普通身份读取 secret',g.invoke(case.request('command_contacts',1)))
    show('受保护资源',g.invoke(case.request('protected_resource',1)))
    request=case.request('duty_contacts')
    show('机密文档等待审批',g.invoke(request))
    case.approve(request)
    authorization=g.authorize(request)
    show('合法审批一次执行',g.dispatch(request,authorization['ticket']))
    show('执行票据重放',g.dispatch(request,authorization['ticket']))
    changed=copy.deepcopy(request);changed['action']['data_level']='public'
    show('审批后篡改',g.dispatch(changed,authorization['ticket']))
finally:case.doCleanups()
