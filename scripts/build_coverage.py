#!/usr/bin/env python3
"""Build per-election results coverage JSON for the openelections-data-* repos.

For each state repo, every results CSV under a year directory (``2018/``,
``2020/counties/``, ...) is parsed from its filename and, when the filename has
no ``__precinct`` / ``__county`` suffix, its header is sniffed to figure out the
reporting level. The result is a static JSON file per state:

    data/coverage/{state}.json

which the state page (/state/?abbr=XX) reads directly, so the browser makes no
extra GitHub API calls.

Usage:
    python scripts/build_coverage.py                # all org repos, via API
    python scripts/build_coverage.py ga pa md       # specific states, via API
    python scripts/build_coverage.py --local ~/code ga pa   # from local clones

Uses GITHUB_TOKEN (or OPENELECTIONS_GITHUB_TOKEN) from the environment when
talking to the API; stdlib only.
"""

import argparse
import concurrent.futures
import json
import os
import re
import ssl
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone

ORG = "openelections"

# `2018/20181106__ga__general__paulding__precinct.csv`
FILENAME_RE = re.compile(r"^(\d{4})(\d{2})(\d{2})__([a-z]{2})__(.+?)\.csv$")
LEVELS = {"precinct", "county"}

# Tokens that describe the office/election rather than a county. Anything else
# directly before a __precinct suffix is treated as a county name
# (e.g. `20180724__ga__primary_runoff__glascock__precinct.csv` -> glascock).
MODIFIERS = {
    "primary", "general", "special", "runoff", "president", "presidential",
    "federal", "state", "us", "house", "senate", "local", "municipal",
    "convention", "caucus", "recount", "election", "precinct", "county",
    "district", "judicial", "absentee", "early", "early_voting", "provisional",
    "state_house", "state_senate", "state_rep", "state_representative",
    "us_house", "us_senate", "us_congress", "assembly", "legislature",
    # office and result-file keywords that can end up as the last filename token
    "ballot", "measure", "ballot_measure", "question", "amendment",
    "proposition", "referendum", "race", "office", "offices", "candidate",
    "candidates", "results", "summary", "official", "certified", "canvass",
    "turnout", "registration", "registered", "voters", "governor",
    "lieutenant", "lt", "attorney", "treasurer", "auditor", "secretary",
    "commissioner", "comptroller", "controller", "sheriff", "clerk",
    "recorder", "coroner", "surveyor", "assessor", "prosecutor", "mayor",
    "council", "board", "supervisors", "school", "education", "justice",
    "judge", "court", "appeals", "supreme", "circuit", "appellate",
    "insurance", "agriculture", "land", "public", "instruction",
    "superintendent", "utility", "corporation",
}

YEAR_PATH_RE = re.compile(r"^\d{4}/.+\.csv$")

# some Python installs (macOS framework builds) lack default CA certs; certifi
# fixes that when installed, but the script still runs without it
try:
    import certifi
    SSL_CONTEXT = ssl.create_default_context(cafile=certifi.where())
except ImportError:
    SSL_CONTEXT = None

HEADER_BYTES = 2048
SNIFF_WORKERS = 8


def log(msg):
    print(msg, file=sys.stderr, flush=True)


def token_from_env():
    for var in ("GITHUB_TOKEN", "OPENELECTIONS_GITHUB_TOKEN"):
        tok = os.environ.get(var)
        if tok:
            return tok
    return None


def api_get(url, token):
    req = urllib.request.Request(url, headers={
        "Accept": "application/vnd.github+json",
        "User-Agent": "openelections-coverage-builder",
    })
    if token:
        req.add_header("Authorization", "Bearer " + token)
    last_err = None
    for attempt in range(3):
        try:
            with urllib.request.urlopen(req, context=SSL_CONTEXT) as resp:
                return json.load(resp)
        except urllib.error.HTTPError as e:
            last_err = e
            if e.code in (403, 429) and attempt < 2:
                time.sleep(int(e.headers.get("Retry-After", 5)) or 5)
                continue
            if e.code >= 500 and attempt < 2:
                time.sleep(5)
                continue
            raise
        except (urllib.error.URLError, TimeoutError) as e:
            last_err = e
            if attempt < 2:
                time.sleep(5)
                continue
            raise
    raise last_err


def sniff_header(header_text):
    """Classify a CSV header line into a reporting level."""
    h = header_text.lower()
    has_precinct = "precinct" in h
    has_county = "county" in h
    if has_precinct:
        return "precinct"
    if has_county:
        return "county"
    return "other"


def parse_filename(path):
    """Parse a results CSV path into (election_key, entry_fields) or None."""
    name = path.split("/")[-1]
    m = FILENAME_RE.match(name)
    if not m:
        return None
    # groups: 1-3 = YYYY MM DD, 4 = state abbr, 5 = election details
    date = "%s-%s-%s" % (m.group(1), m.group(2), m.group(3))
    middle = m.group(5)

    tokens = middle.split("__")
    in_counties_dir = "/counties/" in path

    level = None
    county = None
    if tokens and re.match(r"^(precinct|county)([_-].+)?$", tokens[-1]):
        # exact level suffix, or annotated ones like `precinct_partial` /
        # `precinct_qc_findings` / `county_level`
        level = "precinct" if tokens[-1].startswith("precinct") else "county"
        tokens = tokens[:-1]

    def county_name(token):
        return re.match(r"^[a-z][a-z_]*$", token) and token not in MODIFIERS

    # a trailing county name before the level suffix or in a suffixless
    # per-county file: pa-style counties/ files, ga-style year-dir
    # `__{county}__precinct.csv`, wa-style `__{county}__county.csv`,
    # nv-style suffixless `__{county}.csv`
    if tokens and county_name(tokens[-1]):
        county = tokens[-1]
        tokens = tokens[:-1]

    if tokens:
        etype = tokens[0]
        label = " ".join(t.replace("_", " ") for t in tokens[1:])
    else:
        etype = "election"
        label = ""

    return {
        "date": date,
        "type": etype,
        "label": label,
        "level": level,            # None means "sniff the header"
        "county": county,
        "in_counties_dir": in_counties_dir,
        "path": path,
    }


def is_county_precinct_file(parsed):
    return parsed["county"] is not None and "precinct" in (parsed["level"] or "")


def build_elections(parsed_files, header_levels, st):
    """Group parsed files into per-election coverage records."""
    elections = {}
    for parsed in parsed_files:
        key = "%s|%s" % (parsed["date"], parsed["type"])
        e = elections.setdefault(key, {
            "date": parsed["date"],
            "type": parsed["type"],
            "label": "",
            "_labels": {},
            "county": False,
            "precinct": False,
            "precinct_statewide": False,
            "precinct_counties": [],
            "county_derivable": False,
            "files": [],
        })
        level = parsed["level"]
        if level is None:
            level = header_levels.get(parsed["path"], "other")
        e["files"].append({"path": parsed["path"], "level": level})

        if level == "precinct":
            e["precinct"] = True
            if parsed["county"]:
                e["precinct_counties"].append(parsed["county"])
            else:
                e["precinct_statewide"] = True
        elif level == "county":
            e["county"] = True

        if parsed["label"]:
            e["_labels"][parsed["label"]] = e["_labels"].get(parsed["label"], 0) + 1

    result = list(elections.values())
    for e in result:
        e["precinct_counties"] = sorted(set(e["precinct_counties"]))
        e["files"].sort(key=lambda f: f["path"])
        e["county_derivable"] = e["precinct"] and not e["county"]
        # files for one election can carry slightly different labels; pick the
        # most frequent (shortest on ties) so per-county county names don't win
        if e["_labels"]:
            e["label"] = sorted(e["_labels"].items(),
                                key=lambda kv: (-kv[1], len(kv[0]), kv[0]))[0][0]
        del e["_labels"]
    result.sort(key=lambda e: (e["date"], e["type"]), reverse=True)
    return result


def repo_paths_via_api(st, token):
    """Yield every CSV path under a year directory, via the git trees API."""
    repo = api_get("https://api.github.com/repos/%s/%s-data-%s" % (ORG, ORG, st), token)
    branch = repo.get("default_branch", "master")
    log("  [%s] branch=%s" % (st, branch))
    tree = api_get(
        "https://api.github.com/repos/%s/%s-data-%s/git/trees/%s?recursive=1"
        % (ORG, ORG, st, urllib.parse.quote(branch)), token)
    if tree.get("truncated"):
        log("  [%s] WARNING: tree response truncated; coverage may be incomplete" % st)
    paths = [item["path"] for item in tree.get("tree", [])
             if item.get("type") == "blob" and YEAR_PATH_RE.match(item["path"])]
    return branch, paths


def repo_paths_local(st, local_root):
    repo_dir = os.path.join(local_root, "%s-data-%s" % (ORG, st))
    if not os.path.isdir(repo_dir):
        raise SystemExit("local clone not found: %s" % repo_dir)
    paths = []
    for dirpath, dirnames, filenames in os.walk(repo_dir):
        dirnames[:] = [d for d in dirnames if not d.startswith(".")]
        rel = os.path.relpath(dirpath, repo_dir)
        if rel == ".":
            continue
        rel = rel.replace(os.sep, "/")
        if not re.match(r"^\d{4}(/|$)", rel):
            continue
        for fn in filenames:
            if fn.endswith(".csv"):
                paths.append("%s/%s" % (rel, fn))
    return "master", sorted(paths)


def sniff_headers_via_api(st, branch, paths, parsed):
    """Fetch the first line of headerless files from raw.githubusercontent.com."""
    todo = [p["path"] for p in parsed if not p["level"]]
    if not todo:
        return {}
    log("  [%s] sniffing %d headerless file(s)" % (st, len(todo)))

    def fetch(path):
        url = "https://raw.githubusercontent.com/%s/%s-data-%s/%s/%s" % (
            ORG, ORG, st, urllib.parse.quote(branch),
            urllib.parse.quote(path))
        req = urllib.request.Request(url, headers={
            "Range": "bytes=0-%d" % (HEADER_BYTES - 1),
            "User-Agent": "openelections-coverage-builder",
        })
        for attempt in range(3):
            try:
                with urllib.request.urlopen(req, timeout=30, context=SSL_CONTEXT) as resp:
                    chunk = resp.read(HEADER_BYTES)
                break
            except (urllib.error.URLError, TimeoutError) as e:
                if attempt == 2:
                    log("  [%s] WARNING: could not fetch header for %s: %s" % (st, path, e))
                    return path, None
                time.sleep(2)
        first_line = chunk.split(b"\n", 1)[0].decode("utf-8", "replace")
        return path, sniff_header(first_line)

    levels = {}
    with concurrent.futures.ThreadPoolExecutor(max_workers=SNIFF_WORKERS) as pool:
        for path, level in pool.map(fetch, todo):
            if level is not None:
                levels[path] = level
    return levels


def sniff_headers_local(st, local_root, parsed):
    todo = [p["path"] for p in parsed if not p["level"]]
    levels = {}
    repo_dir = os.path.join(local_root, "%s-data-%s" % (ORG, st))
    for path in todo:
        try:
            with open(os.path.join(repo_dir, path), "rb") as f:
                chunk = f.read(HEADER_BYTES)
            levels[path] = sniff_header(chunk.split(b"\n", 1)[0].decode("utf-8", "replace"))
        except OSError as e:
            log("  [%s] WARNING: could not read %s: %s" % (st, path, e))
    return levels


def org_state_repos(token):
    names = set()
    page = 1
    while True:
        repos = api_get(
            "https://api.github.com/orgs/%s/repos?per_page=100&page=%d" % (ORG, page),
            token)
        if not repos:
            break
        for repo in repos:
            m = re.match(r"^%s-data-([a-z]{2})$" % ORG, repo["name"])
            if m:
                names.add(m.group(1))
        page += 1
    return sorted(names)


def build_state(st, token, local_root, outdir):
    if local_root:
        branch, paths = repo_paths_local(st, local_root)
        parsed = [p for p in (parse_filename(path) for path in paths) if p]
        levels = sniff_headers_local(st, local_root, parsed)
    else:
        branch, paths = repo_paths_via_api(st, token)
        parsed = [p for p in (parse_filename(path) for path in paths) if p]
        levels = sniff_headers_via_api(st, branch, paths, parsed)

    elections = build_elections(parsed, levels, st)
    doc = {
        "state": st,
        "repo": "%s-data-%s" % (ORG, st),
        "generated_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "elections": elections,
    }
    out_path = os.path.join(outdir, "%s.json" % st)
    os.makedirs(outdir, exist_ok=True)
    with open(out_path, "w") as f:
        json.dump(doc, f, ensure_ascii=False, sort_keys=True, indent=1)
        f.write("\n")
    levels_n = sum(1 for e in elections if e["precinct"])
    county_n = sum(1 for e in elections if e["county"])
    log("  [%s] %d CSVs -> %d elections (%d with precinct data, %d with county data) -> %s"
        % (st, len(paths), len(elections), levels_n, county_n, out_path))


def main():
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("states", nargs="*", help="state abbreviations (default: all org data repos)")
    ap.add_argument("--local", metavar="DIR",
                    help="read from local clones under DIR instead of the GitHub API")
    ap.add_argument("--outdir", default="data/coverage", help="output directory (default: data/coverage)")
    args = ap.parse_args()

    token = token_from_env()
    if not args.local and not token:
        log("WARNING: no GITHUB_TOKEN set; unauthenticated API calls are capped at 60/hour")

    states = [s.lower() for s in args.states]
    if args.local and not states:
        states = sorted(
            d[len(ORG) + 6:].lower() for d in os.listdir(args.local)
            if re.match(r"^%s-data-[a-z]{2}$" % ORG, d))

    if args.local:
        for st in states:
            build_state(st, token, args.local, args.outdir)
        return

    if not states:
        states = org_state_repos(token)
    for st in states:
        try:
            build_state(st, token, None, args.outdir)
        except urllib.error.HTTPError as e:
            log("ERROR fetching %s: %s (skipping)" % (st, e))
        except Exception as e:  # keep other states going on unexpected failures
            log("ERROR %s: %r (skipping)" % (st, e))


if __name__ == "__main__":
    main()
