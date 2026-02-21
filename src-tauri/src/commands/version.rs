#[tauri::command]
pub fn get_version() -> String {
    env!("CARGO_PKG_VERSION").to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn returns_package_version() {
        let version = get_version();
        assert_eq!(version, env!("CARGO_PKG_VERSION"));
    }
}
