use serde::{Deserialize, Serialize};

const RELEASES_URL: &str = "https://api.github.com/repos/sschlesier/dgrid/releases/latest";

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UpdateInfo {
    pub version: String,
    pub url: String,
}

#[derive(Deserialize)]
struct GitHubRelease {
    tag_name: String,
    html_url: String,
}

/// Compare two semver strings. Returns true if `latest` is newer than `current`.
fn is_newer(current: &str, latest: &str) -> bool {
    let parse = |v: &str| -> [u32; 3] {
        let stripped = v.strip_prefix('v').unwrap_or(v);
        let mut parts = [0u32; 3];
        for (i, segment) in stripped.split('.').take(3).enumerate() {
            parts[i] = segment.parse().unwrap_or(0);
        }
        parts
    };

    let cur = parse(current);
    let lat = parse(latest);

    for i in 0..3 {
        if lat[i] > cur[i] {
            return true;
        }
        if lat[i] < cur[i] {
            return false;
        }
    }
    false
}

/// Detect how the app was installed. Returns "homebrew" or "direct".
pub fn detect_install_method() -> &'static str {
    if cfg!(target_os = "macos") {
        if let Ok(exe) = std::env::current_exe() {
            // Resolve symlinks — Homebrew Cask symlinks from /Applications/ into /opt/homebrew/Caskroom/
            let path = exe.canonicalize().unwrap_or(exe);
            let path_str = path.to_string_lossy();
            if path_str.contains("/Caskroom/")
                || path_str.starts_with("/opt/homebrew/")
                || path_str.starts_with("/usr/local/Cellar/")
            {
                return "homebrew";
            }
        }
    }
    "direct"
}

/// Check GitHub for a newer release. Returns `None` on any error or if up-to-date.
pub async fn check_for_update(current_version: &str) -> Option<UpdateInfo> {
    let client = reqwest::Client::new();
    let response = client
        .get(RELEASES_URL)
        .header("User-Agent", "DGrid-UpdateChecker")
        .send()
        .await
        .ok()?;

    if !response.status().is_success() {
        return None;
    }

    let release: GitHubRelease = response.json().await.ok()?;
    let latest_version = release.tag_name.strip_prefix('v').unwrap_or(&release.tag_name);

    if is_newer(current_version, latest_version) {
        Some(UpdateInfo {
            version: latest_version.to_string(),
            url: release.html_url,
        })
    } else {
        None
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn newer_patch() {
        assert!(is_newer("1.0.0", "1.0.1"));
    }

    #[test]
    fn newer_minor() {
        assert!(is_newer("1.0.0", "1.1.0"));
    }

    #[test]
    fn newer_major() {
        assert!(is_newer("1.0.0", "2.0.0"));
    }

    #[test]
    fn same_version() {
        assert!(!is_newer("1.0.0", "1.0.0"));
    }

    #[test]
    fn older_version() {
        assert!(!is_newer("2.0.0", "1.0.0"));
    }

    #[test]
    fn strips_v_prefix() {
        assert!(is_newer("v1.0.0", "v1.0.1"));
    }

    #[test]
    fn mixed_prefix() {
        assert!(is_newer("v1.0.0", "1.0.1"));
        assert!(is_newer("1.0.0", "v1.0.1"));
    }

    #[test]
    fn partial_versions() {
        assert!(is_newer("1", "2"));
        assert!(is_newer("1.0", "1.1"));
    }

    #[test]
    fn older_patch_newer_minor() {
        // 1.2.0 vs 1.1.9 — 1.2.0 is newer
        assert!(!is_newer("1.2.0", "1.1.9"));
    }

    #[test]
    fn real_world_versions() {
        assert!(is_newer("0.6.0", "0.7.0"));
        assert!(is_newer("0.6.0", "1.0.0"));
        assert!(!is_newer("0.6.0", "0.5.0"));
        assert!(!is_newer("0.6.0", "0.6.0"));
    }
}
