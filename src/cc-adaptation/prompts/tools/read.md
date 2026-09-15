Read a UTF-8 text file and return line-numbered content.

- Pass `file_path` using the Session filesystem. Use the tool's actual range fields when only part of a large file is needed.
- Treat a truncated result as partial. Follow the returned range or continuation guidance before making claims about the rest of the file.
- Use `read_image` for supported images. Do not pass a `pages` option or assume this tool renders PDFs or notebook cells.
- Re-read the relevant area when correctness depends on the resulting file contents; a successful write is not a test of the change's behavior.
