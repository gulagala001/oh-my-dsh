#!/usr/bin/env python3
"""A small bar that says the desktop is under computer control.

Hyprland gives every surface the same input path, so the agent cannot take the
pointer away from the user. The next best thing is telling the user: this bar
sits on a layer-shell surface above normal windows, ignores pointer and keyboard
input entirely, and shows what the model is doing on a second line. It stays up
for the whole session — the helper refreshes the heartbeat from a thread — and
disappears once that session ends. It is deliberately not a window: layer
surfaces never show up in `hyprctl clients`, so it cannot become a capture
target by accident.
"""

import argparse
import json
import os
import sys
import time

import gi

gi.require_version('Gtk', '3.0')
gi.require_version('Gdk', '3.0')
from gi.repository import Gdk, GLib, Gtk, Pango  # noqa: E402

try:
    gi.require_version('GtkLayerShell', '0.1')
    from gi.repository import GtkLayerShell  # noqa: E402
    LAYER = True
except (ValueError, ImportError):
    LAYER = False

STYLE = b"""
window, .root { background: transparent; }
.box {
  background: rgba(24, 24, 27, 0.94);
  border: 1px solid rgba(255, 170, 0, 0.85);
  border-radius: 14px;
  padding: 8px 16px;
}
.dot { color: #ffaa00; font-size: 15px; font-weight: bold; }
.dot.idle { color: #71717a; }
.title { color: #f4f4f5; font-size: 13px; font-weight: bold; }
.status { color: #d4d4d8; font-size: 12px; }
.age { color: #a1a1aa; font-size: 11px; }
"""


class Bar(Gtk.Window):
    def __init__(self, text, offset):
        super().__init__(type=Gtk.WindowType.TOPLEVEL)
        self.busy_text = text
        self.set_decorated(False)
        self.set_skip_taskbar_hint(True)
        self.set_skip_pager_hint(True)
        self.set_accept_focus(False)
        self.set_focus_on_map(False)
        self.set_app_paintable(True)
        screen = self.get_screen()
        visual = screen.get_rgba_visual()
        if visual is not None:
            self.set_visual(visual)

        box = Gtk.Box(orientation=Gtk.Orientation.VERTICAL, spacing=3)
        box.get_style_context().add_class('box')

        row = Gtk.Box(orientation=Gtk.Orientation.HORIZONTAL, spacing=8)
        self.dot = Gtk.Label(label='●')
        self.dot.get_style_context().add_class('dot')
        self.title = Gtk.Label(label=text)
        self.title.get_style_context().add_class('title')
        self.title.set_xalign(0)
        row.pack_start(self.dot, False, False, 0)
        row.pack_start(self.title, False, False, 0)
        box.pack_start(row, False, False, 0)

        detail = Gtk.Box(orientation=Gtk.Orientation.HORIZONTAL, spacing=6)
        self.status = Gtk.Label(label='已连接，等待指令')
        self.status.get_style_context().add_class('status')
        self.status.set_xalign(0)
        self.status.set_ellipsize(Pango.EllipsizeMode.END)
        self.status.set_max_width_chars(72)
        self.age = Gtk.Label(label='')
        self.age.get_style_context().add_class('age')
        self.age.set_xalign(0)
        detail.pack_start(self.status, False, False, 0)
        detail.pack_start(self.age, False, False, 0)
        box.pack_start(detail, False, False, 0)

        self.add(box)

        provider = Gtk.CssProvider()
        provider.load_from_data(STYLE)
        Gtk.StyleContext.add_provider_for_screen(screen, provider, Gtk.STYLE_PROVIDER_PRIORITY_APPLICATION)

        if LAYER:
            GtkLayerShell.init_for_window(self)
            GtkLayerShell.set_layer(self, GtkLayerShell.Layer.OVERLAY)
            GtkLayerShell.set_anchor(self, GtkLayerShell.Edge.TOP, True)
            GtkLayerShell.set_margin(self, GtkLayerShell.Edge.TOP, offset)
            GtkLayerShell.set_keyboard_mode(self, GtkLayerShell.KeyboardMode.NONE)
            GtkLayerShell.set_exclusive_zone(self, -1)
        else:
            # Without layer-shell the bar is a normal floating window, which at
            # least stays visible even if it cannot be made click-through.
            self.set_type_hint(Gdk.WindowTypeHint.NOTIFICATION)
            self.set_keep_above(True)

        self.connect('realize', self.on_realize)
        self.show_all()

    def set_status(self, text, stamp):
        """Show the step the helper is on, and how long ago it happened.

        A long gap does not mean control ended — the session stays open until
        it is released — so the bar says so instead of looking abandoned.
        """
        if self.status.get_text() != text:
            self.status.set_text(text)
        age = int(time.time() - stamp) if stamp else 0
        self.age.set_text('· %s' % ago(age))
        idle = age >= IDLE_AFTER
        title = 'OpenCU 仍保持接管 · 空闲中，请勿移动鼠标' if idle else self.busy_text
        if self.title.get_text() != title:
            self.title.set_text(title)
        context = self.dot.get_style_context()
        if idle:
            context.add_class('idle')
        else:
            context.remove_class('idle')

    def on_realize(self, _widget):
        """Let every click and scroll pass through to whatever is underneath."""
        window = self.get_window()
        if window is None:
            return
        try:
            import cairo
            window.input_shape_combine_region(cairo.Region())
        except Exception:
            pass


# How long a quiet session may go before the bar says it is idle rather than
# describing an operation that finished minutes ago.
IDLE_AFTER = 20


def ago(seconds):
    if seconds < 1:
        return '刚刚'
    if seconds < 60:
        return '%d 秒前' % seconds
    return '%d 分 %d 秒前' % (seconds // 60, seconds % 60)


def heartbeat_fresh(path, idle):
    try:
        return (time.time() - os.path.getmtime(path)) < idle
    except OSError:
        return False


def read_status(path):
    try:
        with open(path) as stream:
            value = json.load(stream)
    except (OSError, ValueError):
        return None
    text = str(value.get('text') or '').strip()
    if not text:
        return None
    return text, float(value.get('at') or 0)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--text', default='OpenCU 正在操作这台桌面 · 请勿移动鼠标或键盘')
    parser.add_argument('--heartbeat', required=True)
    parser.add_argument('--status', default=None)
    parser.add_argument('--idle', type=float, default=8.0)
    parser.add_argument('--offset', type=int, default=6)
    arguments = parser.parse_args()

    bar = Bar(arguments.text, arguments.offset)
    current = None

    def tick():
        nonlocal current
        if not heartbeat_fresh(arguments.heartbeat, arguments.idle):
            Gtk.main_quit()
            return False
        if arguments.status:
            value = read_status(arguments.status)
            if value is not None:
                current = value
            if current is not None:
                bar.set_status(*current)
        return True

    # A quarter second keeps the line in step with the model without costing
    # anything measurable: one small file read per tick.
    GLib.timeout_add(250, tick)
    Gtk.main()
    return 0


if __name__ == '__main__':
    sys.exit(main())
