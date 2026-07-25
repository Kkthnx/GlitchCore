/*
 * GlitchCore — Copyright (c) 2026 Kkthnx. All Rights Reserved.
 * Proprietary and confidential. Unauthorized copying, use, distribution, or
 * modification of this file or any part of it, via any medium, is strictly
 * prohibited. See the LICENSE file for full terms.
 */

const { execSync } = require('child_process');
const path = require('path');
const pkg = require('../../package.json');

// Captured once at startup so it reflects the commit the RUNNING process was
// launched from — not whatever the working tree happens to be now. That way
// /version proves a `git pull` + restart actually took effect (if you pull
// without restarting, this keeps showing the old commit — which is correct).
let cached = null;

function git(args, cwd) {
    return execSync(`git ${args}`, { cwd, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
}

function getVersionInfo() {
    if (cached) return cached;
    const cwd = path.join(__dirname, '../..');
    const info = { version: pkg.version, commit: null, branch: null, subject: null, commitDate: null };
    try {
        info.commit = git('rev-parse --short HEAD', cwd);
        info.branch = git('rev-parse --abbrev-ref HEAD', cwd);
        info.subject = git('log -1 --pretty=%s', cwd);
        info.commitDate = git('log -1 --pretty=%cI', cwd);
    } catch {
        // Not a git checkout or git isn't installed — fall back to package version.
    }
    cached = info;
    return cached;
}

module.exports = { getVersionInfo };
