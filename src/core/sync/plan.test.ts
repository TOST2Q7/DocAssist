import { describe, expect, it } from 'vitest';
import type { Stamp } from '../device/device';
import { applyPlan, hashJson, planSync, type SyncBase, type SyncPayload } from './plan';

const st = (device: string, at = '2026-10-18T10:00:00.000Z'): Stamp => ({ at, device, deviceId: device });
const env = (data: unknown, savedAt = '2026-10-18T10:00:00.000Z') => ({ $type: 't', $version: 1, $app: '0.6.0', $savedAt: savedAt, data });
const empty: SyncBase = { hashes: {}, dismissed: {} };

describe('сверка личных настроек', () => {
  it('отпечаток не зависит от времени сохранения', () => {
    expect(hashJson(env({ a: 1 }, '2026-01-01'))).toBe(hashJson(env({ a: 1 }, '2026-02-02')));
    expect(hashJson(env({ a: 1 }))).not.toBe(hashJson(env({ a: 2 })));
  });

  it('новое устройство берёт с Диска, первое — отправляет', () => {
    const remote: SyncPayload = { $type: 'docassist/personal-sync', version: 1, savedAt: st('ПК'), items: { 'a.json': { data: env(1), stamp: st('ПК'), hash: hashJson(env(1)) } } };
    const plan = planSync(['a.json', 'b.json'], { 'b.json': { data: env(2), stamp: st('Телефон') } }, remote.items, empty);
    expect(plan.pull).toEqual(['a.json']);
    expect(plan.push).toEqual(['b.json']);
    const res = applyPlan(plan, { 'b.json': { data: env(2), stamp: st('Телефон') } }, remote, [], empty, st('Телефон'));
    expect(res.writeLocal).toEqual({ 'a.json': env(1) });
    expect(res.payload?.items['b.json'].stamp.device).toBe('Телефон');
    expect(res.payload?.items['a.json'].stamp.device).toBe('ПК');
    expect(Object.keys(res.base.hashes).sort()).toEqual(['a.json', 'b.json']);
  });

  it('изменения с двух сторон — расхождение; отложенное не спрашивается снова, пока ничего не поменялось', () => {
    const base: SyncBase = { hashes: { 'a.json': hashJson(env(1)) }, dismissed: {} };
    const local = { 'a.json': { data: env(2), stamp: st('Телефон') } };
    const remote: SyncPayload = { $type: 'docassist/personal-sync', version: 1, savedAt: st('ПК'), items: { 'a.json': { data: env(3), stamp: st('ПК'), hash: hashJson(env(3)) } } };
    const plan = planSync(['a.json'], local, remote.items, base);
    expect(plan.conflicts).toEqual(['a.json']);

    // Верная — на устройстве, но Диск не переписывать.
    const kept = applyPlan(plan, local, remote, [{ id: 'a.json', keep: 'local', overwrite: false }], base, st('Телефон'));
    expect(kept.payload).toBeNull();
    expect(kept.writeLocal).toEqual({});
    expect(planSync(['a.json'], local, remote.items, kept.base).conflicts).toEqual([]);

    // Верная — на Диске, заменить на устройстве.
    const pulled = applyPlan(plan, local, remote, [{ id: 'a.json', keep: 'remote', overwrite: true }], base, st('Телефон'));
    expect(pulled.writeLocal).toEqual({ 'a.json': env(3) });
    expect(pulled.base.hashes['a.json']).toBe(hashJson(env(3)));

    // Верная — на устройстве, переписать Диск.
    const pushed = applyPlan(plan, local, remote, [{ id: 'a.json', keep: 'local', overwrite: true }], base, st('Телефон'));
    expect(pushed.payload?.items['a.json'].hash).toBe(hashJson(env(2)));
  });

  it('изменилось только на одной стороне — без вопросов', () => {
    const base: SyncBase = { hashes: { 'a.json': hashJson(env(1)) }, dismissed: {} };
    const remote = { 'a.json': { data: env(1), stamp: st('ПК'), hash: hashJson(env(1)) } };
    expect(planSync(['a.json'], { 'a.json': { data: env(2), stamp: st('Телефон') } }, remote, base).push).toEqual(['a.json']);
    const remote2 = { 'a.json': { data: env(5), stamp: st('ПК'), hash: hashJson(env(5)) } };
    expect(planSync(['a.json'], { 'a.json': { data: env(1), stamp: st('Телефон') } }, remote2, base).pull).toEqual(['a.json']);
  });
});
