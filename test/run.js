/**
 * Test runner: executes every *.test.js in this directory in its own process (each suite
 * exits non-zero on failure) and prints a combined tally. `npm test`.
 *
 * The suites are sector-agnostic, so the same suite runs against any macro folder. Pass the
 * folder as the first argument (default "Macro - DARB Identification"); it reaches the suites
 * as MACRO_DIR, which harness.js loads Code.gs from:
 *   node test/run.js "Macro - CRB Identification"
 */
'use strict';
var fs = require('fs');
var path = require('path');
var spawnSync = require('child_process').spawnSync;

var macroDir = process.argv[2] || process.env.MACRO_DIR || 'Macro - DARB Identification';
if (!fs.existsSync(path.join(__dirname, '..', macroDir, 'Code.gs'))) {
  console.error('No Code.gs in "' + macroDir + '"');
  process.exit(1);
}
var childEnv = Object.assign({}, process.env, { MACRO_DIR: macroDir });
console.log('Macro under test: ' + macroDir);

var files = fs.readdirSync(__dirname).filter(function (f) { return /\.test\.js$/.test(f); }).sort();
if (!files.length) { console.error('No test files found in ' + __dirname); process.exit(1); }

var passed = 0, failed = 0, suitesFailed = 0;
files.forEach(function (f) {
  console.log('\n=== ' + f + ' ' + new Array(Math.max(2, 60 - f.length)).join('='));
  var res = spawnSync(process.execPath, [path.join(__dirname, f)], { encoding: 'utf8', env: childEnv });
  process.stdout.write(res.stdout || '');
  if (res.stderr) process.stderr.write(res.stderr);
  var m = /(\d+) passed, (\d+) failed/.exec(res.stdout || '');
  if (m) { passed += Number(m[1]); failed += Number(m[2]); }
  if (res.status !== 0) suitesFailed++;
});

console.log('\n' + new Array(62).join('='));
console.log('TOTAL (' + macroDir + '): ' + passed + ' passed, ' + failed + ' failed, ' +
  files.length + ' suite(s), ' + suitesFailed + ' suite(s) failing');
process.exit(suitesFailed ? 1 : 0);
