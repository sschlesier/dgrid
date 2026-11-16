// Loaded by mongosh before the user's script (see shell.rs). Connects `db` and defines
// `__dgrid.result`, which appends one canonical Extended JSON line per reported value
// to the file named by DGRID_SHELL_OUT.
db = connect(process.env.DGRID_SHELL_URI).getSiblingDB(process.env.DGRID_SHELL_DB);

globalThis.__dgrid = (function () {
  const fs = require('fs');
  const outFile = process.env.DGRID_SHELL_OUT;
  const LIMIT = 1000;

  const LONE_SURROGATE = /[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/g;

  function wellFormed(text) {
    return typeof text.toWellFormed === 'function'
      ? text.toWellFormed()
      : text.replace(LONE_SURROGATE, '�');
  }

  // Half of a surrogate pair (such as '😀'.slice(0, 1)) is written as an escape the
  // backend's JSON parser rejects, so it becomes U+FFFD in values and keys. The replacer
  // sees the Extended JSON form, so the type markers it writes are plain objects here.
  function repairStrings(key, value) {
    if (typeof value === 'string') return wellFormed(value);
    if (value === null || typeof value !== 'object' || Array.isArray(value)) return value;
    const keys = Object.keys(value);
    if (keys.every((k) => wellFormed(k) === k)) return value;
    const repaired = {};
    for (const k of keys) repaired[wellFormed(k)] = value[k];
    return repaired;
  }

  function line(index, kind, truncated, value) {
    return EJSON.stringify({ index, kind, truncated, value }, repairStrings, undefined, {
      relaxed: false,
    });
  }

  // Only a value that cannot be serialized becomes a placeholder. A failure to write the
  // result file is left to throw, so it ends the script as an error.
  function report(index, kind, truncated, value, name) {
    let text;
    try {
      text = line(index, kind, truncated, value);
    } catch {
      text = line(index, 'value', false, `[not displayable: ${name}]`);
    }
    fs.appendFileSync(outFile, text + '\n');
  }

  function typeName(value) {
    const name = value && value.constructor && value.constructor.name;
    return typeof name === 'string' && name ? name : 'object';
  }

  function isCursor(value) {
    return (
      value !== null &&
      typeof value === 'object' &&
      typeof value.hasNext === 'function' &&
      typeof value.next === 'function'
    );
  }

  // Plain loops only: mongosh cannot await shell calls made inside callbacks that are
  // passed to built-ins such as Array.prototype.map.
  function result(index, value) {
    if (value === undefined) return;

    if (typeof value === 'function' || typeof value === 'symbol') {
      report(index, 'value', false, `[not displayable: ${typeof value}]`, typeof value);
      return;
    }

    if (isCursor(value)) {
      const documents = [];
      let truncated = false;
      while (value.hasNext()) {
        if (documents.length === LIMIT) {
          truncated = true;
          break;
        }
        documents.push(value.next());
      }
      report(index, 'cursor', truncated, documents, typeName(value));
      return;
    }

    let reported = value;
    let truncated = false;
    if (Array.isArray(value) && value.length > LIMIT) {
      reported = value.slice(0, LIMIT);
      truncated = true;
    }

    report(index, 'value', truncated, reported, typeName(value));
  }

  return { result };
})();
