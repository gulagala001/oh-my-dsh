import { mkdirSync, readFileSync, writeFileSync, renameSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { normalizePersonalityPatch, personalityPatch, personalityPreset, personalityProfile, savedPersonalityPresets, importPersonalityFile, migratePersonalityConfig } from './shared/personality.mjs';

export const CONFIG_KEYS = ['identityPrompt', 'identityPreset', 'identitySavedPresets', 'identityCustomPrompt', 'identityCustomModules', 'identityCustomDescription', 'sessionPersonalityEnabled'];
const object = value => value && typeof value === 'object' && !Array.isArray(value);
export function validateSessionId(id) {
  if (typeof id !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,255}$/.test(id) || ['constructor', 'prototype'].includes(id)) throw Error('会话 ID 无效');
  return id;
}
export function validateConfig(config) {
  if (!object(config) || Object.keys(config).some(key => !CONFIG_KEYS.includes(key))) throw Error('人格设置包含未知字段');
  if (config.sessionPersonalityEnabled !== undefined && typeof config.sessionPersonalityEnabled !== 'boolean') throw Error('会话人设开关必须是布尔值');
  return { sessionPersonalityEnabled: true, ...config, ...personalityPatch(config, personalityPreset(config)) };
}
const read = (path, fallback) => {
  try { return JSON.parse(readFileSync(path, 'utf8')); }
  catch (error) { if (error.code === 'ENOENT') return fallback; throw Error('人格数据读取失败，原文件已保留：' + error.message); }
};
const pick = config => Object.fromEntries(CONFIG_KEYS.filter(key => Object.hasOwn(config, key)).map(key => [key, config[key]]));

export class PersonaStore {
  #closed = false;
  constructor(directory) {
    this.dir = resolve(directory); this.file = join(this.dir, 'state.json');
    const saved = read(this.file, null);
    if (saved && (saved.version !== 1 || !object(saved.sessions) || !Array.isArray(saved.migrations))) throw Error('人格数据格式无效，原文件已保留');
    this.data = saved ?? { version: 1, config: {}, sessions: {}, migrations: [] };
    this.data.config = validateConfig(migratePersonalityConfig(this.data.config));
    for (const [id, preset] of Object.entries(this.data.sessions)) {
      validateSessionId(id);
      if (preset !== null && typeof preset !== 'string') throw Error('会话人格记录无效');
    }
    for (const migration of this.data.migrations) if (!object(migration) || typeof migration.dir !== 'string' || !object(migration.ids)) throw Error('人格迁移记录无效');
    this.persisted = saved !== null;
  }
  commit(next) {
    if (this.#closed) throw Object.assign(Error('人格插件已停用，请重新打开设置'), { statusCode: 503 });
    mkdirSync(this.dir, { recursive: true });
    const temporary = this.file + '.' + randomUUID() + '.tmp';
    writeFileSync(temporary, JSON.stringify(next) + '\n', { mode: 0o600 });
    renameSync(temporary, this.file);
    this.data = next; this.persisted = true;
  }
  close() { this.#closed = true; }
  config() { return structuredClone(this.data.config); }
  revision() { return '"' + createHash('sha256').update(JSON.stringify(this.data.config)).digest('hex') + '"'; }
  update(patch, expectedRevision) {
    if (!object(patch) || Object.keys(patch).some(key => !CONFIG_KEYS.includes(key))) throw Error('未知人格设置');
    if (expectedRevision !== undefined && expectedRevision !== this.revision())
      throw Object.assign(Error('人格设置已在另一处更改，请核对最新设置后重试；编辑草稿已保留'), { statusCode: 409 });
    const config = validateConfig({ ...this.data.config, ...normalizePersonalityPatch(this.data.config, patch) });
    this.commit({ ...this.data, config });
    return this.config();
  }
  migrateLegacy(config, directory) {
    const dir = resolve(directory);
    if (this.data.migrations.some(record => record.dir === dir)) return;
    const legacy = validateConfig(migratePersonalityConfig(pick(config))), ids = {};
    let current = this.config();
    if (!this.persisted) current = legacy;
    else {
      for (const old of savedPersonalityPresets(legacy)) {
        const existing = savedPersonalityPresets(current).find(item => item.id === old.id);
        if (existing && JSON.stringify(existing) === JSON.stringify(old)) continue;
        if (!existing && !savedPersonalityPresets(current).some(item => item.name.normalize('NFC').toLowerCase() === old.name.normalize('NFC').toLowerCase())) {
          current.identitySavedPresets = [...savedPersonalityPresets(current), old]; continue;
        }
        const profile = personalityProfile(legacy, old.id);
        const patch = importPersonalityFile(current, JSON.stringify({ format: 'dsh.persona', version: 1, name: profile.name, description: profile.description, modules: profile.modules }));
        current.identitySavedPresets = patch.identitySavedPresets; ids[old.id] = patch.identityPreset;
      }
      const old = personalityProfile(legacy, 'custom'), existing = personalityProfile(current, 'custom');
      if (JSON.stringify(old.modules) !== JSON.stringify(existing.modules) || old.description !== existing.description) {
        const patch = importPersonalityFile(current, JSON.stringify({ format: 'dsh.persona', version: 1, name: '自定义（导入）', description: old.description, modules: old.modules }));
        current.identitySavedPresets = patch.identitySavedPresets; ids.custom = patch.identityPreset;
      }
    }
    current = validateConfig(current);
    this.commit({ ...this.data, config: current, migrations: [...this.data.migrations, { dir, ids }] });
  }
  choice(id) {
    validateSessionId(id);
    if (Object.hasOwn(this.data.sessions, id)) return this.data.sessions[id] ?? undefined;
    for (const source of this.data.migrations) {
      const legacy = read(join(source.dir, 'sessions', id + '.json'), null);
      if (!legacy) continue;
      if (legacy.id !== id) throw Error('原会话人格记录身份不匹配');
      if (typeof legacy.personalityPreset === 'string') {
        const preset = Object.hasOwn(source.ids, legacy.personalityPreset) ? source.ids[legacy.personalityPreset] : legacy.personalityPreset;
        this.save({ id, personalityPreset: preset }); return preset;
      }
    }
    return undefined;
  }
  peek(id) { const personalityPreset = this.choice(id); return { id, ...(personalityPreset ? { personalityPreset } : {}) }; }
  state(id) { return this.peek(id); }
  save({ id, personalityPreset }) {
    validateSessionId(id);
    if (personalityPreset !== undefined && typeof personalityPreset !== 'string') throw Error('会话人设无效');
    this.commit({ ...this.data, sessions: { ...this.data.sessions, [id]: personalityPreset ?? null } });
  }
}
