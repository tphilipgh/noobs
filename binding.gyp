{
    "targets": [{
        "target_name": "noobs",
        "cflags!": [ "-fno-exceptions" ],
        "cflags_cc!": [ "-fno-exceptions" ],
        "sources": [
            "src/main.cpp",
            "src/obs_interface.cpp",
            "src/utils.cpp",
        ],
        'include_dirs': [
            "<!@(node -p \"require('node-addon-api').include\")",
            "include"
        ],
        'dependencies': [
            "<!(node -p \"require('node-addon-api').gyp\")"
        ],
        'defines': [ 'NAPI_DISABLE_CPP_EXCEPTIONS' ],
        'conditions': [
            ['OS=="win"', {
                'sources': [ "src/platform_win.cpp" ],
                'libraries': [ "../bin/64bit/obs.lib" ],
            }],
            ['OS=="mac"', {
                'sources': [ "src/platform_mac.mm" ],
                # libobs headers declare gs_window with an Objective-C type on
                # macOS, so every translation unit that sees obs.h has to be
                # compiled as Objective-C++.
                'xcode_settings': {
                    'GCC_ENABLE_CPP_EXCEPTIONS': 'YES',
                    'CLANG_CXX_LIBRARY': 'libc++',
                    'CLANG_CXX_LANGUAGE_STANDARD': 'c++17',
                    'MACOSX_DEPLOYMENT_TARGET': '13.0',
                    'OTHER_CPLUSPLUSFLAGS': [
                        '-x', 'objective-c++',
                        '-fexceptions',
                        '-Wno-unused-parameter',
                    ],
                    # dist/noobs.node resolves libobs.framework and the
                    # dependency dylibs next to it.
                    'OTHER_LDFLAGS': [
                        '-Wl,-rpath,@loader_path/Frameworks',
                        '-Wl,-rpath,@loader_path/../Frameworks',
                    ],
                },
                'libraries': [
                    '-F<(module_root_dir)/bin/macos/Frameworks',
                    '-framework libobs',
                    '-framework Cocoa',
                ],
            }],
        ],
    }]
}
