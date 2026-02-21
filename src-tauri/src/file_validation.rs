use std::path::Path;

const ALLOWED_EXTENSIONS: &[&str] = &[".js", ".mongodb", ".json"];

const BLOCKED_PATTERNS: &[&str] = &[
    "/etc/",
    "/var/log/",
    "/var/run/",
    "/var/lib/",
    "/usr/",
    "/bin/",
    "/sbin/",
    "/System/",
    "/Library/",
    "node_modules",
    ".git",
    ".env",
];

/// Maximum file size in bytes (1 MB).
pub const MAX_FILE_SIZE: usize = 1024 * 1024;

/// Check whether a file path is safe to access.
///
/// Rules:
/// - Must be absolute
/// - No directory traversal (resolved path must equal the input)
/// - Temp directories (`/var/folders/`, `/tmp/`) are always allowed
/// - Blocked system/sensitive patterns are rejected
pub fn is_path_safe(file_path: &str) -> bool {
    let path = Path::new(file_path);

    // Must be absolute
    if !path.is_absolute() {
        return false;
    }

    // Prevent directory traversal: match the TypeScript `resolve(filePath) !== filePath`.
    // Rust's Path::components() normalizes `.` away, so check via string.
    if file_path.contains("/./") || file_path.ends_with("/.") || file_path.contains("/../") || file_path.ends_with("/..") {
        return false;
    }

    // Allow temp directories
    if file_path.starts_with("/var/folders/") || file_path.starts_with("/tmp/") {
        return true;
    }

    // Block sensitive paths
    for pattern in BLOCKED_PATTERNS {
        if file_path.contains(pattern) {
            return false;
        }
    }

    true
}

/// Check whether a file has an allowed extension.
pub fn is_allowed_extension(file_path: &str) -> bool {
    is_allowed_extension_with(file_path, ALLOWED_EXTENSIONS)
}

/// Check whether a file has one of the given allowed extensions.
fn is_allowed_extension_with(file_path: &str, allowed: &[&str]) -> bool {
    let path = Path::new(file_path);
    match path.extension() {
        Some(ext) => {
            let ext_lower = format!(".{}", ext.to_string_lossy().to_lowercase());
            allowed.contains(&ext_lower.as_str())
        }
        None => false,
    }
}

/// Return the list of allowed extensions for error messages.
pub fn allowed_extensions_display() -> String {
    ALLOWED_EXTENSIONS.join(", ")
}

#[cfg(test)]
mod tests {
    use super::*;

    // ── is_path_safe ──────────────────────────────────────────────

    #[test]
    fn rejects_relative_paths() {
        assert!(!is_path_safe("foo/bar.js"));
        assert!(!is_path_safe("./foo.js"));
        assert!(!is_path_safe("../foo.js"));
    }

    #[test]
    fn rejects_directory_traversal() {
        assert!(!is_path_safe("/home/user/../etc/passwd"));
        assert!(!is_path_safe("/home/user/./file.js"));
    }

    #[test]
    fn allows_normal_absolute_paths() {
        assert!(is_path_safe("/home/user/scripts/query.js"));
        assert!(is_path_safe("/Users/alice/code/test.mongodb"));
    }

    #[test]
    fn allows_temp_directories() {
        assert!(is_path_safe("/tmp/test.js"));
        assert!(is_path_safe("/var/folders/xx/yy/T/test.js"));
    }

    #[test]
    fn blocks_system_paths() {
        assert!(!is_path_safe("/etc/passwd"));
        assert!(!is_path_safe("/usr/bin/node"));
        assert!(!is_path_safe("/bin/sh"));
        assert!(!is_path_safe("/sbin/init"));
        assert!(!is_path_safe("/var/log/syslog"));
        assert!(!is_path_safe("/var/run/pid"));
        assert!(!is_path_safe("/var/lib/data"));
        assert!(!is_path_safe("/System/Library/test.js"));
        assert!(!is_path_safe("/Library/test.js"));
    }

    #[test]
    fn blocks_sensitive_patterns() {
        assert!(!is_path_safe("/home/user/node_modules/test.js"));
        assert!(!is_path_safe("/home/user/project/.git/config"));
        assert!(!is_path_safe("/home/user/.env"));
    }

    // ── is_allowed_extension ──────────────────────────────────────

    #[test]
    fn allows_valid_extensions() {
        assert!(is_allowed_extension("/path/to/file.js"));
        assert!(is_allowed_extension("/path/to/file.mongodb"));
        assert!(is_allowed_extension("/path/to/file.json"));
    }

    #[test]
    fn rejects_invalid_extensions() {
        assert!(!is_allowed_extension("/path/to/file.txt"));
        assert!(!is_allowed_extension("/path/to/file.py"));
        assert!(!is_allowed_extension("/path/to/file.rs"));
        assert!(!is_allowed_extension("/path/to/file"));
    }

    #[test]
    fn extension_check_is_case_insensitive() {
        assert!(is_allowed_extension("/path/to/file.JS"));
        assert!(is_allowed_extension("/path/to/file.Json"));
        assert!(is_allowed_extension("/path/to/file.MONGODB"));
    }
}
