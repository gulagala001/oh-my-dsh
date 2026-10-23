/** Hyprland implements no RemoteDesktop portal, so its own compositor IPC backend replaces it. */
export function linuxHelper(env = process.env) {
  if (!(env.XDG_SESSION_TYPE === 'wayland' || env.WAYLAND_DISPLAY)) return 'helper.py';
  return /hyprland/i.test(env.XDG_CURRENT_DESKTOP ?? '') || Boolean(env.HYPRLAND_INSTANCE_SIGNATURE) ? 'hyprland.py' : 'wayland.py';
}
