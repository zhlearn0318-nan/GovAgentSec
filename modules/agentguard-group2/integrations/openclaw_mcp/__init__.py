"""Minimal, fail-closed MCP bridge for the AgentGuard HTTP enforcement point.

The local stdio bridge exposes a narrowly controlled demo tool set, while the
remote HTTP bridge remains read-only.  The bridge deliberately has no database,
payment, shell, or business-adapter imports: every business call must cross
AgentGuard's ``POST /invoke`` policy, ticket, sandbox and audit chain.
"""

from .agentguard_client import AgentGuardClient, AgentGuardClientError
from .auth import (
    AuthenticatedPrincipal,
    McpAuthenticationError,
    McpAuthenticator,
    protected_resource_metadata,
    validate_https_endpoint,
)
from .config import AdapterConfig, AdapterConfigError
from .http_server import (
    McpHttpServer,
    RemoteAgentGuardClient,
    RemoteMcpError,
    RemoteMcpServer,
    StreamableHttpMcpServer,
)
from .server import MCP_PROTOCOL_VERSION, SERVER_VERSION, McpServer

__all__ = [
    "AdapterConfig",
    "AdapterConfigError",
    "AgentGuardClient",
    "AgentGuardClientError",
    "AuthenticatedPrincipal",
    "MCP_PROTOCOL_VERSION",
    "McpHttpServer",
    "McpAuthenticationError",
    "McpAuthenticator",
    "RemoteAgentGuardClient",
    "RemoteMcpError",
    "RemoteMcpServer",
    "SERVER_VERSION",
    "McpServer",
    "StreamableHttpMcpServer",
    "protected_resource_metadata",
    "validate_https_endpoint",
]
