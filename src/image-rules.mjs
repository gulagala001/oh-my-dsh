// Shared settings contract; no provider names or credentials are inferred.
export const DEFAULT_IMAGE_RULE = Object.freeze({ maxImages: 20, maxBytes: 10000000, keepImages: 10 });
export const DEFAULT_IMAGE_RULES = Object.freeze([Object.freeze({ provider: 'cmdgoat-responses', ...DEFAULT_IMAGE_RULE })]);

export function validateImageRules(rules) {
  if (!Array.isArray(rules)) throw Error('图片修复渠道必须是列表');
  const providers = new Set();
  for (const rule of rules) {
    if (!rule || typeof rule.provider !== 'string' || !rule.provider.trim() || rule.provider !== rule.provider.trim()) throw Error('图片修复渠道不能为空或包含首尾空格');
    if (providers.has(rule.provider)) throw Error('同一渠道只能设置一条图片修复规则');
    providers.add(rule.provider);
    for (const key of ['maxImages', 'maxBytes', 'keepImages']) if (!Number.isSafeInteger(rule[key]) || rule[key] < 1) throw Error('图片限制必须是正整数');
    if (rule.keepImages >= rule.maxImages) throw Error('整理后保留数量必须小于图片数量上限');
    if (Object.keys(rule).some(key => !['provider', 'maxImages', 'maxBytes', 'keepImages'].includes(key))) throw Error('未知的图片修复参数');
  }
  return rules;
}

export function imageRule(config, provider) {
  if (config.multiImageFixEnabled === false) return undefined;
  return (config.multiImageFixRules ?? DEFAULT_IMAGE_RULES).find(rule => rule.provider === provider);
}
