'use strict';
// Rocco, usual's raccoon. Raccoons know exactly where the good food is, and
// go back to it. Every letter is one pixel; '.' is see-through.

const BIG = [
  '..........................',
  '...................g....g.',
  '..................gGg..gGg',
  '..................GGGGGGGG',
  '.................WGGGGGGGW',
  '.................WKKKgKKKW',
  '.................KKeKgKeKK',
  '.................WWWWgWWWN',
  '..TT..............WWWWWWW.',
  '.TttT...........GGGGGGG...',
  '.TTTT.........GGGGGGGGGG..',
  '..tttt......GGGGGGGGGGGG..',
  '...TTTT...GGGGGgggGGGGGG..',
  '....tttGGGGGGgggggGGGG....',
  '......TGGGGGGgggggGGGG....',
  '........GGGGGGGGGGGGG.....',
  '.........KK..KK...KK......',
];

// the small picture is Rocco's face: it reads better that small
const MINI = [
  '..g......g..',
  '.gGg....gGg.',
  '.GGGGGGGGGG.',
  'WGGGGggGGGGW',
  'WKKKKggKKKKW',
  'KKeKKggKKeKK',
  '.KKWWWWWWKK.',
  '..WWWNNWWW..',
  '....WWWW....',
];

const INK = { G: '#8a8f99', g: '#c3c7ce', W: '#f4f4f2', K: '#25282e', e: '#ffffff', N: '#25282e', T: '#3d4149', t: '#c3c7ce' };
const INK_NIGHT = { ...INK, K: '#3d4149', N: '#4a4f58', T: '#5a5f69' };

module.exports = { BIG, MINI, INK, INK_NIGHT, NAME: 'Rocco' };
