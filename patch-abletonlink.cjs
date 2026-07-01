const fs = require('fs');
const path = require('path');

const gypPath = path.join(__dirname, 'node_modules', '@ktamas77', 'abletonlink', 'binding.gyp');

if (fs.existsSync(gypPath)) {
  console.log('Found @ktamas77/abletonlink/binding.gyp. Patching...');
  let content = fs.readFileSync(gypPath, 'utf8');
  
  // We want to remove "LINK_PLATFORM_MACOSX=1" from the global defines block,
  // but keep it in the OS=='mac' condition.
  // The global defines block looks like:
  //      "defines": [ 
  //        "NAPI_DISABLE_CPP_EXCEPTIONS",
  //        "LINK_PLATFORM_MACOSX=1",
  //        "ASIO_STANDALONE=1"
  //      ],
  
  const originalDefines = /"defines":\s*\[\s*"NAPI_DISABLE_CPP_EXCEPTIONS",\s*"LINK_PLATFORM_MACOSX=1",\s*"ASIO_STANDALONE=1"\s*\]/;
  const targetDefines = `"defines": [\n        "NAPI_DISABLE_CPP_EXCEPTIONS",\n        "ASIO_STANDALONE=1"\n      ]`;
  
  if (originalDefines.test(content)) {
    content = content.replace(originalDefines, targetDefines);
    fs.writeFileSync(gypPath, content, 'utf8');
    console.log('Successfully patched @ktamas77/abletonlink/binding.gyp!');
  } else {
    const firstOccur = content.indexOf('"LINK_PLATFORM_MACOSX=1"');
    const conditionsOccur = content.indexOf('"conditions"');
    if (firstOccur !== -1 && (conditionsOccur === -1 || firstOccur < conditionsOccur)) {
      content = content.replace(/"LINK_PLATFORM_MACOSX=1"\s*,\s*/, '');
      fs.writeFileSync(gypPath, content, 'utf8');
      console.log('Patched via fallback replace!');
    } else {
      console.log('@ktamas77/abletonlink/binding.gyp already patched or format unrecognized.');
    }
  }
} else {
  console.log('@ktamas77/abletonlink/binding.gyp not found.');
}
