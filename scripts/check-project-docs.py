"""Read-only checks for the project fact library. Python standard library only."""
import argparse
import json
import re
import unicodedata
from pathlib import Path
from urllib.parse import unquote, urlsplit

AI_FEATURES = ("assistant", "invoice-ocr", "sommelier", "pricing", "forecasting", "dead-stock", "commands")
BUSINESS_FEATURES = ("checkout", "inventory", "purchasing", "customers", "reporting", "platform")
STATUSES = {"PASS", "BLOCKED", "FAIL", "INFO", "NOT RUN"}
KINDS = {"online-readonly", "online-write", "local-fixture", "local-service", "offline-research", "historical-design"}
REQUIRED_FIELDS = {
    "id", "status", "evidenceType", "recordedAt", "sourceSha", "runtimeSha", "model",
    "promptVersion", "configVersion", "snapshotVersion", "scope", "sample", "result",
    "limitations", "artifacts", "releaseAccepted",
}
VERSION_FIELDS = ("sourceSha", "runtimeSha", "model", "promptVersion", "configVersion", "snapshotVersion")
SESSION = "docs/test-sessions/2026-11-03-project-fact-library.md"


def without_code(text):
    """Ignore fenced examples and inline code when resolving actual links."""
    lines, fence = [], None
    for line in text.splitlines():
        match = re.match(r"^\s*(`{3,}|~{3,})", line)
        if match:
            marker = match.group(1)
            if fence is None:
                fence = marker
            elif marker[0] == fence[0] and len(marker) >= len(fence):
                fence = None
            continue
        if fence is None:
            lines.append(line)
    return re.sub(r"`[^`\n]*`", "", "\n".join(lines))


def headings(text):
    found, used = set(), {}
    for line in text.splitlines():
        match = re.match(r"^#{1,6}\s+(.+?)\s*#*\s*$", line)
        if not match:
            continue
        slug = match.group(1).lower().replace("`", "")
        slug = "".join(c for c in slug if c in "-_ " or unicodedata.category(c)[0] in "LN")
        slug = slug.replace(" ", "-")
        count = used.get(slug, 0)
        used[slug] = count + 1
        found.add(slug if count == 0 else f"{slug}-{count}")
    return found


def local_target(root, source, href):
    parts = urlsplit(href)
    if parts.scheme or parts.netloc:
        if parts.scheme in {"http", "https", "mailto"}:
            return None, None
        raise ValueError("unsupported or machine-specific link")
    if parts.path.startswith(("/", "\\")):
        raise ValueError("local links must be repository-relative")
    target = (source.parent / unquote(parts.path)).resolve() if parts.path else source.resolve()
    if not target.is_relative_to(root.resolve()):
        raise ValueError("link escapes repository")
    return target, unquote(parts.fragment)


def check_links(root, source):
    errors = []
    text = source.read_text(encoding="utf-8-sig")
    for match in re.finditer(r"!?(?<!\\)\[[^\]\n]*\]\(\s*(<[^>]+>|[^)\n]+)\s*\)", without_code(text)):
        href = match.group(1).strip()
        href = href[1:-1] if href.startswith("<") else href.split(' "', 1)[0]
        try:
            target, fragment = local_target(root, source, href)
        except ValueError as exc:
            errors.append(f"{source.relative_to(root)}: {exc}: {href}")
            continue
        if target is None:
            continue
        if not target.exists():
            errors.append(f"{source.relative_to(root)}: missing link: {href}")
        elif fragment and target.suffix.lower() == ".md":
            if fragment not in headings(without_code(target.read_text(encoding="utf-8-sig"))):
                errors.append(f"{source.relative_to(root)}: missing heading: {href}")
    return errors


def check_registry(root, data):
    errors, ids = [], set()
    if not isinstance(data, dict):
        return ["evidence.json: root must be an object"]
    if data.get("schemaVersion") != 1 or not isinstance(data.get("entries"), list) or not data["entries"]:
        return ["evidence.json: schemaVersion=1 and nonempty entries required"]
    for entry in data["entries"]:
        if not isinstance(entry, dict):
            errors.append("evidence.json: entry must be an object")
            continue
        label = str(entry.get("id", "<missing id>"))
        if REQUIRED_FIELDS - entry.keys():
            errors.append(f"{label}: missing required metadata")
        if label in ids or not re.fullmatch(r"E-[A-Z0-9-]+", label):
            errors.append(f"{label}: invalid or duplicate ID")
        ids.add(label)
        if entry.get("status") not in STATUSES or entry.get("evidenceType") not in KINDS:
            errors.append(f"{label}: invalid status or evidence type")
        if not re.match(r"^\d{4}-\d{2}-\d{2}(?:T.*)?$", str(entry.get("recordedAt", ""))):
            errors.append(f"{label}: recordedAt requires an ISO date/time")
        for key in VERSION_FIELDS:
            value = entry.get(key)
            if value is not None and (not isinstance(value, str) or not value.strip()):
                errors.append(f"{label}: {key} must be a nonempty string or null")
        for key in ("sourceSha", "runtimeSha"):
            if entry.get(key) is not None and not re.fullmatch(r"[a-fA-F0-9]{8,40}", str(entry[key])):
                errors.append(f"{label}: invalid {key}")
        for key in ("scope", "sample", "result"):
            if not isinstance(entry.get(key), str) or not entry[key].strip():
                errors.append(f"{label}: {key} required")
        if not isinstance(entry.get("limitations"), list) or not entry["limitations"] or not all(isinstance(x, str) and x.strip() for x in entry["limitations"]):
            errors.append(f"{label}: nonempty limitations required")
        if not isinstance(entry.get("releaseAccepted"), bool):
            errors.append(f"{label}: releaseAccepted must be boolean")
        if entry.get("releaseAccepted") and (entry.get("status") != "PASS" or not entry.get("sourceSha") or not entry.get("runtimeSha")):
            errors.append(f"{label}: release acceptance requires PASS and source/runtime identity")
        artifacts = entry.get("artifacts")
        if not isinstance(artifacts, list) or not artifacts:
            errors.append(f"{label}: evidence artifacts required")
            continue
        targets = []
        for artifact in artifacts:
            try:
                if not isinstance(artifact, str):
                    raise ValueError("artifact path must be a string")
                path, fragment = local_target(root, root / "index.md", artifact)
                if path is None or fragment or not path.is_file():
                    raise ValueError("artifact must be an existing repository file")
                targets.append(path)
            except ValueError as exc:
                errors.append(f"{label}: invalid artifact ({exc})")
        checks = entry.get("jsonChecks", {})
        if not isinstance(checks, dict):
            errors.append(f"{label}: jsonChecks must be an object")
            continue
        if not checks:
            continue
        try:
            raw = json.loads(targets[0].read_text(encoding="utf-8-sig"))
            if isinstance(raw, dict) and raw.get("status") in STATUSES and raw["status"] != entry["status"]:
                errors.append(f"{label}: registered status contradicts primary artifact")
            for field, expected in checks.items():
                actual = raw
                for part in field.split("."):
                    actual = actual[part]
                if actual != expected:
                    errors.append(f"{label}: JSON assertion changed: {field}")
        except (OSError, ValueError, IndexError, KeyError, TypeError):
            errors.append(f"{label}: JSON assertion field/file unavailable")
    return errors


def validate(root):
    library = root / "docs/project"
    required = ["README.md", "overview.md", "baseline.md", "maintenance.md", "tools.md",
                "evidence.md", "evidence.json", "features/README.md", "features/ai/README.md",
                "features/ai/architecture.md", "decisions/README.md", "templates/README.md",
                "reports/2026-11-03-management-summary.md", "reports/2026-11-03-presentation-outline.md"]
    required += [f"features/ai/{name}/{file}.md" for name in AI_FEATURES for file in ("README", "design", "validation", "progress")]
    required += [f"features/{name}/README.md" for name in BUSINESS_FEATURES]
    required += [f"templates/{name}.md" for name in ("feature", "design", "validation", "progress", "decision", "report")]
    errors = [f"missing required file: docs/project/{name}" for name in required if not (library / name).is_file()]
    sources = list(library.rglob("*.md"))
    for name in (SESSION, ".github/PULL_REQUEST_TEMPLATE.md"):
        path = root / name
        if path.is_file():
            sources.append(path)
        else:
            errors.append(f"missing required file: {name}")
    for source in sources:
        errors.extend(check_links(root, source))
    for name in ("README.md", "AGENTS.md"):
        path = root / name
        if not path.is_file() or "(docs/project/README.md)" not in path.read_text(encoding="utf-8-sig"):
            errors.append(f"{name}: fact-library entrypoint required")
    try:
        registry = json.loads((library / "evidence.json").read_text(encoding="utf-8-sig"))
        errors.extend(check_registry(root, registry))
    except (OSError, ValueError):
        errors.append("evidence.json: missing or invalid JSON")
    return errors, len(sources)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", type=Path, default=Path(__file__).resolve().parents[1])
    args = parser.parse_args()
    errors, count = validate(args.root.resolve())
    if errors:
        print("\n".join(errors))
        print(f"FAIL: {len(errors)} documentation errors")
        return 1
    print(f"PASS: {count} Markdown files; required layout, local links/headings and evidence assertions verified")
    print("No external links, providers, runtime or business acceptance tested.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
