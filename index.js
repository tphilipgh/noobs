const path = require('path');

// Path to the OBS binaries. We want this to come first so that the correct
// libraries are loaded. It's possible other copies are on the system PATH
// already.
let binPath = path
  .resolve(__dirname, 'dist', 'bin')
  .replace('app.asar', 'app.asar.unpacked');

if (process.env.PATH) {
  // Almost certainly there is an existing PATH. We don't want to drop
  // things off the path as it might make other things fail.
  binPath += path.delimiter;
  binPath += process.env.PATH;
}

// Now set the updated PATH for this process. Windows looks this up as Path,
// everything else as PATH.
if (process.platform === 'win32') {
  process.env.Path = binPath;
} else {
  process.env.PATH = binPath;
}

const packageName = 'noobs.node';
const noobs = require(`./dist/${packageName}`);
module.exports = noobs;