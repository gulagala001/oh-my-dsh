import { cp, lstat, mkdir, mkdtemp, readFile, realpath, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { symbols } from '@deepseek-ai/cordis';
import { composeFrontmatter, splitFrontmatter, updateFrontmatter } from './frontmatter.mjs';
import { fail, inside, kind } from './common.mjs';

const SKILL_NAME = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const EDITABLE = new Set(['user-dsh', 'user-agents', 'project-dsh', 'project-agents', 'custom']);
const original = value => value?.[symbols.original] ?? value;
const localProvider = provider => Object.getPrototypeOf(original(provider))?.constructor?.name === 'FileSystemSkillProvider';

/** Skills stay where DSH discovers them; this only edits the files behind the native catalog. */
export class Skills {
  constructor(ctx) {
    this.ctx = ctx; this.controller = new AbortController(); this.pending = Promise.resolve();
    ctx.effect(() => () => { this.controller.abort(Error('The skill editor is stopped')); return this.pending; });
  }
  registry(context = this.ctx) {
    this.controller.signal.throwIfAborted();
    const registry = context.get('skills');
    // The supported rc.2 registry exposes each layer's complete candidate list.
    // Keep shadowed files manageable without reimplementing discovery or ranks.
    if (!registry?.layers || typeof registry.listLayerCandidates !== 'function')
      fail('service-missing', 'The native skill catalog is unavailable', {}, 503);
    return registry;
  }
  views(scope) {
    const agents = scope.cwd ? (this.ctx.get('agents')?.list?.() ?? []).filter(agent => {
      const cwd = this.ctx.get('workingDirectory')?.get?.(agent.session) ?? agent.session?.header?.cwd;
      return agent.session?.header?.origin !== 'subagent' && cwd && resolve(cwd) === resolve(scope.cwd);
    }) : [];
    return agents;
  }
  async catalog(scope) {
    const rows = new Map(), roots = new Map(), providerRoots = new Map(), layerIds = new Map();
    layerIds.set(original(this.registry().layers.global), null);
    const filesOf = async (provider, layer, registry, context) => {
      if (!localProvider(provider)) return [];
      const identity = original(provider);
      if (!providerRoots.has(identity)) providerRoots.set(identity, await provider.roots(scope.cwd));
      const files = providerRoots.get(identity);
      for (const root of files) roots.set(`${root.source}:${root.path}`, { ...root, provider, layer, registry, context });
      return files;
    };
    const presets = this.ctx.get('agentPresets'), presetId = presets?.defaultId;
    const lease = presets && await presets.acquireScope(presetId);
    try {
      const views = [{ context: this.ctx, id: null }, ...lease ? [{ context: this.ctx, scope: lease.key, id: `preset:${presetId}` }] : [],
        ...this.views(scope).map(agent => ({ context: agent.ctx, scope: agent, id: agent.session.id }))];
      for (const view of views) {
        const registry = this.registry(view.context);
        const options = { signal: this.controller.signal, ...scope.cwd ? { cwd: scope.cwd } : {}, scope: view.scope };
        for (const layer of [registry.layers.global, ...registry.layers.chainLayers(view.scope)]) {
          if (!layerIds.has(original(layer))) layerIds.set(original(layer), view.id);
          const result = await registry.listLayerCandidates(layer, options);
          if (!result.cacheable) fail('skill-catalog-incomplete', 'The skill catalog could not be completely read; refresh and try again', {}, 503);
          for (const { candidate, provider } of result.entries) {
            const key = JSON.stringify([localProvider(provider) ? 'file' : layerIds.get(original(layer)),
              candidate.provider, candidate.name, candidate.locator?.path ?? candidate.path ?? null]);
            if (rows.has(key)) continue;
            const files = await filesOf(provider, layer, registry, view.context);
            const path = candidate.locator?.path;
            const root = files?.find(root => root.source === candidate.source && path && inside(root.path, path));
            const parts = root && relative(root.path, path).split(sep);
            const editable = !!root && EDITABLE.has(candidate.source)
              && (parts.length === 1 && parts[0].endsWith('.md') || parts.length === 2 && parts[1] === 'SKILL.md');
            rows.set(key, { key, candidate, provider, layer, registry, context: view.context, options, root, path: editable ? path : candidate.path,
              editable, bundle: editable && parts.length === 2 });
          }
          // Empty configured directories are still valid creation destinations.
          for (const { provider } of layer.providers.values()) await filesOf(provider, layer, registry, view.context);
        }
      }
      this.controller.signal.throwIfAborted();
      return { rows: [...rows.values()], roots: [...roots.values()] };
    } finally { await lease?.[Symbol.asyncDispose](); }
  }
  destinations(roots) {
    return Object.fromEntries([['user', 'user-dsh'], ['project', 'project-dsh']].flatMap(([location, source]) => {
      const paths = [...new Set(roots.filter(root => root.source === source).map(root => root.path))];
      return paths.length === 1 ? [[location, paths[0]]] : [];
    }));
  }
  describe(row) {
    const skill = row.candidate;
    return { key: row.key, name: skill.name, description: skill.description, whenToUse: skill.whenToUse,
      source: skill.source, provider: skill.provider, path: row.path,
      directory: skill.resourceBase?.kind === 'directory' ? skill.resourceBase.path : undefined,
      bundle: row.bundle, editable: row.editable,
      model: skill.invocation.modelInvocable, user: skill.invocation.userInvocable };
  }
  async list(scope) {
    const { rows, roots } = await this.catalog(scope);
    return { skills: rows.map(row => this.describe(row)), roots: this.destinations(roots) };
  }
  async find(scope, key) {
    const skill = (await this.catalog(scope)).rows.find(row => row.key === key || key && row.path === key);
    if (!skill) fail('skill-missing', 'This skill is no longer in the DSH catalog; refresh and try again', {}, 404);
    return skill;
  }
  async read(scope, key) {
    const row = await this.find(scope, key);
    const definition = await row.provider.get(row.candidate, row.options);
    if (!definition) fail('skill-missing', 'This skill is no longer available; refresh and try again', {}, 404);
    return { ...this.describe(row), content: row.editable ? await readFile(row.path, 'utf8') : definition.content };
  }
  static validate(content) {
    let parsed;
    try { parsed = splitFrontmatter(content); } catch (error) { fail('invalid-frontmatter', `Invalid YAML frontmatter: ${error.message}`); }
    if (!parsed.data) fail('frontmatter-required', 'SKILL.md needs YAML frontmatter with name and description');
    const { name, description } = parsed.data;
    if (typeof name !== 'string' || !SKILL_NAME.test(name)) fail('invalid-skill-name', 'The skill name must be lowercase letters, digits and single hyphens');
    if (typeof description !== 'string' || !description.trim()) fail('description-required', 'A description is required');
    return parsed;
  }
  editable(skill) { if (!skill.editable) fail('skill-read-only', 'This skill is provided by DSH or a plugin and cannot be changed here', {}, 403); }
  assertOwner(row) {
    if (original(this.registry(row.context)) !== original(row.registry)
      || original(row.layer.providers.get(row.provider.name)?.provider) !== original(row.provider))
      fail('skill-missing', 'The native skill provider changed; refresh and try again', {}, 409);
  }
  invalidate() {
    const registries = new Set([original(this.ctx.get('skills'))]);
    for (const agent of this.ctx.get('agents')?.list?.() ?? [])
      registries.add(original(this.ctx.get('agentPresets')?.serviceFor?.(agent, 'skills') ?? agent.ctx.get('skills')));
    for (const registry of registries) registry?.invalidateCache();
  }
  mutate(action) {
    const task = this.pending.then(async () => {
      this.registry();
      const value = await action();
      return value;
    });
    this.pending = task.catch(() => {});
    return task;
  }
  async destination(scope, location) {
    const { roots } = await this.catalog(scope), path = this.destinations(roots)[location === 'project' ? 'project' : 'user'];
    const root = roots.find(root => root.path === path && root.source === (location === 'project' ? 'project-dsh' : 'user-dsh'));
    if (!root) fail('skill-root-unavailable', 'No unique native skill directory is configured for this location');
    return root;
  }
  async validateFile(provider, source, path) {
    const definition = await provider.get({ source, locator: { path, directory: dirname(path) } }, { signal: this.controller.signal });
    if (!definition) fail('invalid-frontmatter', 'DSH cannot load this skill; check its name, description and invocation fields');
    this.controller.signal.throwIfAborted();
    return definition;
  }
  async replace(skill, content) {
    Skills.validate(content);
    const target = await realpath(skill.path), stage = await mkdtemp(join(dirname(target), '.skill-edit-'));
    try {
      const file = join(stage, 'content');
      await writeFile(file, content, { mode: 0o600 });
      await this.validateFile(skill.provider, skill.candidate.source, file);
      this.assertOwner(skill);
      await rename(file, target);
      this.invalidate();
    } finally { await rm(stage, { recursive: true, force: true }); }
  }
  save(scope, path, content) {
    return this.mutate(async () => {
      const skill = await this.find(scope, path); this.editable(skill);
      await this.replace(skill, content);
    });
  }
  async publish(root, name, prepare) {
    await mkdir(root.path, { recursive: true });
    const target = join(root.path, name), stage = await mkdtemp(join(root.path, '.skill-import-'));
    try {
      // A nested payload is invisible to the native one-level discovery rule.
      const payload = join(stage, 'payload');
      await prepare(payload);
      const definition = await this.validateFile(root.provider, root.source, join(payload, 'SKILL.md'));
      if (definition.name !== name) fail('invalid-skill-name', 'The imported skill name changed during copying');
      const exists = await lstat(target).then(() => true, error => { if (error.code === 'ENOENT') return false; throw error; });
      if (exists) fail('skill-exists', `A skill folder named ${name} already exists`, { name }, 409);
      this.assertOwner(root);
      // The write queue serializes this host. Publish into an absent name;
      // replacing an empty reservation directory is not portable to Windows.
      await rename(payload, target);
      this.invalidate();
      return join(target, 'SKILL.md');
    } finally {
      await rm(stage, { recursive: true, force: true });
    }
  }
  create(scope, { location, name, description, body }) {
    return this.mutate(async () => {
      if (typeof name !== 'string' || !SKILL_NAME.test(name)) fail('invalid-skill-name', 'The skill name must be lowercase letters, digits and single hyphens');
      if (typeof description !== 'string' || !description.trim()) fail('description-required', 'A description is required');
      const root = await this.destination(scope, location);
      return this.publish(root, name, async directory => {
        await mkdir(directory);
        await writeFile(join(directory, 'SKILL.md'), composeFrontmatter({ name, description: description.trim() }, body || ''), { mode: 0o600 });
      });
    });
  }
  invocation(scope, path, changes) {
    return this.mutate(async () => {
      const skill = await this.find(scope, path); this.editable(skill);
      const text = await readFile(skill.path, 'utf8'), fields = {};
      if (Object.hasOwn(changes, 'model')) fields['disable-model-invocation'] = changes.model === false ? true : undefined;
      if (Object.hasOwn(changes, 'user')) fields['user-invocable'] = changes.user === false ? false : undefined;
      await this.replace(skill, updateFrontmatter(text, fields));
    });
  }
  remove(scope, path) { return this.mutate(async () => {
    const skill = await this.find(scope, path); this.editable(skill);
    if (skill.bundle) {
      const directory = dirname(skill.path);
      const roots = (await this.catalog(scope)).roots.map(root => root.path);
      // Only a skill's own folder is removed, never a whole skill root.
      const canonical = await realpath(directory);
      for (const root of roots) {
        const canonicalRoot = await realpath(root).catch(error => { if (error.code === 'ENOENT') return null; throw error; });
        if (inside(directory, root) || canonicalRoot && inside(canonical, canonicalRoot))
          fail('skill-read-only', 'Refusing to remove a skill root');
      }
      const linked = (await lstat(directory)).isSymbolicLink();
      this.assertOwner(skill);
      await rm(directory, { recursive: !linked });
    } else { this.assertOwner(skill); await rm(skill.path); }
    this.invalidate();
  });
  }
  import(scope, { location, source }) { return this.mutate(async () => {
    if (typeof source !== 'string' || !source.trim()) fail('source-required', 'Enter the folder that contains SKILL.md');
    const from = await realpath(resolve(source.trim())).catch(error => { if (error.code === 'ENOENT') fail('skill-source-missing', 'No SKILL.md was found at this location'); throw error; });
    const type = await kind(from);
    const file = type === 'directory' ? join(from, 'SKILL.md') : from;
    if (await kind(file) !== 'file') fail('skill-source-missing', 'No SKILL.md was found at this location');
    const { data } = Skills.validate(await readFile(file, 'utf8'));
    const root = await this.destination(scope, location), target = join(root.path, data.name);
    if (type === 'directory') {
      if (inside(from, target) || inside(target, from)) fail('skill-source-overlap', 'The source folder overlaps the destination');
      const canonicalFrom = await realpath(from), canonicalRoot = await realpath(root.path).catch(error => { if (error.code === 'ENOENT') return resolve(root.path); throw error; });
      if (inside(canonicalFrom, canonicalRoot) || inside(join(canonicalRoot, data.name), canonicalFrom)) fail('skill-source-overlap', 'The source folder overlaps the destination');
    }
    return this.publish(root, data.name, async directory => {
      if (type === 'directory') await cp(from, directory, { recursive: true, force: false, errorOnExist: true,
        filter: path => !/(?:^|[\\/])(?:\.git|node_modules)$/.test(path) });
      else { await mkdir(directory); await writeFile(join(directory, 'SKILL.md'), await readFile(file, 'utf8'), { mode: 0o600 }); }
    });
  });
  }
}
