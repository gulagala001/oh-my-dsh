Performs exact string replacement in an existing UTF-8 file.

- Read the relevant content before editing. Pass the file text itself in `old_string`, without displayed line-number prefixes.
- Match the exact text, including indentation. Use enough context to identify the intended occurrence; use `replace_all: true` only when every occurrence should change.
- If a replacement fails, inspect the current content and adjust the match rather than repeatedly submitting the same stale text.
