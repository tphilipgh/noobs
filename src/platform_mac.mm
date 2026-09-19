#import <Cocoa/Cocoa.h>

#include <vector>
#include <string>

#include <obs.h>

#include "platform.h"

/**
 * macOS implementation of the platform layer.
 *
 * The preview is an NSView added as a subview of the Electron window's
 * content view. libobs-opengl attaches an NSOpenGLContext to it, which is why
 * the view must not be layer backed.
 */

/**
 * A plain NSView using top left origin coordinates, so that the geometry the
 * renderer sends us means the same thing as it does on Windows, and which
 * does not steal mouse events from the Electron content above it.
 */
@interface NoobsPreviewView : NSView
@end

@implementation NoobsPreviewView

- (BOOL)isFlipped {
  return YES;
}

- (NSView*)hitTest:(NSPoint)point {
  // The preview sits underneath the app's own UI. Let clicks fall through.
  return nil;
}

@end

void register_preview_window_class() {
  // Nothing to register on macOS.
}

PreviewSurface create_preview_surface(void* parent) {
  if (!parent) {
    blog(LOG_ERROR, "No parent handle passed to create_preview_surface");
    return nullptr;
  }

  // Electron hands us the NSView* of the window's content view.
  NSView* parentView = (__bridge NSView*)parent;

  if (![parentView isKindOfClass:[NSView class]]) {
    blog(LOG_ERROR, "Parent handle is not an NSView");
    return nullptr;
  }

  __block NoobsPreviewView* view = nil;

  // AppKit requires view hierarchy changes on the main thread.
  dispatch_block_t work = ^{
    view = [[NoobsPreviewView alloc] initWithFrame:NSMakeRect(0, 0, 0, 0)];

    // libobs-opengl uses NSOpenGLContext setView:, which does not work with a
    // layer backed view. Electron's content view is layer backed, so we have
    // to explicitly opt this subview out.
    view.wantsLayer = NO;
    view.autoresizingMask = NSViewNotSizable;

    [parentView addSubview:view positioned:NSWindowBelow relativeTo:nil];
  };

  if ([NSThread isMainThread]) {
    work();
  } else {
    dispatch_sync(dispatch_get_main_queue(), work);
  }

  if (!view) {
    blog(LOG_ERROR, "Failed to create preview view");
    return nullptr;
  }

  blog(LOG_INFO, "Created preview NSView");

  // Balanced by destroy_preview_surface. We are not using ARC here.
  return (void*)CFBridgingRetain(view);
}

/**
 * Run a block against the surface on the main thread.
 */
static void on_main(PreviewSurface surface, void (^block)(NSView*)) {
  if (!surface) return;
  NSView* view = (__bridge NSView*)surface;

  dispatch_block_t work = ^{
    block(view);
  };

  if ([NSThread isMainThread]) {
    work();
  } else {
    dispatch_sync(dispatch_get_main_queue(), work);
  }
}

void position_preview_surface(PreviewSurface surface, int x, int y, int width, int height) {
  on_main(surface, ^(NSView* view) {
    // Our view is flipped, but its superview is not, so convert the origin.
    NSView* parent = view.superview;
    CGFloat parentHeight = parent ? parent.bounds.size.height : 0;
    view.frame = NSMakeRect(x, parentHeight - y - height, width, height);
  });
}

void show_preview_surface(PreviewSurface surface) {
  on_main(surface, ^(NSView* view) {
    view.hidden = NO;
  });
}

void hide_preview_surface(PreviewSurface surface) {
  on_main(surface, ^(NSView* view) {
    view.hidden = YES;
  });
}

void destroy_preview_surface(PreviewSurface surface) {
  if (!surface) return;

  on_main(surface, ^(NSView* view) {
    [view removeFromSuperview];
  });

  CFRelease(surface);
}

void set_preview_window(gs_init_data* data, PreviewSurface surface) {
  data->window.view = (__bridge NSView*)surface;
}

const char* graphics_module_name() {
  return "libobs-opengl.dylib";
}

std::string plugin_binary_path(const std::string& pluginDir, const std::string& name) {
  // Plugins are bundles. obs_open_module wants the Mach-O inside.
  return pluginDir + name + ".plugin/Contents/MacOS/" + name;
}

std::string plugin_data_path(const std::string& pluginDir, const std::string& dataDir, const std::string& name) {
  // A plugin bundle carries its own data, so the shared data dir is unused.
  (void)dataDir;
  return pluginDir + name + ".plugin/Contents/Resources";
}

const std::vector<std::string>& plugin_modules() {
  static const std::vector<std::string> modules = {
    "obs-x264",           // Software encoder.
    "obs-ffmpeg",         // Muxing, and the replay buffer output.
    "mac-capture",        // Display, window and ScreenCaptureKit capture, plus CoreAudio.
    "image-source",       // Required for image sources.
    "mac-videotoolbox",   // Hardware H.264/HEVC encoding.
    "coreaudio-encoder",  // AAC audio encoding.
    "mac-avcapture",      // Webcam capture.
    "obs-transitions",    // libobs expects a cut transition to exist.
    "obs-filters"         // Required for audio filters.
  };

  return modules;
}

bool plugin_may_fail(const std::string& name) {
  // Webcam capture is optional, and VideoToolbox is absent on some hardware.
  return name == "mac-avcapture" || name == "mac-videotoolbox";
}

const char* audio_input_source_id() { return "coreaudio_input_capture"; }

// macOS has no loopback device, so desktop and per application audio both go
// through ScreenCaptureKit. Requires macOS 13.
const char* audio_output_source_id() { return "sck_audio_capture"; }
const char* audio_process_source_id() { return "sck_audio_capture"; }
