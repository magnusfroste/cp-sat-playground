#!/usr/bin/env python3
"""Publish a local folder to AgentPages (https://pages.agenthotel.org) over MCP.

Usage: python publish_pages.py <site-slug> "<Title>" <dir> [--keep]

Reads the bearer token from the Hermes config (mcp_servers.pages.headers.Authorization)
so no secret goes on the command line. Uses the streamable-HTTP MCP transport:
initialize -> notifications/initialized -> tools/call.
"""
import json
import re
import sys
import urllib.request
from pathlib import Path

CONF = Path("/opt/data/profiles/flowwink/config.yaml")
URL = "https://pages.agenthotel.org/mcp"
TEXT = {".html", ".css", ".js", ".json", ".md", ".svg", ".txt"}


def token() -> str:
    txt = CONF.read_text(encoding="utf-8")
    # find the pages block, then its Authorization header
    m = re.search(r"^\s*pages:\s*$(.*?)(?=^\s{2}[a-zA-Z0-9_.-]+:\s*$)", txt, re.M | re.S)
    block = m.group(1) if m else txt
    t = re.search(r"Authorization:\s*Bearer\s+(\S+)", block)
    if not t:
        t = re.search(r"Authorization:\s*Bearer\s+(\S+)", txt)
    return t.group(1).strip().strip('"')


class MCP:
    def __init__(self, url, tok):
        self.url, self.tok, self.sid, self.n = url, tok, None, 0

    def _post(self, payload):
        self.n += 1
        payload.setdefault("jsonrpc", "2.0")
        payload["id"] = self.n
        req = urllib.request.Request(
            self.url, data=json.dumps(payload).encode(),
            headers={"Authorization": f"Bearer {self.tok}",
                     "Content-Type": "application/json",
                     "Accept": "application/json, text/event-stream",
                     **({"Mcp-Session-Id": self.sid} if self.sid else {})},
            method="POST")
        with urllib.request.urlopen(req, timeout=180) as r:
            if r.headers.get("Mcp-Session-Id"):
                self.sid = r.headers["Mcp-Session-Id"]
            body = r.read().decode()
        return self._parse(body)

    @staticmethod
    def _parse(body):
        if body.lstrip().startswith("{"):
            return json.loads(body)
        for line in body.splitlines():
            if line.startswith("data:"):
                try:
                    return json.loads(line[5:].strip())
                except json.JSONDecodeError:
                    continue
        return {}

    def initialize(self):
        self._post({"method": "initialize", "params": {
            "protocolVersion": "2025-06-18", "capabilities": {},
            "clientInfo": {"name": "hermes-publish", "version": "1"}}})
        self._post({"method": "notifications/initialized", "params": {}})

    def call(self, name, args):
        res = self._post({"method": "tools/call", "params": {"name": name, "arguments": args}})
        return res.get("result", res)


def collect(folder: Path):
    files = {}
    for p in sorted(folder.rglob("*")):
        if p.is_dir() or ".git" in p.parts or p.name.startswith("."):
            continue
        if p.suffix.lower() not in TEXT:
            print("skip (binary):", p)
            continue
        files[str(p.relative_to(folder))] = p.read_text(encoding="utf-8")
    return files


def main():
    if len(sys.argv) < 4:
        print(__doc__)
        sys.exit(1)
    slug, title, folder = sys.argv[1], sys.argv[2], Path(sys.argv[3])
    keep = "--keep" in sys.argv
    files = collect(folder)
    print("files:", ", ".join(files))
    m = MCP(URL, token())
    m.initialize()
    args = {"site": slug, "title": title, "files": files}
    if keep:
        args["keep_existing"] = True
    out = m.call("publish_site", args)
    print(json.dumps(out, indent=1)[:2000])


if __name__ == "__main__":
    main()