#include <windows.h>

#include <vector>
#include <string>
#include <stdexcept>

#include <obs.h>

#include "platform.h"

/**
 * Windows implementation of the platform layer. This is the original noobs
 * behaviour, moved out of obs_interface.cpp and utils.cpp unchanged.
 */

LRESULT CALLBACK DisplayWndProc(_In_ HWND hwnd, _In_ UINT uMsg, _In_ WPARAM wParam, _In_ LPARAM lParam)
{
	switch (uMsg) {
	case WM_NCHITTEST:
		return HTTRANSPARENT;
	}

	return DefWindowProc(hwnd, uMsg, wParam, lParam);
}

void register_preview_window_class() {
  WNDCLASSEX klass;

  klass.cbSize = sizeof(WNDCLASSEX);
	klass.style = CS_NOCLOSE | CS_HREDRAW | CS_VREDRAW | CS_OWNDC;
	klass.lpfnWndProc = DisplayWndProc;
	klass.cbClsExtra = 0;
	klass.cbWndExtra = 0;
	klass.hInstance = GetModuleHandle(NULL);
	klass.hIcon = NULL;
	klass.hCursor = NULL;
	klass.hbrBackground = NULL;
	klass.lpszMenuName = NULL;
	klass.lpszClassName = TEXT("PreviewWindowClass");
	klass.hIconSm = NULL;

	if (RegisterClassEx(&klass) == NULL) {
		blog(LOG_ERROR, "Failed to register window class");
    throw new std::runtime_error("Failed to register window class");
	}

  blog(LOG_INFO, "Registered preview window class");
}

PreviewSurface create_preview_surface(void* parent) {
  HWND hwnd = CreateWindowEx(
    0,
    TEXT("PreviewWindowClass"),   // Window class we already registered earlier
    TEXT("OBS Preview"),          // Window name
    WS_POPUP,
    0, 0,                   // Initial position (x, y)
    0, 0,                   // Initial size (width, height)
    NULL,                   // No parent yet
    NULL,                   // No menu
    GetModuleHandle(NULL),
    NULL
  );

  if (!hwnd) {
    blog(LOG_ERROR, "Failed to create preview child window");
    return nullptr;
  }

  SetParent(hwnd, static_cast<HWND>(parent));

  LONG_PTR style = GetWindowLongPtr(hwnd, GWL_STYLE);
  style &= ~WS_POPUP;
  style |= WS_CHILD;
  SetWindowLongPtr(hwnd, GWL_STYLE, style);

  LONG_PTR exStyle = GetWindowLongPtr(hwnd, GWL_EXSTYLE);
  exStyle |= WS_EX_TRANSPARENT;
  SetWindowLongPtr(hwnd, GWL_EXSTYLE, exStyle);

  return hwnd;
}

void position_preview_surface(PreviewSurface surface, int x, int y, int width, int height) {
  bool success = SetWindowPos(
    static_cast<HWND>(surface),    // Handle to the child window
    NULL,                          // No Z-order change
    x, y,                          // New position (x, y)
    width, height,                 // New size (width, height)
    SWP_NOACTIVATE                 // Flags
  );

  if (!success) {
    blog(LOG_ERROR, "Failed to resize preview window to (%d x %d)", width, height);
  }
}

void show_preview_surface(PreviewSurface surface) {
  ShowWindow(static_cast<HWND>(surface), SW_SHOW);
}

void hide_preview_surface(PreviewSurface surface) {
  ShowWindow(static_cast<HWND>(surface), SW_HIDE);
}

void destroy_preview_surface(PreviewSurface surface) {
  if (surface) DestroyWindow(static_cast<HWND>(surface));
}

void set_preview_window(gs_init_data* data, PreviewSurface surface) {
  data->window.hwnd = surface;
}

const char* graphics_module_name() {
  return "libobs-d3d11.dll";
}

std::string plugin_binary_path(const std::string& pluginDir, const std::string& name) {
  return pluginDir + name + ".dll";
}

std::string plugin_data_path(const std::string& pluginDir, const std::string& dataDir, const std::string& name) {
  (void)pluginDir;
  return dataDir + name;
}

const std::vector<std::string>& plugin_modules() {
  static const std::vector<std::string> modules = {
    "obs-x264",     // Software encoder.
    "obs-ffmpeg",   // Contains AMF (AMD) encoder support.
    "win-capture",  // Required for basically all forms of capture on Windows.
    "image-source", // Required for image sources.
    "win-wasapi",   // Required for WASAPI audio input.
    "obs-nvenc",    // Required for NVENC video encoding.
    "obs-qsv11",    // Required for QSV video encoding.
    "obs-filters"   // Required for audio filters.
  };

  return modules;
}

bool plugin_may_fail(const std::string& name) {
  // NVENC fails if there is no NVENC hardware support.
  return name == "obs-nvenc";
}

const char* audio_input_source_id() { return "wasapi_input_capture"; }
const char* audio_output_source_id() { return "wasapi_output_capture"; }
const char* audio_process_source_id() { return "wasapi_process_output_capture"; }
