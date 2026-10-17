/** Copy a complete alpha.2 source program into owned storage; real dependency directories stay read-only. */
import { cp, mkdir, readdir, realpath, symlink } from 'node:fs/promises'
import { join } from 'node:path'

/** Destination must be new; optional Git metadata is copied into independent storage, never shared. */
export async function stageSource(source, destination, { dependencies = false, git = false } = {}) {
  await cp(source, destination, { recursive: true, errorOnExist: true, force: false, verbatimSymlinks: true,
    filter: path => !['node_modules', '.desktop-build', ...(git ? [] : ['.git'])].includes(path.split('/').at(-1)) })
  if (!dependencies) return
  async function link(directory, target) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      if (entry.name === '.git' || entry.name === '.desktop-build') continue
      if (entry.name === 'node_modules') {
        await mkdir(target, { recursive: true })
        await symlink(await realpath(join(directory, entry.name)), join(target, entry.name), 'dir')
      } else if (entry.isDirectory()) await link(join(directory, entry.name), join(target, entry.name))
    }
  }
  await link(source, destination)
}
