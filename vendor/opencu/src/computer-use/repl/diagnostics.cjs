const redactedDiagnosticSourceMaxLength = 16_384;

function applyReplacements(code, replacements) {
  let replacedCode = code;

  for (const replacement of replacements.sort((a, b) => b.start - a.start)) {
    replacedCode =
      replacedCode.slice(0, replacement.start) +
      replacement.text +
      replacedCode.slice(replacement.end);
  }

  return replacedCode;
}

function redactTemplateToken(raw) {
  if (raw.startsWith("`")) {
    return raw.endsWith("${") ? "`${" : "``";
  }

  return raw.endsWith("${") ? "}${" : "}`";
}

function collectRedactedDiagnosticBindingNames(
  ast,
  currentBindings,
  priorBindings,
  collectPatternBindingNames,
) {
  const bindingNames = new Set(
    [...currentBindings, ...priorBindings].map((binding) => binding.name),
  );

  const addPatternNames = (pattern) => {
    for (const name of collectPatternBindingNames(pattern)) {
      bindingNames.add(name);
    }
  };

  const visit = (node) => {
    if (!node || typeof node !== "object") {
      return;
    }

    switch (node.type) {
      case "VariableDeclaration":
        for (const decl of node.declarations ?? []) {
          addPatternNames(decl.id);
        }
        break;
      case "FunctionDeclaration":
      case "FunctionExpression":
        if (node.id) {
          bindingNames.add(node.id.name);
        }
        for (const param of node.params ?? []) {
          addPatternNames(param);
        }
        break;
      case "ArrowFunctionExpression":
        for (const param of node.params ?? []) {
          addPatternNames(param);
        }
        break;
      case "ClassDeclaration":
      case "ClassExpression":
        if (node.id) {
          bindingNames.add(node.id.name);
        }
        break;
      case "CatchClause":
        addPatternNames(node.param);
        break;
      default:
        break;
    }

    for (const value of Object.values(node)) {
      if (Array.isArray(value)) {
        for (const child of value) {
          visit(child);
        }
      } else if (value && typeof value === "object" && "type" in value) {
        visit(value);
      }
    }
  };

  visit(ast);
  return bindingNames;
}

function collectRedactedDiagnosticIdentifierStarts(ast, bindingNames) {
  const starts = new Set();

  const visit = (node, parent = null, key = null) => {
    if (!node || typeof node !== "object") {
      return;
    }

    if (node.type === "Identifier" && bindingNames.has(node.name)) {
      const isMemberProperty =
        parent?.type === "MemberExpression" &&
        key === "property" &&
        parent.computed !== true;
      const isPropertyKey =
        (parent?.type === "Property" || parent?.type === "MethodDefinition") &&
        key === "key" &&
        parent.computed !== true &&
        parent.shorthand !== true;
      if (!isMemberProperty && !isPropertyKey) {
        starts.add(node.start);
      }
      return;
    }

    for (const [childKey, value] of Object.entries(node)) {
      if (Array.isArray(value)) {
        for (const child of value) {
          visit(child, node, childKey);
        }
      } else if (value && typeof value === "object" && "type" in value) {
        visit(value, node, childKey);
      }
    }
  };

  visit(ast);
  return starts;
}

function redactDiagnosticSource(
  code,
  ast,
  currentBindings,
  priorBindings,
  tokens,
  comments,
  collectPatternBindingNames,
) {
  const bindingNames = collectRedactedDiagnosticBindingNames(
    ast,
    currentBindings,
    priorBindings,
    collectPatternBindingNames,
  );
  const identifierStarts = collectRedactedDiagnosticIdentifierStarts(
    ast,
    bindingNames,
  );
  const identifierNames = new Map();
  const replacements = [];

  const identifierReplacement = (raw) => {
    let replacement = identifierNames.get(raw);
    if (!replacement) {
      replacement = `id${identifierNames.size}`;
      identifierNames.set(raw, replacement);
    }
    return raw.startsWith("#") ? `#${replacement}` : replacement;
  };

  for (const token of tokens) {
    const raw = code.slice(token.start, token.end);
    if (token.token === "Identifier" && identifierStarts.has(token.start)) {
      replacements.push({
        start: token.start,
        end: token.end,
        text: identifierReplacement(raw),
      });
    } else if (token.token === "StringLiteral") {
      replacements.push({ start: token.start, end: token.end, text: '""' });
    } else if (token.token === "TemplateLiteral") {
      replacements.push({
        start: token.start,
        end: token.end,
        text: redactTemplateToken(raw),
      });
    } else if (token.token === "RegularExpression") {
      replacements.push({
        start: token.start,
        end: token.end,
        text: "/(?:)/",
      });
    }
  }

  for (const comment of comments) {
    replacements.push({
      start: comment.start,
      end: comment.end,
      text: "/* */",
    });
  }

  const redacted = applyReplacements(code, replacements);
  if (redacted.length <= redactedDiagnosticSourceMaxLength) {
    return redacted;
  }
  return `${redacted.slice(0, redactedDiagnosticSourceMaxLength)}\n/* truncated */`;
}

module.exports = {
  redactDiagnosticSource,
};
