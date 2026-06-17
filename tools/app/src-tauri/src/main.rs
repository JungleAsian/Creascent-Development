use std::{path::PathBuf, process::Command};
use tauri::{
    CustomMenuItem, Manager, SystemTray, SystemTrayEvent, SystemTrayMenu,
};

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
        .system_tray(tray)
        .on_system_tray_event(move |app, event| {
            if let SystemTrayEvent::MenuItemClick { id, .. } = event {
                match id.as_str() {
                    "open" => {
                        if let Some(window) = app.get_window("main") {
                            let _ = window.show();
                            let _ = window.set_focus();
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
