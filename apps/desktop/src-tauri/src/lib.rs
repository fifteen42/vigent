use std::process::{Child, Command};
use std::sync::Mutex;
use tauri::Manager;

struct AgentProcess(Mutex<Option<Child>>);

#[tauri::command]
fn get_agent_url() -> String {
    "http://localhost:3457".to_string()
}

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .manage(AgentProcess(Mutex::new(None)))
        .setup(|app| {
            // Spawn vigent serve on a fixed local port
            match Command::new("vigent")
                .args(["serve", "--port", "3457"])
                .spawn()
            {
                Ok(child) => {
                    *app.state::<AgentProcess>().0.lock().unwrap() = Some(child);
                    println!("[Vigent Desktop] Agent started on port 3457");
                }
                Err(e) => {
                    eprintln!("[Vigent Desktop] Failed to start agent: {e}");
                    eprintln!("Make sure 'vigent' is in PATH. Run: pnpm --filter @vigent/agent build");
                }
            }
            Ok(())
        })
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { .. } = event {
                // Kill the agent process when window closes
                if let Some(mut child) = window
                    .app_handle()
                    .state::<AgentProcess>()
                    .0
                    .lock()
                    .unwrap()
                    .take()
                {
                    let _ = child.kill();
                }
            }
        })
        .invoke_handler(tauri::generate_handler![get_agent_url])
        .run(tauri::generate_context!())
        .expect("error while running Vigent Desktop");
}
