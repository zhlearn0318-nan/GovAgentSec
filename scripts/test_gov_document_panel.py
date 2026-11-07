"""HTTP suite integration: real OPA, signer, one-use ledger, Wasm and audit."""
import json
from pathlib import Path
import sys
import tempfile
import unittest
from urllib.error import HTTPError
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parents[1] / "modules/agentguard-group2"
sys.path.insert(0, str(ROOT))
from service.app import AgentGuardService
from service.config import ServiceConfig


class GovDocumentPanel(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.service = AgentGuardService(
            ServiceConfig(port=0, opa_mode="cli", state_dir=self.temp.name,
                          enable_local_adapters=True, allow_development_identity=False),
            environ={"AGENTGUARD_TICKET_SECRET_HEX": "ab" * 32},
        ).start()
        self.addCleanup(self.service.close)

    def post(self, path="/demo/gov-documents", headers=None):
        req = Request(self.service.base_url + path, data=b"{}",
                      headers={"Content-Type": "application/json", **(headers or {})})
        try:
            response = urlopen(req, timeout=30)
        except HTTPError as exc:
            response = exc
        with response:
            return response.status, json.loads(response.read().decode("utf-8"))

    def test_live_gateway_suite_and_utf8_audit(self):
        self.assertEqual(self.post("/invoke")[1]["reason_code"], "S006_BUSINESS_IDENTITY_DISABLED")
        status, payload = self.post()
        self.assertEqual(status, 200)
        self.assertEqual(payload["demo_identity"], "本机演示身份")
        rows = payload["results"]
        self.assertEqual([r["reason_code"] for r in rows], [
            "G000_EXECUTED", "G002_POLICY_DENY", "G002_POLICY_DENY", "G003_APPROVAL_PENDING",
            "G000_EXECUTED", "G206_TICKET_REPLAY", "G205_TICKET_BINDING_MISMATCH",
        ])
        for index, code in [(1, "D004_CLEARANCE_INSUFFICIENT"), (2, "D005_PROTECTED_RESOURCE"), (3, "A004_SENSITIVE_DATA")]:
            self.assertIn(code, rows[index]["policy_reason_codes"])
        self.assertEqual([r["executed"] for r in rows], [True, False, False, False, True, False, False])
        self.assertEqual(rows[3]["task_id"], rows[4]["task_id"])
        self.assertEqual(rows[3]["action_digest"], rows[4]["receipt"]["action_digest"])
        for row in rows:
            if not row["executed"]:
                self.assertIsNone(row["receipt"])
        self.assertEqual(self.service.gateway.business_adapters.documents.read_count, 2)
        raw = (Path(self.temp.name) / "enforcement_audit.jsonl").read_text(encoding="utf-8")
        self.assertIn("审批后篡改绑定", raw)
        self.assertNotIn("document_content", raw)
        self.assertNotIn("�", raw)
        events = [json.loads(line) for line in raw.splitlines()]
        events = [e for e in events if e.get("demo_run_id") == payload["demo_run_id"]]
        self.assertEqual(len({e["request_id"] for e in events}), 7)
        for event in events:
            self.assertEqual(event["event"], "enforcement_decision")
            self.assertEqual(event["identity_note"], "本机演示身份")
            self.assertTrue(event["document_id"])
            self.assertTrue(event["scenario"])
            self.assertIn("policy_reason_codes", event["result"])
            if event["result"]["status"] == "blocked":
                self.assertFalse(event["result"]["executed"])
                self.assertIsNone(event["result"]["receipt"])

    def test_local_and_browser_boundary(self):
        self.assertEqual(self.post(headers={"Origin": "http://127.0.0.1:8080"})[0], 403)
        self.assertEqual(self.post(headers={"Content-Type": "text/plain"})[0], 403)
        # A loopback caller still cannot use the demo on a publicly bound server.
        self.service._server.server_address = ("0.0.0.0", self.service.port)
        self.assertEqual(self.post()[1]["reason_code"], "S024_LOCAL_DEMO_ONLY")
        self.assertEqual(self.service.gateway.business_adapters.documents.read_count, 0)


if __name__ == "__main__":
    unittest.main()
