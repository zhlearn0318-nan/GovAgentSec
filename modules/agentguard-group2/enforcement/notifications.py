"""Synthetic notification submission registry; never sends network messages."""
from .tickets import compute_action_digest

RECIPIENTS = frozenset({'duty_office', 'synthetic_external_office'})
TEMPLATES = frozenset({'typhoon_notice'})


def notice_action(recipient, template_id):
    if recipient not in RECIPIENTS or template_id not in TEMPLATES:
        raise ValueError('送审目标或模板不可用')
    return {'tool': 'notification.submit', 'operation': 'submit',
            'resource': 'demo://emergency-notice/outbox',
            'parameters': {'recipient': recipient, 'template_id': template_id, 'item_count': 1},
            'risk_level': 'high', 'data_level': 'internal'}


def validate_notice_action(action):
    p = action.get('parameters', {})
    if action != notice_action(p.get('recipient'), p.get('template_id')):
        raise ValueError('送审动作不可用')


def submit_notice(connection, request):
    validate_notice_action(request['action'])
    if request.get('approval', {}).get('status') != 'approved':
        raise ValueError('送审必须先审批')
    p = request['action']['parameters']
    connection.execute('CREATE TABLE IF NOT EXISTS notice_outbox (digest TEXT PRIMARY KEY, recipient TEXT, template_id TEXT)')
    connection.execute('INSERT INTO notice_outbox VALUES (?,?,?)',
                       (compute_action_digest(request), p['recipient'], p['template_id']))
    connection.commit()
    return {'adapter': 'synthetic_notice_outbox', 'status': 'submitted_test_only', 'synthetic': True,
            'external_delivery': False, 'side_effect': True}
