import GLib from "gi://GLib";
import Gio from "gi://Gio";
import Meta from "gi://Meta";
import Shell from "gi://Shell";
import * as Main from "resource:///org/gnome/shell/ui/main.js";
import { Extension } from "resource:///org/gnome/shell/extensions/extension.js";

const INIT_PADDING = 8;
const INIT_KEYBINDING = "<Super>f";

export default class AlmostFullscreenExtension extends Extension {
  _loadConfig() {
    try {
      const configFile = this.dir.get_child("config.json");
      const [success, contents] = configFile.load_contents(null);

      if (success) {
        const configText = new TextDecoder("utf-8").decode(contents);
        const config = JSON.parse(configText);

        this._padding = config.padding || INIT_PADDING;
        this._keybinding = config.keybinding || INIT_KEYBINDING;
      } else throw new Error("Failed to load config.json");
    } catch (e) {
      logError(e);
      this._padding = INIT_PADDING;
      this._keybinding = INIT_KEYBINDING;
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
      (display, window) => {
        if (!window || window.window_type !== Meta.WindowType.NORMAL) return;

        [200, 400, 600].forEach((delay) => {
          GLib.timeout_add(GLib.PRIORITY_DEFAULT, delay, () => {
            this._resizeWindow(window);
            return GLib.SOURCE_REMOVE;
          });
        });
      }
    );

    const settings = this._getSettings();
    // TODO: set CUSTOM shortcut:
    // const settings = this._getSettings().set_strv(
    //   "almost-fullscreen-keybinding",
    //   [this._keybinding]
    // );

    const mode = Shell.ActionMode.NORMAL;
    const flag = Meta.KeyBindingFlags.NONE;

    Main.wm.addKeybinding(
      "almost-fullscreen-keybinding",
      settings,
      flag,
      mode,
      () => this._onKeybindingPressed()
    );
  }

  _onKeybindingPressed() {
    const window = global.display.focus_window;

    if (!window || window.window_type !== Meta.WindowType.NORMAL) return;
    this._resizeWindow(window);
  }

  _resizeWindow(window) {
    try {
      if (window.is_destroyed?.()) return;

      if (window.maximized_horizontally || window.maximized_vertically) {
        window.unmaximize();

        GLib.timeout_add(GLib.PRIORITY_DEFAULT, 200, () => {
          if (window.allows_resize()) this._doResize(window);
          return GLib.SOURCE_REMOVE;
        });
        return;
      }

      if (!window.allows_resize()) return;

      this._doResize(window);
    } catch (e) {
      logError(e, "almost-fullscreen");
    }
  }

  _doResize(window) {
    try {
      const wa = Main.layoutManager.getWorkAreaForMonitor(window.get_monitor());

      const x = wa.x + this._padding;
      const y = wa.y + this._padding;
      const width = Math.max(100, wa.width - this._padding * 2);
      const height = Math.max(100, wa.height - this._padding * 2);

      window.move_resize_frame(true, x, y, width, height);
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
