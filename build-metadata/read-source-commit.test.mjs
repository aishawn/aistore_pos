import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

const script = path.join(import.meta.dirname, "read-source-commit.sh");
const bash = process.platform === "win32"
  ? path.join(process.env.ProgramFiles || "C:/Program Files", "Git", "bin", "bash.exe")
  : "bash";
const sha = "4f9bdb703e2bb4774dff25c1f15c6aedaad20e1f";

function repoFixture(setup) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "dokploy-git-ref-"));
  const git = path.join(root, ".git");
  fs.mkdirSync(git, { recursive: true });
  setup(git);
  return { root, git };
}

function read(git) {
  return execFileSync(bash, [script, git], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
}

test("reads a loose branch ref", () => {
  const { git } = repoFixture((dir) => {
    fs.writeFileSync(path.join(dir, "HEAD"), "ref: refs/heads/main\n");
    fs.mkdirSync(path.join(dir, "refs", "heads"), { recursive: true });
    fs.writeFileSync(path.join(dir, "refs", "heads", "main"), `${sha}\n`);
  });
  assert.equal(read(git), sha);
});

test("reads a packed branch ref", () => {
  const { git } = repoFixture((dir) => {
    fs.writeFileSync(path.join(dir, "HEAD"), "ref: refs/heads/main\n");
    fs.writeFileSync(path.join(dir, "packed-refs"), `# pack-refs with: peeled fully-peeled\n${sha} refs/heads/main\n`);
  });
  assert.equal(read(git), sha);
});

test("reads a detached checkout", () => {
  const { git } = repoFixture((dir) => fs.writeFileSync(path.join(dir, "HEAD"), `${sha}\n`));
  assert.equal(read(git), sha);
});

test("resolves a worktree gitdir pointer", () => {
  const { git: commonGit } = repoFixture((dir) => {
    fs.mkdirSync(path.join(dir, "refs", "heads"), { recursive: true });
    fs.writeFileSync(path.join(dir, "refs", "heads", "codex"), `${sha}\n`);
  });
  const git = path.join(commonGit, "worktrees", "candidate");
  fs.mkdirSync(git, { recursive: true });
  fs.writeFileSync(path.join(git, "HEAD"), "ref: refs/heads/codex\n");
  fs.writeFileSync(path.join(git, "commondir"), "../..\n");
  const worktree = fs.mkdtempSync(path.join(os.tmpdir(), "dokploy-git-pointer-"));
  const pointer = path.join(worktree, ".git");
  fs.writeFileSync(pointer, `gitdir: ${git}\n`);
  assert.equal(read(pointer), sha);
});

test("fails when the checkout does not expose a full SHA", () => {
  const { git } = repoFixture((dir) => fs.writeFileSync(path.join(dir, "HEAD"), "ref: refs/heads/main\n"));
  assert.throws(() => read(git));
});
