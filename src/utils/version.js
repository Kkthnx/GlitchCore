/*
 * GlitchCore. Copyright (c) 2026 Kkthnx. All Rights Reserved.
 * Proprietary and confidential. Unauthorized copying, use, distribution, or
 * modification of this file or any part of it, via any medium, is strictly
 * prohibited. See the LICENSE file for full terms.
 */

const { execSync } = require('child_process');
const path = require('path');
const pkg = require('../../package.json');

// Captured once at startup so it reflects the commit the RUNNING process was
// launched from, not whatever the working tree happens to be now. That way
// /version proves a `git pull` + restart actually took effect (if you pull
// without restarting, this keeps showing the old commit, which is correct).
let cached = null;

function git(args, cwd) {
    return execSync(`git ${args}`, { cwd, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
}

function getVersionInfo() {
    if (cached) return cached;
    const cwd = path.join(__dirname, '../..');
    const info = { version: pkg.version, commit: null, branch: null, subject: null, commitDate: null, author: null };
    try {
        info.commit = git('rev-parse --short HEAD', cwd);
        info.branch = git('rev-parse --abbrev-ref HEAD', cwd);
        info.subject = git('log -1 --pretty=%s', cwd);
        info.commitDate = git('log -1 --pretty=%cI', cwd);
        info.author = git('log -1 --pretty=%an', cwd);
    } catch {
        // Not a git checkout or git isn't installed, fall back to package version.
    }
    cached = info;
    return cached;
}

/**
 * Commit subjects between `sinceCommit` (exclusive) and HEAD, newest first,
 * merges excluded. Used to build the update changelog. Falls back to the
 * current subject if the range can't be resolved (e.g. a shallow clone), and
 * an empty array if git isn't available at all.
 * @param {string} sinceCommit a commit-ish the deploy was previously on
 * @param {number} [limit] max entries to return
 * @returns {string[]}
 */
function getCommitsSince(sinceCommit, limit = 15) {
    const cwd = path.join(__dirname, '../..');
    try {
        const out = git(`log ${sinceCommit}..HEAD --no-merges --pretty=%s`, cwd);
        const lines = out.split('\n').map(s => s.trim()).filter(Boolean);
        if (lines.length) return lines.slice(0, limit);
    } catch {
        // Range unresolved (unknown ref / shallow clone), fall through.
    }
    try {
        const subject = git('log -1 --pretty=%s', cwd);
        return subject ? [subject] : [];
    } catch {
        return [];
    }
}

module.exports = { getVersionInfo, getCommitsSince };
