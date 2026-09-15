Read a supported image and return its pixels to the model.

Use `file_path` for PNG, JPEG, WebP, or GIF content. A normalized attachment path without an extension is accepted; do not rename it merely to add one. The host validates and downscales large supported images, so use this tool before creating inspection thumbnails.

The selected model must accept image input. If the host reports that no image was delivered, do not claim to have seen it. Independent images may be read in small concurrent batches.
