"""The six example households for "The Budget for your household", on PolicyEngine UK run here.

PolicyEngine asked us (6 November 2026) to stop sending households to /uk/calculate on api.policyengine.org and
offered two replacements; we run its Python package ourselves, on the version pinned in requirements.txt, once per
fiscal event, offline (docs/MODEL.md). A household needs no survey data.

Reads JSON on stdin, written by `pnpm household -- record <event>` (scripts/household.ts):

    {"cases": [{"id": "single_25k", "year": 2027, "people": [{...}], "household": {...}}, ...],
     "policies": {"pre": {"param.path": {"2027-01-01.2027-12-31": 0.2}}, "post": {...}}}

and writes JSON on stdout: the package versions, then household_net_income (£ a year) for every case under each
policy, keyed like /uk/calculate's answer so the job reads both the same way:

    {"versions": {"policyengine": "6.15.0", "policyengine_uk": "2.151.0", "policyengine_core": "3.33.3"},
     "pre": {"households": {"single_25k": {"household_net_income": {"2027": 21088.5}}}}, "post": {...}}

Run it with -I (isolated mode) from the virtual environment in requirements.txt.
"""

import json
import sys
from importlib.metadata import version


def main() -> None:
    request = json.load(sys.stdin)

    import policyengine as pe  # slow to import: after the input is read, so a bad input fails fast

    out: dict = {
        "versions": {name.replace("-", "_"): version(name) for name in ("policyengine", "policyengine-uk", "policyengine-core")},
    }
    for side in ("pre", "post"):
        reform = request["policies"][side]
        households: dict = {}
        for case in request["cases"]:
            result = pe.uk.calculate_household(
                people=case["people"],
                household=case["household"],
                year=case["year"],
                reform=reform,
                extra_variables=["household_net_income"],
            )
            value = float(result.household.household_net_income)
            households.setdefault(case["id"], {"household_net_income": {}})["household_net_income"][str(case["year"])] = value
        out[side] = {"households": households}
    json.dump(out, sys.stdout)


if __name__ == "__main__":
    main()
