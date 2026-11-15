// Loaded by mongosh before the user's script (see shell.rs). Connects `db` and defines
// `__dgrid.result`, which appends one canonical Extended JSON line per reported value
// to the file named by DGRID_SHELL_OUT.
db = connect(process.env.DGRID_SHELL_URI).getSiblingDB(process.env.DGRID_SHELL_DB);

globalThis.__dgrid = (function () {
  const fs = require('fs');
  const outFile = process.env.DGRID_SHELL_OUT;
  const LIMIT = 1000;

  function line(index, kind, truncated, value) {
    return EJSON.stringify({ index, kind, truncated, value }, { relaxed: false });
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
