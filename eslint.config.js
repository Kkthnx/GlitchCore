/*
 * GlitchCore. Copyright (c) 2026 Kkthnx. All Rights Reserved.
 * Proprietary and confidential. Unauthorized copying, use, distribution, or
 * modification of this file or any part of it, via any medium, is strictly
 * prohibited. See the LICENSE file for full terms.
 */

const js = require('@eslint/js');
const globals = require('globals');

// Flat ESLint config (ESLint 9+). CommonJS + Node. Run with `npm run lint`.
module.exports = [
    {
        ignores: ['node_modules/**', 'generated-emojis/**', 'src/assets/**', 'coverage/**'],
    },
    js.configs.recommended,
    {
        languageOptions: {
            ecmaVersion: 2022,
            sourceType: 'commonjs',
            globals: { ...globals.node },
        },
        rules: {
            // Surface dead code without failing the build (warnings, not errors).
            'no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrors: 'none' }],
            'no-var': 'error',
            'prefer-const': 'warn',
            'eqeqeq': ['warn', 'smart'],
            'no-empty': ['warn', { allowEmptyCatch: true }],
            'no-console': 'off', // deploy-commands.js / shard.js log intentionally
        },
    },
    {
        // Jest globals for the test suite.
        files: ['tests/**/*.js'],
        languageOptions: { globals: { ...globals.jest } },
    },
];
