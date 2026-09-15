Load a listed skill's full instructions.

A skill is a packaged set of task-specific instructions. When the user names an available skill or the task clearly matches its description, call this tool with the exact catalog `name` before taking the relevant task actions. The catalog is a summary, not the skill's full instructions.

If the user has already invoked a skill and its `<skill_content>` is present, follow that content without loading the same skill again. Resolve resource paths from the base directory or URL given with the loaded skill. Do not invent skill names, arguments, or background execution behavior.
