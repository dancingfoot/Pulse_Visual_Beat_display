const fs = require('fs');
const path = require('path');

const gypPath = path.join(__dirname, 'node_modules', '@ktamas77', 'abletonlink', 'binding.gyp');

if (fs.existsSync(gypPath)) {
  console.log('[Patch] Found @ktamas77/abletonlink/binding.gyp. Patching for Linux compatibility...');
  let content = fs.readFileSync(gypPath, 'utf8');
  
  const originalDefines = /"defines":\s*\[\s*"NAPI_DISABLE_CPP_EXCEPTIONS",\s*"LINK_PLATFORM_MACOSX=1",\s*"ASIO_STANDALONE=1"\s*\]/;
  const targetDefines = `"defines": [\n        "NAPI_DISABLE_CPP_EXCEPTIONS",\n        "ASIO_STANDALONE=1"\n      ]`;
  
  if (originalDefines.test(content)) {
    content = content.replace(originalDefines, targetDefines);
    fs.writeFileSync(gypPath, content, 'utf8');
    console.log('[Patch] ✓ Successfully patched @ktamas77/abletonlink for Linux!');
  } else {
    const firstOccur = content.indexOf('"LINK_PLATFORM_MACOSX=1"');
    const conditionsOccur = content.indexOf('"conditions"');
    if (firstOccur !== -1 && (conditionsOccur === -1 || firstOccur < conditionsOccur)) {
      content = content.replace(/"LINK_PLATFORM_MACOSX=1"\s*,\s*/, '');
      fs.writeFileSync(gypPath, content, 'utf8');
      console.log('[Patch] ✓ Patched via fallback replace!');
    } else {
      console.log('[Patch] @ktamas77/abletonlink/binding.gyp already patched or format clean.');
    }
  }
} else {
  console.log('[Patch] No patch needed or @ktamas77/abletonlink not installed.');
}
