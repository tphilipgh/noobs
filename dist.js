const fs = require('fs');
const path = require('path');

const packageName = 'noobs.node';
const distRoot = path.resolve(__dirname, 'dist');
const distBin = path.join(distRoot, 'bin');

// Clean the dist directory if it exists.
if (fs.existsSync(distRoot)) {
  fs.rmSync(distRoot, { recursive: true, force: true });
}

// Remake the dist directory structure.
fs.mkdirSync(distRoot);
fs.mkdirSync(distBin);

// Copy the compiled .node file.
const addonSrc = path.resolve(__dirname, 'build', 'Release', packageName);
const addonDest = path.join(distRoot, packageName);
fs.copyFileSync(addonSrc, addonDest);

if (process.platform === 'darwin') {
  // On macOS everything we need has already been staged and had its install
  // names fixed up by scripts/stage-macos.js, so the layout just gets copied
  // across wholesale.
  const stageDir = path.resolve(__dirname, 'bin', 'macos');

  if (!fs.existsSync(stageDir)) {
    console.error('bin/macos not found. Run: node scripts/stage-macos.js');
    process.exit(1);
  }

  for (const entry of ['Frameworks', 'obs-plugins', 'data']) {
    fs.cpSync(path.join(stageDir, entry), path.join(distRoot, entry), {
      recursive: true,
      dereference: false,
      verbatimSymlinks: true,
    });
  }

  // bin already exists, so merge into it rather than replacing it.
  fs.cpSync(path.join(stageDir, 'bin'), distBin, { recursive: true });

  console.log('Packaged macOS noobs into dist');
  return;
}

// Now copy the .dll files we need.
const binSrc = path.resolve(__dirname, 'bin', '64bit');
const binDst = path.resolve(__dirname, 'dist', 'bin');

fs.readdirSync(binSrc)
  .filter((file) => file.endsWith('.dll'))
  .forEach((file) => {
    const src = path.join(binSrc, file);
    const dst = path.join(binDst, file);
    fs.copyFileSync(src, dst);
  });

  // Copy executable files required.
const exeFiles = [
  'obs-ffmpeg-mux.exe', // Required for any sort of recording.
  'obs-amf-test.exe',   // For getting AMF encoding capabilities.
  'obs-nvenc-test.exe', // For getting NVENC encoding capabilities.
  'obs-qsv-test.exe',    // For getting QSV encoding capabilities.
  'ffmpeg.exe', // Dynamically linked ffmpeg exe.
  'ffprobe.exe' // Dynamically linked ffprobe exe.
];

exeFiles.forEach((file) => {
  const srcPath = path.resolve(__dirname, 'bin', '64bit', file);
  const destPath = path.resolve(__dirname, 'dist', 'bin', file);
  fs.copyFileSync(srcPath, destPath);
});

// Copy plugins themselves.
const pluginSrc = path.resolve(__dirname, 'bin', 'obs-plugins');
const pluginDst = path.resolve(__dirname, 'dist', 'obs-plugins');

fs.cpSync(pluginSrc, pluginDst, { 
  recursive: true ,  
  filter: (src) => !src.endsWith('.pdb') // Exclude PDB files, they are debug files and they are huge.
});

// Copy data, including effects and plugin data.
const dataSrc = path.resolve(__dirname, 'bin', 'data');
const dataDst = path.resolve(__dirname, 'dist', 'data');

fs.cpSync(dataSrc, dataDst, { 
  recursive: true,  
  filter: (src) => !src.endsWith('.pdb') // Exclude PDB files, they are debug files and they are huge.
});


