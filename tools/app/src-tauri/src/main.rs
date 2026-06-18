#![cfg_attr(target_os = "windows", windows_subsystem = "windows")]

use std::{path::PathBuf, process::Command};
use tauri::{
    CustomMenuItem, LogicalPosition, LogicalSize, Manager, Position, Size, SystemTray,
    SystemTrayEvent, SystemTrayMenu,
};

fn fit_window_to_monitor(window: &tauri::Window) {
    let monitor = window
        .current_monitor()
        .ok()
        .flatten()
        .or_else(|| window.primary_monitor().ok().flatten());
    let Some(monitor) = monitor else {
        let _ = window.show();
        let _ = window.set_focus();
        return;
    };

    let size = monitor.size();
    let scale = monitor.scale_factor();
    let available_width = (size.width as f64 / scale - 80.0).max(720.0);
    let available_height = (size.height as f64 / scale - 120.0).max(520.0);
    let width = available_width.min(960.0);
    let height = available_height.min(680.0);
    let monitor_position = monitor.position();
    let monitor_width = size.width as f64 / scale;
    let monitor_height = size.height as f64 / scale;
    let x = monitor_position.x as f64 / scale + ((monitor_width - width) / 2.0).max(0.0);
    let y = monitor_position.y as f64 / scale + ((monitor_height - height) / 2.0).max(0.0);

    let _ = window.set_size(Size::Logical(LogicalSize { width, height }));
    let _ = window.set_position(Position::Logical(LogicalPosition { x, y }));
    let _ = window.show();
    let _ = window.set_focus();
}

fn main() {
    let tools_dir = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("..")
        .join("..");
    let logs_dir = tools_dir.join("logs");

    let open = CustomMenuItem::new("open".to_string(), "Open DevTools");
    let gates = CustomMenuItem::new("gates".to_string(), "Run Gates");
    let logs = CustomMenuItem::new("logs".to_string(), "Open Logs Folder");
    let quit = CustomMenuItem::new("quit".to_string(), "Quit");
    let tray = SystemTray::new().with_menu(
        SystemTrayMenu::new()
            .add_item(open)
            .add_item(gates)
            .add_item(logs)
            .add_item(quit),
    );

    tauri::Builder::default()
        .setup(|app| {
            if let Some(window) = app.get_window("main") {
                fit_window_to_monitor(&window);
            }
            Ok(())
        })
        .system_tray(tray)
        .on_system_tray_event(move |app, event| {
            if let SystemTrayEvent::MenuItemClick { id, .. } = event {
                match id.as_str() {
                    "open" => {
                        if let Some(window) = app.get_window("main") {
                            fit_window_to_monitor(&window);
                        }
                    }
                    "gates" => {
                        let _ = Command::new("pnpm")
                            .args(["tool", "gates", "check"])
                            .current_dir(&tools_dir)
                            .spawn();
                    }
                    "logs" => {
                        let _ = tauri::api::shell::open(&app.shell_scope(), logs_dir.to_string_lossy(), None);
                    }
                    "quit" => app.exit(0),
                    _ => {}
                }
            }
        })
        .run(tauri::generate_context!())
        .expect("failed to run Docmee DevTools");
}
