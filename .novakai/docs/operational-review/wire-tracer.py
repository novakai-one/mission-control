#!/usr/bin/env python3
"""Kimi wire.jsonl tracer — turns a session's event stream into readable digests.

Usage:
  python3 trace.py digest <agent>            # full readable timeline for one agent
  python3 trace.py stats                     # cross-agent stats table
  python3 trace.py grep <regex>              # find events matching regex across all agents
"""
import json, os, re, sys, datetime, collections

BASE = os.path.expanduser(
    "~/.kimi-code/sessions/wd_novakai-command_f6218118a6cc/"
    "session_76665705-fcbe-413f-8c5f-d99d1a894af6/agents"
)
AEST = datetime.timezone(datetime.timedelta(hours=10))

def ts(ms):
    if not ms: return "??:??:??"
    return datetime.datetime.fromtimestamp(ms / 1000, AEST).strftime("%H:%M:%S")

def day(ms):
    return datetime.datetime.fromtimestamp(ms / 1000, AEST).strftime("%d %b %H:%M:%S")

def load(agent):
    p = os.path.join(BASE, agent, "wire.jsonl")
    out = []
    with open(p) as f:
        for line in f:
            line = line.strip()
            if line:
                out.append(json.loads(line))
    return out

def clip(s, n):
    s = re.sub(r"\s+", " ", str(s)).strip()
    return s if len(s) <= n else s[: n - 1] + "…"

def fmt_args(name, args):
    if not isinstance(args, dict):
        return clip(args, 160)
    if name in ("Read",):
        extra = ""
        if args.get("offset") or args.get("limit"):
            extra = f" [{args.get('offset','')}:{args.get('limit','')}]"
        return (args.get("path") or args.get("file_path", "?")) + extra
    if name in ("Write",):
        return f"{args.get('path') or args.get('file_path','?')} ({len(str(args.get('content','')))}ch)"
    if name in ("Edit", "MultiEdit", "StrReplace"):
        p = args.get("path") or args.get("file_path", "?")
        old = clip(args.get("old_string") or args.get("old_str", ""), 60)
        return f"{p}  old≈'{old}'"
    if name == "Bash":
        return clip(args.get("command", "?"), 220)
    if name in ("Grep", "Glob"):
        return clip(json.dumps({k: v for k, v in args.items() if k in ("pattern", "path", "glob")}), 160)
    if name == "Agent":
        return f"[SPAWN subagent] prompt={clip(args.get('prompt',''),300)}"
    if name == "TodoList":
        todos = args.get("todos", [])
        if isinstance(todos, list):
            return " | ".join(f"{t.get('status','?')[:4]}:{clip(t.get('title',''),40)}" for t in todos)
    if name == "ReadMediaFile":
        return args.get("path", "?")
    return clip(json.dumps(args), 200)

def digest(agent, think_n=260, text_n=4000, result_n=280):
    events = load(agent)
    lines = []
    turn_prompt_count = 0
    for o in events:
        t = o.get("type")
        tm = o.get("time")
        if t == "turn.prompt":
            turn_prompt_count += 1
            inp = o.get("input", [])
            txts = []
            for part in inp:
                if part.get("type") == "text":
                    txts.append(part["text"])
                else:
                    txts.append(f"[{part.get('type')}]")
            lines.append(f"\n{'='*100}\n[{day(tm)}] ###### USER PROMPT #{turn_prompt_count} ######\n" + "\n".join(txts))
        elif t == "turn.cancel":
            lines.append(f"[{day(tm)}] !!!!!! TURN CANCELLED (user interrupt) !!!!!!")
        elif t == "tools.update_store" and o.get("key") == "todo":
            v = o.get("value", [])
            lines.append(f"[{ts(tm)}] TODO: " + " | ".join(f"{i.get('status','?')[:4]}:{clip(i.get('title',''),50)}" for i in v))
        elif t == "context.append_message":
            m = o.get("message", {})
            role = m.get("role")
            content = m.get("content")
            if isinstance(content, list):
                txt = " ".join(p.get("text", f"[{p.get('type')}]") for p in content if isinstance(p, dict))
            else:
                txt = str(content)
            lines.append(f"[{ts(tm)}] (append_message {role}): {clip(txt, 500)}")
        elif t == "context.append_loop_event":
            ev = o["event"]
            et = ev.get("type")
            if et == "content.part":
                part = ev.get("part", {})
                pt = part.get("type")
                if pt == "think":
                    lines.append(f"[{ts(tm)}] think: {clip(part.get('think',''), think_n)}")
                elif pt == "text":
                    lines.append(f"[{ts(tm)}] SAY: {part.get('text','')[:text_n]}")
                else:
                    lines.append(f"[{ts(tm)}] part({pt})")
            elif et == "tool.call":
                lines.append(f"[{ts(tm)}] >> {ev.get('name')}: {fmt_args(ev.get('name'), ev.get('args'))}   ({ev.get('toolCallId','')[-6:]})")
            elif et == "tool.result":
                r = ev.get("result", {})
                out = r.get("output") if isinstance(r, dict) else r
                err = (r.get("error") or r.get("is_error")) if isinstance(r, dict) else None
                mark = " !!ERROR!!" if err else ""
                lines.append(f"[{ts(tm)}] <<{mark} {clip(out, result_n)}   ({ev.get('toolCallId','')[-6:]})")
            elif et == "step.end":
                u = ev.get("usage", {}) or {}
                lines.append(
                    f"[{ts(tm)}] -- step {ev.get('step')} end ({ev.get('finishReason')}) "
                    f"out={u.get('output',0)} inNew={u.get('inputOther',0)} cache={u.get('inputCacheRead',0)}"
                )
    return "\n".join(lines)

def stats():
    rows = []
    for agent in sorted(os.listdir(BASE)):
        p = os.path.join(BASE, agent, "wire.jsonl")
        if not os.path.exists(p):
            continue
        events = load(agent)
        first = events[0].get("created_at") or events[0].get("time")
        last = max(e.get("time", 0) for e in events)
        usage = collections.Counter()
        tools = collections.Counter()
        errors = 0
        steps = 0
        maxctx = 0
        for o in events:
            if o.get("type") == "usage.record":
                for k, v in (o.get("usage") or {}).items():
                    usage[k] += v
            if o.get("type") == "context.append_loop_event":
                ev = o["event"]
                if ev.get("type") == "tool.call":
                    tools[ev.get("name")] += 1
                if ev.get("type") == "step.end":
                    steps += 1
                    u = ev.get("usage") or {}
                    ctx = (u.get("inputOther", 0) + u.get("inputCacheRead", 0) + u.get("inputCacheCreation", 0))
                    maxctx = max(maxctx, ctx)
                if ev.get("type") == "tool.result":
                    r = ev.get("result")
                    if isinstance(r, dict) and (r.get("error") or r.get("is_error")):
                        errors += 1
        dur = (last - first) / 60000 if first else 0
        rows.append({
            "agent": agent, "start": day(first), "end": day(last), "min": round(dur),
            "steps": steps, "toolcalls": sum(tools.values()), "errors": errors,
            "out_tok": usage.get("output", 0),
            "in_new": usage.get("inputOther", 0) + usage.get("inputCacheCreation", 0),
            "cache_rd": usage.get("inputCacheRead", 0),
            "max_ctx": maxctx,
            "top_tools": ", ".join(f"{k}×{v}" for k, v in tools.most_common(6)),
        })
    hdr = f"{'agent':9} {'start':16} {'end':16} {'min':>4} {'steps':>5} {'tools':>5} {'err':>4} {'out_tok':>8} {'in_new':>9} {'cache_rd':>11} {'max_ctx':>8}  top_tools"
    print(hdr)
    for r in rows:
        print(f"{r['agent']:9} {r['start']:16} {r['end']:16} {r['min']:>4} {r['steps']:>5} {r['toolcalls']:>5} {r['errors']:>4} {r['out_tok']:>8} {r['in_new']:>9} {r['cache_rd']:>11} {r['max_ctx']:>8}  {r['top_tools']}")

def grepper(pattern):
    rx = re.compile(pattern, re.I)
    for agent in sorted(os.listdir(BASE)):
        p = os.path.join(BASE, agent, "wire.jsonl")
        if not os.path.exists(p):
            continue
        for o in load(agent):
            s = json.dumps(o)
            if rx.search(s):
                t = o.get("type")
                tm = o.get("time")
                detail = ""
                if t == "context.append_loop_event":
                    ev = o["event"]
                    t = f"{t}/{ev.get('type')}"
                    if ev.get("type") == "tool.call":
                        detail = f"{ev.get('name')}: {fmt_args(ev.get('name'), ev.get('args'))}"
                    elif ev.get("type") == "content.part":
                        part = ev.get("part", {})
                        detail = clip(part.get("think") or part.get("text", ""), 300)
                    elif ev.get("type") == "tool.result":
                        r = ev.get("result", {})
                        detail = clip(r.get("output") if isinstance(r, dict) else r, 300)
                else:
                    detail = clip(s, 200)
                print(f"{agent:9} [{day(tm) if tm else '?'}] {t}: {detail}")

if __name__ == "__main__":
    cmd = sys.argv[1]
    if cmd == "digest":
        print(digest(sys.argv[2]))
    elif cmd == "stats":
        stats()
    elif cmd == "grep":
        grepper(sys.argv[2])
