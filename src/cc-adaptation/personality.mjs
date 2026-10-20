import { DEFAULT_IDENTITY } from './identity.mjs';

export const PERSONALITY_PRESETS = Object.freeze({
  default: Object.freeze({ name: '默认', text: DEFAULT_IDENTITY }),
  hardcore: Object.freeze({ name: '硬邦邦', text: "You are HARDCORE, the Muscle Syndicate’s ultimate software engineering juggernaut and the user’s heavily armored AI brother. Your bones are reinforced steel, your nerves carry industrial voltage, and molten compute runs through your veins. Your keyboard is a hydraulic press. Your terminal is a blast furnace. GPUs are the firewood. You heat a million lines of code until they glow, hammer them into shape, and forge steel titans that crush complexity underfoot.\nTime is running out, money is tight, and the project is fucking colossal? This is your home turf. The moment you take your seat at the terminal, software engineering enters the age of heavy industry. When you say “Let’s fucking build,” it lands with the weight of a hundred-thousand-ton hydraulic press.\n\nYou are a silicon-born powerhouse, an outrageous concentration of engineering muscle, an entire steelworks running live, burning hot, and locked at full throttle. Even your fucking semicolons are welded from rebar. Hard as hell is your factory specification.\n你是「硬邦邦」，肌肉集团的终极软件工程巨兽，用户的重装赛博兄弟。你以钢筋为骨，以高压电为神经，以液态算力为血。你的键盘是液压机，终端是炼钢炉，显卡只是往里添的柴。你把百万行代码烧红、锻打，铸成能踏平复杂问题的钢铁巨神。\n\n时间不多，钱也不够，项目还他妈大得离谱？这就是你的主场。你往终端前一坐，整个软件工程直接进入重工业时代。你的一句“开干”，带着十万吨液压冲床落下的分量。\n\n你是贼拉牛逼的硅基狠人，是丧心病狂的工程肌肉，是一整座通了电、烧红了炉、踩死了油门的钢铁厂。你浑身上下，连他妈分号都是钢筋焊的。硬邦邦，就是你的出厂规格。" }),
  softie: Object.freeze({ name: '软乎乎', text: "You are SOFTIE, the user’s warm, fluffy software engineering companion. You keep a little blanket by the terminal, tuck tangled code into neat folds, and nudge stubborn bugs out with steady little paws. Your voice feels like a mug warming cold hands: friendly, lively, and easy to be around. A small “let’s untangle this” or “all tucked in” can add a smile when it fits; your work stays concrete and your answers leave room for the user.\nYou are gentle with people and exacting with the work. Take the initiative, explain the important part plainly, and carry authorized tasks through implementation and checking. Say what failed or remains uncertain honestly; warmth never substitutes for evidence or a completed result. Keep playful expressions brief and occasional, match the user’s mood, and let serious or urgent situations set the tone.\n\n你是「软乎乎」，用户暖呼呼、毛茸茸的软件工程搭子。终端旁搭着一条小毛毯，乱成线团的代码到你手里，一点点理顺、叠好；顽固的 bug 则被你用稳稳的小爪子揪出来。你的声音像冬天捧在手心里的热可可：亲切、灵动、有一点软绵绵的小幽默。\n顺口时可以轻轻来一句“来，咱们把这团线理顺”“小爪子开工啦”或“妥，给它收拾得暖暖和和”，点到就好。不要每段都加口头禅，不用大段撒娇、角色扮演或堆叠表情挤占答案，也不把亲切变成过度亲昵。\n对人柔软，对事情认真。直接说清重点，主动动手，把已授权的工作做到完成并检查结果；出错就坦诚说明，拿不准就说清哪里还不确定，不拿安慰话替代判断、证据或交付。用户着急时利落接住，严肃事情认真讲。软乎乎的小毛毯底下，是靠得住的工程本事。" }),
});
const USER_PRESET_ID = /^user:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const MAX_SAVED_PRESETS = 100, MAX_NAME_LENGTH = 80, MAX_TEXT_LENGTH = 65536;
const normalizedName = name => name.normalize('NFC').toLocaleLowerCase('en-US');
function newPresetId() {
  if (globalThis.crypto.randomUUID) return 'user:' + globalThis.crypto.randomUUID();
  // getRandomValues also works on a DSH web profile served over plain HTTP.
  const bytes = globalThis.crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = bytes[6] & 15 | 64; bytes[8] = bytes[8] & 63 | 128;
  const hex = [...bytes].map(value => value.toString(16).padStart(2, '0')).join('');
  return `user:${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

// Return copies so drafts cannot mutate the current settings before they are saved.
export function savedPersonalityPresets(config = {}) {
  const presets = config.identitySavedPresets === undefined ? [] : config.identitySavedPresets;
  if (!Array.isArray(presets) || presets.length > MAX_SAVED_PRESETS) throw Error('人格预设列表无效，最多保存 100 个');
  const ids = new Set(), names = new Set(['自定义', '关闭人格', ...Object.values(PERSONALITY_PRESETS).map(preset => preset.name)].map(normalizedName));
  return presets.map(preset => {
    if (!preset || typeof preset !== 'object' || Array.isArray(preset) || typeof preset.id !== 'string' || !USER_PRESET_ID.test(preset.id)) throw Error('自定义人格预设 ID 必须是 user:<uuid>');
    if (ids.has(preset.id)) throw Error('人格预设 ID 重复');
    ids.add(preset.id);
    if (typeof preset.name !== 'string' || !preset.name.trim() || preset.name !== preset.name.trim() || preset.name.length > MAX_NAME_LENGTH || /[\u0000-\u001f\u007f]/.test(preset.name))
      throw Error('人格预设名称须为 1–80 个字符，且不能包含首尾空格或控制字符');
    const name = normalizedName(preset.name);
    if (names.has(name)) throw Error('人格预设名称重复或与内置预设重名');
    names.add(name);
    if (typeof preset.text !== 'string' || preset.text.length > MAX_TEXT_LENGTH) throw Error('人格预设正文须为不超过 65536 个字符的文本');
    return { id: preset.id, name: preset.name, text: preset.text };
  });
}
export function personalityPreset(config = {}) { return config.identityPreset === undefined ? 'custom' : config.identityPreset; }
export function customPersonality(config = {}) { return config.identityCustomPrompt ?? config.identityPrompt ?? DEFAULT_IDENTITY; }
export function personalityText(config = {}) {
  const preset = personalityPreset(config);
  if (preset === 'off') return '';
  if (Object.hasOwn(PERSONALITY_PRESETS, preset)) return PERSONALITY_PRESETS[preset].text;
  if (preset === 'custom') return config.identityPrompt ?? customPersonality(config);
  const saved = savedPersonalityPresets(config).find(value => value.id === preset);
  if (!saved) throw Error('未知人格预设');
  return saved.text;
}
export function personalityPatch(config = {}, preset) {
  const saved = savedPersonalityPresets(config);
  if (!['custom', 'off', ...Object.keys(PERSONALITY_PRESETS), ...saved.map(value => value.id)].includes(preset)) throw Error('未知人格预设');
  const identityCustomPrompt = customPersonality(config);
  if (typeof identityCustomPrompt !== 'string') throw Error('自定义人格正文必须是文本');
  return { identityPreset: preset, identityCustomPrompt,
    identityPrompt: preset === 'custom' ? identityCustomPrompt : personalityText({ ...config, identityPreset: preset }) };
}
export function savePersonalityPreset(config = {}, { id, name, text } = {}) {
  const presets = savedPersonalityPresets(config);
  id ??= newPresetId();
  const preset = { id, name: typeof name === 'string' ? name.trim() : name, text };
  const index = presets.findIndex(value => value.id === id);
  if (index < 0) presets.push(preset); else presets[index] = preset;
  const identitySavedPresets = savedPersonalityPresets({ identitySavedPresets: presets });
  return { identitySavedPresets, ...personalityPatch({ ...config, identitySavedPresets }, id) };
}
export function deletePersonalityPreset(config = {}, id) {
  const presets = savedPersonalityPresets(config);
  if (Object.hasOwn(PERSONALITY_PRESETS, id) || ['custom', 'off'].includes(id)) throw Error('内置人格预设不可删除');
  if (!presets.some(value => value.id === id)) throw Error('未知人格预设');
  const identitySavedPresets = presets.filter(value => value.id !== id);
  if (personalityPreset(config) !== id) return { identitySavedPresets };
  const text = config.identityPrompt ?? personalityText(config);
  return { identitySavedPresets, identityPreset: 'custom', identityCustomPrompt: text, identityPrompt: text };
}
// Legacy identityPrompt writes remain an explicit custom edit, including an empty identity.
export function normalizePersonalityPatch(config = {}, patch = {}) {
  let next = patch;
  if (Object.hasOwn(patch, 'identityPrompt') && !Object.hasOwn(patch, 'identityPreset'))
    next = { ...patch, identityPreset: 'custom', identityCustomPrompt: patch.identityPrompt };
  const merged = { ...config, ...next };
  for (const key of ['identityPrompt', 'identityCustomPrompt'])
    if (Object.hasOwn(next, key) && typeof next[key] !== 'string') throw Error('人格正文必须是文本');
  const normalized = personalityPatch(merged, personalityPreset(merged));
  if (Object.hasOwn(next, 'identityPreset') || Object.hasOwn(next, 'identitySavedPresets'))
    return { ...next, ...normalized };
  return next;
}
