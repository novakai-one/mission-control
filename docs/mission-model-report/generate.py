#!/usr/bin/env python3
"""Generate the mission-model visual report diagrams from live .novakai data.

Read-only: reads .novakai/stores + .novakai-command registry, writes 3 PNGs
next to this script. Run: python3 docs/mission-model-report/generate.py
"""
import json
import os
import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.patches import FancyBboxPatch

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
OUT = os.path.dirname(os.path.abspath(__file__))

STATUS_COLORS = {
    "done": "#2e7d32",
    "in-progress": "#1565c0",
    "todo": "#757575",
    "retired": "#9e9e9e",
}
HARD = "#2e7d32"   # typed ref — hard link
SOFT = "#ef6c00"   # free-text — soft link
MISSING = "#c62828"  # no link exists
READ = "#607d8b"   # read-only composition edge


def load_jsonl(path):
    with open(path) as f:
        return [json.loads(l) for l in f if l.strip()]


missions = load_jsonl(os.path.join(ROOT, ".novakai/stores/missions.jsonl"))
tasks = load_jsonl(os.path.join(ROOT, ".novakai/stores/tasks.jsonl"))
projects = load_jsonl(os.path.join(ROOT, ".novakai/stores/projects.jsonl"))
with open(os.path.join(ROOT, ".novakai-command/agents.json")) as f:
    agents = json.load(f)
    agents = list(agents.values()) if isinstance(agents, dict) else agents


def ref(block, kind):
    return [r["value"] for r in block.get("refs", []) if r.get("kind") == kind]


# ---------------------------------------------------------------- helpers

def box(ax, x, y, w, h, title, fields, color="#37474f", title_h=0.16, fs=8.5):
    """UML-ish box: title bar + field lines. y = bottom."""
    ax.add_patch(FancyBboxPatch((x, y), w, h, boxstyle="round,pad=0.4",
                                fc="white", ec=color, lw=1.6, zorder=2))
    th = h * title_h
    ax.add_patch(FancyBboxPatch((x, y + h - th), w, th, boxstyle="round,pad=0.4",
                                fc=color, ec=color, lw=1.6, zorder=3))
    ax.text(x + w / 2, y + h - th / 2, title, ha="center", va="center",
            color="white", fontsize=10, fontweight="bold", zorder=4)
    n = len(fields)
    for i, line in enumerate(fields):
        fy = y + h - th - (i + 0.7) * (h - th) / (n + 0.4)
        ax.text(x + 1.2, fy, line, ha="left", va="center", fontsize=fs,
                family="monospace", zorder=4)


def edge(ax, p1, p2, label, color, style="-", lx=0, ly=1.5, fs=8):
    ax.annotate("", xy=p2, xytext=p1,
                arrowprops=dict(arrowstyle="-|>", color=color, lw=1.8,
                                linestyle=style, shrinkA=2, shrinkB=2), zorder=1)
    mx, my = (p1[0] + p2[0]) / 2 + lx, (p1[1] + p2[1]) / 2 + ly
    ax.text(mx, my, label, ha="center", fontsize=fs, color=color,
            fontweight="bold", zorder=5,
            bbox=dict(fc="white", ec="none", alpha=0.85, pad=1))


def canvas(w, h, title):
    fig, ax = plt.subplots(figsize=(w, h))
    ax.set_xlim(0, 100)
    ax.set_ylim(0, 100)
    ax.axis("off")
    ax.set_title(title, fontsize=15, fontweight="bold", pad=14)
    return fig, ax


# ================================================================ DIAGRAM 1
# Object model — the "class diagram"
fig, ax = canvas(13, 9, "Mission object model — every box is a real data root, every line is a link type")

box(ax, 2, 74, 22, 20, "objective  (okrs.jsonl)",
    ["id   okr_<slug>", "title", "horizon now|next|later", "KRs = flat blocks,", "  ref back to objective"])
box(ax, 2, 44, 22, 20, "project  (projects.jsonl)",
    ["id   proj_<slug>", "title", "status", "path (absolute)"])
box(ax, 34, 40, 30, 30, "mission  (missions.jsonl)",
    ["id, title, status, owner", "refs[]  typed links", "outcome*   (6/15 have it)",
     "stage*     (6/15)", "team*      (2/15, strings)", "* optional, not enforced"],
    color="#4e342e")
box(ax, 34, 8, 30, 20, "task  (tasks.jsonl)",
    ["id, title, status", "refs[]  typed links"])
box(ax, 74, 66, 24, 24, "agent  (agents.json)", ["agentId", "title  e.g. Manager Fable",
    "provider  kimi|claude|codex", "status  running|exited", "sessionId, terminalPid"], color="#4a148c")
box(ax, 74, 38, 24, 18, "journal (messages.jsonl)", ["from, to, body", "agent-to-agent mail"], color="#4a148c")
box(ax, 74, 8, 24, 18, "Mission Room", ["read-only composition", "joins all 4 roots",
    "provenance per field", "never writes"], color="#00695c")

edge(ax, (24, 54), (34, 55), "mission → project\ntyped ref (14×)", HARD, lx=-2)
edge(ax, (24, 84), (38, 70), "mission → objective\ntyped ref (2×)", HARD, lx=-4, ly=5)
edge(ax, (44, 40), (44, 28), "mission ⇄ task\ntyped refs (sparse)", HARD, lx=14)
edge(ax, (64, 62), (74, 74), 'team = free-text strings\n"Docs Render · opus"', SOFT, style="--", lx=-3, ly=4)
edge(ax, (64, 46), (76, 66), "agent ⇢ mission\nNO FIELD EITHER SIDE", MISSING, style=":", lx=-3, ly=-5)
edge(ax, (86, 66), (86, 56), "mail about work,\nno mission field", SOFT, style="--", lx=13, fs=7.5)
for p1, p2 in [((49, 40), (80, 26)), ((86, 38), (86, 26)), ((49, 28), (76, 26))]:
    edge(ax, p1, p2, "", READ, style="-.")

# legend
lx, ly = 3, 22
for i, (c, s, t) in enumerate([(HARD, "-", "hard link — typed ref, machine-joinable"),
                               (SOFT, "--", "soft link — free text, human-only"),
                               (MISSING, ":", "missing — no link exists"),
                               (READ, "-.", "Mission Room read edge")]):
    ax.plot([lx, lx + 4], [ly - i * 3.4] * 2, color=c, lw=1.8, linestyle=s)
    ax.text(lx + 5.5, ly - i * 3.4, t, fontsize=8.5, va="center")

fig.savefig(os.path.join(OUT, "1-object-model.png"), dpi=130, bbox_inches="tight")
plt.close(fig)

# ================================================================ DIAGRAM 2
# Live data tree — projects → missions → tasks
proj_missions = {p["id"]: [] for p in projects}
orphan_m = []
for m in missions:
    prefs = ref(m, "project")
    (proj_missions.setdefault(prefs[0], []) if prefs else orphan_m).append(m)

task_by_mission = {}
orphan_t = []
for t in tasks:
    mrefs = ref(t, "mission")
    if mrefs:
        task_by_mission.setdefault(mrefs[0], []).append(t)
    else:
        orphan_t.append(t)

rows = []  # (depth, label, color, extra)
for p in projects:
    rows.append((0, f'{p["id"]}', "#00695c", p.get("status", "")))
    for m in proj_missions.get(p["id"], []):
        badge = ""
        if m.get("outcome"): badge += " ◆outcome"
        if m.get("team"): badge += " ◆team"
        rows.append((1, f'{m["id"]}  [{m["status"]}]{badge}',
                     STATUS_COLORS.get(m["status"], "#000"), ""))
        for t in task_by_mission.get(m["id"], []):
            rows.append((2, f'{t["id"]}  [{t["status"]}]',
                         STATUS_COLORS.get(t["status"], "#000"), ""))
for m in orphan_m:
    rows.append((0, f'(no project) {m["id"]}  [{m["status"]}]',
                 STATUS_COLORS.get(m["status"], "#000"), ""))
rows.append((0, f"(no mission) {len(orphan_t)} tasks — mostly 'refiled' tombstones", "#9e9e9e", ""))

fig, ax = plt.subplots(figsize=(13, max(6, len(rows) * 0.42)))
ax.set_xlim(0, 100)
ax.set_ylim(0, len(rows) + 2)
ax.axis("off")
ax.set_title("What's actually in the stores — hierarchy of live blocks", fontsize=15,
             fontweight="bold", pad=14)
for i, (depth, label, color, extra) in enumerate(rows):
    y = len(rows) - i
    x = 2 + depth * 6
    if depth > 0:
        ax.plot([x - 4, x - 4, x - 0.6], [y + 0.9, y, y], color="#b0bec5", lw=1)
    weight = "bold" if depth == 0 else "normal"
    ax.text(x, y, label, fontsize=9 if depth else 10.5, color=color,
            fontweight=weight, family="monospace", va="center")
ax.text(2, 0.2, "◆ = carries the optional rich field    green=done  blue=in-progress  "
        "gray=todo/retired", fontsize=8.5, color="#546e7a")
fig.savefig(os.path.join(OUT, "2-data-tree.png"), dpi=130, bbox_inches="tight")
plt.close(fig)

# ================================================================ DIAGRAM 3
# Right now — runtime truth vs store truth
running = [a for a in agents if a.get("status") == "running"]
fig, ax = canvas(13, 7.5, "Right now (verified against process table) — who is linked to what")

box(ax, 2, 60, 30, 30, "mission_messaging-state-report",
    ["status: in-progress", 'owner: "manager-kimi-messaging"', "outcome: — (absent)",
     "team: — (absent)", "stage: — (absent)"], color="#1565c0")
box(ax, 44, 68, 26, 22, "Manager Kimi Messaging", ["provider: kimi", "status: running",
    "registry: yes"], color="#4a148c")
box(ax, 44, 38, 26, 22, "Author Scribe", ["provider: codex", "status: running",
    "registry: yes"], color="#4a148c")
box(ax, 44, 8, 26, 22, "claude PID 3090 (fable)", ["started today 10:42", "registry: NO ENTRY",
    "spawned by hand"], color=MISSING)
box(ax, 80, 38, 18, 22, "Auditor Verity", ["provider: kimi", "status: exited",
    "audit delivered"], color="#757575")

edge(ax, (32, 76), (44, 78), 'name match only\n(owner is a string)', SOFT, style="--")
edge(ax, (32, 68), (44, 50), "no link at all —\nroom shows AttentionItem", MISSING, style=":", ly=-4)
edge(ax, (17, 60), (50, 30), "", MISSING, style=":")
ax.text(28, 42, "no link at all", fontsize=8, color=MISSING, fontweight="bold",
        bbox=dict(fc="white", ec="none", pad=1))
edge(ax, (70, 48), (80, 48), "mail\nthread", SOFT, style="--", lx=0)

fig.savefig(os.path.join(OUT, "3-right-now.png"), dpi=130, bbox_inches="tight")
plt.close(fig)

print("wrote 1-object-model.png, 2-data-tree.png, 3-right-now.png to", OUT)
print("running agents:", [a.get("title") for a in running])
