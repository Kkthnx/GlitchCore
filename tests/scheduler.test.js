/*
 * GlitchCore. Copyright (c) 2026 Kkthnx. All Rights Reserved.
 * Proprietary and confidential. Unauthorized copying, use, distribution, or
 * modification of this file or any part of it, via any medium, is strictly
 * prohibited. See the LICENSE file for full terms.
 */

const { nonOverlapping } = require('../src/utils/scheduler');

// A promise plus the handles to settle it from the test body.
function deferred() {
    let resolve, reject;
    const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
    return { promise, resolve, reject };
}

describe('nonOverlapping', () => {
    test('runs the task and reports that it ran', async () => {
        const task = jest.fn().mockResolvedValue(undefined);
        const guarded = nonOverlapping('TEST', task);

        await expect(guarded()).resolves.toBe(true);
        expect(task).toHaveBeenCalledTimes(1);
    });

    test('skips a tick that starts while the previous one is still running', async () => {
        const gate = deferred();
        const task = jest.fn(() => gate.promise);
        const guarded = nonOverlapping('TEST', task);

        const first = guarded();
        // Second tick lands mid-flight: it must not invoke the task again.
        await expect(guarded()).resolves.toBe(false);
        expect(task).toHaveBeenCalledTimes(1);

        gate.resolve();
        await expect(first).resolves.toBe(true);
    });

    test('accepts a new tick once the previous one finished', async () => {
        const gate = deferred();
        const task = jest.fn(() => gate.promise);
        const guarded = nonOverlapping('TEST', task);

        const first = guarded();
        gate.resolve();
        await first;

        await expect(guarded()).resolves.toBe(true);
        expect(task).toHaveBeenCalledTimes(2);
    });

    test('releases the guard when the task throws, so the poller is not wedged', async () => {
        const task = jest.fn()
            .mockRejectedValueOnce(new Error('db down'))
            .mockResolvedValueOnce(undefined);
        const guarded = nonOverlapping('TEST', task);

        await expect(guarded()).rejects.toThrow('db down');
        // A thrown tick must not leave `running` stuck true forever.
        await expect(guarded()).resolves.toBe(true);
    });

    test('forwards arguments to the task', async () => {
        const task = jest.fn().mockResolvedValue(undefined);
        const guarded = nonOverlapping('TEST', task);

        await guarded('a', 2);
        expect(task).toHaveBeenCalledWith('a', 2);
    });
});
