Writes a UTF-8 file, creating it or replacing its full contents.

To preserve existing content, first read the complete current file without truncation (or context_view raw with partial=false); never reconstruct it from a partial view. Preserve its newline convention and final newline. Use edit for localized changes. Provide complete new content, not a patch or omitted-section placeholders.
For an explicitly requested regeneration or full replacement that does not depend on old contents, use the authoritative source/generator; do not read a large generated output merely to reproduce it. This does not authorize discarding unrelated user changes or bypassing a file/permission denial.
