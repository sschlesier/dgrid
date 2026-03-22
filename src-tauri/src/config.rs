use std::env;
use std::path::PathBuf;

#[derive(Debug, Clone)]
pub struct AppConfig {
    pub data_dir: PathBuf,
    pub disable_update_checks: bool,
    pub use_mock_passwords: bool,
}

impl AppConfig {
    pub fn from_env() -> Self {
        let data_dir = env::var_os("DGRID_DATA_DIR")
            .map(PathBuf::from)
            .or_else(default_data_dir)
            .expect("could not determine DGrid data directory");

        Self {
            data_dir,
            disable_update_checks: env_flag("DGRID_DISABLE_UPDATE_CHECKS"),
            use_mock_passwords: env_flag("DGRID_USE_MOCK_PASSWORDS"),
        }
    }
}

fn default_data_dir() -> Option<PathBuf> {
    dirs::home_dir().map(|home| home.join(".dgrid"))
}

fn env_flag(key: &str) -> bool {
    matches!(
        env::var(key).ok().as_deref(),
        Some("1") | Some("true") | Some("TRUE") | Some("yes") | Some("YES")
    )
}
