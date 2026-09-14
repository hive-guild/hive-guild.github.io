"""Publish committed dist only to the primary HIVE Pages branch (no force push)."""
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
def git(*args, text=None):
    return subprocess.run(["git", *args], cwd=ROOT, input=text, text=True,
                          capture_output=True, check=True).stdout.strip()

if git("status", "--porcelain"):
    raise SystemExit("Commit the checked frontend and generated release before publishing.")
remote = "hive-pages"
if git("remote", "get-url", "--push", remote) != "https://github.com/hive-guild/hive-guild.github.io.git":
    raise SystemExit("Unexpected Pages destination.")
source = git("rev-parse", "HEAD")
tree = git("rev-parse", "HEAD:dist")
existing = git("ls-remote", "--heads", remote, "refs/heads/gh-pages")
parent = []
if existing:
    git("fetch", remote, "refs/heads/gh-pages")
    old = git("rev-parse", "FETCH_HEAD")
    if git("rev-parse", old + "^{tree}") == tree:
        print("Pages branch already contains this frontend.")
        raise SystemExit(0)
    parent = ["-p", old]
commit = git("commit-tree", tree, *parent, text="Publish HIVE frontend from " + source + "\n")
git("push", remote, commit + ":refs/heads/gh-pages")
print("Published committed dist from " + source + " to primary gh-pages.")
