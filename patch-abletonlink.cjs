const fs = require('fs');
const path = require('path');

const gypPath = path.join(__dirname, 'node_modules', '@ktamas77', 'abletonlink', 'binding.gyp');

if (fs.existsSync(gypPath)) {
  console.log('[Patch] Found @ktamas77/abletonlink/binding.gyp. Applying Linux C++17 patch...');
  
  // High-compatibility binding.gyp configured for modern Node (v18, v20, v22, v24) and Linux GCC
  const linuxGyp = `{
  "targets": [
    {
      "target_name": "abletonlink",
      "sources": [
        "src/abletonlink.cc"
      ],
      "include_dirs": [
        "<!@(node -p \\"require('node-addon-api').include\\")",
        "link/include",
        "link/modules/asio-standalone/asio/include"
      ],
      "cflags!": [ "-fno-exceptions" ],
      "cflags_cc!": [ "-fno-exceptions", "-std=c++11", "-std=gnu++11", "-std=c++14" ],
      "cflags_cc": [
        "-std=c++17",
        "-fexceptions",
        "-Wno-multichar",
        "-Wno-redundant-move"
      ],
      "defines": [
        "NAPI_DISABLE_CPP_EXCEPTIONS",
        "ASIO_STANDALONE=1"
      ],
      "conditions": [
        ["OS=='linux'", {
          "cflags_cc": [
            "-std=c++17",
            "-fexceptions",
            "-Wno-multichar",
            "-Wno-redundant-move"
          ],
          "defines": [
            "LINK_PLATFORM_LINUX=1",
            "ASIO_STANDALONE=1"
          ]
        }],
        ["OS=='mac'", {
          "xcode_settings": {
            "CLANG_CXX_LANGUAGE_STANDARD": "c++17",
            "CLANG_CXX_LIBRARY": "libc++",
            "MACOSX_DEPLOYMENT_TARGET": "10.14",
            "GCC_ENABLE_CPP_EXCEPTIONS": "YES"
          },
          "defines": [
            "LINK_PLATFORM_MACOSX=1",
            "ASIO_STANDALONE=1"
          ]
        }],
        ["OS=='win'", {
          "defines": [
            "LINK_PLATFORM_WINDOWS=1",
            "ASIO_STANDALONE=1",
            "_WIN32_WINNT=0x0601"
          ],
          "msvs_settings": {
            "VCCLCompilerTool": {
              "AdditionalOptions": [ "/std:c++17" ]
            }
          }
        }]
      ]
    }
  ]
}
`;

  fs.writeFileSync(gypPath, linuxGyp, 'utf8');
  console.log('[Patch] ✓ Successfully replaced binding.gyp with C++17 Linux/GCC configuration!');
} else {
  console.log('[Patch] @ktamas77/abletonlink not installed yet or not found.');
}
