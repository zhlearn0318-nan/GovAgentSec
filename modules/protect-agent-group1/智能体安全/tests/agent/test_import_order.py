import subprocess
import sys
import unittest
from pathlib import Path


class PackageImportTests(unittest.TestCase):
    def test_policy_can_be_imported_first_in_a_clean_process(self) -> None:
        project_root = Path(__file__).resolve().parents[2]

        completed = subprocess.run(
            [
                sys.executable,
                "-c",
                (
                    "from policy.policy_engine import PolicyEngine; "
                    "from agent.agent import SecurityAgent"
                ),
            ],
            cwd=project_root,
            capture_output=True,
            text=True,
            check=False,
        )

        self.assertEqual(completed.returncode, 0, completed.stderr)


if __name__ == "__main__":
    unittest.main()
