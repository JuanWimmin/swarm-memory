// Tiny ANSI helper. picocolors reads the Node `process` global, which does not exist in Bare —
// this is the "Pear and Bare are not Node.js" trap, so we do the four escape codes ourselves.

const wrap = (open, close) => (text) => '\u001b[' + open + 'm' + text + '\u001b[' + close + 'm'

module.exports = {
  bold: wrap(1, 22),
  dim: wrap(2, 22),
  red: wrap(31, 39),
  green: wrap(32, 39),
  yellow: wrap(33, 39),
  blue: wrap(34, 39),
  magenta: wrap(35, 39),
  cyan: wrap(36, 39),
  white: wrap(37, 39)
}
