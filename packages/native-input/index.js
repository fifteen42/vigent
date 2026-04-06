const { existsSync } = require('fs');
const { join } = require('path');

const { platform, arch } = process;

let nativeBinding = null;

const localPath = join(__dirname, `vigent-native-input.${platform}-${arch === 'arm64' ? 'arm64' : 'x64'}.node`);

// Try platform-specific binary first
if (platform === 'darwin') {
  if (arch === 'arm64') {
    const p = join(__dirname, 'vigent-native-input.darwin-arm64.node');
    if (existsSync(p)) nativeBinding = require(p);
  } else {
    const p = join(__dirname, 'vigent-native-input.darwin-x64.node');
    if (existsSync(p)) nativeBinding = require(p);
  }
}

// Fallback: try any .node file
if (!nativeBinding) {
  const fs = require('fs');
  const files = fs.readdirSync(__dirname).filter(f => f.endsWith('.node'));
  if (files.length > 0) {
    nativeBinding = require(join(__dirname, files[0]));
  }
}

if (!nativeBinding) {
  throw new Error('Failed to load native binding for @vigent/native-input');
}

module.exports = nativeBinding;
