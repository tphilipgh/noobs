/**
 * Stage a macOS libobs build into bin/macos, ready for dist.js to package.
 *
 * The Windows build of noobs consumes a prebuilt libobs dropped into
 * bin/64bit. There is no equivalent prebuilt for macOS, so we build the
 * warcraft-recorder-obs-studio fork ourselves and stage the pieces here.
 *
 * The OBS macOS build is normally driven by the Xcode generator, which fixes
 * up install names as part of its bundle handling. We build with Ninja to
 * avoid requiring a full Xcode install, which means every Mach-O we stage
 * still refers to its dependencies by build directory relative paths. This
 * script rewrites those to @rpath and installs the rpaths that make the
 * staged tree relocatable.
 *
 * Usage:
 *   node scripts/stage-macos.js [path-to-obs-build-dir]
 *
 * Defaults to ../obs/build_mac relative to the repo root.
 */

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const repoRoot = path.resolve(__dirname, '..');

const buildDir = path.resolve(
  process.argv[2] || process.env.OBS_BUILD_DIR || path.join(repoRoot, '..', 'obs', 'build_mac'),
);

const stageDir = path.join(repoRoot, 'bin', 'macos');
const frameworksDir = path.join(stageDir, 'Frameworks');
const pluginsDir = path.join(stageDir, 'obs-plugins');
const effectsDir = path.join(stageDir, 'data', 'effects');
const binDir = path.join(stageDir, 'bin');

// The plugins we actually load. Anything OBS builds that we do not list here
// is dead weight in the app bundle.
const PLUGINS = [
  'mac-capture', // Display, window and SCK capture, plus CoreAudio input.
  'mac-videotoolbox', // Hardware H.264/HEVC encoding.
  'mac-avcapture', // Webcam capture.
  'coreaudio-encoder', // AAC audio encoding.
  'obs-ffmpeg', // Muxing, and the replay buffer output.
  'obs-x264', // Software encoding fallback.
  'obs-filters', // Audio filters, e.g. noise suppression.
  'image-source', // Used for the chat overlay.
  'obs-transitions', // libobs expects at least a cut transition to exist.
];

const LIBOBS_OLD_ID = 'libobs/libobs.framework/Versions/A/libobs';
const LIBOBS_NEW_ID = '@rpath/libobs.framework/Versions/A/libobs';

const run = (cmd, args) => execFileSync(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'] }).toString();

/**
 * install_name_tool fails if an rpath is already present, which makes reruns
 * of this script noisy. Tolerate that specific case.
 */
const addRpath = (file, rpath) => {
  try {
    run('install_name_tool', ['-add_rpath', rpath, file]);
  } catch (e) {
    if (!String(e.stderr).includes('would duplicate path')) throw e;
  }
};

const setId = (file, id) => run('install_name_tool', ['-id', id, file]);

const changeDep = (file, from, to) => run('install_name_tool', ['-change', from, to, file]);

/**
 * Strip the ad-hoc signature invalidated by install_name_tool. Without this
 * the dynamic loader refuses to load the binary on Apple silicon.
 */
const resign = (file) => run('codesign', ['--force', '--sign', '-', '--timestamp=none', file]);

const rmrf = (p) => fs.rmSync(p, { recursive: true, force: true });

// verbatimSymlinks keeps the framework's relative Versions/Current symlinks
// intact. Without it Node rewrites them to absolute paths into the build tree,
// and anything linking against the staged framework picks up the build path.
const copyDir = (src, dst) =>
  fs.cpSync(src, dst, { recursive: true, dereference: false, verbatimSymlinks: true });

// --------------------------------------------------------------------------

if (!fs.existsSync(buildDir)) {
  console.error(`OBS build directory not found: ${buildDir}`);
  console.error('Build it first, or pass the path as an argument.');
  process.exit(1);
}

console.log(`Staging from ${buildDir}`);
rmrf(stageDir);
fs.mkdirSync(frameworksDir, { recursive: true });
fs.mkdirSync(pluginsDir, { recursive: true });
fs.mkdirSync(effectsDir, { recursive: true });
fs.mkdirSync(binDir, { recursive: true });

// -- libobs.framework ------------------------------------------------------

const libobsSrc = path.join(buildDir, 'libobs', 'libobs.framework');
copyDir(libobsSrc, path.join(frameworksDir, 'libobs.framework'));

const libobs = path.join(frameworksDir, 'libobs.framework', 'Versions', 'A', 'libobs');
setId(libobs, LIBOBS_NEW_ID);
addRpath(libobs, '@loader_path/../../..');
resign(libobs);
console.log('Staged libobs.framework');

// -- Graphics module -------------------------------------------------------

const openglSrc = path.join(buildDir, 'libobs-opengl', 'libobs-opengl.dylib');
const opengl = path.join(frameworksDir, 'libobs-opengl.dylib');
fs.copyFileSync(openglSrc, opengl);
setId(opengl, '@rpath/libobs-opengl.dylib');
changeDep(opengl, LIBOBS_OLD_ID, LIBOBS_NEW_ID);
addRpath(opengl, '@loader_path');
resign(opengl);
console.log('Staged libobs-opengl.dylib');

// -- Third party dylibs (ffmpeg, srt, rist, ...) ---------------------------

const depsLib = path.join(path.dirname(buildDir), '.deps', 'obs-deps-2025-07-11-universal', 'lib');

if (fs.existsSync(depsLib)) {
  let count = 0;

  for (const entry of fs.readdirSync(depsLib, { withFileTypes: true })) {
    if (!entry.name.endsWith('.dylib')) continue;
    const src = path.join(depsLib, entry.name);
    const dst = path.join(frameworksDir, entry.name);

    if (entry.isSymbolicLink()) {
      fs.symlinkSync(fs.readlinkSync(src), dst);
    } else {
      fs.copyFileSync(src, dst);
      count++;
    }
  }

  console.log(`Staged ${count} dependency dylibs`);
} else {
  console.warn(`Dependency libs not found at ${depsLib}, skipping`);
}

// -- Effects ---------------------------------------------------------------

const effectsSrc = path.join(frameworksDir, 'libobs.framework', 'Versions', 'A', 'Resources');

for (const file of fs.readdirSync(effectsSrc)) {
  if (!file.endsWith('.effect')) continue;
  fs.copyFileSync(path.join(effectsSrc, file), path.join(effectsDir, file));
}

console.log('Staged libobs effects');

// -- Plugins ---------------------------------------------------------------

for (const plugin of PLUGINS) {
  const found = [
    path.join(buildDir, 'plugins', plugin, `${plugin}.plugin`),
    path.join(buildDir, 'plugins', 'mac-avcapture', `${plugin}.plugin`),
  ].find(fs.existsSync);

  if (!found) {
    console.warn(`Plugin not built, skipping: ${plugin}`);
    continue;
  }

  const dst = path.join(pluginsDir, `${plugin}.plugin`);
  copyDir(found, dst);

  const binary = path.join(dst, 'Contents', 'MacOS', plugin);
  changeDep(binary, LIBOBS_OLD_ID, LIBOBS_NEW_ID);
  // obs-plugins/<name>.plugin/Contents/MacOS -> up four to the dist root.
  addRpath(binary, '@loader_path/../../../../Frameworks');
  resign(binary);
  console.log(`Staged plugin ${plugin}`);
}

// -- ffmpeg-mux helper -----------------------------------------------------

const muxSrc = path.join(buildDir, 'plugins', 'obs-ffmpeg', 'ffmpeg-mux', 'obs-ffmpeg-mux');

if (fs.existsSync(muxSrc)) {
  const mux = path.join(binDir, 'obs-ffmpeg-mux');
  fs.copyFileSync(muxSrc, mux);
  changeDep(mux, LIBOBS_OLD_ID, LIBOBS_NEW_ID);
  addRpath(mux, '@loader_path/../Frameworks');
  resign(mux);
  console.log('Staged obs-ffmpeg-mux');
} else {
  console.warn('obs-ffmpeg-mux not found, the replay buffer will not work');
}

console.log(`\nStaged macOS libobs into ${stageDir}`);
