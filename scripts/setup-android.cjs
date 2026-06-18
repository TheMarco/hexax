#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const MANIFEST = path.join(__dirname, '..', 'android', 'app', 'src', 'main', 'AndroidManifest.xml');
const STYLES = path.join(__dirname, '..', 'android', 'app', 'src', 'main', 'res', 'values', 'styles.xml');

function patchManifest() {
  if (!fs.existsSync(MANIFEST)) {
    console.error('AndroidManifest.xml not found. Run "npx cap add android" first.');
    process.exit(1);
  }
  let m = fs.readFileSync(MANIFEST, 'utf8');
  if (!m.includes('android:screenOrientation')) {
    m = m.replace(
      /(<activity[\s\S]*?)(>)/m,
      (match, before, close) =>
        before +
        '\n            android:screenOrientation="landscape"' +
        '\n            android:keepScreenOn="true"' +
        close
    );
    console.log('  + Added landscape + keepScreenOn to AndroidManifest.xml');
  } else {
    console.log('  = AndroidManifest.xml already patched');
  }
  fs.writeFileSync(MANIFEST, m, 'utf8');
}

function patchStyles() {
  if (!fs.existsSync(STYLES)) {
    console.error('styles.xml not found. Run "npx cap add android" first.');
    process.exit(1);
  }
  let s = fs.readFileSync(STYLES, 'utf8');
  if (!s.includes('android:windowFullscreen')) {
    s = s.replace(
      /(<style\s+name="AppTheme\.NoActionBar"[^>]*>)/,
      (match) =>
        match +
        '\n        <item name="android:windowFullscreen">true</item>' +
        '\n        <item name="android:windowLayoutInDisplayCutoutMode">shortEdges</item>'
    );
    console.log('  + Added fullscreen theme to styles.xml');
  } else {
    console.log('  = styles.xml already patched');
  }
  fs.writeFileSync(STYLES, s, 'utf8');
}

console.log('Configuring Android project for handheld gaming...');
patchManifest();
patchStyles();
console.log('Done.');
