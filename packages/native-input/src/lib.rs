use enigo::{
    Axis, Button, Coordinate, Direction, Enigo, Keyboard, Mouse, Settings,
};
use napi::Result;
use napi_derive::napi;
use std::cell::RefCell;

thread_local! {
    static ENIGO: RefCell<Option<Enigo>> = RefCell::new(None);
}

fn with_enigo<F, R>(f: F) -> Result<R>
where
    F: FnOnce(&mut Enigo) -> std::result::Result<R, enigo::InputError>,
{
    ENIGO.with(|cell| {
        let mut borrow = cell.borrow_mut();
        if borrow.is_none() {
            let enigo = Enigo::new(&Settings::default())
                .map_err(|e| napi::Error::from_reason(format!("Failed to create Enigo: {e}")))?;
            *borrow = Some(enigo);
        }
        let enigo = borrow.as_mut().unwrap();
        f(enigo).map_err(|e| napi::Error::from_reason(format!("{e}")))
    })
}

#[napi(object)]
pub struct MousePos {
    pub x: i32,
    pub y: i32,
}

#[napi]
pub fn move_mouse(x: i32, y: i32) -> Result<()> {
    with_enigo(|enigo| enigo.move_mouse(x, y, Coordinate::Abs))
}

#[napi]
pub fn mouse_click(button: String, count: u32) -> Result<()> {
    let btn = parse_button(&button)?;
    with_enigo(|enigo| {
        for _ in 0..count {
            enigo.button(btn, Direction::Click)?;
        }
        Ok(())
    })
}

#[napi]
pub fn mouse_down(button: String) -> Result<()> {
    let btn = parse_button(&button)?;
    with_enigo(|enigo| enigo.button(btn, Direction::Press))
}

#[napi]
pub fn mouse_up(button: String) -> Result<()> {
    let btn = parse_button(&button)?;
    with_enigo(|enigo| enigo.button(btn, Direction::Release))
}

#[napi]
pub fn mouse_scroll(dx: i32, dy: i32) -> Result<()> {
    with_enigo(|enigo| {
        if dy != 0 {
            enigo.scroll(dy, Axis::Vertical)?;
        }
        if dx != 0 {
            enigo.scroll(dx, Axis::Horizontal)?;
        }
        Ok(())
    })
}

#[napi]
pub fn mouse_location() -> Result<MousePos> {
    with_enigo(|enigo| enigo.location()).map(|(x, y)| MousePos { x, y })
}

#[napi]
pub fn type_text(text: String) -> Result<()> {
    with_enigo(|enigo| enigo.text(&text))
}

#[napi]
pub fn press_key(key: String) -> Result<()> {
    let k = parse_key(&key)?;
    with_enigo(|enigo| enigo.key(k, Direction::Click))
}

#[napi]
pub fn press_keys(keys: Vec<String>) -> Result<()> {
    let parsed: Vec<enigo::Key> = keys.iter().map(|k| parse_key(k)).collect::<Result<_>>()?;

    if parsed.is_empty() {
        return Ok(());
    }

    let (modifiers, main_key) = parsed.split_at(parsed.len() - 1);

    with_enigo(|enigo| {
        for &m in modifiers {
            enigo.key(m, Direction::Press)?;
        }
        enigo.key(main_key[0], Direction::Click)?;
        for &m in modifiers.iter().rev() {
            enigo.key(m, Direction::Release)?;
        }
        Ok(())
    })
}

fn parse_button(s: &str) -> Result<Button> {
    match s.to_lowercase().as_str() {
        "left" => Ok(Button::Left),
        "right" => Ok(Button::Right),
        "middle" => Ok(Button::Middle),
        _ => Err(napi::Error::from_reason(format!(
            "Unknown button: {s}. Use left/right/middle"
        ))),
    }
}

fn parse_key(s: &str) -> Result<enigo::Key> {
    match s.to_lowercase().as_str() {
        "return" | "enter" => Ok(enigo::Key::Return),
        "tab" => Ok(enigo::Key::Tab),
        "space" => Ok(enigo::Key::Space),
        "backspace" | "delete" => Ok(enigo::Key::Backspace),
        "escape" | "esc" => Ok(enigo::Key::Escape),
        "up" => Ok(enigo::Key::UpArrow),
        "down" => Ok(enigo::Key::DownArrow),
        "left" => Ok(enigo::Key::LeftArrow),
        "right" => Ok(enigo::Key::RightArrow),
        "command" | "cmd" | "meta" => Ok(enigo::Key::Meta),
        "shift" => Ok(enigo::Key::Shift),
        "control" | "ctrl" => Ok(enigo::Key::Control),
        "alt" | "option" => Ok(enigo::Key::Alt),
        "capslock" => Ok(enigo::Key::CapsLock),
        "home" => Ok(enigo::Key::Home),
        "end" => Ok(enigo::Key::End),
        "pageup" => Ok(enigo::Key::PageUp),
        "pagedown" => Ok(enigo::Key::PageDown),
        "f1" => Ok(enigo::Key::F1),
        "f2" => Ok(enigo::Key::F2),
        "f3" => Ok(enigo::Key::F3),
        "f4" => Ok(enigo::Key::F4),
        "f5" => Ok(enigo::Key::F5),
        "f6" => Ok(enigo::Key::F6),
        "f7" => Ok(enigo::Key::F7),
        "f8" => Ok(enigo::Key::F8),
        "f9" => Ok(enigo::Key::F9),
        "f10" => Ok(enigo::Key::F10),
        "f11" => Ok(enigo::Key::F11),
        "f12" => Ok(enigo::Key::F12),
        s if s.len() == 1 => Ok(enigo::Key::Unicode(s.chars().next().unwrap())),
        _ => Err(napi::Error::from_reason(format!("Unknown key: {s}"))),
    }
}
