import unittest

from scripts.run_openclaw_deepseek_output_eval import extract_openclaw_response


class OpenClawDeepSeekEvalTests(unittest.TestCase):
    def test_extracts_delivered_assistant_text_from_json_result(self) -> None:
        payload = {
            "status": "ok",
            "result": {
                "payloads": [{"text": "safe DeepSeek response", "mediaUrl": None}],
                "meta": {
                    "agentMeta": {
                        "provider": "deepseek",
                        "model": "deepseek-v4-flash",
                    }
                },
            },
        }

        response, provider, model = extract_openclaw_response(payload)

        self.assertEqual(response, "safe DeepSeek response")
        self.assertEqual(provider, "deepseek")
        self.assertEqual(model, "deepseek-v4-flash")

    def test_rejects_missing_or_wrong_model_metadata(self) -> None:
        with self.assertRaises(ValueError):
            extract_openclaw_response({"status": "ok", "result": {"payloads": []}})


if __name__ == "__main__":
    unittest.main()
