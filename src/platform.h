#pragma once

#include <obs.h>
#include <string>
#include <vector>

/**
 * Platform abstraction for the parts of noobs that cannot be shared between
 * Windows and macOS: the native surface the OBS preview renders into, the
 * libobs graphics module, and the names of capture sources and plugin
 * modules.
 *
 * Everything else in noobs is plain libobs and stays platform agnostic.
 */

/**
 * Opaque handle to the child surface we render the preview into.
 * Windows: HWND. macOS: NSView*.
 */
using PreviewSurface = void*;

/**
 * Windows needs a window class registered before the preview child window can
 * be created. No-op on macOS.
 */
void register_preview_window_class();

/**
 * Create a preview child surface inside the given native parent handle, which
 * is what Electron's BrowserWindow.getNativeWindowHandle() returns. Returns
 * nullptr on failure.
 */
PreviewSurface create_preview_surface(void* parent);

/**
 * Move and resize the surface within its parent. Coordinates are top left
 * origin on both platforms; macOS flips them internally.
 */
void position_preview_surface(PreviewSurface surface, int x, int y, int width, int height);

void show_preview_surface(PreviewSurface surface);
void hide_preview_surface(PreviewSurface surface);
void destroy_preview_surface(PreviewSurface surface);

/**
 * Point gs_init_data at the surface. The member of gs_window differs by
 * platform, and on macOS it is an Objective-C type.
 */
void set_preview_window(gs_init_data* data, PreviewSurface surface);

/**
 * Name of the libobs graphics module to pass to obs_reset_video.
 */
const char* graphics_module_name();

/**
 * Absolute path to a loadable libobs plugin, and to the data directory that
 * goes with it. On Windows these are a DLL and a sibling data directory; on
 * macOS a plugin is a bundle that carries its own data in Contents/Resources.
 */
std::string plugin_binary_path(const std::string& pluginDir, const std::string& name);
std::string plugin_data_path(const std::string& pluginDir, const std::string& dataDir, const std::string& name);

/**
 * The libobs plugins we load, in load order. Differs by platform since the
 * capture and encoder backends are entirely different.
 */
const std::vector<std::string>& plugin_modules();

/**
 * Whether a module is allowed to fail to load, e.g. encoders that depend on
 * hardware that may not be present.
 */
bool plugin_may_fail(const std::string& name);

/**
 * Source type ids for audio capture. These are WASAPI on Windows and a mix of
 * CoreAudio and ScreenCaptureKit on macOS.
 */
const char* audio_input_source_id();
const char* audio_output_source_id();
const char* audio_process_source_id();
