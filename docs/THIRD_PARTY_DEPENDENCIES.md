# 第三方依赖版本与许可依据明细

更新日期：2026-11-02。配套主声明：[THIRD_PARTY_NOTICES.md](../THIRD_PARTY_NOTICES.md)。

本附表按 8 份 Python 锁 / 约束文件及 1 份 pnpm 锁文件逐项生成，共 475 条环境记录、347 个不同生态 / 包名 / 版本组合。跨环境重复条目保留，不代表同样数量的独立软件项目。

## 阅读与核对范围

- 版本来自仓库锁文件，不宣称所有条目均已安装。Python 条件标记与 Node 跨平台可选包约束原样保留。
- 许可证记录来自对应精确版本的官方 PyPI / npm 发布者元数据；对未提供有效字段的个别项目，改用对应上游版本 LICENSE。
- `declared` 表示发布者许可字段；`classifier-declaration` 表示发布者 License classifiers（多项以分号列出，不能自行解释为 AND 或 OR）；`upstream-license` 表示引用上游版本许可证；`upstream-core-license` 只覆盖核心代码，二进制制品自带声明另适用。
- 许可名称保留发布者原值，BSD、GPL 等未指明子版本的声明不擅自细化为某个 SPDX 标识。此表不代替发布包中的完整许可证与 NOTICE。
- Cisco 扫描器锁、安全覆盖约束与后端锁可能先后作用于同一环境；各文件中的版本分别展示，不把原始锁记录误称为覆盖后的单一已安装版本。
- CI 锁文件的 `-r requirements-dev.lock` 引用由独立的 `aegis-dev` 分组覆盖；`aegis-ci` 分组只列本文件另加的项目。
- 不重复展开单独安装的 OpenClaw、DeepSeek Harness、Docker Desktop、CUDA 或整个容器操作系统的软件包树；这些外部制品应保留其自带第三方清单。主要来源及固定镜像摘要见主声明。
- 不把漏洞演示 fixtures 的模拟依赖、个人缓存或运行日志纳入部署依赖。

## 分组与锁文件校验

| 分组 | 条目数 | 仓库来源 | SHA-256 |
| --- | ---: | --- | --- |
| `protect` | 38 | [requirements-protect-lock.txt](../requirements-protect-lock.txt) | `7534cbc116f31a7d2f9b6fbca25971eafd3349fcc1d533c74c8e33727e478b19` |
| `agentguard` | 61 | [modules/agentguard-group2/requirements-lock.txt](../modules/agentguard-group2/requirements-lock.txt) | `33b852e5ad31679697ea034ae3e493c3c2f7ec90b6f3e4b28fc08ab0c0c0c2eb` |
| `aegis-backend` | 16 | [modules/aegis/demo_web/backend/requirements.lock](../modules/aegis/demo_web/backend/requirements.lock) | `64830f79c2c7a14a2f96fb6eae09d72dd744c0c4415a8e6b873e2ddccb285eaa` |
| `aegis-security-overrides` | 17 | [modules/aegis/demo_web/backend/runtime-security.lock](../modules/aegis/demo_web/backend/runtime-security.lock) | `c9e7068a2461b5581bbb10382a2542445703f20b4869f9a995598a012c5606b0` |
| `aegis-dev` | 29 | [modules/aegis/demo_web/backend/requirements-dev.lock](../modules/aegis/demo_web/backend/requirements-dev.lock) | `5f6334fd37ab223b0dfffa0325d81451daa13a768a505bbdf14c5efd40b89ffa` |
| `aegis-ci` | 1 | [modules/aegis/demo_web/backend/requirements-ci.lock](../modules/aegis/demo_web/backend/requirements-ci.lock) | `19c4046151f7b347c22d00e8364545fa1b16ad723f0a8ea6612d52f716a205bf` |
| `cisco-skill-dependencies` | 138 | [modules/aegis/results/skill_scanner_locked_requirements.txt](../modules/aegis/results/skill_scanner_locked_requirements.txt) | `928b878ee1fbf6cbd6f18583a68a797764c67206a004e1295c5205be97ee2005` |
| `cisco-mcp-dependencies` | 125 | [modules/aegis/results/mcp_scanner_locked_requirements.txt](../modules/aegis/results/mcp_scanner_locked_requirements.txt) | `640a5fcbe9712640215d12a0bb38013723e2f4d233067cc8fad78278c114c569` |
| `aegis-frontend-all-locked-platforms` | 50 | [modules/aegis/demo_web/frontend/pnpm-lock.yaml](../modules/aegis/demo_web/frontend/pnpm-lock.yaml) | `4f09a3db0acada9e5dc44546f132ba237d55dfb7846fd6a87d7d7eca83ad11b0` |

## 逐项明细

### protect

| 包名 | 锁定版本 | 平台 / 条件标记 | 上游许可声明 | 依据类型 | 版本证据 |
| --- | --- | --- | --- | --- | --- |
| `absl-py` | `2.5.0` | — | Apache-2.0 | `declared` | [上游元数据 / LICENSE](https://pypi.org/pypi/absl-py/2.5.0/json) |
| `certifi` | `2026.7.22` | — | MPL-2.0 | `declared` | [上游元数据 / LICENSE](https://pypi.org/pypi/certifi/2026.7.22/json) |
| `charset-normalizer` | `3.5.1` | — | MIT | `declared` | [上游元数据 / LICENSE](https://pypi.org/pypi/charset-normalizer/3.5.1/json) |
| `click` | `8.5.0` | — | BSD-3-Clause | `declared` | [上游元数据 / LICENSE](https://pypi.org/pypi/click/8.5.0/json) |
| `cloudpickle` | `3.1.2` | — | BSD-3-Clause | `declared` | [上游元数据 / LICENSE](https://pypi.org/pypi/cloudpickle/3.1.2/json) |
| `colorama` | `0.4.6` | — | BSD License | `classifier-declaration` | [上游元数据 / LICENSE](https://pypi.org/pypi/colorama/0.4.6/json) |
| `einops` | `0.8.1` | — | MIT | `declared` | [上游元数据 / LICENSE](https://pypi.org/pypi/einops/0.8.1/json) |
| `filelock` | `3.32.6` | — | MIT | `declared` | [上游元数据 / LICENSE](https://pypi.org/pypi/filelock/3.32.6/json) |
| `fsspec` | `2026.7.0` | — | BSD-3-Clause | `upstream-license` | [上游元数据 / LICENSE](https://github.com/fsspec/filesystem_spec/blob/2026.7.0/LICENSE) |
| `huggingface_hub` | `0.36.2` | — | Apache | `declared` | [上游元数据 / LICENSE](https://pypi.org/pypi/huggingface_hub/0.36.2/json) |
| `idna` | `3.19` | — | BSD-3-Clause | `declared` | [上游元数据 / LICENSE](https://pypi.org/pypi/idna/3.19/json) |
| `Jinja2` | `3.1.6` | — | BSD License | `classifier-declaration` | [上游元数据 / LICENSE](https://pypi.org/pypi/jinja2/3.1.6/json) |
| `joblib` | `1.6.0` | — | BSD-3-Clause | `declared` | [上游元数据 / LICENSE](https://pypi.org/pypi/joblib/1.6.0/json) |
| `MarkupSafe` | `3.0.3` | — | BSD-3-Clause | `declared` | [上游元数据 / LICENSE](https://pypi.org/pypi/markupsafe/3.0.3/json) |
| `mpmath` | `1.3.0` | — | BSD | `declared` | [上游元数据 / LICENSE](https://pypi.org/pypi/mpmath/1.3.0/json) |
| `networkx` | `3.6.1` | — | BSD-3-Clause | `declared` | [上游元数据 / LICENSE](https://pypi.org/pypi/networkx/3.6.1/json) |
| `nltk` | `3.9.1` | — | Apache License, Version 2.0 | `declared` | [上游元数据 / LICENSE](https://pypi.org/pypi/nltk/3.9.1/json) |
| `numpy` | `1.26.4` | — | BSD License | `classifier-declaration` | [上游元数据 / LICENSE](https://pypi.org/pypi/numpy/1.26.4/json) |
| `packaging` | `26.3` | — | Apache-2.0 OR BSD-2-Clause | `declared` | [上游元数据 / LICENSE](https://pypi.org/pypi/packaging/26.3/json) |
| `protobuf` | `5.29.4` | — | 3-Clause BSD License | `declared` | [上游元数据 / LICENSE](https://pypi.org/pypi/protobuf/5.29.4/json) |
| `PyYAML` | `6.0.3` | — | MIT | `declared` | [上游元数据 / LICENSE](https://pypi.org/pypi/pyyaml/6.0.3/json) |
| `regex` | `2026.9.10` | — | Apache-2.0 AND CNRI-Python | `declared` | [上游元数据 / LICENSE](https://pypi.org/pypi/regex/2026.9.10/json) |
| `requests` | `2.32.4` | — | Apache-2.0 | `declared` | [上游元数据 / LICENSE](https://pypi.org/pypi/requests/2.32.4/json) |
| `rouge_score` | `0.1.2` | — | Apache Software License | `classifier-declaration` | [上游元数据 / LICENSE](https://pypi.org/pypi/rouge_score/0.1.2/json) |
| `safetensors` | `0.8.0` | — | Apache Software License | `classifier-declaration` | [上游元数据 / LICENSE](https://pypi.org/pypi/safetensors/0.8.0/json) |
| `scikit-learn` | `1.6.1` | — | BSD License | `classifier-declaration` | [上游元数据 / LICENSE](https://pypi.org/pypi/scikit-learn/1.6.1/json) |
| `scipy` | `1.17.1` | — | BSD License | `classifier-declaration` | [上游元数据 / LICENSE](https://pypi.org/pypi/scipy/1.17.1/json) |
| `sentencepiece` | `0.2.0` | — | Apache | `declared` | [上游元数据 / LICENSE](https://pypi.org/pypi/sentencepiece/0.2.0/json) |
| `setuptools` | `84.0.0` | — | MIT | `declared` | [上游元数据 / LICENSE](https://pypi.org/pypi/setuptools/84.0.0/json) |
| `six` | `1.17.0` | — | MIT | `declared` | [上游元数据 / LICENSE](https://pypi.org/pypi/six/1.17.0/json) |
| `sympy` | `1.13.1` | — | BSD | `declared` | [上游元数据 / LICENSE](https://pypi.org/pypi/sympy/1.13.1/json) |
| `threadpoolctl` | `3.6.0` | — | BSD-3-Clause | `declared` | [上游元数据 / LICENSE](https://pypi.org/pypi/threadpoolctl/3.6.0/json) |
| `tokenizers` | `0.21.4` | — | Apache Software License | `classifier-declaration` | [上游元数据 / LICENSE](https://pypi.org/pypi/tokenizers/0.21.4/json) |
| `torch` | `2.6.0+cu124` | — | BSD-style PyTorch core; bundled binary notices also apply | `upstream-core-license` | [上游元数据 / LICENSE](https://github.com/pytorch/pytorch/blob/v2.6.0/LICENSE) |
| `tqdm` | `4.70.1` | — | MPL-2.0 AND MIT | `declared` | [上游元数据 / LICENSE](https://pypi.org/pypi/tqdm/4.70.1/json) |
| `transformers` | `4.51.3` | — | Apache 2.0 License | `declared` | [上游元数据 / LICENSE](https://pypi.org/pypi/transformers/4.51.3/json) |
| `typing_extensions` | `4.16.0` | — | PSF-2.0 | `declared` | [上游元数据 / LICENSE](https://pypi.org/pypi/typing-extensions/4.16.0/json) |
| `urllib3` | `2.7.0` | — | MIT | `declared` | [上游元数据 / LICENSE](https://pypi.org/pypi/urllib3/2.7.0/json) |

### agentguard

| 包名 | 锁定版本 | 平台 / 条件标记 | 上游许可声明 | 依据类型 | 版本证据 |
| --- | --- | --- | --- | --- | --- |
| `aiosqlite` | `0.22.1` | — | MIT License | `classifier-declaration` | [上游元数据 / LICENSE](https://pypi.org/pypi/aiosqlite/0.22.1/json) |
| `annotated-types` | `0.8.0` | — | MIT | `declared` | [上游元数据 / LICENSE](https://pypi.org/pypi/annotated-types/0.8.0/json) |
| `anyio` | `4.14.2` | — | MIT | `declared` | [上游元数据 / LICENSE](https://pypi.org/pypi/anyio/4.14.2/json) |
| `attrs` | `26.1.0` | — | MIT | `declared` | [上游元数据 / LICENSE](https://pypi.org/pypi/attrs/26.1.0/json) |
| `certifi` | `2026.7.22` | — | MPL-2.0 | `declared` | [上游元数据 / LICENSE](https://pypi.org/pypi/certifi/2026.7.22/json) |
| `cffi` | `2.1.1` | — | MIT-0 | `declared` | [上游元数据 / LICENSE](https://pypi.org/pypi/cffi/2.1.1/json) |
| `charset-normalizer` | `3.5.0` | — | MIT | `declared` | [上游元数据 / LICENSE](https://pypi.org/pypi/charset-normalizer/3.5.0/json) |
| `click` | `8.5.0` | — | BSD-3-Clause | `declared` | [上游元数据 / LICENSE](https://pypi.org/pypi/click/8.5.0/json) |
| `cryptography` | `50.0.0` | — | Apache-2.0 OR BSD-3-Clause | `declared` | [上游元数据 / LICENSE](https://pypi.org/pypi/cryptography/50.0.0/json) |
| `distro` | `1.9.0` | — | Apache License, Version 2.0 | `declared` | [上游元数据 / LICENSE](https://pypi.org/pypi/distro/1.9.0/json) |
| `h11` | `0.16.0` | — | MIT | `declared` | [上游元数据 / LICENSE](https://pypi.org/pypi/h11/0.16.0/json) |
| `httpcore` | `1.0.9` | — | BSD-3-Clause | `declared` | [上游元数据 / LICENSE](https://pypi.org/pypi/httpcore/1.0.9/json) |
| `httpcore2` | `2.12.0` | — | BSD-3-Clause | `declared` | [上游元数据 / LICENSE](https://pypi.org/pypi/httpcore2/2.12.0/json) |
| `httpx` | `0.28.1` | — | BSD-3-Clause | `declared` | [上游元数据 / LICENSE](https://pypi.org/pypi/httpx/0.28.1/json) |
| `httpx2` | `2.12.0` | — | BSD-3-Clause | `declared` | [上游元数据 / LICENSE](https://pypi.org/pypi/httpx2/2.12.0/json) |
| `idna` | `3.18` | — | BSD-3-Clause | `declared` | [上游元数据 / LICENSE](https://pypi.org/pypi/idna/3.18/json) |
| `jsonpatch` | `1.33` | — | Modified BSD License | `declared` | [上游元数据 / LICENSE](https://pypi.org/pypi/jsonpatch/1.33/json) |
| `jsonpointer` | `3.1.1` | — | Modified BSD License | `declared` | [上游元数据 / LICENSE](https://pypi.org/pypi/jsonpointer/3.1.1/json) |
| `jsonschema` | `4.26.0` | — | MIT | `declared` | [上游元数据 / LICENSE](https://pypi.org/pypi/jsonschema/4.26.0/json) |
| `jsonschema-specifications` | `2025.9.1` | — | MIT | `declared` | [上游元数据 / LICENSE](https://pypi.org/pypi/jsonschema-specifications/2025.9.1/json) |
| `langchain-core` | `1.5.4` | — | MIT | `declared` | [上游元数据 / LICENSE](https://pypi.org/pypi/langchain-core/1.5.4/json) |
| `langchain-protocol` | `0.0.18` | — | MIT | `declared` | [上游元数据 / LICENSE](https://pypi.org/pypi/langchain-protocol/0.0.18/json) |
| `langgraph` | `1.2.10` | — | MIT | `declared` | [上游元数据 / LICENSE](https://pypi.org/pypi/langgraph/1.2.10/json) |
| `langgraph-checkpoint` | `4.2.0` | — | MIT | `declared` | [上游元数据 / LICENSE](https://pypi.org/pypi/langgraph-checkpoint/4.2.0/json) |
| `langgraph-checkpoint-sqlite` | `3.1.1` | — | MIT | `declared` | [上游元数据 / LICENSE](https://pypi.org/pypi/langgraph-checkpoint-sqlite/3.1.1/json) |
| `langgraph-prebuilt` | `1.1.0` | — | MIT | `declared` | [上游元数据 / LICENSE](https://pypi.org/pypi/langgraph-prebuilt/1.1.0/json) |
| `langgraph-sdk` | `0.4.2` | — | MIT | `declared` | [上游元数据 / LICENSE](https://pypi.org/pypi/langgraph-sdk/0.4.2/json) |
| `langsmith` | `0.10.15` | — | MIT | `declared` | [上游元数据 / LICENSE](https://pypi.org/pypi/langsmith/0.10.15/json) |
| `mcp` | `2.1.1` | — | MIT | `declared` | [上游元数据 / LICENSE](https://pypi.org/pypi/mcp/2.1.1/json) |
| `mcp-types` | `2.1.1` | — | MIT | `declared` | [上游元数据 / LICENSE](https://pypi.org/pypi/mcp-types/2.1.1/json) |
| `opentelemetry-api` | `1.44.0` | — | Apache-2.0 | `declared` | [上游元数据 / LICENSE](https://pypi.org/pypi/opentelemetry-api/1.44.0/json) |
| `orjson` | `3.11.9` | — | MPL-2.0 AND (Apache-2.0 OR MIT) | `declared` | [上游元数据 / LICENSE](https://pypi.org/pypi/orjson/3.11.9/json) |
| `ormsgpack` | `1.12.2` | — | Apache-2.0 OR MIT | `declared` | [上游元数据 / LICENSE](https://pypi.org/pypi/ormsgpack/1.12.2/json) |
| `packaging` | `26.3` | — | Apache-2.0 OR BSD-2-Clause | `declared` | [上游元数据 / LICENSE](https://pypi.org/pypi/packaging/26.3/json) |
| `pycdlib` | `1.14.0` | — | LGPLv2 | `declared` | [上游元数据 / LICENSE](https://pypi.org/pypi/pycdlib/1.14.0/json) |
| `pycparser` | `3.0` | — | BSD-3-Clause | `declared` | [上游元数据 / LICENSE](https://pypi.org/pypi/pycparser/3.0/json) |
| `pydantic` | `2.13.4` | — | MIT | `declared` | [上游元数据 / LICENSE](https://pypi.org/pypi/pydantic/2.13.4/json) |
| `pydantic-core` | `2.46.4` | — | MIT | `declared` | [上游元数据 / LICENSE](https://pypi.org/pypi/pydantic-core/2.46.4/json) |
| `pyjwt` | `2.10.1` | — | MIT | `declared` | [上游元数据 / LICENSE](https://pypi.org/pypi/pyjwt/2.10.1/json) |
| `python-multipart` | `0.0.32` | — | Apache-2.0 | `declared` | [上游元数据 / LICENSE](https://pypi.org/pypi/python-multipart/0.0.32/json) |
| `pywin32` | `312` | ; sys_platform == 'win32' | PSF | `declared` | [上游元数据 / LICENSE](https://pypi.org/pypi/pywin32/312/json) |
| `pyyaml` | `6.0.3` | — | MIT | `declared` | [上游元数据 / LICENSE](https://pypi.org/pypi/pyyaml/6.0.3/json) |
| `referencing` | `0.37.0` | — | MIT | `declared` | [上游元数据 / LICENSE](https://pypi.org/pypi/referencing/0.37.0/json) |
| `requests` | `2.34.2` | — | Apache-2.0 | `declared` | [上游元数据 / LICENSE](https://pypi.org/pypi/requests/2.34.2/json) |
| `requests-toolbelt` | `1.0.0` | — | Apache 2.0 | `declared` | [上游元数据 / LICENSE](https://pypi.org/pypi/requests-toolbelt/1.0.0/json) |
| `rpds-py` | `2026.6.3` | — | MIT | `declared` | [上游元数据 / LICENSE](https://pypi.org/pypi/rpds-py/2026.6.3/json) |
| `sniffio` | `1.3.1` | — | MIT OR Apache-2.0 | `declared` | [上游元数据 / LICENSE](https://pypi.org/pypi/sniffio/1.3.1/json) |
| `sqlite-vec` | `0.1.9` | — | MIT License, Apache License, Version 2.0 | `declared` | [上游元数据 / LICENSE](https://pypi.org/pypi/sqlite-vec/0.1.9/json) |
| `sse-starlette` | `3.4.8` | — | BSD-3-Clause | `declared` | [上游元数据 / LICENSE](https://pypi.org/pypi/sse-starlette/3.4.8/json) |
| `starlette` | `1.6.0` | — | BSD-3-Clause | `declared` | [上游元数据 / LICENSE](https://pypi.org/pypi/starlette/1.6.0/json) |
| `tenacity` | `9.1.4` | — | Apache 2.0 | `declared` | [上游元数据 / LICENSE](https://pypi.org/pypi/tenacity/9.1.4/json) |
| `truststore` | `0.10.4` | — | MIT | `declared` | [上游元数据 / LICENSE](https://pypi.org/pypi/truststore/0.10.4/json) |
| `typing-extensions` | `4.16.0` | — | PSF-2.0 | `declared` | [上游元数据 / LICENSE](https://pypi.org/pypi/typing-extensions/4.16.0/json) |
| `typing-inspection` | `0.4.4` | — | MIT | `declared` | [上游元数据 / LICENSE](https://pypi.org/pypi/typing-inspection/0.4.4/json) |
| `urllib3` | `2.7.0` | — | MIT | `declared` | [上游元数据 / LICENSE](https://pypi.org/pypi/urllib3/2.7.0/json) |
| `uuid-utils` | `0.17.0` | — | BSD-3-Clause | `declared` | [上游元数据 / LICENSE](https://pypi.org/pypi/uuid-utils/0.17.0/json) |
| `uvicorn` | `0.52.4` | — | BSD-3-Clause | `declared` | [上游元数据 / LICENSE](https://pypi.org/pypi/uvicorn/0.52.4/json) |
| `wasmtime` | `47.0.1` | — | Apache-2.0 WITH LLVM-exception | `declared` | [上游元数据 / LICENSE](https://pypi.org/pypi/wasmtime/47.0.1/json) |
| `websockets` | `15.0.1` | — | BSD-3-Clause | `declared` | [上游元数据 / LICENSE](https://pypi.org/pypi/websockets/15.0.1/json) |
| `xxhash` | `4.0.0` | — | BSD-2-Clause | `declared` | [上游元数据 / LICENSE](https://pypi.org/pypi/xxhash/4.0.0/json) |
| `zstandard` | `0.25.0` | — | BSD-3-Clause | `declared` | [上游元数据 / LICENSE](https://pypi.org/pypi/zstandard/0.25.0/json) |

### aegis-backend

| 包名 | 锁定版本 | 平台 / 条件标记 | 上游许可声明 | 依据类型 | 版本证据 |
| --- | --- | --- | --- | --- | --- |
| `annotated-doc` | `0.0.4` | — | MIT | `declared` | [上游元数据 / LICENSE](https://pypi.org/pypi/annotated-doc/0.0.4/json) |
| `annotated-types` | `0.7.0` | — | MIT License | `classifier-declaration` | [上游元数据 / LICENSE](https://pypi.org/pypi/annotated-types/0.7.0/json) |
| `anyio` | `4.12.0` | — | MIT | `declared` | [上游元数据 / LICENSE](https://pypi.org/pypi/anyio/4.12.0/json) |
| `click` | `8.3.3` | — | BSD-3-Clause | `declared` | [上游元数据 / LICENSE](https://pypi.org/pypi/click/8.3.3/json) |
| `colorama` | `0.4.6` | ; sys_platform == 'win32' | BSD License | `classifier-declaration` | [上游元数据 / LICENSE](https://pypi.org/pypi/colorama/0.4.6/json) |
| `fastapi` | `0.141.1` | — | MIT | `declared` | [上游元数据 / LICENSE](https://pypi.org/pypi/fastapi/0.141.1/json) |
| `h11` | `0.16.0` | — | MIT | `declared` | [上游元数据 / LICENSE](https://pypi.org/pypi/h11/0.16.0/json) |
| `idna` | `3.19` | — | BSD-3-Clause | `declared` | [上游元数据 / LICENSE](https://pypi.org/pypi/idna/3.19/json) |
| `pydantic` | `2.12.5` | — | MIT | `declared` | [上游元数据 / LICENSE](https://pypi.org/pypi/pydantic/2.12.5/json) |
| `pydantic-core` | `2.41.5` | — | MIT | `declared` | [上游元数据 / LICENSE](https://pypi.org/pypi/pydantic-core/2.41.5/json) |
| `python-multipart` | `0.0.32` | — | Apache-2.0 | `declared` | [上游元数据 / LICENSE](https://pypi.org/pypi/python-multipart/0.0.32/json) |
| `pyyaml` | `6.0.3` | — | MIT | `declared` | [上游元数据 / LICENSE](https://pypi.org/pypi/pyyaml/6.0.3/json) |
| `starlette` | `1.3.1` | — | BSD-3-Clause | `declared` | [上游元数据 / LICENSE](https://pypi.org/pypi/starlette/1.3.1/json) |
| `typing-extensions` | `4.15.0` | — | PSF-2.0 | `declared` | [上游元数据 / LICENSE](https://pypi.org/pypi/typing-extensions/4.15.0/json) |
| `typing-inspection` | `0.4.2` | — | MIT | `declared` | [上游元数据 / LICENSE](https://pypi.org/pypi/typing-inspection/0.4.2/json) |
| `uvicorn` | `0.38.0` | — | BSD-3-Clause | `declared` | [上游元数据 / LICENSE](https://pypi.org/pypi/uvicorn/0.38.0/json) |

### aegis-security-overrides

| 包名 | 锁定版本 | 平台 / 条件标记 | 上游许可声明 | 依据类型 | 版本证据 |
| --- | --- | --- | --- | --- | --- |
| `aiohttp` | `3.14.3` | — | Apache-2.0 AND MIT | `declared` | [上游元数据 / LICENSE](https://pypi.org/pypi/aiohttp/3.14.3/json) |
| `black` | `26.3.1` | — | MIT | `declared` | [上游元数据 / LICENSE](https://pypi.org/pypi/black/26.3.1/json) |
| `cryptography` | `50.0.0` | — | Apache-2.0 OR BSD-3-Clause | `declared` | [上游元数据 / LICENSE](https://pypi.org/pypi/cryptography/50.0.0/json) |
| `filelock` | `3.20.3` | — | Unlicense | `declared` | [上游元数据 / LICENSE](https://pypi.org/pypi/filelock/3.20.3/json) |
| `mcp` | `1.28.1` | — | MIT | `declared` | [上游元数据 / LICENSE](https://pypi.org/pypi/mcp/1.28.1/json) |
| `msgpack` | `1.2.1` | — | Apache-2.0 | `declared` | [上游元数据 / LICENSE](https://pypi.org/pypi/msgpack/1.2.1/json) |
| `pathspec` | `1.1.1` | — | Mozilla Public License 2.0 (MPL 2.0) | `classifier-declaration` | [上游元数据 / LICENSE](https://pypi.org/pypi/pathspec/1.1.1/json) |
| `pip` | `26.2` | — | MIT | `declared` | [上游元数据 / LICENSE](https://pypi.org/pypi/pip/26.2/json) |
| `pydantic-settings` | `2.14.2` | — | MIT | `declared` | [上游元数据 / LICENSE](https://pypi.org/pypi/pydantic-settings/2.14.2/json) |
| `pygments` | `2.20.0` | — | BSD-2-Clause | `declared` | [上游元数据 / LICENSE](https://pypi.org/pypi/pygments/2.20.0/json) |
| `pyjwt` | `2.13.0` | — | MIT | `declared` | [上游元数据 / LICENSE](https://pypi.org/pypi/pyjwt/2.13.0/json) |
| `pytest` | `9.0.3` | — | MIT | `declared` | [上游元数据 / LICENSE](https://pypi.org/pypi/pytest/9.0.3/json) |
| `python-dotenv` | `1.2.2` | — | BSD-3-Clause | `declared` | [上游元数据 / LICENSE](https://pypi.org/pypi/python-dotenv/1.2.2/json) |
| `pytokens` | `0.4.1` | — | MIT License | `classifier-declaration` | [上游元数据 / LICENSE](https://pypi.org/pypi/pytokens/0.4.1/json) |
| `requests` | `2.33.0` | — | Apache-2.0 | `declared` | [上游元数据 / LICENSE](https://pypi.org/pypi/requests/2.33.0/json) |
| `urllib3` | `2.7.0` | — | MIT | `declared` | [上游元数据 / LICENSE](https://pypi.org/pypi/urllib3/2.7.0/json) |
| `virtualenv` | `20.36.1` | — | MIT | `declared` | [上游元数据 / LICENSE](https://pypi.org/pypi/virtualenv/20.36.1/json) |

### aegis-dev

| 包名 | 锁定版本 | 平台 / 条件标记 | 上游许可声明 | 依据类型 | 版本证据 |
| --- | --- | --- | --- | --- | --- |
| `annotated-doc` | `0.0.4` | — | MIT | `declared` | [上游元数据 / LICENSE](https://pypi.org/pypi/annotated-doc/0.0.4/json) |
| `annotated-types` | `0.7.0` | — | MIT License | `classifier-declaration` | [上游元数据 / LICENSE](https://pypi.org/pypi/annotated-types/0.7.0/json) |
| `anyio` | `4.12.0` | — | MIT | `declared` | [上游元数据 / LICENSE](https://pypi.org/pypi/anyio/4.12.0/json) |
| `certifi` | `2026.7.22` | — | MPL-2.0 | `declared` | [上游元数据 / LICENSE](https://pypi.org/pypi/certifi/2026.7.22/json) |
| `charset-normalizer` | `3.5.1` | — | MIT | `declared` | [上游元数据 / LICENSE](https://pypi.org/pypi/charset-normalizer/3.5.1/json) |
| `click` | `8.3.3` | — | BSD-3-Clause | `declared` | [上游元数据 / LICENSE](https://pypi.org/pypi/click/8.3.3/json) |
| `colorama` | `0.4.6` | ; sys_platform == 'win32' | BSD License | `classifier-declaration` | [上游元数据 / LICENSE](https://pypi.org/pypi/colorama/0.4.6/json) |
| `fastapi` | `0.141.1` | — | MIT | `declared` | [上游元数据 / LICENSE](https://pypi.org/pypi/fastapi/0.141.1/json) |
| `h11` | `0.16.0` | — | MIT | `declared` | [上游元数据 / LICENSE](https://pypi.org/pypi/h11/0.16.0/json) |
| `httpcore2` | `2.12.0` | ; sys_platform != 'emscripten' | BSD-3-Clause | `declared` | [上游元数据 / LICENSE](https://pypi.org/pypi/httpcore2/2.12.0/json) |
| `httpx2` | `2.12.0` | — | BSD-3-Clause | `declared` | [上游元数据 / LICENSE](https://pypi.org/pypi/httpx2/2.12.0/json) |
| `httpx2-jsfetch` | `1.0` | ; sys_platform == 'emscripten' | BSD-3-Clause | `declared` | [上游元数据 / LICENSE](https://pypi.org/pypi/httpx2-jsfetch/1.0/json) |
| `idna` | `3.19` | — | BSD-3-Clause | `declared` | [上游元数据 / LICENSE](https://pypi.org/pypi/idna/3.19/json) |
| `iniconfig` | `2.3.0` | — | MIT | `declared` | [上游元数据 / LICENSE](https://pypi.org/pypi/iniconfig/2.3.0/json) |
| `packaging` | `25.0` | — | Apache Software License; BSD License | `classifier-declaration` | [上游元数据 / LICENSE](https://pypi.org/pypi/packaging/25.0/json) |
| `pluggy` | `1.6.0` | — | MIT | `declared` | [上游元数据 / LICENSE](https://pypi.org/pypi/pluggy/1.6.0/json) |
| `pydantic` | `2.12.5` | — | MIT | `declared` | [上游元数据 / LICENSE](https://pypi.org/pypi/pydantic/2.12.5/json) |
| `pydantic-core` | `2.41.5` | — | MIT | `declared` | [上游元数据 / LICENSE](https://pypi.org/pypi/pydantic-core/2.41.5/json) |
| `pygments` | `2.20.0` | — | BSD-2-Clause | `declared` | [上游元数据 / LICENSE](https://pypi.org/pypi/pygments/2.20.0/json) |
| `pytest` | `9.0.3` | — | MIT | `declared` | [上游元数据 / LICENSE](https://pypi.org/pypi/pytest/9.0.3/json) |
| `python-multipart` | `0.0.32` | — | Apache-2.0 | `declared` | [上游元数据 / LICENSE](https://pypi.org/pypi/python-multipart/0.0.32/json) |
| `pyyaml` | `6.0.3` | — | MIT | `declared` | [上游元数据 / LICENSE](https://pypi.org/pypi/pyyaml/6.0.3/json) |
| `requests` | `2.33.0` | — | Apache-2.0 | `declared` | [上游元数据 / LICENSE](https://pypi.org/pypi/requests/2.33.0/json) |
| `starlette` | `1.3.1` | — | BSD-3-Clause | `declared` | [上游元数据 / LICENSE](https://pypi.org/pypi/starlette/1.3.1/json) |
| `truststore` | `0.10.4` | ; sys_platform != 'emscripten' | MIT | `declared` | [上游元数据 / LICENSE](https://pypi.org/pypi/truststore/0.10.4/json) |
| `typing-extensions` | `4.15.0` | — | PSF-2.0 | `declared` | [上游元数据 / LICENSE](https://pypi.org/pypi/typing-extensions/4.15.0/json) |
| `typing-inspection` | `0.4.2` | — | MIT | `declared` | [上游元数据 / LICENSE](https://pypi.org/pypi/typing-inspection/0.4.2/json) |
| `urllib3` | `2.7.0` | — | MIT | `declared` | [上游元数据 / LICENSE](https://pypi.org/pypi/urllib3/2.7.0/json) |
| `uvicorn` | `0.38.0` | — | BSD-3-Clause | `declared` | [上游元数据 / LICENSE](https://pypi.org/pypi/uvicorn/0.38.0/json) |

### aegis-ci

| 包名 | 锁定版本 | 平台 / 条件标记 | 上游许可声明 | 依据类型 | 版本证据 |
| --- | --- | --- | --- | --- | --- |
| `yara-python` | `4.5.4` | — | Apache 2.0 | `declared` | [上游元数据 / LICENSE](https://pypi.org/pypi/yara-python/4.5.4/json) |

### cisco-skill-dependencies

| 包名 | 锁定版本 | 平台 / 条件标记 | 上游许可声明 | 依据类型 | 版本证据 |
| --- | --- | --- | --- | --- | --- |
| `aiohappyeyeballs` | `2.6.1` | — | PSF-2.0 | `declared` | [上游元数据 / LICENSE](https://pypi.org/pypi/aiohappyeyeballs/2.6.1/json) |
| `aiohttp` | `3.14.1` | — | Apache-2.0 AND MIT | `declared` | [上游元数据 / LICENSE](https://pypi.org/pypi/aiohttp/3.14.1/json) |
| `aiosignal` | `1.4.0` | — | Apache 2.0 | `declared` | [上游元数据 / LICENSE](https://pypi.org/pypi/aiosignal/1.4.0/json) |
| `annotated-doc` | `0.0.4` | — | MIT | `declared` | [上游元数据 / LICENSE](https://pypi.org/pypi/annotated-doc/0.0.4/json) |
| `annotated-types` | `0.7.0` | — | MIT License | `classifier-declaration` | [上游元数据 / LICENSE](https://pypi.org/pypi/annotated-types/0.7.0/json) |
| `anthropic` | `0.97.0` | — | MIT | `declared` | [上游元数据 / LICENSE](https://pypi.org/pypi/anthropic/0.97.0/json) |
| `anyio` | `4.13.0` | — | MIT | `declared` | [上游元数据 / LICENSE](https://pypi.org/pypi/anyio/4.13.0/json) |
| `async-timeout` | `5.0.1` | ; python_full_version < '3.11' | Apache 2 | `declared` | [上游元数据 / LICENSE](https://pypi.org/pypi/async-timeout/5.0.1/json) |
| `attrs` | `26.1.0` | — | MIT | `declared` | [上游元数据 / LICENSE](https://pypi.org/pypi/attrs/26.1.0/json) |
| `backports-asyncio-runner` | `1.2.0` | ; python_full_version < '3.11' | PSF-2.0 | `declared` | [上游元数据 / LICENSE](https://pypi.org/pypi/backports-asyncio-runner/1.2.0/json) |
| `boolean-py` | `5.0` | — | BSD-2-Clause | `declared` | [上游元数据 / LICENSE](https://pypi.org/pypi/boolean-py/5.0/json) |
| `cachecontrol` | `0.14.4` | — | Apache-2.0 | `declared` | [上游元数据 / LICENSE](https://pypi.org/pypi/cachecontrol/0.14.4/json) |
| `certifi` | `2026.4.22` | — | MPL-2.0 | `declared` | [上游元数据 / LICENSE](https://pypi.org/pypi/certifi/2026.4.22/json) |
| `cffi` | `2.0.0` | ; platform_python_implementation != 'PyPy' | MIT | `declared` | [上游元数据 / LICENSE](https://pypi.org/pypi/cffi/2.0.0/json) |
| `cfgv` | `3.5.0` | — | MIT | `declared` | [上游元数据 / LICENSE](https://pypi.org/pypi/cfgv/3.5.0/json) |
| `charset-normalizer` | `3.4.7` | — | MIT | `declared` | [上游元数据 / LICENSE](https://pypi.org/pypi/charset-normalizer/3.4.7/json) |
| `click` | `8.1.8` | — | BSD License | `classifier-declaration` | [上游元数据 / LICENSE](https://pypi.org/pypi/click/8.1.8/json) |
| `colorama` | `0.4.6` | ; sys_platform == 'win32' | BSD License | `classifier-declaration` | [上游元数据 / LICENSE](https://pypi.org/pypi/colorama/0.4.6/json) |
| `colorclass` | `2.2.2` | — | MIT | `declared` | [上游元数据 / LICENSE](https://pypi.org/pypi/colorclass/2.2.2/json) |
| `coloredlogs` | `15.0.1` | ; python_full_version < '3.11' | MIT | `declared` | [上游元数据 / LICENSE](https://pypi.org/pypi/coloredlogs/15.0.1/json) |
| `confusable-homoglyphs` | `3.3.1` | — | MIT | `declared` | [上游元数据 / LICENSE](https://pypi.org/pypi/confusable-homoglyphs/3.3.1/json) |
| `coverage` | `7.13.5` | — | Apache-2.0 | `declared` | [上游元数据 / LICENSE](https://pypi.org/pypi/coverage/7.13.5/json) |
| `cryptography` | `49.0.0` | ; (platform_python_implementation != 'PyPy' and sys_platform == 'darwin') or (platform_python_implementation != 'PyPy' and sys_platform == 'win32') or (sys_platform != 'darwin' and sys_platform != 'win32') | Apache-2.0 OR BSD-3-Clause | `declared` | [上游元数据 / LICENSE](https://pypi.org/pypi/cryptography/49.0.0/json) |
| `cyclonedx-python-lib` | `11.7.0` | — | Apache-2.0 | `declared` | [上游元数据 / LICENSE](https://pypi.org/pypi/cyclonedx-python-lib/11.7.0/json) |
| `defusedxml` | `0.7.1` | — | PSFL | `declared` | [上游元数据 / LICENSE](https://pypi.org/pypi/defusedxml/0.7.1/json) |
| `distlib` | `0.4.0` | — | PSF-2.0 | `declared` | [上游元数据 / LICENSE](https://pypi.org/pypi/distlib/0.4.0/json) |
| `distro` | `1.9.0` | — | Apache License, Version 2.0 | `declared` | [上游元数据 / LICENSE](https://pypi.org/pypi/distro/1.9.0/json) |
| `docstring-parser` | `0.18.0` | — | MIT | `declared` | [上游元数据 / LICENSE](https://pypi.org/pypi/docstring-parser/0.18.0/json) |
| `easygui` | `0.98.3` | — | BSD | `declared` | [上游元数据 / LICENSE](https://pypi.org/pypi/easygui/0.98.3/json) |
| `exceptiongroup` | `1.3.1` | ; python_full_version < '3.11' | MIT License | `classifier-declaration` | [上游元数据 / LICENSE](https://pypi.org/pypi/exceptiongroup/1.3.1/json) |
| `fastapi` | `0.136.1` | — | MIT | `declared` | [上游元数据 / LICENSE](https://pypi.org/pypi/fastapi/0.136.1/json) |
| `fastuuid` | `0.14.0` | — | BSD License | `classifier-declaration` | [上游元数据 / LICENSE](https://pypi.org/pypi/fastuuid/0.14.0/json) |
| `filelock` | `3.29.0` | — | MIT | `declared` | [上游元数据 / LICENSE](https://pypi.org/pypi/filelock/3.29.0/json) |
| `flatbuffers` | `25.12.19` | — | Apache 2.0 | `declared` | [上游元数据 / LICENSE](https://pypi.org/pypi/flatbuffers/25.12.19/json) |
| `frozenlist` | `1.8.0` | — | Apache-2.0 | `declared` | [上游元数据 / LICENSE](https://pypi.org/pypi/frozenlist/1.8.0/json) |
| `fsspec` | `2026.3.0` | — | BSD-3-Clause | `declared` | [上游元数据 / LICENSE](https://pypi.org/pypi/fsspec/2026.3.0/json) |
| `h11` | `0.16.0` | — | MIT | `declared` | [上游元数据 / LICENSE](https://pypi.org/pypi/h11/0.16.0/json) |
| `hf-xet` | `1.4.3` | ; platform_machine == 'AMD64' or platform_machine == 'aarch64' or platform_machine == 'amd64' or platform_machine == 'arm64' or platform_machine == 'x86_64' | Apache Software License | `classifier-declaration` | [上游元数据 / LICENSE](https://pypi.org/pypi/hf-xet/1.4.3/json) |
| `httpcore` | `1.0.9` | — | BSD-3-Clause | `declared` | [上游元数据 / LICENSE](https://pypi.org/pypi/httpcore/1.0.9/json) |
| `httptools` | `0.7.1` | — | MIT | `declared` | [上游元数据 / LICENSE](https://pypi.org/pypi/httptools/0.7.1/json) |
| `httpx` | `0.28.1` | — | BSD-3-Clause | `declared` | [上游元数据 / LICENSE](https://pypi.org/pypi/httpx/0.28.1/json) |
| `huggingface-hub` | `1.12.2` | — | Apache-2.0 | `declared` | [上游元数据 / LICENSE](https://pypi.org/pypi/huggingface-hub/1.12.2/json) |
| `humanfriendly` | `10.0` | ; python_full_version < '3.11' | MIT | `declared` | [上游元数据 / LICENSE](https://pypi.org/pypi/humanfriendly/10.0/json) |
| `identify` | `2.6.19` | — | MIT | `declared` | [上游元数据 / LICENSE](https://pypi.org/pypi/identify/2.6.19/json) |
| `idna` | `3.18` | — | BSD-3-Clause | `declared` | [上游元数据 / LICENSE](https://pypi.org/pypi/idna/3.18/json) |
| `importlib-metadata` | `8.5.0` | — | Apache Software License | `classifier-declaration` | [上游元数据 / LICENSE](https://pypi.org/pypi/importlib-metadata/8.5.0/json) |
| `iniconfig` | `2.3.0` | — | MIT | `declared` | [上游元数据 / LICENSE](https://pypi.org/pypi/iniconfig/2.3.0/json) |
| `jinja2` | `3.1.6` | — | BSD License | `classifier-declaration` | [上游元数据 / LICENSE](https://pypi.org/pypi/jinja2/3.1.6/json) |
| `jiter` | `0.14.0` | — | MIT | `declared` | [上游元数据 / LICENSE](https://pypi.org/pypi/jiter/0.14.0/json) |
| `jsonschema` | `4.23.0` | — | MIT | `declared` | [上游元数据 / LICENSE](https://pypi.org/pypi/jsonschema/4.23.0/json) |
| `jsonschema-specifications` | `2025.9.1` | — | MIT | `declared` | [上游元数据 / LICENSE](https://pypi.org/pypi/jsonschema-specifications/2025.9.1/json) |
| `librt` | `0.9.0` | ; platform_python_implementation != 'PyPy' | MIT | `declared` | [上游元数据 / LICENSE](https://pypi.org/pypi/librt/0.9.0/json) |
| `liccheck` | `0.9.2` | — | Apache Software License | `declared` | [上游元数据 / LICENSE](https://pypi.org/pypi/liccheck/0.9.2/json) |
| `license-expression` | `30.4.4` | — | Apache-2.0 | `declared` | [上游元数据 / LICENSE](https://pypi.org/pypi/license-expression/30.4.4/json) |
| `linkify-it-py` | `2.1.0` | — | MIT | `declared` | [上游元数据 / LICENSE](https://pypi.org/pypi/linkify-it-py/2.1.0/json) |
| `litellm` | `1.89.3` | — | MIT | `declared` | [上游元数据 / LICENSE](https://pypi.org/pypi/litellm/1.89.3/json) |
| `magika` | `1.0.2` | — | Apache-2.0 | `declared` | [上游元数据 / LICENSE](https://pypi.org/pypi/magika/1.0.2/json) |
| `markdown-it-py` | `4.0.0` | — | MIT License | `classifier-declaration` | [上游元数据 / LICENSE](https://pypi.org/pypi/markdown-it-py/4.0.0/json) |
| `markupsafe` | `3.0.3` | — | BSD-3-Clause | `declared` | [上游元数据 / LICENSE](https://pypi.org/pypi/markupsafe/3.0.3/json) |
| `mdit-py-plugins` | `0.5.0` | — | MIT License | `classifier-declaration` | [上游元数据 / LICENSE](https://pypi.org/pypi/mdit-py-plugins/0.5.0/json) |
| `mdurl` | `0.1.2` | — | MIT License | `classifier-declaration` | [上游元数据 / LICENSE](https://pypi.org/pypi/mdurl/0.1.2/json) |
| `mpmath` | `1.3.0` | ; python_full_version < '3.11' | BSD | `declared` | [上游元数据 / LICENSE](https://pypi.org/pypi/mpmath/1.3.0/json) |
| `msgpack` | `1.2.1` | — | Apache-2.0 | `declared` | [上游元数据 / LICENSE](https://pypi.org/pypi/msgpack/1.2.1/json) |
| `msoffcrypto-tool` | `6.0.0` | ; (platform_python_implementation != 'PyPy' and sys_platform == 'darwin') or (platform_python_implementation != 'PyPy' and sys_platform == 'win32') or (sys_platform != 'darwin' and sys_platform != 'win32') | MIT | `declared` | [上游元数据 / LICENSE](https://pypi.org/pypi/msoffcrypto-tool/6.0.0/json) |
| `multidict` | `6.7.1` | — | Apache License 2.0 | `declared` | [上游元数据 / LICENSE](https://pypi.org/pypi/multidict/6.7.1/json) |
| `mypy` | `1.19.1` | — | MIT | `declared` | [上游元数据 / LICENSE](https://pypi.org/pypi/mypy/1.19.1/json) |
| `mypy-extensions` | `1.1.0` | — | MIT | `upstream-license` | [上游元数据 / LICENSE](https://github.com/python/mypy_extensions/blob/1.1.0/LICENSE) |
| `nodeenv` | `1.10.0` | — | BSD | `declared` | [上游元数据 / LICENSE](https://pypi.org/pypi/nodeenv/1.10.0/json) |
| `numpy` | `2.2.6` | ; python_full_version < '3.11' | BSD License | `classifier-declaration` | [上游元数据 / LICENSE](https://pypi.org/pypi/numpy/2.2.6/json) |
| `numpy` | `2.4.4` | ; python_full_version >= '3.11' | BSD-3-Clause AND 0BSD AND MIT AND Zlib AND CC0-1.0 | `declared` | [上游元数据 / LICENSE](https://pypi.org/pypi/numpy/2.4.4/json) |
| `olefile` | `0.47` | — | BSD | `declared` | [上游元数据 / LICENSE](https://pypi.org/pypi/olefile/0.47/json) |
| `oletools` | `0.60.2` | — | BSD | `declared` | [上游元数据 / LICENSE](https://pypi.org/pypi/oletools/0.60.2/json) |
| `onnxruntime` | `1.23.2` | ; python_full_version < '3.11' | MIT License | `declared` | [上游元数据 / LICENSE](https://pypi.org/pypi/onnxruntime/1.23.2/json) |
| `onnxruntime` | `1.25.1` | ; python_full_version >= '3.11' | MIT License | `declared` | [上游元数据 / LICENSE](https://pypi.org/pypi/onnxruntime/1.25.1/json) |
| `openai` | `2.24.0` | — | Apache-2.0 | `declared` | [上游元数据 / LICENSE](https://pypi.org/pypi/openai/2.24.0/json) |
| `packageurl-python` | `0.17.6` | — | MIT | `declared` | [上游元数据 / LICENSE](https://pypi.org/pypi/packageurl-python/0.17.6/json) |
| `packaging` | `26.2` | — | Apache-2.0 OR BSD-2-Clause | `declared` | [上游元数据 / LICENSE](https://pypi.org/pypi/packaging/26.2/json) |
| `pathspec` | `1.1.1` | — | Mozilla Public License 2.0 (MPL 2.0) | `classifier-declaration` | [上游元数据 / LICENSE](https://pypi.org/pypi/pathspec/1.1.1/json) |
| `pcodedmp` | `1.2.6` | — | GPL | `declared` | [上游元数据 / LICENSE](https://pypi.org/pypi/pcodedmp/1.2.6/json) |
| `pdfid` | `1.1.3` | — | MIT License | `classifier-declaration` | [上游元数据 / LICENSE](https://pypi.org/pypi/pdfid/1.1.3/json) |
| `pip` | `26.1.2` | — | MIT | `declared` | [上游元数据 / LICENSE](https://pypi.org/pypi/pip/26.1.2/json) |
| `pip-api` | `0.0.34` | — | Apache Software License | `classifier-declaration` | [上游元数据 / LICENSE](https://pypi.org/pypi/pip-api/0.0.34/json) |
| `pip-audit` | `2.10.0` | — | Apache Software License | `classifier-declaration` | [上游元数据 / LICENSE](https://pypi.org/pypi/pip-audit/2.10.0/json) |
| `pip-requirements-parser` | `32.0.1` | — | MIT | `declared` | [上游元数据 / LICENSE](https://pypi.org/pypi/pip-requirements-parser/32.0.1/json) |
| `platformdirs` | `4.9.6` | — | MIT | `declared` | [上游元数据 / LICENSE](https://pypi.org/pypi/platformdirs/4.9.6/json) |
| `pluggy` | `1.6.0` | — | MIT | `declared` | [上游元数据 / LICENSE](https://pypi.org/pypi/pluggy/1.6.0/json) |
| `pre-commit` | `4.5.1` | — | MIT | `declared` | [上游元数据 / LICENSE](https://pypi.org/pypi/pre-commit/4.5.1/json) |
| `propcache` | `0.4.1` | — | Apache-2.0 | `declared` | [上游元数据 / LICENSE](https://pypi.org/pypi/propcache/0.4.1/json) |
| `protobuf` | `5.29.6` | — | 3-Clause BSD License | `declared` | [上游元数据 / LICENSE](https://pypi.org/pypi/protobuf/5.29.6/json) |
| `py-serializable` | `2.1.0` | — | Apache-2.0 | `declared` | [上游元数据 / LICENSE](https://pypi.org/pypi/py-serializable/2.1.0/json) |
| `pycparser` | `3.0` | ; implementation_name != 'PyPy' and platform_python_implementation != 'PyPy' | BSD-3-Clause | `declared` | [上游元数据 / LICENSE](https://pypi.org/pypi/pycparser/3.0/json) |
| `pydantic` | `2.12.5` | — | MIT | `declared` | [上游元数据 / LICENSE](https://pypi.org/pypi/pydantic/2.12.5/json) |
| `pydantic-core` | `2.41.5` | — | MIT | `declared` | [上游元数据 / LICENSE](https://pypi.org/pypi/pydantic-core/2.41.5/json) |
| `pygments` | `2.20.0` | — | BSD-2-Clause | `declared` | [上游元数据 / LICENSE](https://pypi.org/pypi/pygments/2.20.0/json) |
| `pyparsing` | `3.3.2` | — | MIT | `declared` | [上游元数据 / LICENSE](https://pypi.org/pypi/pyparsing/3.3.2/json) |
| `pyreadline3` | `3.5.4` | ; python_full_version < '3.11' and sys_platform == 'win32' | BSD | `declared` | [上游元数据 / LICENSE](https://pypi.org/pypi/pyreadline3/3.5.4/json) |
| `pytest` | `9.0.3` | — | MIT | `declared` | [上游元数据 / LICENSE](https://pypi.org/pypi/pytest/9.0.3/json) |
| `pytest-asyncio` | `1.3.0` | — | Apache-2.0 | `declared` | [上游元数据 / LICENSE](https://pypi.org/pypi/pytest-asyncio/1.3.0/json) |
| `pytest-cov` | `7.0.0` | — | MIT | `declared` | [上游元数据 / LICENSE](https://pypi.org/pypi/pytest-cov/7.0.0/json) |
| `python-discovery` | `1.2.2` | — | MIT License | `classifier-declaration` | [上游元数据 / LICENSE](https://pypi.org/pypi/python-discovery/1.2.2/json) |
| `python-dotenv` | `1.2.2` | — | BSD-3-Clause | `declared` | [上游元数据 / LICENSE](https://pypi.org/pypi/python-dotenv/1.2.2/json) |
| `python-frontmatter` | `1.1.0` | — | MIT | `declared` | [上游元数据 / LICENSE](https://pypi.org/pypi/python-frontmatter/1.1.0/json) |
| `python-multipart` | `0.0.32` | — | Apache-2.0 | `declared` | [上游元数据 / LICENSE](https://pypi.org/pypi/python-multipart/0.0.32/json) |
| `pyyaml` | `6.0.3` | — | MIT | `declared` | [上游元数据 / LICENSE](https://pypi.org/pypi/pyyaml/6.0.3/json) |
| `referencing` | `0.37.0` | — | MIT | `declared` | [上游元数据 / LICENSE](https://pypi.org/pypi/referencing/0.37.0/json) |
| `regex` | `2026.4.4` | — | Apache-2.0 AND CNRI-Python | `declared` | [上游元数据 / LICENSE](https://pypi.org/pypi/regex/2026.4.4/json) |
| `requests` | `2.33.1` | — | Apache-2.0 | `declared` | [上游元数据 / LICENSE](https://pypi.org/pypi/requests/2.33.1/json) |
| `rich` | `14.3.4` | — | MIT | `declared` | [上游元数据 / LICENSE](https://pypi.org/pypi/rich/14.3.4/json) |
| `rpds-py` | `0.30.0` | — | MIT | `declared` | [上游元数据 / LICENSE](https://pypi.org/pypi/rpds-py/0.30.0/json) |
| `ruff` | `0.14.12` | — | MIT License | `classifier-declaration` | [上游元数据 / LICENSE](https://pypi.org/pypi/ruff/0.14.12/json) |
| `semantic-version` | `2.10.0` | — | BSD | `declared` | [上游元数据 / LICENSE](https://pypi.org/pypi/semantic-version/2.10.0/json) |
| `shellingham` | `1.5.4` | — | ISC License | `declared` | [上游元数据 / LICENSE](https://pypi.org/pypi/shellingham/1.5.4/json) |
| `sniffio` | `1.3.1` | — | MIT OR Apache-2.0 | `declared` | [上游元数据 / LICENSE](https://pypi.org/pypi/sniffio/1.3.1/json) |
| `sortedcontainers` | `2.4.0` | — | Apache 2.0 | `declared` | [上游元数据 / LICENSE](https://pypi.org/pypi/sortedcontainers/2.4.0/json) |
| `starlette` | `1.3.1` | — | BSD-3-Clause | `declared` | [上游元数据 / LICENSE](https://pypi.org/pypi/starlette/1.3.1/json) |
| `sympy` | `1.14.0` | ; python_full_version < '3.11' | BSD | `declared` | [上游元数据 / LICENSE](https://pypi.org/pypi/sympy/1.14.0/json) |
| `tabulate` | `0.10.0` | — | MIT | `declared` | [上游元数据 / LICENSE](https://pypi.org/pypi/tabulate/0.10.0/json) |
| `textual` | `7.5.0` | — | MIT | `declared` | [上游元数据 / LICENSE](https://pypi.org/pypi/textual/7.5.0/json) |
| `tiktoken` | `0.12.0` | — | MIT | `upstream-license` | [上游元数据 / LICENSE](https://github.com/openai/tiktoken/blob/0.12.0/LICENSE) |
| `tokenizers` | `0.22.2` | — | Apache Software License | `classifier-declaration` | [上游元数据 / LICENSE](https://pypi.org/pypi/tokenizers/0.22.2/json) |
| `toml` | `0.10.2` | — | MIT | `declared` | [上游元数据 / LICENSE](https://pypi.org/pypi/toml/0.10.2/json) |
| `tomli` | `2.4.1` | — | MIT | `declared` | [上游元数据 / LICENSE](https://pypi.org/pypi/tomli/2.4.1/json) |
| `tomli-w` | `1.2.0` | — | MIT License | `classifier-declaration` | [上游元数据 / LICENSE](https://pypi.org/pypi/tomli-w/1.2.0/json) |
| `tqdm` | `4.67.3` | — | MPL-2.0 AND MIT | `declared` | [上游元数据 / LICENSE](https://pypi.org/pypi/tqdm/4.67.3/json) |
| `typer` | `0.23.1` | — | MIT | `declared` | [上游元数据 / LICENSE](https://pypi.org/pypi/typer/0.23.1/json) |
| `typing-extensions` | `4.15.0` | — | PSF-2.0 | `declared` | [上游元数据 / LICENSE](https://pypi.org/pypi/typing-extensions/4.15.0/json) |
| `typing-inspection` | `0.4.2` | — | MIT | `declared` | [上游元数据 / LICENSE](https://pypi.org/pypi/typing-inspection/0.4.2/json) |
| `uc-micro-py` | `2.0.0` | — | MIT | `declared` | [上游元数据 / LICENSE](https://pypi.org/pypi/uc-micro-py/2.0.0/json) |
| `urllib3` | `2.7.0` | — | MIT | `declared` | [上游元数据 / LICENSE](https://pypi.org/pypi/urllib3/2.7.0/json) |
| `uvicorn` | `0.46.0` | — | BSD-3-Clause | `declared` | [上游元数据 / LICENSE](https://pypi.org/pypi/uvicorn/0.46.0/json) |
| `uvloop` | `0.22.1` | ; platform_python_implementation != 'PyPy' and sys_platform != 'cygwin' and sys_platform != 'win32' | MIT License | `declared` | [上游元数据 / LICENSE](https://pypi.org/pypi/uvloop/0.22.1/json) |
| `virtualenv` | `21.3.0` | — | MIT | `declared` | [上游元数据 / LICENSE](https://pypi.org/pypi/virtualenv/21.3.0/json) |
| `watchfiles` | `1.1.1` | — | MIT | `declared` | [上游元数据 / LICENSE](https://pypi.org/pypi/watchfiles/1.1.1/json) |
| `websockets` | `16.0` | — | BSD-3-Clause | `declared` | [上游元数据 / LICENSE](https://pypi.org/pypi/websockets/16.0/json) |
| `win-unicode-console` | `0.5` | ; platform_python_implementation != 'PyPy' and sys_platform == 'win32' | MIT | `declared` | [上游元数据 / LICENSE](https://pypi.org/pypi/win-unicode-console/0.5/json) |
| `yara-x` | `1.15.0` | — | BSD License | `classifier-declaration` | [上游元数据 / LICENSE](https://pypi.org/pypi/yara-x/1.15.0/json) |
| `yarl` | `1.23.0` | — | Apache-2.0 | `declared` | [上游元数据 / LICENSE](https://pypi.org/pypi/yarl/1.23.0/json) |
| `zipp` | `3.23.1` | — | MIT | `declared` | [上游元数据 / LICENSE](https://pypi.org/pypi/zipp/3.23.1/json) |

### cisco-mcp-dependencies

| 包名 | 锁定版本 | 平台 / 条件标记 | 上游许可声明 | 依据类型 | 版本证据 |
| --- | --- | --- | --- | --- | --- |
| `aiohappyeyeballs` | `2.6.1` | — | PSF-2.0 | `declared` | [上游元数据 / LICENSE](https://pypi.org/pypi/aiohappyeyeballs/2.6.1/json) |
| `aiohttp` | `3.13.5` | — | Apache-2.0 AND MIT | `declared` | [上游元数据 / LICENSE](https://pypi.org/pypi/aiohttp/3.13.5/json) |
| `aiosignal` | `1.4.0` | — | Apache 2.0 | `declared` | [上游元数据 / LICENSE](https://pypi.org/pypi/aiosignal/1.4.0/json) |
| `annotated-doc` | `0.0.4` | — | MIT | `declared` | [上游元数据 / LICENSE](https://pypi.org/pypi/annotated-doc/0.0.4/json) |
| `annotated-types` | `0.7.0` | — | MIT License | `classifier-declaration` | [上游元数据 / LICENSE](https://pypi.org/pypi/annotated-types/0.7.0/json) |
| `anyio` | `4.12.0` | — | MIT | `declared` | [上游元数据 / LICENSE](https://pypi.org/pypi/anyio/4.12.0/json) |
| `attrs` | `25.4.0` | — | MIT | `declared` | [上游元数据 / LICENSE](https://pypi.org/pypi/attrs/25.4.0/json) |
| `black` | `25.12.0` | — | MIT | `declared` | [上游元数据 / LICENSE](https://pypi.org/pypi/black/25.12.0/json) |
| `boolean-py` | `5.0` | — | BSD-2-Clause | `declared` | [上游元数据 / LICENSE](https://pypi.org/pypi/boolean-py/5.0/json) |
| `cachecontrol` | `0.14.4` | — | Apache-2.0 | `declared` | [上游元数据 / LICENSE](https://pypi.org/pypi/cachecontrol/0.14.4/json) |
| `certifi` | `2025.11.12` | — | MPL-2.0 | `declared` | [上游元数据 / LICENSE](https://pypi.org/pypi/certifi/2025.11.12/json) |
| `cffi` | `2.0.0` | ; platform_python_implementation != 'PyPy' | MIT | `declared` | [上游元数据 / LICENSE](https://pypi.org/pypi/cffi/2.0.0/json) |
| `cfgv` | `3.5.0` | — | MIT | `declared` | [上游元数据 / LICENSE](https://pypi.org/pypi/cfgv/3.5.0/json) |
| `charset-normalizer` | `3.4.4` | — | MIT | `declared` | [上游元数据 / LICENSE](https://pypi.org/pypi/charset-normalizer/3.4.4/json) |
| `click` | `8.1.8` | — | BSD License | `classifier-declaration` | [上游元数据 / LICENSE](https://pypi.org/pypi/click/8.1.8/json) |
| `colorama` | `0.4.6` | ; sys_platform == 'win32' | BSD License | `classifier-declaration` | [上游元数据 / LICENSE](https://pypi.org/pypi/colorama/0.4.6/json) |
| `coverage` | `7.13.0` | — | Apache-2.0 | `declared` | [上游元数据 / LICENSE](https://pypi.org/pypi/coverage/7.13.0/json) |
| `cryptography` | `46.0.3` | — | Apache-2.0 OR BSD-3-Clause | `declared` | [上游元数据 / LICENSE](https://pypi.org/pypi/cryptography/46.0.3/json) |
| `cyclonedx-python-lib` | `11.7.0` | — | Apache-2.0 | `declared` | [上游元数据 / LICENSE](https://pypi.org/pypi/cyclonedx-python-lib/11.7.0/json) |
| `defusedxml` | `0.7.1` | — | PSFL | `declared` | [上游元数据 / LICENSE](https://pypi.org/pypi/defusedxml/0.7.1/json) |
| `distlib` | `0.4.0` | — | PSF-2.0 | `declared` | [上游元数据 / LICENSE](https://pypi.org/pypi/distlib/0.4.0/json) |
| `distro` | `1.9.0` | — | Apache License, Version 2.0 | `declared` | [上游元数据 / LICENSE](https://pypi.org/pypi/distro/1.9.0/json) |
| `expandvars` | `1.1.2` | — | MIT License | `classifier-declaration` | [上游元数据 / LICENSE](https://pypi.org/pypi/expandvars/1.1.2/json) |
| `fastapi` | `0.125.0` | — | MIT | `declared` | [上游元数据 / LICENSE](https://pypi.org/pypi/fastapi/0.125.0/json) |
| `fastuuid` | `0.14.0` | — | BSD License | `classifier-declaration` | [上游元数据 / LICENSE](https://pypi.org/pypi/fastuuid/0.14.0/json) |
| `filelock` | `3.20.1` | — | Unlicense | `declared` | [上游元数据 / LICENSE](https://pypi.org/pypi/filelock/3.20.1/json) |
| `flake8` | `7.3.0` | — | MIT | `declared` | [上游元数据 / LICENSE](https://pypi.org/pypi/flake8/7.3.0/json) |
| `frozenlist` | `1.8.0` | — | Apache-2.0 | `declared` | [上游元数据 / LICENSE](https://pypi.org/pypi/frozenlist/1.8.0/json) |
| `fsspec` | `2025.12.0` | — | BSD-3-Clause | `declared` | [上游元数据 / LICENSE](https://pypi.org/pypi/fsspec/2025.12.0/json) |
| `h11` | `0.16.0` | — | MIT | `declared` | [上游元数据 / LICENSE](https://pypi.org/pypi/h11/0.16.0/json) |
| `hf-xet` | `1.2.0` | ; platform_machine == 'AMD64' or platform_machine == 'aarch64' or platform_machine == 'amd64' or platform_machine == 'arm64' or platform_machine == 'x86_64' | Apache Software License | `classifier-declaration` | [上游元数据 / LICENSE](https://pypi.org/pypi/hf-xet/1.2.0/json) |
| `httpcore` | `1.0.9` | — | BSD-3-Clause | `declared` | [上游元数据 / LICENSE](https://pypi.org/pypi/httpcore/1.0.9/json) |
| `httpx` | `0.28.1` | — | BSD-3-Clause | `declared` | [上游元数据 / LICENSE](https://pypi.org/pypi/httpx/0.28.1/json) |
| `httpx-sse` | `0.4.3` | — | MIT | `declared` | [上游元数据 / LICENSE](https://pypi.org/pypi/httpx-sse/0.4.3/json) |
| `huggingface-hub` | `1.2.3` | — | Apache | `declared` | [上游元数据 / LICENSE](https://pypi.org/pypi/huggingface-hub/1.2.3/json) |
| `identify` | `2.6.15` | — | MIT | `declared` | [上游元数据 / LICENSE](https://pypi.org/pypi/identify/2.6.15/json) |
| `idna` | `3.11` | — | BSD-3-Clause | `declared` | [上游元数据 / LICENSE](https://pypi.org/pypi/idna/3.11/json) |
| `importlib-metadata` | `8.5.0` | — | Apache Software License | `classifier-declaration` | [上游元数据 / LICENSE](https://pypi.org/pypi/importlib-metadata/8.5.0/json) |
| `iniconfig` | `2.3.0` | — | MIT | `declared` | [上游元数据 / LICENSE](https://pypi.org/pypi/iniconfig/2.3.0/json) |
| `isort` | `7.0.0` | — | MIT | `declared` | [上游元数据 / LICENSE](https://pypi.org/pypi/isort/7.0.0/json) |
| `jinja2` | `3.1.6` | — | BSD License | `classifier-declaration` | [上游元数据 / LICENSE](https://pypi.org/pypi/jinja2/3.1.6/json) |
| `jiter` | `0.12.0` | — | MIT License | `classifier-declaration` | [上游元数据 / LICENSE](https://pypi.org/pypi/jiter/0.12.0/json) |
| `jsonschema` | `4.23.0` | — | MIT | `declared` | [上游元数据 / LICENSE](https://pypi.org/pypi/jsonschema/4.23.0/json) |
| `jsonschema-specifications` | `2025.9.1` | — | MIT | `declared` | [上游元数据 / LICENSE](https://pypi.org/pypi/jsonschema-specifications/2025.9.1/json) |
| `librt` | `0.7.4` | ; platform_python_implementation != 'PyPy' | MIT | `declared` | [上游元数据 / LICENSE](https://pypi.org/pypi/librt/0.7.4/json) |
| `license-expression` | `30.4.4` | — | Apache-2.0 | `declared` | [上游元数据 / LICENSE](https://pypi.org/pypi/license-expression/30.4.4/json) |
| `litellm` | `1.93.0` | — | MIT | `declared` | [上游元数据 / LICENSE](https://pypi.org/pypi/litellm/1.93.0/json) |
| `markdown-it-py` | `4.0.0` | — | MIT License | `classifier-declaration` | [上游元数据 / LICENSE](https://pypi.org/pypi/markdown-it-py/4.0.0/json) |
| `markupsafe` | `3.0.3` | — | BSD-3-Clause | `declared` | [上游元数据 / LICENSE](https://pypi.org/pypi/markupsafe/3.0.3/json) |
| `mccabe` | `0.7.0` | — | Expat license | `declared` | [上游元数据 / LICENSE](https://pypi.org/pypi/mccabe/0.7.0/json) |
| `mcp` | `1.25.0` | — | MIT | `declared` | [上游元数据 / LICENSE](https://pypi.org/pypi/mcp/1.25.0/json) |
| `mdurl` | `0.1.2` | — | MIT License | `classifier-declaration` | [上游元数据 / LICENSE](https://pypi.org/pypi/mdurl/0.1.2/json) |
| `msgpack` | `1.1.2` | — | Apache-2.0 | `declared` | [上游元数据 / LICENSE](https://pypi.org/pypi/msgpack/1.1.2/json) |
| `multidict` | `6.7.0` | — | Apache License 2.0 | `declared` | [上游元数据 / LICENSE](https://pypi.org/pypi/multidict/6.7.0/json) |
| `mypy` | `1.19.1` | — | MIT | `declared` | [上游元数据 / LICENSE](https://pypi.org/pypi/mypy/1.19.1/json) |
| `mypy-extensions` | `1.1.0` | — | MIT | `upstream-license` | [上游元数据 / LICENSE](https://github.com/python/mypy_extensions/blob/1.1.0/LICENSE) |
| `nodeenv` | `1.9.1` | — | BSD | `declared` | [上游元数据 / LICENSE](https://pypi.org/pypi/nodeenv/1.9.1/json) |
| `openai` | `2.30.0` | — | Apache-2.0 | `declared` | [上游元数据 / LICENSE](https://pypi.org/pypi/openai/2.30.0/json) |
| `packageurl-python` | `0.17.6` | — | MIT | `declared` | [上游元数据 / LICENSE](https://pypi.org/pypi/packageurl-python/0.17.6/json) |
| `packaging` | `25.0` | — | Apache Software License; BSD License | `classifier-declaration` | [上游元数据 / LICENSE](https://pypi.org/pypi/packaging/25.0/json) |
| `pathspec` | `0.12.1` | — | Mozilla Public License 2.0 (MPL 2.0) | `classifier-declaration` | [上游元数据 / LICENSE](https://pypi.org/pypi/pathspec/0.12.1/json) |
| `pip` | `26.0.1` | — | MIT | `declared` | [上游元数据 / LICENSE](https://pypi.org/pypi/pip/26.0.1/json) |
| `pip-api` | `0.0.34` | — | Apache Software License | `classifier-declaration` | [上游元数据 / LICENSE](https://pypi.org/pypi/pip-api/0.0.34/json) |
| `pip-audit` | `2.10.0` | — | Apache Software License | `classifier-declaration` | [上游元数据 / LICENSE](https://pypi.org/pypi/pip-audit/2.10.0/json) |
| `pip-requirements-parser` | `32.0.1` | — | MIT | `declared` | [上游元数据 / LICENSE](https://pypi.org/pypi/pip-requirements-parser/32.0.1/json) |
| `platformdirs` | `4.5.1` | — | MIT | `declared` | [上游元数据 / LICENSE](https://pypi.org/pypi/platformdirs/4.5.1/json) |
| `pluggy` | `1.6.0` | — | MIT | `declared` | [上游元数据 / LICENSE](https://pypi.org/pypi/pluggy/1.6.0/json) |
| `pre-commit` | `4.5.1` | — | MIT | `declared` | [上游元数据 / LICENSE](https://pypi.org/pypi/pre-commit/4.5.1/json) |
| `propcache` | `0.4.1` | — | Apache-2.0 | `declared` | [上游元数据 / LICENSE](https://pypi.org/pypi/propcache/0.4.1/json) |
| `puremagic` | `1.30` | — | MIT | `declared` | [上游元数据 / LICENSE](https://pypi.org/pypi/puremagic/1.30/json) |
| `py-serializable` | `2.1.0` | — | Apache-2.0 | `declared` | [上游元数据 / LICENSE](https://pypi.org/pypi/py-serializable/2.1.0/json) |
| `pycodestyle` | `2.14.0` | — | MIT | `declared` | [上游元数据 / LICENSE](https://pypi.org/pypi/pycodestyle/2.14.0/json) |
| `pycparser` | `2.23` | ; implementation_name != 'PyPy' and platform_python_implementation != 'PyPy' | BSD-3-Clause | `declared` | [上游元数据 / LICENSE](https://pypi.org/pypi/pycparser/2.23/json) |
| `pydantic` | `2.12.5` | — | MIT | `declared` | [上游元数据 / LICENSE](https://pypi.org/pypi/pydantic/2.12.5/json) |
| `pydantic-core` | `2.41.5` | — | MIT | `declared` | [上游元数据 / LICENSE](https://pypi.org/pypi/pydantic-core/2.41.5/json) |
| `pydantic-settings` | `2.12.0` | — | MIT | `declared` | [上游元数据 / LICENSE](https://pypi.org/pypi/pydantic-settings/2.12.0/json) |
| `pyflakes` | `3.4.0` | — | MIT | `declared` | [上游元数据 / LICENSE](https://pypi.org/pypi/pyflakes/3.4.0/json) |
| `pygments` | `2.19.2` | — | BSD-2-Clause | `declared` | [上游元数据 / LICENSE](https://pypi.org/pypi/pygments/2.19.2/json) |
| `pyjwt` | `2.10.1` | — | MIT | `declared` | [上游元数据 / LICENSE](https://pypi.org/pypi/pyjwt/2.10.1/json) |
| `pyparsing` | `3.3.2` | — | MIT | `declared` | [上游元数据 / LICENSE](https://pypi.org/pypi/pyparsing/3.3.2/json) |
| `pytest` | `9.0.2` | — | MIT | `declared` | [上游元数据 / LICENSE](https://pypi.org/pypi/pytest/9.0.2/json) |
| `pytest-asyncio` | `1.3.0` | — | Apache-2.0 | `declared` | [上游元数据 / LICENSE](https://pypi.org/pypi/pytest-asyncio/1.3.0/json) |
| `pytest-cov` | `7.0.0` | — | MIT | `declared` | [上游元数据 / LICENSE](https://pypi.org/pypi/pytest-cov/7.0.0/json) |
| `python-dotenv` | `1.0.1` | — | BSD-3-Clause | `declared` | [上游元数据 / LICENSE](https://pypi.org/pypi/python-dotenv/1.0.1/json) |
| `python-multipart` | `0.0.21` | — | Apache-2.0 | `declared` | [上游元数据 / LICENSE](https://pypi.org/pypi/python-multipart/0.0.21/json) |
| `pytokens` | `0.3.0` | — | MIT | `declared` | [上游元数据 / LICENSE](https://pypi.org/pypi/pytokens/0.3.0/json) |
| `pywin32` | `311` | ; sys_platform == 'win32' | PSF | `declared` | [上游元数据 / LICENSE](https://pypi.org/pypi/pywin32/311/json) |
| `pyyaml` | `6.0.3` | — | MIT | `declared` | [上游元数据 / LICENSE](https://pypi.org/pypi/pyyaml/6.0.3/json) |
| `referencing` | `0.37.0` | — | MIT | `declared` | [上游元数据 / LICENSE](https://pypi.org/pypi/referencing/0.37.0/json) |
| `regex` | `2025.11.3` | — | Apache-2.0 AND CNRI-Python | `declared` | [上游元数据 / LICENSE](https://pypi.org/pypi/regex/2025.11.3/json) |
| `requests` | `2.32.5` | — | Apache-2.0 | `declared` | [上游元数据 / LICENSE](https://pypi.org/pypi/requests/2.32.5/json) |
| `respx` | `0.22.0` | — | BSD-3-Clause | `declared` | [上游元数据 / LICENSE](https://pypi.org/pypi/respx/0.22.0/json) |
| `rich` | `14.2.0` | — | MIT | `declared` | [上游元数据 / LICENSE](https://pypi.org/pypi/rich/14.2.0/json) |
| `rpds-py` | `0.30.0` | — | MIT | `declared` | [上游元数据 / LICENSE](https://pypi.org/pypi/rpds-py/0.30.0/json) |
| `shellingham` | `1.5.4` | — | ISC License | `declared` | [上游元数据 / LICENSE](https://pypi.org/pypi/shellingham/1.5.4/json) |
| `sniffio` | `1.3.1` | — | MIT OR Apache-2.0 | `declared` | [上游元数据 / LICENSE](https://pypi.org/pypi/sniffio/1.3.1/json) |
| `sortedcontainers` | `2.4.0` | — | Apache 2.0 | `declared` | [上游元数据 / LICENSE](https://pypi.org/pypi/sortedcontainers/2.4.0/json) |
| `sse-starlette` | `3.0.4` | — | BSD-3-Clause | `declared` | [上游元数据 / LICENSE](https://pypi.org/pypi/sse-starlette/3.0.4/json) |
| `starlette` | `0.50.0` | — | BSD-3-Clause | `declared` | [上游元数据 / LICENSE](https://pypi.org/pypi/starlette/0.50.0/json) |
| `tiktoken` | `0.12.0` | — | MIT | `upstream-license` | [上游元数据 / LICENSE](https://github.com/openai/tiktoken/blob/0.12.0/LICENSE) |
| `tokenizers` | `0.22.2` | — | Apache Software License | `classifier-declaration` | [上游元数据 / LICENSE](https://pypi.org/pypi/tokenizers/0.22.2/json) |
| `tomli` | `2.3.0` | — | MIT | `declared` | [上游元数据 / LICENSE](https://pypi.org/pypi/tomli/2.3.0/json) |
| `tomli-w` | `1.2.0` | — | MIT License | `classifier-declaration` | [上游元数据 / LICENSE](https://pypi.org/pypi/tomli-w/1.2.0/json) |
| `tqdm` | `4.67.1` | — | MPL-2.0 AND MIT | `declared` | [上游元数据 / LICENSE](https://pypi.org/pypi/tqdm/4.67.1/json) |
| `tree-sitter` | `0.25.2` | — | MIT License | `classifier-declaration` | [上游元数据 / LICENSE](https://pypi.org/pypi/tree-sitter/0.25.2/json) |
| `tree-sitter-c-sharp` | `0.23.1` | — | MIT | `declared` | [上游元数据 / LICENSE](https://pypi.org/pypi/tree-sitter-c-sharp/0.23.1/json) |
| `tree-sitter-go` | `0.25.0` | — | MIT | `declared` | [上游元数据 / LICENSE](https://pypi.org/pypi/tree-sitter-go/0.25.0/json) |
| `tree-sitter-java` | `0.23.5` | — | MIT | `declared` | [上游元数据 / LICENSE](https://pypi.org/pypi/tree-sitter-java/0.23.5/json) |
| `tree-sitter-javascript` | `0.25.0` | — | MIT | `declared` | [上游元数据 / LICENSE](https://pypi.org/pypi/tree-sitter-javascript/0.25.0/json) |
| `tree-sitter-kotlin` | `1.1.0` | — | MIT | `declared` | [上游元数据 / LICENSE](https://pypi.org/pypi/tree-sitter-kotlin/1.1.0/json) |
| `tree-sitter-php` | `0.24.1` | — | MIT | `declared` | [上游元数据 / LICENSE](https://pypi.org/pypi/tree-sitter-php/0.24.1/json) |
| `tree-sitter-python` | `0.25.0` | — | MIT | `declared` | [上游元数据 / LICENSE](https://pypi.org/pypi/tree-sitter-python/0.25.0/json) |
| `tree-sitter-ruby` | `0.23.1` | — | MIT | `declared` | [上游元数据 / LICENSE](https://pypi.org/pypi/tree-sitter-ruby/0.23.1/json) |
| `tree-sitter-rust` | `0.24.0` | — | MIT | `declared` | [上游元数据 / LICENSE](https://pypi.org/pypi/tree-sitter-rust/0.24.0/json) |
| `tree-sitter-typescript` | `0.23.2` | — | MIT | `declared` | [上游元数据 / LICENSE](https://pypi.org/pypi/tree-sitter-typescript/0.23.2/json) |
| `typer` | `0.20.1` | — | MIT | `declared` | [上游元数据 / LICENSE](https://pypi.org/pypi/typer/0.20.1/json) |
| `typer-slim` | `0.20.1` | — | MIT | `declared` | [上游元数据 / LICENSE](https://pypi.org/pypi/typer-slim/0.20.1/json) |
| `typing-extensions` | `4.15.0` | — | PSF-2.0 | `declared` | [上游元数据 / LICENSE](https://pypi.org/pypi/typing-extensions/4.15.0/json) |
| `typing-inspection` | `0.4.2` | — | MIT | `declared` | [上游元数据 / LICENSE](https://pypi.org/pypi/typing-inspection/0.4.2/json) |
| `urllib3` | `2.6.2` | — | MIT | `declared` | [上游元数据 / LICENSE](https://pypi.org/pypi/urllib3/2.6.2/json) |
| `uvicorn` | `0.38.0` | — | BSD-3-Clause | `declared` | [上游元数据 / LICENSE](https://pypi.org/pypi/uvicorn/0.38.0/json) |
| `virtualenv` | `20.35.4` | — | MIT | `declared` | [上游元数据 / LICENSE](https://pypi.org/pypi/virtualenv/20.35.4/json) |
| `yara-python` | `4.5.4` | — | Apache 2.0 | `declared` | [上游元数据 / LICENSE](https://pypi.org/pypi/yara-python/4.5.4/json) |
| `yarl` | `1.22.0` | — | Apache-2.0 | `declared` | [上游元数据 / LICENSE](https://pypi.org/pypi/yarl/1.22.0/json) |
| `zipp` | `3.23.0` | — | MIT | `declared` | [上游元数据 / LICENSE](https://pypi.org/pypi/zipp/3.23.0/json) |

### aegis-frontend-all-locked-platforms

| 包名 | 锁定版本 | 平台 / 条件标记 | 上游许可声明 | 依据类型 | 版本证据 |
| --- | --- | --- | --- | --- | --- |
| `@emnapi/core` | `2.0.0-alpha.3` | — | MIT | `declared` | [上游元数据 / LICENSE](https://registry.npmjs.org/%40emnapi%2Fcore/2.0.0-alpha.3) |
| `@emnapi/runtime` | `2.0.0-alpha.3` | — | MIT | `declared` | [上游元数据 / LICENSE](https://registry.npmjs.org/%40emnapi%2Fruntime/2.0.0-alpha.3) |
| `@emnapi/wasi-threads` | `2.0.1` | — | MIT | `declared` | [上游元数据 / LICENSE](https://registry.npmjs.org/%40emnapi%2Fwasi-threads/2.0.1) |
| `@napi-rs/wasm-runtime` | `1.2.2` | — | MIT | `declared` | [上游元数据 / LICENSE](https://registry.npmjs.org/%40napi-rs%2Fwasm-runtime/1.2.2) |
| `@oxc-project/types` | `0.142.0` | — | MIT | `declared` | [上游元数据 / LICENSE](https://registry.npmjs.org/%40oxc-project%2Ftypes/0.142.0) |
| `@rolldown/binding-android-arm64` | `1.2.1` | {"os":["android"],"cpu":["arm64"]} | MIT | `declared` | [上游元数据 / LICENSE](https://registry.npmjs.org/%40rolldown%2Fbinding-android-arm64/1.2.1) |
| `@rolldown/binding-darwin-arm64` | `1.2.1` | {"os":["darwin"],"cpu":["arm64"]} | MIT | `declared` | [上游元数据 / LICENSE](https://registry.npmjs.org/%40rolldown%2Fbinding-darwin-arm64/1.2.1) |
| `@rolldown/binding-darwin-x64` | `1.2.1` | {"os":["darwin"],"cpu":["x64"]} | MIT | `declared` | [上游元数据 / LICENSE](https://registry.npmjs.org/%40rolldown%2Fbinding-darwin-x64/1.2.1) |
| `@rolldown/binding-freebsd-x64` | `1.2.1` | {"os":["freebsd"],"cpu":["x64"]} | MIT | `declared` | [上游元数据 / LICENSE](https://registry.npmjs.org/%40rolldown%2Fbinding-freebsd-x64/1.2.1) |
| `@rolldown/binding-linux-arm-gnueabihf` | `1.2.1` | {"os":["linux"],"cpu":["arm"]} | MIT | `declared` | [上游元数据 / LICENSE](https://registry.npmjs.org/%40rolldown%2Fbinding-linux-arm-gnueabihf/1.2.1) |
| `@rolldown/binding-linux-arm64-gnu` | `1.2.1` | {"os":["linux"],"cpu":["arm64"],"libc":["glibc"]} | MIT | `declared` | [上游元数据 / LICENSE](https://registry.npmjs.org/%40rolldown%2Fbinding-linux-arm64-gnu/1.2.1) |
| `@rolldown/binding-linux-arm64-musl` | `1.2.1` | {"os":["linux"],"cpu":["arm64"],"libc":["musl"]} | MIT | `declared` | [上游元数据 / LICENSE](https://registry.npmjs.org/%40rolldown%2Fbinding-linux-arm64-musl/1.2.1) |
| `@rolldown/binding-linux-ppc64-gnu` | `1.2.1` | {"os":["linux"],"cpu":["ppc64"],"libc":["glibc"]} | MIT | `declared` | [上游元数据 / LICENSE](https://registry.npmjs.org/%40rolldown%2Fbinding-linux-ppc64-gnu/1.2.1) |
| `@rolldown/binding-linux-s390x-gnu` | `1.2.1` | {"os":["linux"],"cpu":["s390x"],"libc":["glibc"]} | MIT | `declared` | [上游元数据 / LICENSE](https://registry.npmjs.org/%40rolldown%2Fbinding-linux-s390x-gnu/1.2.1) |
| `@rolldown/binding-linux-x64-gnu` | `1.2.1` | {"os":["linux"],"cpu":["x64"],"libc":["glibc"]} | MIT | `declared` | [上游元数据 / LICENSE](https://registry.npmjs.org/%40rolldown%2Fbinding-linux-x64-gnu/1.2.1) |
| `@rolldown/binding-linux-x64-musl` | `1.2.1` | {"os":["linux"],"cpu":["x64"],"libc":["musl"]} | MIT | `declared` | [上游元数据 / LICENSE](https://registry.npmjs.org/%40rolldown%2Fbinding-linux-x64-musl/1.2.1) |
| `@rolldown/binding-openharmony-arm64` | `1.2.1` | {"os":["openharmony"],"cpu":["arm64"]} | MIT | `declared` | [上游元数据 / LICENSE](https://registry.npmjs.org/%40rolldown%2Fbinding-openharmony-arm64/1.2.1) |
| `@rolldown/binding-wasm32-wasi` | `1.2.1` | — | MIT | `declared` | [上游元数据 / LICENSE](https://registry.npmjs.org/%40rolldown%2Fbinding-wasm32-wasi/1.2.1) |
| `@rolldown/binding-win32-arm64-msvc` | `1.2.1` | {"os":["win32"],"cpu":["arm64"]} | MIT | `declared` | [上游元数据 / LICENSE](https://registry.npmjs.org/%40rolldown%2Fbinding-win32-arm64-msvc/1.2.1) |
| `@rolldown/binding-win32-x64-msvc` | `1.2.1` | {"os":["win32"],"cpu":["x64"]} | MIT | `declared` | [上游元数据 / LICENSE](https://registry.npmjs.org/%40rolldown%2Fbinding-win32-x64-msvc/1.2.1) |
| `@rolldown/pluginutils` | `1.0.1` | — | MIT | `declared` | [上游元数据 / LICENSE](https://registry.npmjs.org/%40rolldown%2Fpluginutils/1.0.1) |
| `@tybys/wasm-util` | `0.10.3` | — | MIT | `declared` | [上游元数据 / LICENSE](https://registry.npmjs.org/%40tybys%2Fwasm-util/0.10.3) |
| `@vitejs/plugin-react` | `6.0.5` | — | MIT | `declared` | [上游元数据 / LICENSE](https://registry.npmjs.org/%40vitejs%2Fplugin-react/6.0.5) |
| `detect-libc` | `2.1.2` | — | Apache-2.0 | `declared` | [上游元数据 / LICENSE](https://registry.npmjs.org/detect-libc/2.1.2) |
| `fdir` | `6.5.0` | — | MIT | `declared` | [上游元数据 / LICENSE](https://registry.npmjs.org/fdir/6.5.0) |
| `fsevents` | `2.3.3` | {"os":["darwin"]} | MIT | `declared` | [上游元数据 / LICENSE](https://registry.npmjs.org/fsevents/2.3.3) |
| `lightningcss-android-arm64` | `1.33.0` | {"os":["android"],"cpu":["arm64"]} | MPL-2.0 | `declared` | [上游元数据 / LICENSE](https://registry.npmjs.org/lightningcss-android-arm64/1.33.0) |
| `lightningcss-darwin-arm64` | `1.33.0` | {"os":["darwin"],"cpu":["arm64"]} | MPL-2.0 | `declared` | [上游元数据 / LICENSE](https://registry.npmjs.org/lightningcss-darwin-arm64/1.33.0) |
| `lightningcss-darwin-x64` | `1.33.0` | {"os":["darwin"],"cpu":["x64"]} | MPL-2.0 | `declared` | [上游元数据 / LICENSE](https://registry.npmjs.org/lightningcss-darwin-x64/1.33.0) |
| `lightningcss-freebsd-x64` | `1.33.0` | {"os":["freebsd"],"cpu":["x64"]} | MPL-2.0 | `declared` | [上游元数据 / LICENSE](https://registry.npmjs.org/lightningcss-freebsd-x64/1.33.0) |
| `lightningcss-linux-arm-gnueabihf` | `1.33.0` | {"os":["linux"],"cpu":["arm"]} | MPL-2.0 | `declared` | [上游元数据 / LICENSE](https://registry.npmjs.org/lightningcss-linux-arm-gnueabihf/1.33.0) |
| `lightningcss-linux-arm64-gnu` | `1.33.0` | {"os":["linux"],"cpu":["arm64"],"libc":["glibc"]} | MPL-2.0 | `declared` | [上游元数据 / LICENSE](https://registry.npmjs.org/lightningcss-linux-arm64-gnu/1.33.0) |
| `lightningcss-linux-arm64-musl` | `1.33.0` | {"os":["linux"],"cpu":["arm64"],"libc":["musl"]} | MPL-2.0 | `declared` | [上游元数据 / LICENSE](https://registry.npmjs.org/lightningcss-linux-arm64-musl/1.33.0) |
| `lightningcss-linux-x64-gnu` | `1.33.0` | {"os":["linux"],"cpu":["x64"],"libc":["glibc"]} | MPL-2.0 | `declared` | [上游元数据 / LICENSE](https://registry.npmjs.org/lightningcss-linux-x64-gnu/1.33.0) |
| `lightningcss-linux-x64-musl` | `1.33.0` | {"os":["linux"],"cpu":["x64"],"libc":["musl"]} | MPL-2.0 | `declared` | [上游元数据 / LICENSE](https://registry.npmjs.org/lightningcss-linux-x64-musl/1.33.0) |
| `lightningcss-win32-arm64-msvc` | `1.33.0` | {"os":["win32"],"cpu":["arm64"]} | MPL-2.0 | `declared` | [上游元数据 / LICENSE](https://registry.npmjs.org/lightningcss-win32-arm64-msvc/1.33.0) |
| `lightningcss-win32-x64-msvc` | `1.33.0` | {"os":["win32"],"cpu":["x64"]} | MPL-2.0 | `declared` | [上游元数据 / LICENSE](https://registry.npmjs.org/lightningcss-win32-x64-msvc/1.33.0) |
| `lightningcss` | `1.33.0` | — | MPL-2.0 | `declared` | [上游元数据 / LICENSE](https://registry.npmjs.org/lightningcss/1.33.0) |
| `nanoid` | `3.3.18` | — | MIT | `declared` | [上游元数据 / LICENSE](https://registry.npmjs.org/nanoid/3.3.18) |
| `picocolors` | `1.1.1` | — | ISC | `declared` | [上游元数据 / LICENSE](https://registry.npmjs.org/picocolors/1.1.1) |
| `picomatch` | `4.0.5` | — | MIT | `declared` | [上游元数据 / LICENSE](https://registry.npmjs.org/picomatch/4.0.5) |
| `postcss` | `8.5.25` | — | MIT | `declared` | [上游元数据 / LICENSE](https://registry.npmjs.org/postcss/8.5.25) |
| `react-dom` | `19.2.8` | — | MIT | `declared` | [上游元数据 / LICENSE](https://registry.npmjs.org/react-dom/19.2.8) |
| `react` | `19.2.8` | — | MIT | `declared` | [上游元数据 / LICENSE](https://registry.npmjs.org/react/19.2.8) |
| `rolldown` | `1.2.1` | — | MIT | `declared` | [上游元数据 / LICENSE](https://registry.npmjs.org/rolldown/1.2.1) |
| `scheduler` | `0.27.0` | — | MIT | `declared` | [上游元数据 / LICENSE](https://registry.npmjs.org/scheduler/0.27.0) |
| `source-map-js` | `1.2.1` | — | BSD-3-Clause | `declared` | [上游元数据 / LICENSE](https://registry.npmjs.org/source-map-js/1.2.1) |
| `tinyglobby` | `0.2.17` | — | MIT | `declared` | [上游元数据 / LICENSE](https://registry.npmjs.org/tinyglobby/0.2.17) |
| `tslib` | `2.8.1` | — | 0BSD | `declared` | [上游元数据 / LICENSE](https://registry.npmjs.org/tslib/2.8.1) |
| `vite` | `8.2.0` | — | MIT | `declared` | [上游元数据 / LICENSE](https://registry.npmjs.org/vite/8.2.0) |

## 尚未解决的组件级事项

包级依赖许可依据已逐条记录，但 SimCSE 模型权重的授权状态仍待确认；Qwen2.5 Ollama 标签及部分外部工具未在本仓库按内容摘要或版本固定。它们不属于已被本附表解决的事项。

可编辑 CSV：[third-party-dependencies.csv](third-party-dependencies.csv)。
