import GLib from "gi://GLib";
import Gio from "gi://Gio";
import Meta from "gi://Meta";
import Shell from "gi://Shell";
import * as Main from "resource:///org/gnome/shell/ui/main.js";
import { Extension } from "resource:///org/gnome/shell/extensions/extension.js";

const INIT_PADDING = 8;
const INIT_KEYBINDING = "<Super>f";
const INIT_IGNORE_WINDOWS = [];

export default class AlmostFullscreenExtension extends Extension {
  _loadConfig() {
    try {
      const configFile = this.dir.get_child("config.json");
      const [success, contents] = configFile.load_contents(null);

      if (success) {
        const config = JSON.parse(new TextDecoder("utf-8").decode(contents));

        this._keybinding = config.keybinding || INIT_KEYBINDING;
        this._padding = {
          t: Math.round(config.padding.t || INIT_PADDING),
          b: Math.round(config.padding.b || INIT_PADDING),
          l: Math.round(config.padding.l || INIT_PADDING),
          r: Math.round(config.padding.r || INIT_PADDING),
        };
        this._ignoreWindows = config.ignoreWindows || INIT_IGNORE_WINDOWS;
      } else throw new Error("Failed to load config.json");
    } catch (e) {
      logError(e);
      this._keybinding = INIT_KEYBINDING;
      this._padding = {
        t: INIT_PADDING,
        b: INIT_PADDING,
        l: INIT_PADDING,
        r: INIT_PADDING,
      };
      this._ignoreWindows = INIT_IGNORE_WINDOWS;
    }
  }

  _getSettings() {
    const GioSSS = Gio.SettingsSchemaSource;
    const schemaSource = GioSSS.new_from_directory(
      this.dir.get_child("schemas").get_path(),
      GioSSS.get_default(),
      false
    );
    const schemaObj = schemaSource.lookup(
      "org.gnome.shell.extensions.almost-fullscreen",
      true
    );

    if (!schemaObj) throw new Error("cannot find schemas");
    return new Gio.Settings({ settings_schema: schemaObj });
  }

  enable() {
    this._loadConfig();

    this._windowCreatedId = global.display.connect(
      "window-created",
      (_, window) => {
        const actor = window.get_compositor_private();
        const id = actor.connect("first-frame", (_) => {
          this._resizeWindow(window);
          actor.disconnect(id);
        });

        //! Delays are important for some windows
        GLib.timeout_add(GLib.PRIORITY_DEFAULT, 400, () => {
          this._resizeWindow(window);
          return GLib.SOURCE_REMOVE;
        });
      }
    );

    const settings = this._getSettings();
    settings.set_strv("almost-fullscreen-keybinding", [this._keybinding]);

    Main.wm.addKeybinding(
      "almost-fullscreen-keybinding",
      settings,
      Meta.KeyBindingFlags.NONE,
      Shell.ActionMode.NORMAL,
      () => this._onKeybindingPressed()
    );
  }

  _onKeybindingPressed() {
    const focusedWindow = global.display.focus_window;
    this._resizeWindow(focusedWindow, focusedWindow.get_compositor_private());
  }

  _resizeWindow(window, actor) {
    try {
      if (
        !window ||
        window.is_destroyed?.() ||
        window.window_type !== Meta.WindowType.NORMAL ||
        this._ignoreWindows.includes(window.get_wm_class()) ||
        !window.get_compositor_private()
      )
        return;

      if (window.maximized_horizontally || window.maximized_vertically)
        window.unmaximize();

      if (window.allows_resize()) this._doResize(window, actor);
    } catch (e) {
      logError(e, "almost-fullscreen");
    }
  }

  _doResize(window, actor) {
    try {
      const { x, y, width, height } = Main.layoutManager.getWorkAreaForMonitor(
        window.get_monitor()
      );

      const frameRect = window.get_frame_rect();
      const bufferRect = window.get_buffer_rect();
      const offsetX = Math.round(bufferRect.x) - Math.round(frameRect.x);
      const offsetY = Math.round(bufferRect.y) - Math.round(frameRect.y);

      const newX = Math.round(x) + this._padding.l;
      const newY = Math.round(y) + this._padding.t;
      const newWidth = Math.max(
        100,
        Math.round(width) - (this._padding.l + this._padding.r)
      );
      const newHeight = Math.max(
        100,
        Math.round(height) - (this._padding.t + this._padding.b)
      );

      if (
        newX === Math.round(frameRect.x) &&
        newY === Math.round(frameRect.y) &&
        newWidth === Math.round(frameRect.width) &&
        newHeight === Math.round(frameRect.height)
      )
        return;

      //! Workaround: some windows resize themselves a pixel smaller
      if (!window.maximized_horizontally && !window.maximized_vertically) {
        window.maximize();
        window.unmaximize();
      }

      if (actor) {
        actor.ease({
          //! Offsets are important for some windows
          x: newX + offsetX,
          y: newY + offsetY,
          width: newWidth,
          height: newHeight,
          duration: 400,
          mode: global.ease_out_cubic,
        });
      }

      window.move_resize_frame(false, newX, newY, newWidth, newHeight);
    } catch (e) {
      logError(e, "almost-fullscreen resize");
    }
  }

  disable() {
    if (this._windowCreatedId) {
      global.display.disconnect(this._windowCreatedId);
      this._windowCreatedId = null;
    }

    Main.wm.removeKeybinding("almost-fullscreen-keybinding");
  }
}
