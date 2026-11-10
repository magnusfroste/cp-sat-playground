# CP-SAT Playground

An interactive teaching page for **Google OR-Tools CP-SAT** — the constraint solver that
schedules, routes, packs and allocates. Built to answer one question honestly: *when does
this kind of solver beat a hand-written rule, a spreadsheet, or an LLM?*

**Live:** https://pages.agenthotel.org/cp-sat-playground/

## What is on the page

| Lab | What you do | What it teaches |
|---|---|---|
| **01 — En riktig arbetsdag** | Pick one of seven rule sets for an 11-job, 3-technician day. See the optimal plan, its cost breakdown and the solver's own numbers. | Constraints interact. Overtime does not fix a window clash. A model that is infeasible is a *finding*, not a bug. |
| **02 — Solvern du kan stega** | Step through an 8-queens search: tries, rejections, backtracks, share of the 40 320 permutations. | What search with propagation actually does, and why it explores 2 % of the space. |
| **03 — Passar problemet?** | Eight yes/no questions. | Turns "AI can do scheduling" into a decision rule you can use in a sales conversation. |
| **Kod** | Four copyable snippets. | The four modelling moves that separate a model that solves in 20 ms from one that times out. |

## Everything numeric is real

`gen_data.py` builds the instance and runs **seven CP-SAT solves** with OR-Tools 9.15.6755.
For each configuration it records status, objective, wall time, variable count, constraint
count and the optimal schedule. `data/dispatch.json` is that output — nothing on the page is
invented or illustrative.

```bash
pip install ortools
python gen_data.py          # regenerates data/dispatch.json
python -m http.server 8765  # then open http://127.0.0.1:8765
```

The n-queens solver in `app.js` is a separate, deliberately small backtracking solver. It is
there to show the *mechanism*, not CP-SAT's performance, and the page says so.

## The instance

3 technicians with different skills and home zones, 11 jobs with skills, durations, zones and
time windows in a 480-minute day. Travel is charged per technician/job pair.

| Weight | Value |
|---|---|
| Dropped job | 5 000 |
| Late minute | 20 |
| Early minute | 8 |
| Overtime minute | 3 |
| Travel minute | 2 |

## The seven rule sets and what the solver returns

| Rule set | Status | Objective |
|---|---|---|
| All rules hard | INFEASIBLE | — |
| Overtime allowed | INFEASIBLE | — |
| Time windows may slide | INFEASIBLE | — |
| Jobs may be postponed | OPTIMAL | 10 260 (2 dropped) |
| Skills relaxed | OPTIMAL | 270 |
| Overtime + sliding windows | OPTIMAL | 1 300 |
| Everything soft | OPTIMAL | 270 |

The three infeasible rows are the most useful ones: they show that the binding constraint is
not the one you assume, and that CP-SAT proves impossibility instead of guessing.

## Files

```
index.html        the page
styles.css        theme
app.js            labs 1–3, solver visualiser, code tabs
gen_data.py       generates the real CP-SAT data
data/dispatch.json
```

No build step, no dependencies, no tracking. Works offline except for the two external links.

## Licence

MIT for this page. OR-Tools is Apache 2.0, © Google.