/** Parse metadata as syntax, never by evaluating user-authored JavaScript. */
import { parse } from 'acorn'
import { validateMeta } from './meta.ts'
import type { WorkflowMeta } from '@deepseek-ai/dsh-workflow'

function literal(node: any): unknown {
  if (node?.type === 'Literal' && !node.regex && !node.bigint && (node.value === null || ['string', 'boolean', 'number'].includes(typeof node.value))) return node.value
  if (node?.type === 'UnaryExpression' && node.operator === '-' && node.argument.type === 'Literal' && typeof node.argument.value === 'number') return -node.argument.value
  if (node?.type === 'ArrayExpression' && node.elements.every(Boolean)) return node.elements.map(literal)
  if (node?.type === 'ObjectExpression') {
    const value = Object.create(null)
    for (const property of node.properties) {
      if (property.type !== 'Property' || property.computed || property.method || property.shorthand || property.kind !== 'init') throw new Error('Workflow meta must be a pure literal')
      const key = property.key.type === 'Identifier' ? property.key.name : literal(property.key)
      if (typeof key !== 'string' || Object.hasOwn(value, key)) throw new Error('Workflow meta keys must be unique strings')
      value[key] = literal(property.value)
    }
    return value
  }
  throw new Error('Workflow meta must be a pure literal: no calls, variables, spreads, or interpolation')
}

export function parseWorkflowSource(script: string, suppliedMeta?: unknown): { meta: WorkflowMeta; body: string } {
  const tree = parse(script, { ecmaVersion: 'latest', sourceType: 'module', allowAwaitOutsideFunction: true, allowReturnOutsideFunction: true })
  const first: any = tree.body[0]
  if (first?.type !== 'ExportNamedDeclaration') {
    if (suppliedMeta === undefined) throw new Error('Workflow script must begin with export const meta = {...}, or supply the meta field')
    return { meta: validateMeta(suppliedMeta), body: script }
  }
  const declaration = first.declaration
  if (declaration?.type !== 'VariableDeclaration' || declaration.kind !== 'const' || declaration.declarations.length !== 1 || declaration.declarations[0].id.type !== 'Identifier' || declaration.declarations[0].id.name !== 'meta') throw new Error('Workflow script must begin with export const meta = {...}')
  const meta = validateMeta(literal(declaration.declarations[0].init))
  if (suppliedMeta !== undefined && JSON.stringify(meta) !== JSON.stringify(validateMeta(suppliedMeta))) throw new Error('Workflow inline meta and meta field disagree')
  return { meta, body: script.slice(0, first.start) + script.slice(first.start, first.end).replace(/[^\n\r]/g, ' ') + script.slice(first.end) }
}

export function serializeWorkflowSource(meta: WorkflowMeta, body: string): string {
  return `export const meta = ${JSON.stringify(meta, null, 2)};\n${body}`
}
