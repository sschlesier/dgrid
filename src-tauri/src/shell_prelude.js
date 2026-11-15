// Loaded by mongosh before the user's script (see shell.rs). Connects `db` and defines
// `__dgrid.result`, which appends one canonical Extended JSON line per reported value
// to the file named by DGRID_SHELL_OUT.
db = connect(process.env.DGRID_SHELL_URI).getSiblingDB(process.env.DGRID_SHELL_DB);

globalThis.__dgrid = (function () {
  const fs = require('fs');
  const outFile = process.env.DGRID_SHELL_OUT;
  const LIMIT = 1000;

  function write(index, kind, truncated, value) {
    const line = EJSON.stringify({ index, kind, truncated, value }, { relaxed: false });
    fs.appendFileSync(outFile, line + '\n');
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
      write(index, 'value', false, `[not displayable: ${typeof value}]`);
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
      write(index, 'cursor', truncated, documents);
      return;
    }

    let reported = value;
    let truncated = false;
    if (Array.isArray(value) && value.length > LIMIT) {
      reported = value.slice(0, LIMIT);
      truncated = true;
    }

    try {
      write(index, 'value', truncated, reported);
    } catch {
      write(index, 'value', false, `[not displayable: ${typeName(value)}]`);
    }
  }

  return { result };
})();
