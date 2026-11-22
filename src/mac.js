'use strict';
// usual on a Mac: running at login (so reminders can pop up) and a little
// "usual" app for Spotlight and Launchpad. Nothing needs an administrator.

const path = require('path');
const { home } = require('./store');
const Mac = require('./macos')({ app: 'usual', label: 'dev.dpatel7.usual', home });

const SCRIPT = path.join(__dirname, '..', 'bin', 'usual.js');

function setUp(version) {
  const icon = path.join(__dirname, '..', 'assets', 'usual.icns');
  Mac.makeApp({ name: 'usual', id: 'dev.dpatel7.usual.app', args: ['app'], icon, script: SCRIPT, version });
  return Mac.startAgent({ args: ['serve'], script: SCRIPT });
}

function tearDown() {
  Mac.stopAgent();
  Mac.removeApp('usual');
}

module.exports = { ...Mac, setUp, tearDown, SCRIPT };
