#!/usr/bin/env node
'use strict';
process.stdout.on('error', (e) => { if (e.code === 'EPIPE') process.exit(0); });

// Keep this first check in plain old JavaScript so even an ancient Node can run it.
var major = parseInt(process.versions.node.split('.')[0], 10);
if (major < 18) {
  console.error('usual needs Node.js 18 or newer (this is ' + process.versions.node + ').');
  console.error('Re-run the installer, or get Node from https://nodejs.org');
  process.exit(1);
}

require('../src/cli').main(process.argv.slice(2)).catch(function (e) {
  console.error('\n  ' + ((e && e.message) || e) + '\n');
  process.exit(1);
});
