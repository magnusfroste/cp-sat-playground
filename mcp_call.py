#!/usr/bin/env python3
"""Call a tool on the AgentPages MCP server (https://pages.agenthotel.org/mcp).

Usage: python mcp_call.py <tool> '<json-args>'     e.g. python mcp_call.py list_sites '{}'
Reads the bearer token from the Hermes config, so no secret on the command line.
"""
import json
import re
import sys
import urllib.request
from pathlib import Path

URL = "https://pages.agenthotel.org/mcp"
CONF = Path("/opt/data/profiles/flowwink/config.yaml")
UA = "hermes-mcp-client/1.0"


def token():
    txt = CONF.read_text(encoding="utf-8")
    m = re.search(r"^  pages:\n(.*?)(?=^  [a-zA-Z0-9_.-]+:)", txt, re.M | re.S)
    t = re.search(r"Authorization:\s*Bearer\s+(\S+)", m.group(1) if m else txt)
    return t.group(1).strip().strip('"')


class MCP:
    def __init__(self):
        self.sid = None
        self.n = 0

    def post(self, payload):
        self.n += 1
        payload.update({"jsonrpc": "2.0", "id": self.n})
        headers = {"Authorization": f"Bearer {token()}", "Content-Type": "application/json",
                   "Accept": "application/json, text/event-stream", "User-Agent": UA}
        if self.sid:
            headers["Mcp-Session-Id"] = self.sid
        req = urllib.request.Request(URL, data=json.dumps(payload).encode(),
                                     headers=headers, method="POST")
        with urllib.request.urlopen(req, timeout=300) as r:
            if r.headers.get("Mcp-Session-Id"):
                self.sid = r.headers["Mcp-Session-Id"]
            body = r.read().decode()
        if body.lstrip().startswith("{"):
            return json.loads(body)
        for line in body.splitlines():
            if line.startswith("data:"):
                return json.loads(line[5:].strip())
        return {}

    def init(self):
        self.post({"method": "initialize", "params": {
            "protocolVersion": "2025-06-18", "capabilities": {},
            "clientInfo": {"name": "hermes", "version": "1"}}})
        self.post({"method": "notifications/initialized", "params": {}})

    def call(self, name, args):
        return self.post({"method": "tools/call", "params": {"name": name, "arguments": args}})


def main():
    tool = sys.argv[1]
    args = json.loads(sys.argv[2]) if len(sys.argv) > 2 else {}
    m = MCP()
    m.init()
    res = m.call(tool, args)
    print(json.dumps(res, indent=1, ensure_ascii=False)[:4000])


if __name__ == "__main__":
    main()