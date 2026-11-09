#!/usr/bin/env python3
"""Generate the real CP-SAT data that the playground page displays.

Every number on the page comes from this script: OR-Tools 9.15.6755, CP-SAT.
One small field-service instance, eight constraint configurations.  For each
configuration we record status, objective, solve time, model size and the optimal
schedule (so the page can draw a real Gantt chart).

Run:  python gen_data.py  ->  data/dispatch.json
"""
import json
import time
from pathlib import Path

from ortools.sat.python import cp_model

DAY = 480
DROP = 5000
LATE = 20          # per minute of window overrun
EARLY = 8          # per minute of early arrival
OVERTIME = 3       # per minute beyond the agreed day
TRAVEL = 2         # per minute of travel

# --- the instance -----------------------------------------------------------
TECHS = [
    {"id": 0, "name": "A. Lind",   "skills": ["el", "net"],  "zone": 0, "max": 390},
    {"id": 1, "name": "M. Okafor", "skills": ["el", "mech"], "zone": 1, "max": 390},
    {"id": 2, "name": "S. Berg",   "skills": ["net"],        "zone": 2, "max": 390},
]

JOBS = [
    {"id": 0, "name": "Värmepump service",   "skill": "el",   "zone": 0, "dur": 90,  "lo": 60,  "hi": 240},
    {"id": 1, "name": "Elcentral byte",      "skill": "el",   "zone": 1, "dur": 120, "lo": 0,   "hi": 300},
    {"id": 2, "name": "Nätverksrack",        "skill": "net",  "zone": 3, "dur": 60,  "lo": 0,   "hi": 150},
    {"id": 3, "name": "Ventilation just.",   "skill": "mech", "zone": 1, "dur": 90,  "lo": 120, "hi": 240},
    {"id": 4, "name": "Laddbox installation","skill": "el",   "zone": 3, "dur": 120, "lo": 180, "hi": 420},
    {"id": 5, "name": "Fiber inkoppling",    "skill": "net",  "zone": 3, "dur": 45,  "lo": 240, "hi": 420},
    {"id": 6, "name": "Styr & övervakning",  "skill": "el",   "zone": 1, "dur": 90,  "lo": 300, "hi": 480},
    {"id": 7, "name": "Servicedisk",         "skill": "net",  "zone": 0, "dur": 60,  "lo": 0,   "hi": 150},
    {"id": 8, "name": "Fläktbyte tak",       "skill": "mech", "zone": 2, "dur": 90,  "lo": 150, "hi": 270},
    {"id": 9, "name": "Kylmaskin översyn",   "skill": "mech", "zone": 3, "dur": 120, "lo": 0,   "hi": 300},
    {"id": 10, "name": "Tryckkärl kontroll", "skill": "mech", "zone": 1, "dur": 120, "lo": 240, "hi": 480},
]

TRAVEL_MIN = [
    [0, 25, 40, 55],
    [25, 0, 30, 35],
    [40, 30, 0, 25],
    [55, 35, 25, 0],
]


def build(cfg):
    """cfg keys: overtime, soft_window, allow_drop, relax_skills"""
    m = cp_model.CpModel()
    cap = {t["id"]: (t["max"] + (120 if cfg["overtime"] else 0)) for t in TECHS}
    start, end, drop, x, iv = {}, {}, {}, {}, {}
    op = 0                       # overtime minutes per technician
    for t in TECHS:
        op_t = m.new_int_var(0, 240, f"ot{t['id']}")
        iv[t["id"]] = op_t
    for j in JOBS:
        start[j["id"]] = m.new_int_var(0, DAY, f"s{j['id']}")
        end[j["id"]] = m.new_int_var(0, DAY, f"e{j['id']}")
        m.add(end[j["id"]] == start[j["id"]] + j["dur"])
        drop[j["id"]] = m.new_bool_var(f"drop{j['id']}")
        if cfg["soft_window"]:
            e = m.new_int_var(0, j["lo"], f"early{j['id']}")
            l = m.new_int_var(0, DAY, f"late{j['id']}")
            m.add(start[j["id"]] >= j["lo"] - e)
            m.add(end[j["id"]] <= j["hi"] + l)
            op += EARLY * e + LATE * l
        else:
            m.add(start[j["id"]] >= j["lo"])
            m.add(end[j["id"]] <= j["hi"])
    for t in TECHS:
        for j in JOBS:
            if not cfg["relax_skills"] and j["skill"] not in t["skills"]:
                continue
            x[t["id"], j["id"]] = m.new_bool_var(f"x{t['id']}_{j['id']}")
            iv[t["id"], j["id"]] = m.new_optional_interval_var(
                start[j["id"]], j["dur"], end[j["id"]], x[t["id"], j["id"]],
                f"iv{t['id']}_{j['id']}")
    for j in JOBS:
        terms = [x[t["id"], j["id"]] for t in TECHS if (t["id"], j["id"]) in x]
        if cfg["allow_drop"]:
            m.add(sum(terms) + drop[j["id"]] == 1)
        else:
            m.add(sum(terms) == 1)
    for t in TECHS:
        ivs = [iv[t["id"], j["id"]] for j in JOBS if (t["id"], j["id"]) in iv]
        if ivs:
            m.add_no_overlap(ivs)
        load = sum(j["dur"] * x[t["id"], j["id"]] for j in JOBS if (t["id"], j["id"]) in x)
        base = t["max"]
        ot_used = m.new_int_var(0, cap[t["id"]] - base, f"otu{t['id']}")
        m.add(load <= base + ot_used)
        op += OVERTIME * ot_used
    travel = 0
    for t in TECHS:
        for j in JOBS:
            if (t["id"], j["id"]) in x:
                travel += TRAVEL * TRAVEL_MIN[t["zone"]][j["zone"]] * x[t["id"], j["id"]]
    m.minimize(DROP * sum(drop.values()) + op + travel)
    s = cp_model.CpSolver()
    s.parameters.max_time_in_seconds = 20.0
    s.parameters.num_search_workers = 8
    t0 = time.time()
    st = s.solve(m)
    wall = time.time() - t0
    names = {cp_model.OPTIMAL: "OPTIMAL", cp_model.FEASIBLE: "FEASIBLE",
             cp_model.INFEASIBLE: "INFEASIBLE", cp_model.UNKNOWN: "UNKNOWN",
             cp_model.MODEL_INVALID: "MODEL_INVALID"}
    out = {"status": names[st], "wall_ms": round(wall * 1000, 1),
           "vars": len(m.proto.variables), "constraints": len(m.proto.constraints),
           "objective": None, "plan": [], "dropped": [], "overtime": {}, "lateness": {}}
    if st in (cp_model.OPTIMAL, cp_model.FEASIBLE):
        out["objective"] = round(s.objective_value, 1)
        out["bound"] = round(s.best_objective_bound, 1)
        for t in TECHS:
            out["overtime"][t["id"]] = 0
            load = 0
            for j in JOBS:
                if (t["id"], j["id"]) in x and s.value(x[t["id"], j["id"]]) == 1:
                    load += j["dur"]
                    out["plan"].append({"job": j["id"], "tech": t["id"],
                                        "start": s.value(start[j["id"]]),
                                        "end": s.value(end[j["id"]]),
                                        "dur": j["dur"], "late": max(0, s.value(end[j["id"]]) - j["hi"]),
                                        "early": max(0, j["lo"] - s.value(start[j["id"]]))})
            out["overtime"][t["id"]] = max(0, load - t["max"])
        for j in JOBS:
            if cfg["allow_drop"] and s.value(drop[j["id"]]) == 1:
                out["dropped"].append(j["id"])
            if cfg["soft_window"]:
                out["lateness"][j["id"]] = 0
        out["plan"].sort(key=lambda a: (a["tech"], a["start"]))
    return out


VARIANTS = [
    ("hard",     "Alla regler hårda",              dict(overtime=False, soft_window=False, allow_drop=False, relax_skills=False)),
    ("overtime", "Övertid tillåten",               dict(overtime=True,  soft_window=False, allow_drop=False, relax_skills=False)),
    ("softwin",  "Tidsfönster får glida",          dict(overtime=False, soft_window=True,  allow_drop=False, relax_skills=False)),
    ("drop",     "Jobb får skjutas upp",           dict(overtime=False, soft_window=False, allow_drop=True,  relax_skills=False)),
    ("skills",   "Kompetenskrav mjukas upp",       dict(overtime=False, soft_window=False, allow_drop=False, relax_skills=True)),
    ("ot_win",   "Övertid + glidande fönster",     dict(overtime=True,  soft_window=True,  allow_drop=False, relax_skills=False)),
    ("all",      "Allt mjukt",                     dict(overtime=True,  soft_window=True,  allow_drop=True,  relax_skills=True)),
]


def main():
    data = {"instance": {"day": DAY, "techs": TECHS, "jobs": JOBS,
                         "travel": TRAVEL_MIN,
                         "weights": {"drop": DROP, "late": LATE, "early": EARLY,
                                     "overtime": OVERTIME, "travel": TRAVEL}},
            "variants": {}}
    for key, label, cfg in VARIANTS:
        res = build(cfg)
        data["variants"][key] = {"label": label, "config": cfg, **res}
        print(f"{key:9s} {res['status']:10s} obj={res['objective']} "
              f"{res['wall_ms']:7.1f} ms  vars={res['vars']:3d} cons={res['constraints']:3d} "
              f"dropped={res['dropped']} ot={res['overtime']}")
    Path("data").mkdir(exist_ok=True)
    Path("data/dispatch.json").write_text(json.dumps(data, indent=1), encoding="utf-8")


if __name__ == "__main__":
    main()