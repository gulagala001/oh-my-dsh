#import <Cocoa/Cocoa.h>
#import <QuartzCore/QuartzCore.h>
#import <CoreImage/CoreImage.h>
#import <objc/message.h>
#import <libproc.h>
#import "completion.h"
#import "controls.h"
#import "motion-driver.h"
#import "host-operations.h"
#import "producer-channel.h"
#include "dynamics.h"
#include <node_api.h>
#include <cmath>
#include <cstring>
#include <dlfcn.h>
#include <memory>
#include <mutex>
#include <stdexcept>
#include <string>
#include <algorithm>
#include <optional>
#include <vector>

static void Check(napi_status status) {
  if (status != napi_ok) throw std::runtime_error("Node-API operation failed.");
}

static napi_value ToJS(napi_env env, id value) {
  napi_value result;
  if (!value || value == NSNull.null) {
    Check(napi_get_null(env, &result));
  } else if ([value isKindOfClass:NSString.class]) {
    Check(napi_create_string_utf8(env, [value UTF8String], NAPI_AUTO_LENGTH, &result));
  } else if ([value isKindOfClass:NSNumber.class]) {
    if (CFGetTypeID((__bridge CFTypeRef)value) == CFBooleanGetTypeID()) {
      Check(napi_get_boolean(env, [value boolValue], &result));
    } else {
      Check(napi_create_double(env, [value doubleValue], &result));
    }
  } else if ([value isKindOfClass:NSArray.class]) {
    NSArray *array = value;
    Check(napi_create_array_with_length(env, array.count, &result));
    for (NSUInteger i = 0; i < array.count; ++i) Check(napi_set_element(env, result, (uint32_t)i, ToJS(env, array[i])));
  } else if ([value isKindOfClass:NSDictionary.class]) {
    Check(napi_create_object(env, &result));
    for (NSString *key in value) Check(napi_set_named_property(env, result, key.UTF8String, ToJS(env, value[key])));
  } else {
    throw std::runtime_error("Unsupported native event value.");
  }
  return result;
}

static id FromJS(napi_env env, napi_value value, unsigned depth = 0, size_t stringLimit = 65536) {
  if (depth > 8) throw std::runtime_error("Command nesting exceeds the native limit.");
  napi_valuetype type;
  Check(napi_typeof(env, value, &type));
  if (type == napi_null) return NSNull.null;
  if (type == napi_string) {
    size_t length;
    Check(napi_get_value_string_utf8(env, value, nullptr, 0, &length));
    if (length > stringLimit) throw std::runtime_error("Command string exceeds the native limit.");
    std::string string(length + 1, '\0');
    Check(napi_get_value_string_utf8(env, value, string.data(), string.size(), &length));
    return [[NSString alloc] initWithBytes:string.data() length:length encoding:NSUTF8StringEncoding];
  }
  if (type == napi_boolean) {
    bool boolean;
    Check(napi_get_value_bool(env, value, &boolean));
    return @(boolean);
  }
  if (type == napi_number) {
    double number;
    Check(napi_get_value_double(env, value, &number));
    if (!std::isfinite(number)) throw std::runtime_error("Command numbers must be finite.");
    return @(number);
  }
  if (type != napi_object) throw std::runtime_error("Native commands only accept JSON values.");
  bool isBuffer;
  Check(napi_is_buffer(env, value, &isBuffer));
  if (isBuffer) throw std::runtime_error("Binary payloads are not native layout inputs.");
  bool isArray;
  Check(napi_is_array(env, value, &isArray));
  if (isArray) {
    uint32_t length;
    Check(napi_get_array_length(env, value, &length));
    if (length > 4096) throw std::runtime_error("Command array exceeds the native limit.");
    NSMutableArray *array = [NSMutableArray arrayWithCapacity:length];
    for (uint32_t i = 0; i < length; ++i) {
      napi_value item;
      Check(napi_get_element(env, value, i, &item));
      [array addObject:FromJS(env, item, depth + 1, stringLimit)];
    }
    return array;
  }
  napi_value names;
  Check(napi_get_property_names(env, value, &names));
  uint32_t count;
  Check(napi_get_array_length(env, names, &count));
  if (count > 128) throw std::runtime_error("Command object exceeds the native limit.");
  NSMutableDictionary *dictionary = [NSMutableDictionary dictionaryWithCapacity:count];
  for (uint32_t i = 0; i < count; ++i) {
    napi_value name, item;
    Check(napi_get_element(env, names, i, &name));
    Check(napi_get_property(env, value, name, &item));
    id key = FromJS(env, name, depth + 1);
    if (![key isKindOfClass:NSString.class]) throw std::runtime_error("Command keys must be strings.");
    dictionary[key] = FromJS(env, item, depth + 1, stringLimit);
  }
  return dictionary;
}

static NSDictionary *Dictionary(id value, const char *name) {
  if (![value isKindOfClass:NSDictionary.class]) throw std::runtime_error(std::string(name) + " must be an object.");
  return value;
}

static NSString *String(id value, const char *name) {
  if (![value isKindOfClass:NSString.class] || [value length] == 0) throw std::runtime_error(std::string(name) + " must be a nonempty string.");
  return value;
}

static NSString *NullableString(id value, const char *name) {
  if (value == NSNull.null) return nil;
  return String(value, name);
}

static double Number(id value, const char *name) {
  if (![value isKindOfClass:NSNumber.class] || CFGetTypeID((__bridge CFTypeRef)value) == CFBooleanGetTypeID() || !std::isfinite([value doubleValue])) {
    throw std::runtime_error(std::string(name) + " must be a finite number.");
  }
  return [value doubleValue];
}

static uint32_t Unsigned(id value, const char *name, bool allowZero = false) {
  double number = Number(value, name);
  if (number < (allowZero ? 0 : 1) || number > UINT32_MAX || std::floor(number) != number) throw std::runtime_error(std::string(name) + " must be a uint32.");
  return (uint32_t)number;
}

static BOOL ReadBoolean(id value, const char *name) {
  if (![value isKindOfClass:NSNumber.class] || CFGetTypeID((__bridge CFTypeRef)value) != CFBooleanGetTypeID()) throw std::runtime_error(std::string(name) + " must be boolean.");
  return [value boolValue];
}

static NSSize ReadSize(id value, const char *name) {
  NSDictionary *size = Dictionary(value, name);
  return NSMakeSize(Number(size[@"width"], "width"), Number(size[@"height"], "height"));
}

static NSPoint ReadPoint(id value, const char *name) {
  NSDictionary *point = Dictionary(value, name);
  return NSMakePoint(Number(point[@"x"], "x"), Number(point[@"y"], "y"));
}

static NSRect ReadRect(id value, const char *name) {
  NSDictionary *rect = Dictionary(value, name);
  return NSMakeRect(Number(rect[@"x"], "x"), Number(rect[@"y"], "y"), Number(rect[@"width"], "width"), Number(rect[@"height"], "height"));
}

static NSSize DisplaySize(NSSize source, double maximum) {
  auto size = opencu::pip::displaySizeForSourceSize({source.width, source.height}, maximum);
  return NSMakeSize(size.width, size.height);
}

static opencu::pip::Point PipPoint(NSPoint point) { return {point.x, point.y}; }
static NSPoint NativePoint(opencu::pip::Point point) { return NSMakePoint(point.x, point.y); }
static opencu::pip::Rect PipRect(NSRect frame) { return {{frame.origin.x, frame.origin.y}, {frame.size.width, frame.size.height}}; }
static NSRect NativeRect(opencu::pip::Rect frame) { return NSMakeRect(frame.origin.x, frame.origin.y, frame.size.width, frame.size.height); }
static NSDictionary *SizeValue(NSSize size) { return @{@"width": @(size.width), @"height": @(size.height)}; }

static uint64_t NativeOperationID(id value) {
  double number = Number(value, "operationID");
  if (number < 1 || number > 9007199254740991.0 || std::floor(number) != number) throw std::runtime_error("Native operationID must be a positive exact JSON integer.");
  return (uint64_t)number;
}

static NSImage *ApplicationIconForSource(NSDictionary *source) {
  pid_t pid = [source[@"pid"] intValue];
  struct proc_bsdinfo info = {};
  if (proc_pidinfo(pid, PROC_PIDTBSDINFO, 0, &info, sizeof(info)) != sizeof(info)) return nil;
  NSString *identity = [NSString stringWithFormat:@"%d:%llu:%llu", pid, info.pbi_start_tvsec, info.pbi_start_tvusec];
  if (![identity isEqual:source[@"processIdentity"]]) return nil;
  NSRunningApplication *application = [NSRunningApplication runningApplicationWithProcessIdentifier:pid];
  if (source[@"bundleId"] && ![source[@"bundleId"] isEqual:application.bundleIdentifier]) return nil;
  NSURL *bundleURL = application.bundleURL;
  return bundleURL ? [NSWorkspace.sharedWorkspace iconForFile:bundleURL.path] : nil;
}

struct EventSink {
  napi_threadsafe_function function = nullptr;
  std::mutex mutex;

  static void Call(napi_env env, napi_value callback, void *, void *data) {
    NSDictionary *event = CFBridgingRelease(data);
    if (!env || !callback) return;
    try {
      napi_value receiver, result;
      Check(napi_get_undefined(env, &receiver));
      napi_value argument = ToJS(env, event);
      napi_status status = napi_call_function(env, receiver, callback, 1, &argument, &result);
      if (status == napi_pending_exception) {
        napi_value exception;
        napi_get_and_clear_last_exception(env, &exception);
        NSLog(@"Desktop presentation event listener threw; native lifecycle continues.");
      } else {
        Check(status);
      }
    } catch (const std::exception &error) {
      NSLog(@"Desktop presentation event delivery failed: %s", error.what());
    }
  }

  EventSink(napi_env env, napi_value callback) {
    napi_value name;
    Check(napi_create_string_utf8(env, "DesktopPresentations", NAPI_AUTO_LENGTH, &name));
    Check(napi_create_threadsafe_function(env, callback, nullptr, name, 0, 1, nullptr, nullptr, nullptr, Call, &function));
    napi_status status = napi_unref_threadsafe_function(env, function);
    if (status != napi_ok) {
      napi_release_threadsafe_function(function, napi_tsfn_abort);
      function = nullptr;
      Check(status);
    }
  }

  void Send(NSDictionary *event) {
    std::lock_guard<std::mutex> lock(mutex);
    if (!function) return;
    void *data = (void *)CFBridgingRetain(event);
    if (napi_call_threadsafe_function(function, data, napi_tsfn_nonblocking) != napi_ok) CFBridgingRelease(data);
  }

  void Close() {
    std::lock_guard<std::mutex> lock(mutex);
    if (!function) return;
    napi_release_threadsafe_function(function, napi_tsfn_abort);
    function = nullptr;
  }

  void Finish() {
    std::lock_guard<std::mutex> lock(mutex);
    if (!function) return;
    napi_release_threadsafe_function(function, napi_tsfn_release);
    function = nullptr;
  }

  ~EventSink() { Close(); }
};

@interface OPRemoteAttachment : NSObject
@property(nonatomic, strong) CALayer *layer;
@property(nonatomic, strong) CALayer *localHost;
@property(nonatomic, strong) CALayer *localRoot;
@property(nonatomic, strong) CALayer *producerHost;
@property(nonatomic, strong) id context;
@property(nonatomic) NSSize sourceBaseSize;
@property(nonatomic) NSInteger hostedContentScaling;
- (instancetype)initWithParent:(CALayer *)parent frame:(NSRect)frame contextID:(uint32_t)contextID;
- (void)setFrameInTransaction:(NSRect)frame;
- (void)updateHostedContentFrames;
- (BOOL)prepareWithContextID:(uint32_t)contextID displaySize:(NSSize)size replaceContext:(BOOL)replace fencePort:(mach_port_t)fencePort;
- (BOOL)prepareResizeWithFencePort:(mach_port_t)fencePort;
- (void)detach;
@end

static BOOL RemoteContextAvailable() {
  Class context = NSClassFromString(@"CAContext");
  Class host = NSClassFromString(@"CALayerHost");
  return context && host && [context respondsToSelector:NSSelectorFromString(@"contextWithCGSConnection:options:")] &&
    [context instancesRespondToSelector:NSSelectorFromString(@"contextId")] &&
    [context instancesRespondToSelector:NSSelectorFromString(@"setLayer:")] &&
    [context instancesRespondToSelector:NSSelectorFromString(@"setFencePort:")] &&
    [host instancesRespondToSelector:NSSelectorFromString(@"setContextId:")] &&
    dlsym(RTLD_DEFAULT, "CGSMainConnectionID");
}

@implementation OPRemoteAttachment
- (instancetype)initWithParent:(CALayer *)parent frame:(NSRect)frame contextID:(uint32_t)contextID {
  self = [super init];
  if (!self || !RemoteContextAvailable()) return nil;
  auto connection = reinterpret_cast<uint32_t (*)()>(dlsym(RTLD_DEFAULT, "CGSMainConnectionID"));
  Class contextClass = NSClassFromString(@"CAContext");
  Class hostClass = NSClassFromString(@"CALayerHost");
  id context = ((id (*)(id, SEL, uint32_t, id))objc_msgSend)(contextClass, NSSelectorFromString(@"contextWithCGSConnection:options:"), connection(), @{});
  CALayer *localHost = [[hostClass alloc] init];
  CALayer *producerHost = [[hostClass alloc] init];
  if (!context || ![context respondsToSelector:NSSelectorFromString(@"contextId")] || ![context respondsToSelector:NSSelectorFromString(@"setLayer:")] || ![context respondsToSelector:NSSelectorFromString(@"setFencePort:")] || ![localHost respondsToSelector:NSSelectorFromString(@"setContextId:")] || ![producerHost respondsToSelector:NSSelectorFromString(@"setContextId:")]) return nil;
  _context = context;
  _localHost = localHost;
  _producerHost = producerHost;
  _layer = CALayer.layer;
  _layer.frame = frame;
  _layer.masksToBounds = YES;
  _layer.cornerRadius = 0;
  _localRoot = CALayer.layer;
  _localRoot.masksToBounds = YES;
  [CATransaction begin];
  [CATransaction setDisableActions:YES];
  uint32_t localContextID = ((uint32_t (*)(id, SEL))objc_msgSend)(_context, NSSelectorFromString(@"contextId"));
  ((void (*)(id, SEL, uint32_t))objc_msgSend)(_localHost, NSSelectorFromString(@"setContextId:"), localContextID);
  _localHost.frame = _layer.bounds;
  [_layer addSublayer:_localHost];
  _localRoot.frame = _layer.bounds;
  _sourceBaseSize = _localRoot.bounds.size;
  ((void (*)(id, SEL, id))objc_msgSend)(_context, NSSelectorFromString(@"setLayer:"), _localRoot);
  ((void (*)(id, SEL, uint32_t))objc_msgSend)(_producerHost, NSSelectorFromString(@"setContextId:"), contextID);
  _producerHost.frame = _localRoot.bounds;
  [_localRoot addSublayer:_producerHost];
  [parent addSublayer:_layer];
  [CATransaction commit];
  [CATransaction flush];
  return self;
}

- (void)setFrameInTransaction:(NSRect)frame {
  _layer.frame = frame;
  [self updateHostedContentFrames];
}

- (void)updateHostedContentFrames {
  _localHost.transform = CATransform3DIdentity;
  _localHost.frame = _layer.bounds;
  _localRoot.frame = _layer.bounds;
  NSRect bounds = _localRoot.bounds;
  NSSize source = _sourceBaseSize;
  if (!_hostedContentScaling || !_producerHost || source.width <= 0 || source.height <= 0) {
    _producerHost.transform = CATransform3DIdentity;
    _producerHost.frame = bounds;
  } else if (_hostedContentScaling == 1) {
    _producerHost.bounds = NSMakeRect(0, 0, source.width, source.height);
    _producerHost.position = NSMakePoint(NSMidX(bounds), NSMidY(bounds));
    _producerHost.transform = CATransform3DMakeScale(bounds.size.width / source.width, bounds.size.height / source.height, 1);
  } else {
    _producerHost.transform = CATransform3DIdentity;
    _localRoot.frame = NSMakeRect(0, 0, source.width, source.height);
    _producerHost.frame = _localRoot.bounds;
    _localHost.bounds = _localRoot.bounds;
    _localHost.position = NSMakePoint(NSMidX(_layer.bounds), NSMidY(_layer.bounds));
    _localHost.transform = CATransform3DMakeScale(_layer.bounds.size.width / source.width, _layer.bounds.size.height / source.height, 1);
  }
}

// sky.node 0x4f14 sets the actual CA fence before beginning its transaction.
- (BOOL)prepareWithContextID:(uint32_t)contextID displaySize:(NSSize)size replaceContext:(BOOL)replace fencePort:(mach_port_t)fencePort {
  if (!_context || !_layer || !fencePort) return NO;
  CALayer *replacement = nil;
  if (replace) {
    Class hostClass = NSClassFromString(@"CALayerHost");
    replacement = [[hostClass alloc] init];
    if (![replacement respondsToSelector:NSSelectorFromString(@"setContextId:")]) return NO;
    ((void (*)(id, SEL, uint32_t))objc_msgSend)(replacement, NSSelectorFromString(@"setContextId:"), contextID);
  } else if (!_producerHost) return NO;
  ((void (*)(id, SEL, mach_port_t))objc_msgSend)(_context, NSSelectorFromString(@"setFencePort:"), fencePort);
  NSRect frame = _layer.frame;
  frame.size = size;
  _sourceBaseSize = size;
  [CATransaction begin]; [CATransaction setDisableActions:YES];
  _layer.frame = frame;
  if (replace) {
    [_localRoot addSublayer:replacement];
    [_producerHost removeFromSuperlayer];
    _producerHost = replacement;
  }
  _hostedContentScaling = 0;
  [self updateHostedContentFrames];
  [CATransaction commit]; [CATransaction flush];
  return YES;
}

// sky.node 0x50b0: an in-progress resize only fences the existing attachment.
- (BOOL)prepareResizeWithFencePort:(mach_port_t)fencePort {
  if (!_producerHost || !_context || !fencePort) return NO;
  ((void (*)(id, SEL, mach_port_t))objc_msgSend)(_context, NSSelectorFromString(@"setFencePort:"), fencePort);
  return YES;
}

- (void)detach {
  [CATransaction begin];
  [CATransaction setDisableActions:YES];
  [_producerHost removeAllAnimations];
  _producerHost.transform = CATransform3DIdentity;
  [_producerHost removeFromSuperlayer];
  _producerHost = nil;
  if (_context) ((void (*)(id, SEL, id))objc_msgSend)(_context, NSSelectorFromString(@"setLayer:"), nil);
  [_localHost removeAllAnimations];
  [_localRoot removeAllAnimations];
  [_layer removeAllAnimations];
  _layer.hidden = YES;
  [_layer removeFromSuperlayer];
  [CATransaction commit];
  [CATransaction flush];
  _layer = nil;
  _localHost = nil;
  _localRoot = nil;
  _context = nil;
}

- (void)dealloc {
  if (_layer || _context) [self detach];
}
@end

static CAAnimationGroup *AppearanceAnimationGroup(BOOL exiting) {
  CASpringAnimation *scale = [CASpringAnimation animationWithKeyPath:@"transform"];
  scale.mass = 1; scale.stiffness = 185; scale.damping = 18; scale.initialVelocity = 0;
  scale.fromValue = [NSValue valueWithCATransform3D:CATransform3DMakeScale(exiting ? 1 : 0.72, exiting ? 1 : 0.72, 1)];
  scale.toValue = [NSValue valueWithCATransform3D:CATransform3DMakeScale(exiting ? 0.72 : 1, exiting ? 0.72 : 1, 1)];
  CABasicAnimation *opacity = [CABasicAnimation animationWithKeyPath:@"opacity"];
  opacity.fromValue = exiting ? @1 : @0; opacity.toValue = exiting ? @0 : @1; opacity.duration = exiting ? 0.22 : 0.2;
  CABasicAnimation *blur = [CABasicAnimation animationWithKeyPath:@"filters.remoteHostedPIPAppearanceBlur.inputRadius"];
  blur.fromValue = exiting ? @0 : @18; blur.toValue = exiting ? @18 : @0; blur.duration = exiting ? 0.24 : 0.28;
  opacity.timingFunction = blur.timingFunction = [CAMediaTimingFunction functionWithName:exiting ? kCAMediaTimingFunctionEaseIn : kCAMediaTimingFunctionEaseOut];
  CAAnimationGroup *group = CAAnimationGroup.animation;
  group.animations = @[scale, opacity, blur]; group.duration = std::max(scale.settlingDuration, blur.duration); group.removedOnCompletion = YES;
  return group;
}

@interface OPPresentation : NSObject {
@public
  opencu::pip::MotionState motion;
@private
  uint64_t _appearanceGeneration;
}
@property(nonatomic, copy) NSDictionary *identity;
@property(nonatomic, strong) OPRemoteAttachment *attachment;
@property(nonatomic, strong) CALayer *positionLayer;
@property(nonatomic, strong) CALayer *appearanceLayer;
@property(nonatomic, strong) CALayer *shadowLayer;
@property(nonatomic, strong) CALayer *hoverLayer;
@property(nonatomic, strong) CIFilter *appearanceBlur;
@property(nonatomic, readonly) NSRect currentFrame;
@property(nonatomic) NSSize sourceSize;
@property(nonatomic) NSSize contentAspectSize;
@property(nonatomic) NSSize displaySize;
@property(nonatomic) uint32_t sourceGeneration;
@property(nonatomic) uint32_t contextID;
@property(nonatomic) BOOL completed;
@property(nonatomic) BOOL contributes;
@property(nonatomic, strong) dispatch_source_t completionTimer;
@property(nonatomic, strong) NSImage *applicationIcon;
@property(nonatomic, strong) OCUCompletionEffect *completionEffect;
@property(nonatomic) double homeTransitionProgress;
@property(nonatomic) uint64_t pendingOperationID;
@property(nonatomic) uint64_t lastCompletedOperationID;
@property(nonatomic) BOOL removalFinished;
@property(nonatomic) BOOL removalAnimated;
@property(nonatomic, copy) NSDictionary *removalPayload;
- (instancetype)initWithParentLayer:(CALayer *)parent displaySize:(NSSize)size;
- (void)configureContentLayer;
- (void)setFrameInTransaction:(NSRect)frame;
- (void)setAppearanceAnchorPoint:(NSPoint)point;
- (void)animateIn;
- (void)animateOutWithCompletion:(dispatch_block_t)completion;
- (void)stopAppearance;
@end
@implementation OPPresentation
- (instancetype)initWithParentLayer:(CALayer *)parent displaySize:(NSSize)size {
  self = [super init];
  if (!self) return nil;
  NSRect frame = NSMakeRect(0, 0, size.width, size.height);
  _positionLayer = CALayer.layer; _positionLayer.frame = frame; _positionLayer.masksToBounds = NO;
  _appearanceLayer = CALayer.layer; _appearanceLayer.frame = frame; _appearanceLayer.masksToBounds = NO; _appearanceLayer.opacity = 0;
  _shadowLayer = CALayer.layer; _shadowLayer.frame = frame; _shadowLayer.masksToBounds = NO;
  _shadowLayer.shadowColor = NSColor.blackColor.CGColor; _shadowLayer.shadowOpacity = 0.16f;
  _shadowLayer.shadowOffset = NSMakeSize(0, -6); _shadowLayer.shadowRadius = 10;
  CGPathRef path = CGPathCreateWithRect(frame, nullptr); _shadowLayer.shadowPath = path; CGPathRelease(path);
  _appearanceBlur = [CIFilter filterWithName:@"CIGaussianBlur"];
  _appearanceBlur.name = @"remoteHostedPIPAppearanceBlur";
  [_appearanceBlur setDefaults]; [_appearanceBlur setValue:@0 forKey:kCIInputRadiusKey];
  [_appearanceLayer addSublayer:_shadowLayer]; [_positionLayer addSublayer:_appearanceLayer]; [parent addSublayer:_positionLayer];
  return self;
}
- (NSRect)currentFrame { return _positionLayer.frame; }
- (void)configureContentLayer {
  CALayer *content = _attachment.layer;
  content.cornerRadius = 0; content.masksToBounds = YES;
  _hoverLayer = CALayer.layer; _hoverLayer.frame = content.bounds;
  _hoverLayer.backgroundColor = [NSColor colorWithCalibratedWhite:0 alpha:0.06].CGColor;
  _hoverLayer.compositingFilter = @"sourceAtop"; _hoverLayer.hidden = YES;
  [content addSublayer:_hoverLayer];
}
- (void)setFrameInTransaction:(NSRect)frame {
  BOOL sameSize = NSEqualSizes(_positionLayer.frame.size, frame.size);
  _positionLayer.frame = frame;
  if (sameSize) return;
  NSRect local = NSMakeRect(0, 0, frame.size.width, frame.size.height);
  _appearanceLayer.frame = local; _shadowLayer.frame = local;
  [_attachment setFrameInTransaction:local]; _hoverLayer.frame = _attachment.layer.bounds;
  [_completionEffect layoutInSize:_attachment.layer.bounds.size];
  CGPathRef path = CGPathCreateWithRect(local, nullptr); _shadowLayer.shadowPath = path; CGPathRelease(path);
}
- (void)setAppearanceAnchorPoint:(NSPoint)point {
  NSRect frame = _appearanceLayer.frame;
  [CATransaction begin]; [CATransaction setDisableActions:YES];
  _appearanceLayer.anchorPoint = point; _appearanceLayer.frame = frame;
  [CATransaction commit];
}
- (void)animateIn {
  if (!_appearanceLayer || !_appearanceBlur) return;
  uint64_t generation = ++_appearanceGeneration;
  [_appearanceLayer removeAnimationForKey:@"remoteHostedPIPAppearance"];
  CAAnimationGroup *group = AppearanceAnimationGroup(NO);
  [CATransaction begin]; [CATransaction setDisableActions:YES];
  _appearanceLayer.filters = @[_appearanceBlur]; _appearanceLayer.transform = CATransform3DIdentity; _appearanceLayer.opacity = 1;
  [_appearanceBlur setValue:@0 forKey:kCIInputRadiusKey];
  [_appearanceLayer addAnimation:group forKey:@"remoteHostedPIPAppearance"];
  [CATransaction commit];
  __weak OPPresentation *weakSelf = self;
  dispatch_after(dispatch_time(DISPATCH_TIME_NOW, (int64_t)(group.duration * NSEC_PER_SEC)), dispatch_get_main_queue(), ^{
    OPPresentation *item = weakSelf;
    if (!item || item->_appearanceGeneration != generation) return;
    item.appearanceLayer.filters = nil; [item.appearanceBlur setValue:@0 forKey:kCIInputRadiusKey];
  });
}
- (void)animateOutWithCompletion:(dispatch_block_t)completion {
  if (!_appearanceLayer || !_appearanceBlur) { if (completion) completion(); return; }
  uint64_t generation = ++_appearanceGeneration;
  [_appearanceLayer removeAnimationForKey:@"remoteHostedPIPAppearance"];
  CAAnimationGroup *group = AppearanceAnimationGroup(YES);
  [CATransaction begin]; [CATransaction setDisableActions:YES];
  _appearanceLayer.filters = @[_appearanceBlur];
  _appearanceLayer.transform = CATransform3DMakeScale(0.72, 0.72, 1); _appearanceLayer.opacity = 0;
  [_appearanceBlur setValue:@18 forKey:kCIInputRadiusKey];
  [_appearanceLayer addAnimation:group forKey:@"remoteHostedPIPAppearance"];
  [CATransaction commit];
  dispatch_after(dispatch_time(DISPATCH_TIME_NOW, (int64_t)(group.duration * NSEC_PER_SEC)), dispatch_get_main_queue(), ^{
    if (self->_appearanceGeneration == generation && completion) completion();
  });
}
- (void)stopAppearance {
  ++_appearanceGeneration;
  [_appearanceLayer removeAllAnimations]; _appearanceLayer.filters = nil;
  [_appearanceBlur setValue:@0 forKey:kCIInputRadiusKey];
}
@end

@protocol OPInteractionDelegate <NSObject>
- (BOOL)acceptsPoint:(NSPoint)point;
- (void)mouseMovedAtPoint:(NSPoint)point;
- (void)mouseDownAtPoint:(NSPoint)point event:(NSEvent *)event;
- (void)mouseDraggedAtPoint:(NSPoint)point event:(NSEvent *)event;
- (void)mouseUpAtPoint:(NSPoint)point event:(NSEvent *)event;
- (void)mouseExited;
- (NSString *)toolTipAtPoint:(NSPoint)point;
@end

@interface OPContentView : NSView
@property(nonatomic, weak) id<OPInteractionDelegate> interactionDelegate;
@property(nonatomic, strong) NSTrackingArea *tracking;
@end
@implementation OPContentView
- (BOOL)isOpaque { return NO; }
- (BOOL)acceptsFirstMouse:(NSEvent *)event { (void)event; return YES; }
- (NSView *)hitTest:(NSPoint)point {
  NSPoint local = [self convertPoint:point fromView:self.superview];
  return [_interactionDelegate acceptsPoint:local] ? self : nil;
}
- (void)updateTrackingAreas {
  [super updateTrackingAreas];
  if (_tracking) [self removeTrackingArea:_tracking];
  _tracking = [[NSTrackingArea alloc] initWithRect:self.bounds options:(NSTrackingMouseMoved | NSTrackingMouseEnteredAndExited | NSTrackingActiveAlways | NSTrackingInVisibleRect) owner:self userInfo:nil];
  [self addTrackingArea:_tracking];
}
- (NSPoint)pointForEvent:(NSEvent *)event { return [self convertPoint:event.locationInWindow fromView:nil]; }
- (void)mouseMoved:(NSEvent *)event { [_interactionDelegate mouseMovedAtPoint:[self pointForEvent:event]]; }
- (void)mouseEntered:(NSEvent *)event { [self mouseMoved:event]; }
- (void)mouseExited:(NSEvent *)event { (void)event; [_interactionDelegate mouseExited]; }
- (void)mouseDown:(NSEvent *)event { [_interactionDelegate mouseDownAtPoint:[self pointForEvent:event] event:event]; }
- (void)mouseDragged:(NSEvent *)event { [_interactionDelegate mouseDraggedAtPoint:[self pointForEvent:event] event:event]; }
- (void)mouseUp:(NSEvent *)event { [_interactionDelegate mouseUpAtPoint:[self pointForEvent:event] event:event]; }
- (NSString *)view:(NSView *)view stringForToolTip:(NSToolTipTag)tag point:(NSPoint)point userData:(void *)data {
  (void)view; (void)tag; (void)data; return [_interactionDelegate toolTipAtPoint:point];
}
@end

@interface OPRegisteredHost : NSObject
@property(nonatomic, copy) NSString *hostID;
@property(nonatomic, weak) NSWindow *owner;
@property(nonatomic) NSRect anchorFrame;
@property(nonatomic, strong) NSValue *anchorContentRect;
@property(nonatomic, strong) NSValue *interactionPassthroughContentRect;
@property(nonatomic, copy) NSArray<NSDictionary *> *anchors;
@property(nonatomic) NSUInteger presentationScope;
@property(nonatomic) BOOL codexHomeAvailable;
- (NSRect)screenAnchorFrame;
- (NSRect)screenInteractionPassthroughFrame;
- (NSPoint)screenPointForContentPoint:(NSPoint)point;
@end
@implementation OPRegisteredHost
- (NSPoint)screenPointForContentPoint:(NSPoint)point {
  NSView *view = _owner.contentView;
  if (!view) return point;
  return [view.window convertPointToScreen:[view convertPoint:point toView:nil]];
}
- (NSRect)screenAnchorFrame {
  if (!_anchorContentRect || !_owner.contentView) return _anchorFrame;
  NSView *view = _owner.contentView;
  return [view.window convertRectToScreen:[view convertRect:_anchorContentRect.rectValue toView:nil]];
}
- (NSRect)screenInteractionPassthroughFrame {
  NSView *view = _owner.contentView;
  NSRect content = _interactionPassthroughContentRect.rectValue;
  if (!view || NSIsEmptyRect(content)) return NSZeroRect;
  return [view.window convertRectToScreen:[view convertRect:content toView:nil]];
}
@end

static NSPanel *CreatePanel(NSString *title) {
  NSPanel *panel = [[NSPanel alloc] initWithContentRect:NSMakeRect(0, 0, 1, 1) styleMask:(NSWindowStyleMask)0x80 backing:NSBackingStoreBuffered defer:NO];
  panel.title = title;
  panel.backgroundColor = NSColor.clearColor;
  panel.opaque = NO;
  panel.hasShadow = NO;
  panel.level = 0;
  panel.acceptsMouseMovedEvents = YES;
  panel.collectionBehavior = (NSWindowCollectionBehavior)0x108;
  panel.hidesOnDeactivate = NO;
  panel.movableByWindowBackground = NO;
  panel.releasedWhenClosed = NO;
  OPContentView *view = [[OPContentView alloc] initWithFrame:NSMakeRect(0, 0, 1, 1)];
  view.wantsLayer = YES;
  view.layer.backgroundColor = NSColor.clearColor.CGColor;
  panel.contentView = view;
  return panel;
}

static bool HasViewAddress(NSView *view, uintptr_t address) {
  if ((uintptr_t)(__bridge void *)view == address) return true;
  for (NSView *child in view.subviews) if (HasViewAddress(child, address)) return true;
  return false;
}

static NSWindow *ResolveOwner(uintptr_t address) {
  for (NSWindow *window in NSApp.windows) {
    if ((uintptr_t)(__bridge void *)window == address || HasViewAddress(window.contentView, address)) return window;
  }
  return nil;
}

static NSDictionary *NativeCommandFromJS(napi_env env, napi_value value) {
  napi_value operationValue, senderValue, payloadValue;
  Check(napi_get_named_property(env, value, "operation", &operationValue));
  NSString *operation = String(FromJS(env, operationValue), "operation");
  if ([operation isEqual:@"publishEncodedFrame"]) return Dictionary(FromJS(env, value, 0, 16 * 1024 * 1024), "command");
  if (![operation isEqual:@"registerNativeHost"]) return Dictionary(FromJS(env, value), "command");
  Check(napi_get_named_property(env, value, "senderContext", &senderValue));
  Check(napi_get_named_property(env, value, "payload", &payloadValue));
  napi_value names;
  Check(napi_get_property_names(env, payloadValue, &names));
  uint32_t count; Check(napi_get_array_length(env, names, &count));
  if (count > 128) throw std::runtime_error("Host registration exceeds the native property limit.");
  NSMutableDictionary *payload = NSMutableDictionary.dictionary;
  for (uint32_t index = 0; index < count; ++index) {
    napi_value nameValue, fieldValue;
    Check(napi_get_element(env, names, index, &nameValue));
    NSString *name = String(FromJS(env, nameValue), "property");
    Check(napi_get_property(env, payloadValue, nameValue, &fieldValue));
    if ([name isEqual:@"nativeOwner"]) throw std::runtime_error("Native owner objects are internal.");
    if (![name isEqual:@"ownerWindowHandle"]) { payload[name] = FromJS(env, fieldValue); continue; }
    bool isBuffer; Check(napi_is_buffer(env, fieldValue, &isBuffer));
    if (!isBuffer) throw std::runtime_error("Host owner must be a main-process native window handle Buffer.");
    void *bytes; size_t length;
    Check(napi_get_buffer_info(env, fieldValue, &bytes, &length));
    if (length != sizeof(uintptr_t)) throw std::runtime_error("Unexpected native host window handle size.");
    uintptr_t address; std::memcpy(&address, bytes, sizeof(address));
    NSWindow *owner = ResolveOwner(address);
    if (!owner) throw std::runtime_error("Host handle does not identify a live AppKit window or view.");
    payload[@"nativeOwner"] = owner;
  }
  return @{@"operation": operation, @"senderContext": Dictionary(FromJS(env, senderValue), "senderContext"), @"payload": payload};
}

@interface OPHost : NSObject <OPInteractionDelegate, OCUNativePresentationOperations> {
  std::shared_ptr<EventSink> _sink;
  std::vector<opencu::pip::Host> _nativeHosts;
  std::optional<opencu::pip::Anchor> _targetAnchor;
  std::optional<opencu::pip::ProgrammaticMove> _programmaticMove;
  opencu::pip::EnvelopeState _envelopeState;
  std::optional<std::uint64_t> _preferredAlignment;
  BOOL _deferredLayout;
  BOOL _deferredAnimated;
  BOOL _hostAlignmentTransition;
  NSPoint _lastHostAnchor;
  double _programmaticSizeStartTimestamp;
  BOOL _windowHiddenForDOMVideo;
  BOOL _dragActive;
  NSString *_dragLeader;
  NSPoint _dragGrabOffset;
  NSPoint _dragInitialPointer;
  NSPoint _dragPointer;
  NSPoint _dragVelocity;
  double _dragTimestamp;
  BOOL _dragHasMoved;
  BOOL _resizeActive;
  NSString *_resizeLeader;
  NSPoint _resizeInitialPointer;
  double _resizeInitialMaximum;
  NSInteger _resizeAlignment;
  NSPoint _resizeFixedScreenPoint;
  BOOL _resizeFixedScreenPointValid;
  std::optional<opencu::pip::Point> _resizeLayoutAnchor;
  BOOL _resizeChangedMaximum;
  BOOL _resizePreviewScalingActive;
  BOOL _resizePreviewWasActiveAtStart;
  BOOL _resizeReleaseReconcileActive;
  double _lastNotifiedMaximum;
  NSString *_pendingControl;
  NSPoint _mouseDownPoint;
  NSString *_pendingPlacement;
  NSString *_unregisteredCurrentHostID;
  NSString *_hoveredPresentationID;
  NSString *_windowCurrentHostID;
  __weak NSWindow *_windowOwner;
  NSNumber *_serviceAnchorAlignment;
  NSMutableDictionary<NSString *, NSNumber *> *_codexPlacementPreferences;
  BOOL _codexHomeAvailable;
  BOOL _hostCloseCompleted;
  NSMutableDictionary<NSString *, NSMutableDictionary<NSString *, NSDictionary *> *> *_domHomeSurfaces;
  NSMutableDictionary<NSString *, NSDictionary *> *_lastDOMHomeSnapshots;
}
@property(nonatomic, weak) NSWindow *owner;
@property(nonatomic, strong) NSPanel *panel;
@property(nonatomic, strong) NSPanel *controlPanel;
@property(nonatomic, strong) id ownerCloseObserver;
@property(nonatomic, strong) NSMutableDictionary<NSString *, OPPresentation *> *presentations;
@property(nonatomic, strong) NSMutableDictionary<NSString *, OPPresentation *> *exitingPresentations;
@property(nonatomic, strong) NSMutableDictionary<NSString *, OPProducerChannel *> *producerChannels;
@property(nonatomic, strong) NSMutableArray<NSString *> *publicationOrder;
@property(nonatomic, strong) NSMutableArray<NSString *> *controllerOrder;
@property(nonatomic, strong) NSMutableDictionary<NSString *, OPRegisteredHost *> *registeredHosts;
@property(nonatomic, strong) NSMutableDictionary<NSString *, NSNumber *> *hostIndices;
@property(nonatomic, strong) NSMutableArray *hostObjects;
@property(nonatomic, strong) OPRegisteredHost *currentNativeHost;
@property(nonatomic, strong) OPMotionDisplayLinkDriver *motionDriver;
@property(nonatomic, strong) OCUNativePIPControls *controls;
@property(nonatomic, strong) NSMutableArray *ownerFrameObservers;
@property(nonatomic, strong) NSMutableDictionary<NSString *, NSDictionary *> *retiredIdentities;
@property(nonatomic, strong) NSMutableDictionary<NSString *, NSMutableSet<NSString *> *> *invalidatedTurns;
@property(nonatomic, strong) NSMutableSet<NSString *> *enabledThreads;
@property(nonatomic, strong) NSMutableSet<NSString *> *readyThreads;
@property(nonatomic, strong) NSMutableSet<NSString *> *failedThreads;
@property(nonatomic, copy) NSString *token;
@property(nonatomic) uint32_t senderID;
@property(nonatomic) uint32_t senderGeneration;
@property(nonatomic, copy) NSDictionary *layoutInputs;
@property(nonatomic) uint64_t layoutRevision;
@property(nonatomic) BOOL closed;
- (instancetype)initWithOwner:(NSWindow *)owner senderID:(uint32_t)senderID generation:(uint32_t)generation sink:(std::shared_ptr<EventSink>)sink;
- (NSDictionary *)command:(NSDictionary *)command;
- (void)close;
- (void)applyLayout;
- (void)renderMotionFramesExpanded:(BOOL)expanded;
- (void)displayLinkDidFireAtTimestamp:(double)timestamp;
- (void)layoutAnimated:(BOOL)animated;
- (BOOL)moveToHost:(NSString *)hostID alignment:(NSNumber *)alignment;
- (BOOL)requestPlacement:(NSString *)placement;
- (BOOL)domHomeReadyForThread:(NSString *)threadID;
- (NSDictionary *)domHomeSnapshotForThread:(NSString *)threadID;
- (void)publishDOMHomeStates;
@end

@implementation OPHost
- (instancetype)initWithOwner:(NSWindow *)owner senderID:(uint32_t)senderID generation:(uint32_t)generation sink:(std::shared_ptr<EventSink>)sink {
  self = [super init];
  if (!self) return nil;
  _sink = sink;
  _owner = owner;
  _senderID = senderID;
  _senderGeneration = generation;
  _token = NSUUID.UUID.UUIDString;
  _presentations = NSMutableDictionary.dictionary;
  _exitingPresentations = NSMutableDictionary.dictionary;
  _producerChannels = NSMutableDictionary.dictionary;
  _publicationOrder = NSMutableArray.array;
  _controllerOrder = NSMutableArray.array;
  _registeredHosts = NSMutableDictionary.dictionary;
  _hostIndices = NSMutableDictionary.dictionary;
  _hostObjects = NSMutableArray.array;
  _ownerFrameObservers = NSMutableArray.array;
  _retiredIdentities = NSMutableDictionary.dictionary;
  _invalidatedTurns = NSMutableDictionary.dictionary;
  _enabledThreads = NSMutableSet.set;
  _readyThreads = NSMutableSet.set;
  _failedThreads = NSMutableSet.set;
  _codexPlacementPreferences = NSMutableDictionary.dictionary;
  _domHomeSurfaces = NSMutableDictionary.dictionary;
  _lastDOMHomeSnapshots = NSMutableDictionary.dictionary;
  _panel = CreatePanel(@"Computer Use");
  _controlPanel = CreatePanel(@"Computer Use Controls");
  __weak OPHost *weakSelf = self;
  ((OPContentView *)_panel.contentView).interactionDelegate = self;
  ((OPContentView *)_controlPanel.contentView).interactionDelegate = self;
  _motionDriver = [[OPMotionDisplayLinkDriver alloc] initWithFrameHandler:^(double timestamp) {
    OPHost *host = weakSelf;
    if (!host || host.closed) return;
    @try {
      try { [host displayLinkDidFireAtTimestamp:timestamp]; }
      catch (const std::exception &error) {
        [host.motionDriver stopMotionDisplayLink];
        [host emit:@"nativeFrameFailed" payload:@{@"message": @(error.what())}];
      }
    } @catch (NSException *exception) {
      [host.motionDriver stopMotionDisplayLink];
      [host emit:@"nativeFrameFailed" payload:@{@"message": exception.reason ?: @"Native frame failed"}];
    }
  }];
  _controls = [[OCUNativePIPControls alloc] initWithContentView:_panel.contentView controlView:_controlPanel.contentView contentPanel:_panel controlPanel:_controlPanel placementIcon:nil];
  _controls.contrastSamplingChanged = ^(BOOL active) {
    OPHost *host = weakSelf;
    if (active) [host.motionDriver startControlIconContrastSampling];
    else [host.motionDriver stopControlIconContrastSampling];
  };
  _ownerCloseObserver = [NSNotificationCenter.defaultCenter addObserverForName:NSWindowWillCloseNotification object:owner queue:nil usingBlock:^(NSNotification *) { [weakSelf close]; }];
  for (NSNotificationName name in @[NSWindowDidMoveNotification, NSWindowDidResizeNotification, NSWindowDidChangeScreenNotification, NSWindowDidMiniaturizeNotification, NSWindowDidDeminiaturizeNotification]) {
    id observer = [NSNotificationCenter.defaultCenter addObserverForName:name object:nil queue:NSOperationQueue.mainQueue usingBlock:^(NSNotification *notification) {
      OPHost *host = weakSelf;
      if (!host || host.closed || notification.object == host.panel || notification.object == host.controlPanel) return;
      try { [host layoutAnimated:NO]; } catch (const std::exception &error) { [host emit:@"nativeHostLayoutFailed" payload:@{@"message": @(error.what())}]; }
    }];
    [_ownerFrameObservers addObject:observer];
  }
  return self;
}

- (void)emit:(NSString *)type payload:(NSDictionary *)payload {
  if ([type isEqual:@"presentationRemoved"]) {
    NSDictionary *identity = payload[@"identity"] ?: payload;
    [_producerChannels[identity[@"presentationID"]] confirmSurfaceDetached:payload];
  }
  if (_sink) _sink->Send(@{@"type": type, @"hostToken": _token, @"senderID": @(_senderID), @"senderGeneration": @(_senderGeneration), @"payload": payload});
}

- (void)requireLiveOwner {
  if (![NSThread isMainThread]) throw std::runtime_error("Native presentation commands require the AppKit main thread.");
  if (_closed) throw std::runtime_error("Native presentation host is closed.");
  if (!_owner || ![NSApp.windows containsObject:_owner]) {
    [self close];
    throw std::runtime_error("Native owner window no longer exists.");
  }
}

- (NSArray<NSString *> *)orderedIDs {
  NSString *active = _layoutInputs[@"activeThreadID"];
  if (![active isKindOfClass:NSString.class] || !active.length) return @[];
  NSMutableArray *ids = NSMutableArray.array;
  for (NSString *presentationID in _publicationOrder) {
    OPPresentation *item = _presentations[presentationID];
    if (item && [item.identity[@"threadID"] isEqual:active]) [ids addObject:presentationID];
  }
  return ids;
}

- (BOOL)hideForDOMVideo {
  NSString *active = _layoutInputs[@"activeThreadID"];
  if (![active isKindOfClass:NSString.class] || !active.length || ![self orderedIDs].count) return NO;
  // sky.node 0x14c70's DOM home authority is separate from 0x31b38's physical owner.
  // Cross-process DOM handoff always awaits its real ready receipt and native motion settlement.
  if ([_layoutInputs[@"presentationScope"] integerValue] == 0 && !_programmaticMove && [self domHomeReadyForThread:active]) return YES;
  if ([_failedThreads containsObject:active]) return NO;
  BOOL moving = _programmaticMove.has_value();
  BOOL handoff = [_layoutInputs[@"homeHandoffPending"] boolValue];
  if (handoff && (moving || ![_readyThreads containsObject:active])) return NO;
  if ([_layoutInputs[@"presentationScope"] integerValue] != 0 || [_layoutInputs[@"codexPlacement"] integerValue] != 0 || ![_layoutInputs[@"codexHomeAvailable"] boolValue]) return NO;
  id hostID = _layoutInputs[@"currentHostID"];
  return hostID == NSNull.null || [hostID isEqual:@"codex-main-thread"];
}

- (BOOL)domHomeReadyForThread:(NSString *)threadID {
  if (![_layoutInputs[@"activeThreadID"] isEqual:threadID] || ![_enabledThreads containsObject:threadID]) return NO;
  NSArray *ordered = [self orderedIDs];
  NSArray *visible = [ordered subarrayWithRange:NSMakeRange(0, std::min(ordered.count, [self visibleLimit]))];
  if (!visible.count) return NO;
  for (NSDictionary *surface in _domHomeSurfaces[threadID].allValues) {
    if ([surface[@"available"] boolValue] && [surface[@"visible"] boolValue] && [surface[@"active"] boolValue]
        && [surface[@"ready"] boolValue] && [surface[@"orderedPresentationIDs"] isEqual:visible]) return YES;
  }
  return NO;
}

- (NSDictionary *)domHomeSnapshotForThread:(NSString *)threadID {
  NSDictionary *entries = _domHomeSurfaces[threadID];
  NSMutableArray *surfaces = NSMutableArray.array;
  BOOL available = NO, visible = NO, active = NO;
  for (NSString *key in [entries.allKeys sortedArrayUsingSelector:@selector(compare:)]) {
    NSDictionary *surface = entries[key]; [surfaces addObject:surface];
    available |= [surface[@"available"] boolValue];
    visible |= [surface[@"available"] boolValue] && [surface[@"visible"] boolValue];
    active |= [surface[@"available"] boolValue] && [surface[@"active"] boolValue];
  }
  const BOOL sameThread = [_layoutInputs[@"activeThreadID"] isEqual:threadID];
  return @{@"threadID": threadID, @"ownerKind": @"dsh-dom", @"placement": @"home", @"surfaces": surfaces,
    @"available": @(available), @"visible": @(visible), @"active": @(active && sameThread),
    @"ready": @(!_programmaticMove && [self domHomeReadyForThread:threadID]),
    @"windowHiddenForDOMVideo": @(sameThread && _windowHiddenForDOMVideo)};
}

- (void)publishDOMHomeStates {
  for (NSString *threadID in _domHomeSurfaces.allKeys) {
    NSDictionary *snapshot = [self domHomeSnapshotForThread:threadID];
    if ([_lastDOMHomeSnapshots[threadID] isEqual:snapshot]) continue;
    _lastDOMHomeSnapshots[threadID] = snapshot;
    [self emit:@"domHomeStateChanged" payload:snapshot];
  }
}

- (NSArray<NSString *> *)controllerIDs {
  NSArray *published = [self orderedIDs];
  NSSet *allowed = [NSSet setWithArray:published];
  for (NSString *identifier in [_controllerOrder copy]) if (![allowed containsObject:identifier]) [_controllerOrder removeObject:identifier];
  for (NSString *identifier in published) if (![_controllerOrder containsObject:identifier]) [_controllerOrder addObject:identifier];
  return [_controllerOrder copy];
}

- (NSUInteger)visibleLimit { return [_layoutInputs[@"visibleStackItemLimit"] unsignedIntegerValue]; }
- (NSInteger)currentAlignment { return _targetAnchor ? (NSInteger)_targetAnchor->alignment : [_layoutInputs[@"currentAlignment"] integerValue]; }

- (std::vector<opencu::pip::LayoutItem>)layoutItems:(NSArray<NSString *> *)ids {
  std::vector<opencu::pip::LayoutItem> result;
  for (NSString *identifier in ids) {
    OPPresentation *item = _presentations[identifier];
    result.push_back({{item.displaySize.width, item.displaySize.height}, item ? &item->motion : nullptr, (bool)item.contributes, item != nil && item.attachment != nil});
  }
  return result;
}

- (std::vector<opencu::pip::LayoutItem>)exitingLayoutItems:(NSArray<NSString *> *)ids {
  std::vector<opencu::pip::LayoutItem> result;
  for (NSString *identifier in ids) {
    OPPresentation *item = _exitingPresentations[identifier];
    result.push_back({{item.displaySize.width, item.displaySize.height}, item ? &item->motion : nullptr, true, item != nil && item.attachment != nil});
  }
  return result;
}

- (BOOL)positioningCandidate:(NSWindow *)window {
  return window && window.visible && !window.miniaturized && ![window isKindOfClass:NSPanel.class] && window.level == 0 && window.contentView;
}

- (BOOL)registeredHostAvailable:(OPRegisteredHost *)host {
  return host.owner && host.owner.visible && !host.owner.miniaturized && host.owner.contentView;
}

- (NSArray<OPRegisteredHost *> *)registeredAnchorHosts {
  NSMutableArray *hosts = NSMutableArray.array;
  for (NSString *identifier in _registeredHosts.allKeys) {
    OPRegisteredHost *host = _registeredHosts[identifier];
    if (!host.owner) { [_registeredHosts removeObjectForKey:identifier]; continue; }
    if ([self registeredHostAvailable:host]) [hosts addObject:host];
  }
  return hosts;
}

- (OPRegisteredHost *)genericHostForWindow:(NSWindow *)window {
  if (![self positioningCandidate:window]) return nil;
  OPRegisteredHost *host = [OPRegisteredHost new];
  host.hostID = [NSString stringWithFormat:@"window:%ld", (long)window.windowNumber];
  host.owner = window;
  host.anchorFrame = window.frame;
  host.anchors = @[];
  return host;
}

- (OPRegisteredHost *)defaultNativeHost {
  NSWindow *window = [self positioningCandidate:NSApp.keyWindow] ? NSApp.keyWindow : [self positioningCandidate:NSApp.mainWindow] ? NSApp.mainWindow : nil;
  if (!window) for (NSWindow *candidate in NSApp.orderedWindows) if ([self positioningCandidate:candidate]) { window = candidate; break; }
  if (!window) return nil;
  for (OPRegisteredHost *host in _registeredHosts.allValues) if (host.owner == window && [self registeredHostAvailable:host]) return host;
  return [self genericHostForWindow:window];
}

- (OPRegisteredHost *)currentHostForAnchoring {
  OPRegisteredHost *registered = _windowCurrentHostID ? _registeredHosts[_windowCurrentHostID] : nil;
  if ([self registeredHostAvailable:registered]) return registered;
  if ([self positioningCandidate:_windowOwner]) return [self genericHostForWindow:_windowOwner];
  return [self defaultNativeHost];
}

- (NSUInteger)indexForHost:(OPRegisteredHost *)host {
  NSNumber *existing = _hostIndices[host.hostID];
  NSUInteger index;
  if (existing) { index = existing.unsignedIntegerValue; _hostObjects[index] = host; }
  else {
    index = _hostObjects.count;
    _hostIndices[host.hostID] = @(index);
    [_hostObjects addObject:host];
    _nativeHosts.emplace_back();
  }
  auto &model = _nativeHosts[index];
  model.hostID = host.hostID.UTF8String;
  model.anchorFrame = PipRect([host screenAnchorFrame]);
  model.codexHomeAvailable = host.codexHomeAvailable;
  model.screenAnchors.clear();
  for (NSDictionary *anchor in host.anchors) model.screenAnchors.push_back({PipPoint([host screenPointForContentPoint:ReadPoint(anchor[@"contentPoint"], "contentPoint")]), [anchor[@"alignment"] unsignedLongLongValue], index});
  return index;
}

- (OPRegisteredHost *)hostForAnchor:(const opencu::pip::Anchor &)anchor {
  if (!anchor.hostIndex || *anchor.hostIndex >= _hostObjects.count) return nil;
  id host = _hostObjects[*anchor.hostIndex];
  return [host isKindOfClass:OPRegisteredHost.class] ? host : nil;
}

- (std::optional<opencu::pip::Point>)restAnchor {
  OPRegisteredHost *host = [self currentHostForAnchoring];
  NSRect frame = host ? [host screenAnchorFrame] : _panel.frame;
  return PipPoint(NSMakePoint(NSMaxX(frame) - 24, NSMaxY(frame) - 24));
}

- (std::vector<opencu::pip::Anchor>)compatibleAnchors:(BOOL)dragHosts {
  OPRegisteredHost *current = [self currentHostForAnchoring];
  if (current) [self attachToNativeHost:current];
  OPRegisteredHost *fallback = [self defaultNativeHost];
  std::optional<std::size_t> currentIndex = current ? std::optional<std::size_t>{[self indexForHost:current]} : std::nullopt;
  std::optional<std::size_t> defaultIndex = fallback ? std::optional<std::size_t>{[self indexForHost:fallback]} : std::nullopt;
  std::vector<std::size_t> registered;
  for (OPRegisteredHost *host in [self registeredAnchorHosts]) registered.push_back([self indexForHost:host]);
  auto items = [self layoutItems:[self controllerIDs]];
  const auto rest = opencu::pip::stackRestSize(items, [self visibleLimit]);
  return opencu::pip::compatibleAnchors(_nativeHosts, currentIndex, defaultIndex, registered, dragHosts, [self restAnchor], [_layoutInputs[@"stackDisplayWidth"] doubleValue], rest.width, _panel != nil);
}

- (void)attachToNativeHost:(OPRegisteredHost *)host {
  NSWindow *owner = host.owner;
  if (!owner || owner == _panel || owner == _controlPanel) {
    [_panel.parentWindow removeChildWindow:_panel]; [_controlPanel.parentWindow removeChildWindow:_controlPanel];
    _currentNativeHost = nil;
    _windowOwner = nil; _windowCurrentHostID = nil;
    [_panel orderOut:nil]; [_controlPanel orderOut:nil];
    return;
  }
  _windowCurrentHostID = [host.hostID copy];
  if (_windowHiddenForDOMVideo) return;
  _currentNativeHost = host; _windowOwner = owner;
  NSRect contentFrame = _panel.frame, controlFrame = _controlPanel.frame;
  if (_panel.parentWindow != owner) {
    [_panel.parentWindow removeChildWindow:_panel]; [_controlPanel.parentWindow removeChildWindow:_controlPanel];
    [owner addChildWindow:_panel ordered:NSWindowAbove]; [owner addChildWindow:_controlPanel ordered:NSWindowAbove];
    [_panel setFrame:contentFrame display:NO animate:NO]; [_controlPanel setFrame:controlFrame display:NO animate:NO];
  }
  _panel.level = owner.level; _controlPanel.level = owner.level;
  [_controlPanel orderWindow:NSWindowAbove relativeTo:_panel.windowNumber];
}

- (void)setWindowHiddenForDOMVideo:(BOOL)hidden {
  if (_windowHiddenForDOMVideo == hidden) return;
  _windowHiddenForDOMVideo = hidden;
  if (hidden) {
    [_panel orderOut:nil]; [_controlPanel orderOut:nil];
    [_panel.parentWindow removeChildWindow:_panel]; [_controlPanel.parentWindow removeChildWindow:_controlPanel];
    _windowOwner = nil;
  } else {
    if (![self controllerIDs].count && !_exitingPresentations.count) {
      [_panel orderOut:nil]; [_controlPanel orderOut:nil]; return;
    }
    OPRegisteredHost *host = [self currentHostForAnchoring];
    if (host) {
      [self attachToNativeHost:host]; [_panel orderFront:host.owner]; [_controlPanel orderFront:host.owner];
      [_controlPanel orderWindow:NSWindowAbove relativeTo:_panel.windowNumber];
    }
  }
}

- (void)reconcileVisiblePresentationsAnimated:(BOOL)animated {
  [self setWindowHiddenForDOMVideo:[self hideForDOMVideo]];
  [self layoutAnimated:animated];
}

- (void)setServicePresentationScopeFromHost:(OPRegisteredHost *)host {
  if (!_layoutInputs || [_layoutInputs[@"presentationScope"] unsignedIntegerValue] == host.presentationScope) return;
  NSMutableDictionary *inputs = [_layoutInputs mutableCopy]; inputs[@"presentationScope"] = @(host.presentationScope); _layoutInputs = inputs;
  [self reconcileVisiblePresentationsAnimated:YES];
}

// sky.node 0x11f08 publishes service state independently of the stack window.
- (void)notifyHostChanged:(OPRegisteredHost *)host {
  if (_layoutInputs) {
    _serviceAnchorAlignment = @([self currentAlignment]);
    NSMutableDictionary *inputs = [_layoutInputs mutableCopy];
    BOOL changedID = ![inputs[@"currentHostID"] isEqual:host.hostID ?: NSNull.null];
    inputs[@"currentHostID"] = host.hostID ?: NSNull.null;
    _layoutInputs = inputs;
    if (changedID) [self publishLayout];
    [self setServicePresentationScopeFromHost:host];
  }
  [self emit:@"hostChanged" payload:@{@"hostID": host.hostID ?: NSNull.null, @"presentationScope": @(host.presentationScope)}];
}

- (void)notifyAnchorCommitted:(OPRegisteredHost *)host alignment:(NSUInteger)alignment {
  NSString *active = _layoutInputs[@"activeThreadID"];
  if (host.presentationScope == 0 && [active isKindOfClass:NSString.class] && active.length) {
    NSMutableDictionary *inputs = [_layoutInputs mutableCopy];
    inputs[@"codexPlacement"] = alignment == 1 ? @(!host.codexHomeAvailable) : @1;
    inputs[@"homeHandoffPending"] = @([inputs[@"codexPlacement"] integerValue] == 0 && _programmaticMove.has_value());
    _serviceAnchorAlignment = @(alignment); _preferredAlignment = alignment;
    _codexPlacementPreferences[active] = inputs[@"codexPlacement"];
    _layoutInputs = inputs;
  }
  [self emit:@"anchorCommitted" payload:@{@"hostID": host.hostID ?: NSNull.null, @"alignment": @(alignment)}];
}

- (void)publishLayout {
  if (!_layoutInputs) return;
  NSArray *ids = [self orderedIDs];
  id hostID = _layoutInputs[@"currentHostID"] ?: NSNull.null;
  id placement = hostID == NSNull.null ? NSNull.null : [_layoutInputs[@"presentationScope"] unsignedIntegerValue] == 1 ? @"pet" : [_layoutInputs[@"codexPlacement"] integerValue] == 0 ? @"home" : @"pinned";
  ++_layoutRevision;
  [self emit:@"layout" payload:@{
    @"activeThreadID": _layoutInputs[@"activeThreadID"] ?: NSNull.null, @"currentHostID": hostID,
    @"orderedPresentationIDs": ids, @"placement": placement, @"revision": @(_layoutRevision),
    @"stackDisplayHeight": _layoutInputs[@"stackDisplayHeight"], @"stackDisplayWidth": _layoutInputs[@"stackDisplayWidth"],
    @"isMovingToAnchor": @(_programmaticMove.has_value())
  }];
}

- (void)renderMotionFramesExpanded:(BOOL)expanded {
  if (!_layoutInputs || _closed) return;
  NSArray *ids = [self controllerIDs];
  auto items = [self layoutItems:ids];
  NSArray *exitIDs = _exitingPresentations.allKeys;
  auto exits = [self exitingLayoutItems:exitIDs];
  std::optional<opencu::pip::ProgrammaticMove> sizeMove = _programmaticMove;
  if (sizeMove) sizeMove->startTimestamp = _programmaticSizeStartTimestamp;
  const double timestamp = _motionDriver.lastMotionTimestamp;
  const auto *move = sizeMove ? &*sizeMove : nullptr;
  auto content = opencu::pip::motionContentEnvelope(items, exits, [self visibleLimit], move, timestamp);
  for (OPPresentation *item in _presentations.allValues) item.positionLayer.hidden = YES;
  if (!content) { [_panel orderOut:nil]; [_controlPanel orderOut:nil]; return; }
  NSScreen *screen = _panel.screen ?: _currentNativeHost.owner.screen ?: NSScreen.mainScreen;
  std::optional<opencu::pip::Rect> visible = screen ? std::optional<opencu::pip::Rect>{PipRect(screen.visibleFrame)} : std::nullopt;
  const double scale = _panel.backingScaleFactor;
  auto envelope = opencu::pip::motionEnvelope(*content, expanded, _resizeActive, std::min((NSUInteger)ids.count, [self visibleLimit]), exits.size(), _resizeAlignment, [self currentAlignment], _resizeFixedScreenPointValid ? std::optional<opencu::pip::Point>{PipPoint(_resizeFixedScreenPoint)} : std::nullopt, visible, scale, _envelopeState);
  NSRect frame = NativeRect(envelope.frame);
  [_panel setFrame:frame display:NO animate:NO];
  [_controlPanel setFrame:frame display:NO animate:NO];
  if (envelope.captureActualPanelFrame) _envelopeState.resizeFrozenEnvelope = PipRect(_panel.frame);
  const NSPoint actualOrigin = _panel.frame.origin;
  auto frames = opencu::pip::applyMotionFrames(items, exits, [self visibleLimit], PipPoint(actualOrigin), _targetAnchor ? &*_targetAnchor : nullptr, _nativeHosts, move, timestamp, expanded);
  [CATransaction begin]; [CATransaction setDisableActions:YES];
  for (const auto &output : frames.items) {
    OPPresentation *item = _presentations[ids[output.originalIndex]];
    [item setFrameInTransaction:NativeRect(output.frame)];
    item.positionLayer.zPosition = output.zIndex.value_or(0);
    item.homeTransitionProgress = output.homeTransitionProgress.value_or(0);
    item.shadowLayer.shadowOpacity = (float)((1 - item.homeTransitionProgress) * 0.16);
    item.positionLayer.hidden = output.originalIndex >= [self visibleLimit];
  }
  for (const auto &output : frames.exitingItems) [_exitingPresentations[exitIDs[output.originalIndex]] setFrameInTransaction:NativeRect(output.frame)];
  OPRegisteredHost *anchorHost = _programmaticMove ? [self hostForAnchor:_programmaticMove->targetAnchor] : _targetAnchor ? [self hostForAnchor:*_targetAnchor] : [self currentHostForAnchoring];
  NSInteger controlPlacement = anchorHost.presentationScope == 1 ? 2 : [_layoutInputs[@"codexPlacement"] integerValue] ? 1 : 0;
  OCUPIPControlLayout controls = {NativeRect(frames.controlReferenceFrame), anchorHost ? [anchorHost screenAnchorFrame] : NSZeroRect, controlPlacement, [self currentAlignment], [_layoutInputs[@"presentationScope"] integerValue], (BOOL)frames.controlsVisible, (BOOL)frames.controlsAboveItem, (BOOL)frames.controlsDocked};
  [_controls updateLayout:controls];
  [_controlPanel.contentView removeAllToolTips];
  for (NSValue *value in _controls.toolTipRects) [_controlPanel.contentView addToolTipRect:value.rectValue owner:_controlPanel.contentView userData:nullptr];
  [CATransaction commit];
  BOOL hidden = [self hideForDOMVideo];
  [self setWindowHiddenForDOMVideo:hidden];
  if (hidden) {
    [_panel orderOut:nil]; [_controlPanel orderOut:nil];
    [_panel.parentWindow removeChildWindow:_panel]; [_controlPanel.parentWindow removeChildWindow:_controlPanel];
    _windowOwner = nil;
  } else {
    OPRegisteredHost *host = [self currentHostForAnchoring];
    if (host) {
      [self attachToNativeHost:host];
      [_panel orderFront:host.owner]; [_controlPanel orderFront:host.owner];
      [_controlPanel orderWindow:NSWindowAbove relativeTo:_panel.windowNumber];
    } else { [_panel orderOut:nil]; [_controlPanel orderOut:nil]; }
  }
  [self mouseMovedAtPoint:[_panel.contentView convertPoint:_panel.mouseLocationOutsideOfEventStream fromView:nil]];
  [_panel.contentView.window invalidateCursorRectsForView:_panel.contentView];
  [CATransaction flush];
  [self publishDOMHomeStates];
}

- (void)layoutAnimated:(BOOL)animated {
  if (!_layoutInputs || _closed) return;
  NSArray *ids = [self controllerIDs];
  if (_programmaticMove && ids.count) { _deferredLayout = YES; _deferredAnimated |= animated; return; }
  _programmaticMove.reset();
  if (!animated) { [_motionDriver stopMotionDisplayLink]; _hostAlignmentTransition = NO; }
  if (!ids.count) {
    _deferredLayout = _deferredAnimated = NO;
    if (_exitingPresentations.count) [self renderMotionFramesExpanded:NO];
    else { [self notifyHostChanged:nil]; [_panel orderOut:nil]; [_controlPanel orderOut:nil]; }
    return;
  }
  auto items = [self layoutItems:ids];
  if (!_motionDriver.running) for (NSUInteger index = 0; index < ids.count; ++index) {
    OPPresentation *item = _presentations[ids[index]];
    opencu::pip::synchronizeMotionOrigin(item->motion, PipRect(item.currentFrame), PipPoint(_panel.frame.origin));
  }
  for (NSUInteger index = 0; index < ids.count; ++index) {
    OPPresentation *item = _presentations[ids[index]];
    NSSize previous = item.currentFrame.size;
    opencu::pip::reconcileCenteredAlignmentOrigin(item->motion, {previous.width, previous.height}, {item.displaySize.width, item.displaySize.height}, [self currentAlignment]);
  }
  auto candidates = [self compatibleAnchors:NO];
  auto preferred = opencu::pip::preferredCompatibleAnchor(candidates, _preferredAlignment);
  const auto current = opencu::pip::currentStackAnchorOrDefault(items, [self visibleLimit], [self restAnchor]);
  auto chosen = preferred.value_or(opencu::pip::nearestTargetAnchor(current, opencu::pip::Point{}, candidates, _nativeHosts, _currentNativeHost ? std::optional<std::string>{_currentNativeHost.hostID.UTF8String} : std::nullopt, opencu::pip::fallbackAnchor([self restAnchor], std::nullopt)).anchor);
  _targetAnchor = chosen;
  OPRegisteredHost *chosenHost = [self hostForAnchor:chosen];
  [self attachToNativeHost:chosenHost];
  [self notifyHostChanged:chosenHost];
  opencu::pip::updateRestOffsetsForAlignment(items, [self visibleLimit], chosen.alignment, [self restAnchor]);
  opencu::pip::configureMotionSprings(items, 0, false, false);
  for (NSUInteger index = 0; index < ids.count; ++index) {
    OPPresentation *item = _presentations[ids[index]];
    auto appearance = opencu::pip::appearanceAnchorPoint(chosen.alignment);
    [item setAppearanceAnchorPoint:NSMakePoint(appearance.x, appearance.y)];
    if (!animated) opencu::pip::placeMotionAtAnchor(item->motion, chosen.point);
  }
  [self renderMotionFramesExpanded:animated];
  if (animated) [_motionDriver startMotionDisplayLink];
  [self publishLayout];
}

- (void)applyLayout {
  if (!_layoutInputs) { [_panel orderOut:nil]; [_controlPanel orderOut:nil]; return; }
  for (OPPresentation *item in _presentations.allValues) item.displaySize = DisplaySize(item.contentAspectSize, [_layoutInputs[@"maxDisplaySize"] doubleValue]);
  for (OPPresentation *item in _exitingPresentations.allValues) item.displaySize = DisplaySize(item.contentAspectSize, [_layoutInputs[@"maxDisplaySize"] doubleValue]);
  if (_programmaticMove) {
    auto items = [self layoutItems:[self controllerIDs]];
    opencu::pip::updateRestOffsetsForAlignment(items, [self visibleLimit], [self currentAlignment], [self restAnchor]);
  }
  [self layoutAnimated:NO];
  [self setWindowHiddenForDOMVideo:[self hideForDOMVideo]];
  [self publishDOMHomeStates];
}

- (double)normalizedMaximumDisplaySize:(double)maximum {
  maximum = std::isfinite(maximum) ? std::clamp(maximum, 1.0, 400.0) : 200;
  return opencu::pip::snapToBackingScale(maximum, _panel.backingScaleFactor);
}

// sky.node 0x236c0 preserves an active move or resize when its size changes.
- (BOOL)applyMaximumDisplaySize:(double)maximum animated:(BOOL)animated {
  maximum = [self normalizedMaximumDisplaySize:maximum];
  if (std::abs(maximum - [_layoutInputs[@"maxDisplaySize"] doubleValue]) < 0.5) return NO;
  NSMutableDictionary *inputs = [_layoutInputs mutableCopy];
  inputs[@"maxDisplaySize"] = @(maximum);
  _layoutInputs = inputs;
  for (OPPresentation *item in _presentations.allValues) item.displaySize = DisplaySize(item.contentAspectSize, maximum);
  for (OPPresentation *item in _exitingPresentations.allValues) item.displaySize = DisplaySize(item.contentAspectSize, maximum);
  if (_programmaticMove) {
    auto items = [self layoutItems:[self controllerIDs]];
    opencu::pip::updateRestOffsetsForAlignment(items, [self visibleLimit], [self currentAlignment], [self restAnchor]);
  } else if (_resizeActive) [self renderMotionFramesExpanded:YES];
  else [self layoutAnimated:animated];
  return YES;
}

- (void)displayLinkDidFireAtTimestamp:(double)timestamp {
  if (_motionDriver.needsMotion && (!_programmaticMove || !_programmaticMove->suspendedForDOM)) {
    const double delta = opencu::pip::motionDeltaSeconds(timestamp, _motionDriver.lastMotionTimestamp);
    [_motionDriver recordMotionTimestamp:timestamp];
    BOOL moveUpdated = NO;
    if (_dragActive) [self updateDragTarget];
    else if (_programmaticMove) {
      opencu::pip::Anchor anchor;
      moveUpdated = opencu::pip::updateProgrammaticMove(*_programmaticMove, timestamp, anchor);
      if (moveUpdated) _targetAnchor = anchor;
    }
    NSArray *ids = [self controllerIDs];
    auto items = [self layoutItems:ids];
    auto exits = [self exitingLayoutItems:_exitingPresentations.allKeys];
    if (_hostAlignmentTransition && _targetAnchor) {
      OPRegisteredHost *host = [self currentHostForAnchoring];
      if (host) {
        NSUInteger index = [self indexForHost:host];
        auto anchors = opencu::pip::anchorsForHost(_nativeHosts[index], index, [_layoutInputs[@"stackDisplayWidth"] doubleValue], opencu::pip::stackRestSize(items, [self visibleLimit]).width);
        auto preferred = opencu::pip::preferredAnchor(anchors, [self currentAlignment]);
        if (preferred) {
          opencu::pip::translateMotionOrigins(items, {preferred->point.x - _lastHostAnchor.x, preferred->point.y - _lastHostAnchor.y});
          opencu::pip::translateMotionOrigins(exits, {preferred->point.x - _lastHostAnchor.x, preferred->point.y - _lastHostAnchor.y});
          _targetAnchor = *preferred; _lastHostAnchor = NativePoint(preferred->point);
        }
      }
    }
    BOOL settled = YES;
    std::optional<opencu::pip::ProgrammaticMove> sizeMove = _programmaticMove;
    if (sizeMove) sizeMove->startTimestamp = _programmaticSizeStartTimestamp;
    auto anchor = _targetAnchor ? _targetAnchor->point : opencu::pip::currentStackAnchorOrDefault(items, [self visibleLimit], [self restAnchor]);
    for (std::size_t index = 0; index < items.size(); ++index) if (items[index].motion) {
      auto stepAnchor = opencu::pip::motionStepAnchor(anchor, items[index], index, [self currentAlignment], sizeMove ? &*sizeMove : nullptr, timestamp, moveUpdated);
      settled &= opencu::pip::exactStep(*items[index].motion, stepAnchor, delta);
    }
    for (auto &input : exits) if (input.motion) settled &= opencu::pip::exactStep(*input.motion, anchor, delta);
    BOOL completed = _programmaticMove && _programmaticMove->reachedTarget && settled;
    if (completed) {
      _programmaticMove.reset();
      for (NSString *identifier in ids) _presentations[identifier].attachment.hostedContentScaling = _resizePreviewScalingActive ? 1 : 0;
      moveUpdated = NO;
    }
    [self renderMotionFramesExpanded:_dragActive || moveUpdated || !settled];
    if (!_dragActive && !_programmaticMove && settled) {
      _resizeReleaseReconcileActive = NO;
      _motionDriver.needsMotion = NO; _hostAlignmentTransition = NO;
      [self renderMotionFramesExpanded:NO];
      if (_deferredLayout) { BOOL animated = _deferredAnimated; _deferredLayout = _deferredAnimated = NO; [self layoutAnimated:animated]; }
      if (completed) { [self emit:@"programmaticMoveCompleted" payload:@{}]; [self publishLayout]; }
    }
  }
  [_controls updateContrastAtTimestamp:timestamp force:NO needsMotion:_motionDriver.needsMotion resizing:_resizeActive];
  [_motionDriver stopDisplayLinkIfIdle];
}

- (void)updateDragTarget {
  OPPresentation *leader = _presentations[_dragLeader];
  if (!_dragActive || !leader) return;
  OPRegisteredHost *host = [self currentHostForAnchoring];
  auto anchor = opencu::pip::Anchor{{_dragPointer.x - _dragGrabOffset.x - leader->motion.restOffset.x, _dragPointer.y - _dragGrabOffset.y - leader->motion.restOffset.y}, (std::uint64_t)[self currentAlignment], host ? std::optional<std::size_t>{[self indexForHost:host]} : std::nullopt};
  _targetAnchor = anchor;
}

- (void)synchronizeOrigins {
  for (NSString *identifier in [self controllerIDs]) {
    OPPresentation *item = _presentations[identifier];
    opencu::pip::synchronizeMotionOrigin(item->motion, PipRect(item.currentFrame), PipPoint(_panel.frame.origin));
  }
}

- (BOOL)moveToHost:(NSString *)hostID alignment:(NSNumber *)alignment {
  OPRegisteredHost *host = _registeredHosts[hostID];
  if (![self registeredHostAvailable:host] || _resizeActive || ![self controllerIDs].count) return NO;
  NSUInteger hostIndex = [self indexForHost:host];
  NSArray *ids = [self controllerIDs];
  auto items = [self layoutItems:ids];
  auto anchors = opencu::pip::anchorsForHost(_nativeHosts[hostIndex], hostIndex, [_layoutInputs[@"stackDisplayWidth"] doubleValue], opencu::pip::stackRestSize(items, [self visibleLimit]).width);
  auto chosen = opencu::pip::preferredAnchor(anchors, alignment ? alignment.unsignedLongLongValue : [self currentAlignment]);
  if (!chosen) return NO;
  [self synchronizeOrigins];
  for (NSString *identifier in ids) {
    OPPresentation *item = _presentations[identifier];
    item->motion.moveStartSize = {item.currentFrame.size.width, item.currentFrame.size.height};
    item->motion.moveStartHomeTransitionProgress = item.homeTransitionProgress;
    item.attachment.hostedContentScaling = 2;
  }
  OPRegisteredHost *previous = [self currentHostForAnchoring];
  _targetAnchor = *chosen;
  opencu::pip::updateRestOffsetsForAlignment(items, [self visibleLimit], chosen->alignment, [self restAnchor]);
  const auto start = opencu::pip::currentStackAnchorOrDefault(items, [self visibleLimit], [self restAnchor]);
  opencu::pip::configureMotionSprings(items, 0, false, true);
  _programmaticMove = opencu::pip::beginProgrammaticMove(start, *chosen, CACurrentMediaTime(), _windowHiddenForDOMVideo, host.codexHomeAvailable, (uintptr_t)(__bridge void *)previous.owner, (uintptr_t)(__bridge void *)host.owner);
  _programmaticSizeStartTimestamp = _programmaticMove->startTimestamp;
  _preferredAlignment = chosen->alignment;
  if (!_programmaticMove->waitingForHostHandoff) [self attachToNativeHost:host];
  [self notifyAnchorCommitted:host alignment:chosen->alignment];
  [self notifyHostChanged:host];
  if (_programmaticMove->waitingForHostHandoff) [self emit:@"hostHandoffRequested" payload:@{@"hostID": host.hostID, @"alignment": @(chosen->alignment)}];
  else {
    [self renderMotionFramesExpanded:YES];
    if (!_programmaticMove->suspendedForDOM) [_motionDriver startMotionDisplayLink];
  }
  if (_programmaticMove->suspendedForDOM) [self emit:@"domVideoRemovalRequested" payload:@{@"threadID": _layoutInputs[@"activeThreadID"] ?: NSNull.null}];
  [self publishLayout];
  return YES;
}

- (void)didRemoveDOMVideo {
  if (!_programmaticMove || !_programmaticMove->suspendedForDOM) return;
  _programmaticMove->suspendedForDOM = false;
  _programmaticMove->startTimestamp = CACurrentMediaTime();
  _programmaticSizeStartTimestamp = _programmaticMove->startTimestamp;
  [_motionDriver startMotionDisplayLink];
}

- (void)registeredHostChanged:(NSString *)identifier animated:(BOOL)animated springParameters:(NSDictionary *)spring {
  OPRegisteredHost *host = _registeredHosts[identifier];
  const BOOL available = [self registeredHostAvailable:host];
  if ([identifier isEqual:@"avatar-overlay"] && [_pendingPlacement isEqual:@"pet"] && available && [self requestPlacement:@"pet"]) return;
  if (![identifier isEqual:@"codex-main-thread"]) { [self layoutForRegisteredHostChange:identifier animated:animated springParameters:spring]; return; }
  const BOOL previous = _codexHomeAvailable;
  _codexHomeAvailable = available && host.codexHomeAvailable;
  if (_layoutInputs) {
    NSMutableDictionary *inputs = [_layoutInputs mutableCopy]; inputs[@"codexHomeAvailable"] = @(_codexHomeAvailable); _layoutInputs = inputs;
  }
  if (!previous && _codexHomeAvailable && [self hideForDOMVideo]) [self emit:@"nativeVideoPresentationUpdateRequested" payload:@{@"threadID": _layoutInputs[@"activeThreadID"] ?: NSNull.null}];
  if ([_pendingPlacement isEqual:@"home"] && available && [self requestPlacement:@"home"]) return;
  if (_layoutInputs && ([_layoutInputs[@"presentationScope"] unsignedIntegerValue] == 0 || [_layoutInputs[@"currentHostID"] isEqual:identifier]) && _codexHomeAvailable && [_layoutInputs[@"codexPlacement"] integerValue] == 1 && _serviceAnchorAlignment.integerValue == 1) {
    NSMutableDictionary *inputs = [_layoutInputs mutableCopy]; inputs[@"codexPlacement"] = @0; _layoutInputs = inputs;
    NSString *active = inputs[@"activeThreadID"];
    if ([active isKindOfClass:NSString.class] && _codexPlacementPreferences[active]) _codexPlacementPreferences[active] = @0;
    [self setServicePresentationScopeFromHost:host]; [self publishLayout];
  }
  if (previous && !_codexHomeAvailable && [_layoutInputs[@"presentationScope"] unsignedIntegerValue] == 0 && [_layoutInputs[@"codexPlacement"] integerValue] == 0) {
    [self reconcileVisiblePresentationsAnimated:NO];
    [self layoutForRegisteredHostChange:identifier animated:NO springParameters:nil];
    return;
  }
  [self layoutForRegisteredHostChange:identifier animated:animated springParameters:spring];
  if (previous != _codexHomeAvailable) [self reconcileVisiblePresentationsAnimated:animated];
}

- (void)layoutForRegisteredHostChange:(NSString *)identifier animated:(BOOL)animated springParameters:(NSDictionary *)spring {
  OPRegisteredHost *host = _registeredHosts[identifier];
  OPRegisteredHost *moveTarget = _programmaticMove ? [self hostForAnchor:_programmaticMove->targetAnchor] : nil;
  if (_programmaticMove && [moveTarget.hostID isEqual:identifier] && [self registeredHostAvailable:host]) {
    NSUInteger index = [self indexForHost:host];
    auto items = [self layoutItems:[self controllerIDs]];
    auto anchors = opencu::pip::anchorsForHost(_nativeHosts[index], index, [_layoutInputs[@"stackDisplayWidth"] doubleValue], opencu::pip::stackRestSize(items, [self visibleLimit]).width);
    auto chosen = opencu::pip::preferredAnchor(anchors, [self currentAlignment]);
    if (!chosen) return;
    auto &move = *_programmaticMove;
    if (move.suspendedForDOM) {
      move.targetAnchor = *chosen;
      move.controlPoint = opencu::pip::programmaticMoveControlPoint(move.startPoint, *chosen, host.codexHomeAvailable);
      move.controlPoint.y = std::min(move.controlPoint.y, move.startPoint.y);
      _targetAnchor = *chosen; _targetAnchor->point = move.startPoint;
    } else if (move.waitingForHostHandoff) {
      move.waitingForHostHandoff = false;
      [self attachToNativeHost:host]; [self synchronizeOrigins];
      move.startPoint = opencu::pip::currentStackAnchorOrDefault(items, [self visibleLimit], [self restAnchor]);
      move.targetAnchor = *chosen;
      move.controlPoint = opencu::pip::programmaticMoveControlPoint(move.startPoint, *chosen, host.codexHomeAvailable);
      move.startTimestamp = CACurrentMediaTime(); move.reachedTarget = false;
      _programmaticSizeStartTimestamp = move.startTimestamp;
      _targetAnchor = *chosen; _targetAnchor->point = move.startPoint;
      [self renderMotionFramesExpanded:YES]; [_motionDriver startMotionDisplayLink];
    } else {
      const auto old = move.targetAnchor;
      if (old.alignment == chosen->alignment && std::hypot(old.point.x - chosen->point.x, old.point.y - chosen->point.y) < 0.5) move.targetAnchor = *chosen;
      else {
        const double now = CACurrentMediaTime();
        const double end = move.startTimestamp + move.duration;
        move.startPoint = _targetAnchor ? _targetAnchor->point : opencu::pip::currentStackAnchorOrDefault(items, [self visibleLimit], [self restAnchor]);
        move.targetAnchor = *chosen;
        move.controlPoint = {(move.startPoint.x + chosen->point.x) * 0.5, (move.startPoint.y + chosen->point.y) * 0.5};
        move.startTimestamp = now; move.duration = std::max(end - now, 1.0 / 60); move.reachedTarget = false;
      }
    }
    [self publishLayout];
    return;
  }
  id currentID = _windowCurrentHostID;
  const BOOL currentChanged = currentID == nil || currentID == NSNull.null || [currentID isEqual:identifier];
  const BOOL available = [self registeredHostAvailable:host];
  if (!currentChanged && !(available && [_unregisteredCurrentHostID isEqual:identifier])) return;
  _unregisteredCurrentHostID = !available && currentChanged ? identifier : nil;
  if ((_dragActive || _resizeActive || _programmaticMove) && [self controllerIDs].count) { _deferredLayout = YES; _deferredAnimated |= animated; return; }
  const auto oldAnchor = _targetAnchor;
  const BOOL wasTransitioning = _hostAlignmentTransition;
  [self layoutAnimated:animated];
  if (animated && spring) {
    auto items = [self layoutItems:[self controllerIDs]];
    auto exits = [self exitingLayoutItems:_exitingPresentations.allKeys];
    opencu::pip::configureMotionSpringsWithParameters(items, exits, {Number(spring[@"damping"], "spring.damping"), Number(spring[@"mass"], "spring.mass"), Number(spring[@"stiffness"], "spring.stiffness")});
    if (!wasTransitioning) _lastHostAnchor = NativePoint(oldAnchor ? oldAnchor->point : _targetAnchor ? _targetAnchor->point : opencu::pip::Point{});
    _hostAlignmentTransition = YES;
  }
}

- (BOOL)requestPlacement:(NSString *)placement {
  NSString *hostID = [placement isEqual:@"pet"] ? @"avatar-overlay" : @"codex-main-thread";
  OPRegisteredHost *host = _registeredHosts[hostID];
  if (![self registeredHostAvailable:host]) {
    _pendingPlacement = placement;
    [self emit:[placement isEqual:@"pet"] ? @"petWakeRequested" : @"codexHostRequested" payload:@{}];
    return NO;
  }
  if ([placement isEqual:@"home"]) {
    NSMutableDictionary *inputs = [_layoutInputs mutableCopy];
    inputs[@"codexPlacement"] = @(!host.codexHomeAvailable);
    NSString *active = inputs[@"activeThreadID"];
    if ([active isKindOfClass:NSString.class] && active.length) _codexPlacementPreferences[active] = inputs[@"codexPlacement"];
    _serviceAnchorAlignment = @1; _preferredAlignment = 1;
    _layoutInputs = inputs;
  }
  if (![self moveToHost:hostID alignment:[placement isEqual:@"home"] ? @1 : nil]) {
    _pendingPlacement = placement;
    [self emit:@"placementMoveDeferred" payload:@{@"placement": placement, @"hostID": hostID}];
    return NO;
  }
  _pendingPlacement = nil;
  return YES;
}

- (NSString *)presentationAtPoint:(NSPoint)point {
  NSString *best = nil; double bestZ = -INFINITY;
  NSArray *ids = [self controllerIDs];
  for (NSUInteger index = 0; index < std::min(ids.count, [self visibleLimit]); ++index) {
    OPPresentation *item = _presentations[ids[index]];
    if (item.positionLayer && NSPointInRect(point, item.currentFrame) && item.positionLayer.zPosition >= bestZ) { best = ids[index]; bestZ = item.positionLayer.zPosition; }
  }
  return best;
}

- (NSString *)resizeHandleAtPoint:(NSPoint)point alignment:(NSInteger *)alignment {
  NSString *best = nil; double bestZ = -INFINITY;
  NSArray *ids = [self controllerIDs];
  for (NSUInteger index = 0; index < std::min(ids.count, [self visibleLimit]); ++index) {
    OPPresentation *item = _presentations[ids[index]];
    if (!item.positionLayer || item.positionLayer.zPosition < bestZ) continue;
    NSRect frame = item.currentFrame;
    NSRect handles[] = {NSMakeRect(NSMaxX(frame)-14, NSMinY(frame),14,14), NSMakeRect(NSMinX(frame),NSMinY(frame),14,14), NSMakeRect(NSMinX(frame),NSMaxY(frame)-14,14,14), NSMakeRect(NSMaxX(frame)-14,NSMaxY(frame)-14,14,14)};
    for (NSInteger corner = 0; corner < 4; ++corner) if (NSPointInRect(point, handles[corner])) { best = ids[index]; bestZ = item.positionLayer.zPosition; if (alignment) *alignment = corner; }
  }
  return best;
}

- (BOOL)acceptsPoint:(NSPoint)point {
  NSPoint screen = [_panel convertPointToScreen:[_panel.contentView convertPoint:point toView:nil]];
  if (NSPointInRect(screen, [[self currentHostForAnchoring] screenInteractionPassthroughFrame])) return NO;
  return [self resizeHandleAtPoint:point alignment:nullptr] || [self presentationAtPoint:point] || [_controls controlIdentifierAtPoint:point];
}

- (void)mouseMovedAtPoint:(NSPoint)point {
  if (!_resizeActive) {
    NSString *hovered = [self presentationAtPoint:point];
    [self setHoveredPresentationID:hovered];
    [_controls updateHoverAtContentPoint:point hasPresentation:hovered != nil resizeHandle:[self resizeHandleAtPoint:point alignment:nullptr] != nil resizing:NO];
  }
  NSInteger alignment = 0;
  if ([self resizeHandleAtPoint:point alignment:&alignment] && ! _dragActive) {
    SEL selector = NSSelectorFromString(@"frameResizeCursorFromPosition:inDirections:");
    if ([NSCursor respondsToSelector:selector]) {
      NSCursor *cursor = ((id (*)(id, SEL, NSInteger, NSUInteger))objc_msgSend)(NSCursor.class, selector, (alignment == 0 || alignment == 2) ? 12 : 6, 3);
      [cursor set];
    }
  } else [NSCursor.arrowCursor set];
}
- (void)setHoveredPresentationID:(NSString *)identifier {
  if ([_hoveredPresentationID isEqual:identifier] || (!_hoveredPresentationID && !identifier)) return;
  [CATransaction begin]; [CATransaction setDisableActions:YES];
  if (_hoveredPresentationID) _presentations[_hoveredPresentationID].hoverLayer.hidden = YES;
  _hoveredPresentationID = [identifier copy];
  if (_hoveredPresentationID) _presentations[_hoveredPresentationID].hoverLayer.hidden = NO;
  [CATransaction commit];
}
- (void)clearHover { [_controls clearHover]; [self setHoveredPresentationID:nil]; }
- (void)mouseExited { [self clearHover]; }

- (NSString *)toolTipAtPoint:(NSPoint)point {
  NSString *control = [_controls controlIdentifierAtPoint:point];
  if ([control isEqual:@"placement"]) return _layoutInputs[@"placementControlToolTip"];
  if (![control isEqual:@"hide"]) return nil;
  OPRegisteredHost *host = _targetAnchor ? [self hostForAnchor:*_targetAnchor] : [self currentHostForAnchoring];
  NSInteger placement = host.presentationScope == 1 ? 2 : [_layoutInputs[@"codexPlacement"] integerValue] ? 1 : 0;
  return placement == 0 ? _controls.hideControlTitle : _layoutInputs[@"closeControlToolTip"];
}

- (void)beginDragAtPoint:(NSPoint)point timestamp:(double)timestamp {
  if (_resizeActive) return;
  _programmaticMove.reset(); _hostAlignmentTransition = NO;
  [self clearHover];
  if (!_motionDriver.running) [self synchronizeOrigins];
  auto items = [self layoutItems:[self controllerIDs]];
  opencu::pip::updateRestOffsetsForAlignment(items, [self visibleLimit], [self currentAlignment], [self restAnchor]);
  NSString *leader = [self presentationAtPoint:point];
  if (!leader) return;
  OPPresentation *item = _presentations[leader];
  NSPoint screen = [_panel convertPointToScreen:[_panel.contentView convertPoint:point toView:nil]];
  _dragLeader = leader; _dragActive = YES; _dragHasMoved = NO;
  _dragInitialPointer = _dragPointer = screen; _dragVelocity = NSZeroPoint; _dragTimestamp = timestamp;
  _dragGrabOffset = NSMakePoint(screen.x - item->motion.origin.x, screen.y - item->motion.origin.y);
  NSUInteger lead = [[self controllerIDs] indexOfObject:leader];
  opencu::pip::configureMotionSprings(items, lead == NSNotFound ? -1 : (std::ptrdiff_t)lead, true, false);
  [self updateDragTarget]; [self renderMotionFramesExpanded:YES]; [_motionDriver startMotionDisplayLink];
}

- (void)mouseDownAtPoint:(NSPoint)point event:(NSEvent *)event {
  (void)event;
  [self mouseMovedAtPoint:point];
  _mouseDownPoint = point;
  NSInteger alignment = 0;
  NSString *resize = [self resizeHandleAtPoint:point alignment:&alignment];
  if (resize) { [self beginResizeWithPresentation:resize alignment:alignment point:point]; return; }
  _pendingControl = [_controls controlIdentifierAtPoint:point];
  if (!_pendingControl) [self beginDragAtPoint:point timestamp:CACurrentMediaTime()];
}

- (void)mouseDraggedAtPoint:(NSPoint)point event:(NSEvent *)event {
  (void)event;
  [self mouseMovedAtPoint:point];
  if (_pendingControl) {
    if (std::hypot(point.x - _mouseDownPoint.x, point.y - _mouseDownPoint.y) < 4) return;
    _pendingControl = nil; [self beginDragAtPoint:_mouseDownPoint timestamp:CACurrentMediaTime()];
  }
  if (_resizeActive) { [self resizeToScreenPoint:[_panel convertPointToScreen:[_panel.contentView convertPoint:point toView:nil]]]; return; }
  if (!_dragActive) return;
  NSPoint screen = NSEvent.mouseLocation;
  const double timestamp = CACurrentMediaTime();
  NSPoint previous = _dragPointer;
  _dragPointer = screen;
  _dragHasMoved |= std::hypot(screen.x - _dragInitialPointer.x, screen.y - _dragInitialPointer.y) >= 4;
  double delta = std::max(timestamp - _dragTimestamp, 1.0 / 240);
  _dragVelocity = NSMakePoint(_dragVelocity.x * 0.72 + ((screen.x - previous.x) / delta) * 0.28, _dragVelocity.y * 0.72 + ((screen.y - previous.y) / delta) * 0.28);
  _dragTimestamp = timestamp; [self updateDragTarget];
  [_motionDriver startMotionDisplayLink];
}

- (void)mouseUpAtPoint:(NSPoint)point event:(NSEvent *)event {
  (void)event;
  if (_resizeActive) {
    [self resizeToScreenPoint:[_panel convertPointToScreen:[_panel.contentView convertPoint:point toView:nil]]];
    [self endResize]; return;
  }
  if (_pendingControl) {
    NSString *control = _pendingControl; _pendingControl = nil;
    if ([control isEqual:[_controls controlIdentifierAtPoint:point]]) [self performControl:control];
    return;
  }
  if (!_dragActive) return;
  NSArray *ids = [self controllerIDs];
  if (!_dragHasMoved && [_dragLeader isEqual:ids.firstObject]) [self emit:@"presentationClickRequested" payload:@{@"threadID": _layoutInputs[@"activeThreadID"] ?: NSNull.null, @"presentationID": _dragLeader}];
  auto items = [self layoutItems:ids];
  const auto current = opencu::pip::currentStackAnchorOrDefault(items, [self visibleLimit], [self restAnchor]);
  auto candidates = [self compatibleAnchors:opencu::pip::includesDragHosts(_dragHasMoved, PipPoint(_dragVelocity))];
  auto chosen = opencu::pip::nearestTargetAnchor(current, PipPoint(_dragVelocity), candidates, _nativeHosts, _currentNativeHost ? std::optional<std::string>{_currentNativeHost.hostID.UTF8String} : std::nullopt, opencu::pip::fallbackAnchor([self restAnchor], std::nullopt)).anchor;
  _dragActive = NO;
  [_controllerOrder removeObject:_dragLeader]; [_controllerOrder insertObject:_dragLeader atIndex:0];
  ids = [self controllerIDs]; items = [self layoutItems:ids];
  _targetAnchor = chosen; _preferredAlignment = chosen.alignment;
  [self attachToNativeHost:[self hostForAnchor:chosen]];
  opencu::pip::updateRestOffsetsForAlignment(items, [self visibleLimit], chosen.alignment, [self restAnchor]);
  opencu::pip::configureMotionSprings(items, 0, false, false);
  for (std::size_t index = 0; index < items.size(); ++index) if (items[index].motion) items[index].motion->velocity = opencu::pip::releaseVelocity(PipPoint(_dragVelocity), index, 0, index == 0);
  _dragLeader = nil;
  [self notifyAnchorCommitted:[self hostForAnchor:chosen] alignment:chosen.alignment];
  [self notifyHostChanged:[self hostForAnchor:chosen]];
  [self renderMotionFramesExpanded:YES]; [_motionDriver startMotionDisplayLink]; [self publishLayout];
}

- (opencu::pip::Point)resizeFixedLocal:(NSSize)size alignment:(NSInteger)alignment {
  if ([self currentAlignment] == 4 || [self currentAlignment] == 5) alignment = [self currentAlignment];
  switch (alignment) {
    case 0: return {0, size.height}; case 1: return {size.width, size.height};
    case 2: return {size.width, 0}; case 3: return {0, 0};
    case 4: return {size.width * 0.5, size.height}; case 5: return {size.width * 0.5, 0};
    default: return {};
  }
}

- (void)beginResizeWithPresentation:(NSString *)identifier alignment:(NSInteger)alignment point:(NSPoint)point {
  OPPresentation *item = _presentations[identifier]; if (!item) return;
  _dragActive = NO; _dragLeader = nil; _programmaticMove.reset(); _hostAlignmentTransition = NO;
  _motionDriver.needsMotion = NO; [_motionDriver stopDisplayLinkIfIdle];
  [self clearHover]; [self synchronizeOrigins];
  auto items = [self layoutItems:[self controllerIDs]];
  opencu::pip::updateRestOffsetsForAlignment(items, [self visibleLimit], [self currentAlignment], [self restAnchor]);
  OPRegisteredHost *host = [self currentHostForAnchoring];
  _targetAnchor = opencu::pip::Anchor{opencu::pip::currentStackAnchorOrDefault(items, [self visibleLimit], [self restAnchor]), (std::uint64_t)[self currentAlignment], host ? std::optional<std::size_t>{[self indexForHost:host]} : std::nullopt};
  _resizeActive = YES; _resizeLeader = identifier; _resizeAlignment = alignment;
  _resizeChangedMaximum = NO; _resizePreviewWasActiveAtStart = _resizePreviewScalingActive; _resizeReleaseReconcileActive = NO;
  _resizeInitialPointer = [_panel convertPointToScreen:[_panel.contentView convertPoint:point toView:nil]];
  _resizeInitialMaximum = std::max(item.displaySize.width, item.displaySize.height);
  auto fixed = [self resizeFixedLocal:item.displaySize alignment:alignment];
  _resizeFixedScreenPoint = NativePoint(opencu::pip::snapPointToBackingScale({item->motion.origin.x + fixed.x, item->motion.origin.y + fixed.y}, _panel.backingScaleFactor));
  _resizeFixedScreenPointValid = YES; _envelopeState.resizeFrozenEnvelope.reset();
  _resizeLayoutAnchor.reset();
  [self renderMotionFramesExpanded:YES];
}

- (void)setResizePreviewScalingActive:(BOOL)active {
  if (_resizePreviewScalingActive == active) return;
  _resizePreviewScalingActive = active;
  for (NSString *identifier in [self controllerIDs]) _presentations[identifier].attachment.hostedContentScaling = active ? 1 : 0;
  for (OPPresentation *item in _exitingPresentations.allValues) item.attachment.hostedContentScaling = active ? 1 : 0;
}

- (void)resizeToScreenPoint:(NSPoint)point {
  if (!_resizeActive) return;
  const double sign = _resizeAlignment == 2 || _resizeAlignment == 3 || _resizeAlignment == 5 ? 1 : -1;
  double maximum = [self normalizedMaximumDisplaySize:std::fmax(_resizeInitialMaximum + sign * (point.y - _resizeInitialPointer.y), 100.0)];
  if (std::abs(maximum - [_layoutInputs[@"maxDisplaySize"] doubleValue]) < 0.5) return;
  NSMutableDictionary *inputs = [_layoutInputs mutableCopy]; inputs[@"maxDisplaySize"] = @(maximum); _layoutInputs = inputs;
  NSArray *ids = [self controllerIDs];
  for (OPPresentation *item in _presentations.allValues) item.displaySize = DisplaySize(item.contentAspectSize, maximum);
  for (OPPresentation *item in _exitingPresentations.allValues) item.displaySize = DisplaySize(item.contentAspectSize, maximum);
  auto items = [self layoutItems:ids];
  opencu::pip::updateRestOffsetsForAlignment(items, [self visibleLimit], [self currentAlignment], [self restAnchor]);
  OPPresentation *leader = _presentations[_resizeLeader];
  auto fixed = [self resizeFixedLocal:leader.displaySize alignment:_resizeAlignment];
  auto anchor = opencu::pip::snapPointToBackingScale({_resizeFixedScreenPoint.x - fixed.x - leader->motion.restOffset.x, _resizeFixedScreenPoint.y - fixed.y - leader->motion.restOffset.y}, _panel.backingScaleFactor);
  _resizeLayoutAnchor = anchor;
  for (auto &input : items) if (input.motion) opencu::pip::placeMotionAtAnchor(*input.motion, anchor);
  [self renderMotionFramesExpanded:YES];
  _resizeChangedMaximum = YES;
  [self setResizePreviewScalingActive:YES];
}

- (void)endResize {
  if (!_resizeActive) return;
  NSString *leader = _resizeLeader;
  const double maximum = [_layoutInputs[@"maxDisplaySize"] doubleValue];
  const double delta = std::abs(maximum - _resizeInitialMaximum);
  _resizeActive = NO; _resizeLeader = nil; _envelopeState.resizeFrozenEnvelope.reset();
  if (_resizeFixedScreenPointValid && _panel) {
    _resizeLayoutAnchor.reset(); _resizeFixedScreenPointValid = NO;
    if ([self currentAlignment] != 4 && [self currentAlignment] != 5) {
      NSArray *ids = [self controllerIDs];
      auto items = [self layoutItems:ids];
      if (!_targetAnchor) {
        OPRegisteredHost *host = [self currentHostForAnchoring];
        _targetAnchor = opencu::pip::Anchor{opencu::pip::currentStackAnchorOrDefault(items, [self visibleLimit], [self restAnchor]), (std::uint64_t)[self currentAlignment], host ? std::optional<std::size_t>{[self indexForHost:host]} : std::nullopt};
      }
      opencu::pip::updateRestOffsetsForAlignment(items, [self visibleLimit], [self currentAlignment], [self restAnchor]);
      NSUInteger lead = [ids indexOfObject:leader];
      opencu::pip::configureMotionSprings(items, lead == NSNotFound ? 0 : (std::ptrdiff_t)lead, false, false);
      _resizeReleaseReconcileActive = YES;
      _motionDriver.needsMotion = YES; [_motionDriver startDisplayLink];
    }
  }
  if (delta >= 0.5) {
    _lastNotifiedMaximum = maximum;
    [self emit:@"maxDisplaySizeChanged" payload:@{@"maxDisplaySize": @(maximum)}];
    for (NSString *identifier in [self controllerIDs]) {
      OPPresentation *item = _presentations[identifier];
      [self emit:@"producerDisplaySizeRequested" payload:@{@"identity": item.identity, @"contextID": @(item.contextID), @"sourceGeneration": @(item.sourceGeneration), @"displaySize": SizeValue(item.displaySize), @"atomicPrepareAvailable": @NO}];
    }
  } else if (_resizeChangedMaximum && !_resizePreviewWasActiveAtStart) [self setResizePreviewScalingActive:NO];
  _resizeChangedMaximum = NO;
  if (_resizeReleaseReconcileActive) return;
  BOOL animated = _deferredLayout ? _deferredAnimated : YES;
  _deferredLayout = _deferredAnimated = NO; [self layoutAnimated:animated];
}

- (void)performControl:(NSString *)identifier {
  if ([identifier isEqual:@"placement"]) {
    [self requestPlacement:@"pet"];
  } else if ([identifier isEqual:@"hide"]) {
    OPRegisteredHost *host = _targetAnchor ? [self hostForAnchor:*_targetAnchor] : [self currentHostForAnchoring];
    NSInteger placement = host.presentationScope == 1 ? 2 : [_layoutInputs[@"codexPlacement"] integerValue] ? 1 : 0;
    if (placement != 0) { [self requestPlacement:@"home"]; return; }
    NSString *taskTitle = _layoutInputs[@"hideForTaskMenuTitle"], *allTitle = _layoutInputs[@"hideForAllActiveTasksMenuTitle"];
    if (![taskTitle isKindOfClass:NSString.class] || ![allTitle isKindOfClass:NSString.class]) { [self emit:@"hideMenuLocalizationRequested" payload:@{}]; return; }
    NSMenu *menu = [[NSMenu alloc] initWithTitle:_controls.hideControlTitle ?: @""];
    NSMenuItem *task = [[NSMenuItem alloc] initWithTitle:taskTitle action:@selector(hideForTaskMenuItemSelected:) keyEquivalent:@""];
    task.target = self; [menu addItem:task];
    NSMenuItem *all = [[NSMenuItem alloc] initWithTitle:allTitle action:@selector(hideForAllActiveTasksMenuItemSelected:) keyEquivalent:@""];
    all.target = self; [menu addItem:all];
    [menu popUpMenuPositioningItem:nil atLocation:_controls.hideControlFrame.origin inView:_controlPanel.contentView];
  }
}

- (void)hideForTaskMenuItemSelected:(id)sender {
  (void)sender;
  NSString *active = _layoutInputs[@"activeThreadID"];
  if ([active isKindOfClass:NSString.class] && active.length) [self emit:@"visibilityRequested" payload:@{@"kind": @"hide-for-task", @"threadIDs": @[active]}];
}

- (void)hideForAllActiveTasksMenuItemSelected:(id)sender {
  (void)sender;
  NSMutableOrderedSet *threads = NSMutableOrderedSet.orderedSet;
  for (NSString *identifier in _publicationOrder) {
    NSString *thread = _presentations[identifier].identity[@"threadID"];
    if (thread.length) [threads addObject:thread];
  }
  if (threads.count) [self emit:@"visibilityRequested" payload:@{@"kind": @"hide-for-all-active-tasks", @"threadIDs": threads.array}];
}

- (void)completeRemovalOfItem:(OPPresentation *)item {
  if (item.removalFinished) return;
  NSString *presentationID = item.identity[@"presentationID"];
  [item.completionEffect stop];
  item.completionEffect = nil;
  [item stopAppearance];
  [CATransaction begin]; [CATransaction setDisableActions:YES];
  [item.positionLayer removeFromSuperlayer];
  [item.attachment detach];
  [CATransaction commit]; [CATransaction flush];
  item.attachment = nil;
  item.positionLayer = nil; item.appearanceLayer = nil; item.shadowLayer = nil; item.hoverLayer = nil;
  if (_exitingPresentations[presentationID] == item) [_exitingPresentations removeObjectForKey:presentationID];
  item.removalFinished = YES;
  if (!_closed) {
    @try {
      try { [self layoutAnimated:item.removalAnimated]; }
      catch (const std::exception &error) { [self emit:@"nativeHostLayoutFailed" payload:@{@"message": @(error.what())}]; }
    } @catch (NSException *exception) { [self emit:@"nativeHostLayoutFailed" payload:@{@"message": exception.reason ?: @"Native layout failed"}]; }
  }
  NSMutableDictionary *payload = [item.removalPayload mutableCopy];
  payload[@"surfaceDetached"] = @YES;
  _retiredIdentities[presentationID] = [payload copy];
  [self emit:@"presentationRemoved" payload:payload];
  item.removalPayload = nil;
}

- (void)removeItem:(OPPresentation *)item reason:(NSString *)reason {
  NSString *presentationID = item.identity[@"presentationID"];
  if (_presentations[presentationID] != item) return;
  const BOOL animated = ![reason isEqual:@"turn-invalidated"] && ![reason isEqual:@"host-closed"];
  const BOOL visible = !item.positionLayer.hidden;
  if (item.completionTimer) { dispatch_source_cancel(item.completionTimer); item.completionTimer = nil; }
  if ([_hoveredPresentationID isEqual:presentationID]) [self setHoveredPresentationID:nil];
  if ([_dragLeader isEqual:presentationID]) { _dragLeader = nil; _dragActive = NO; }
  if ([_resizeLeader isEqual:presentationID]) { _resizeLeader = nil; _resizeActive = NO; _resizeFixedScreenPointValid = NO; _resizeLayoutAnchor.reset(); _envelopeState.resizeFrozenEnvelope.reset(); }
  auto appearance = opencu::pip::appearanceAnchorPoint([self currentAlignment]);
  [item setAppearanceAnchorPoint:NativePoint(appearance)];
  if (!item->motion.initialized) {
    auto items = [self layoutItems:[self controllerIDs]];
    const auto anchor = opencu::pip::currentStackAnchorOrDefault(items, [self visibleLimit], [self restAnchor]);
    item->motion.origin = {item.currentFrame.origin.x + _panel.frame.origin.x, item.currentFrame.origin.y + _panel.frame.origin.y};
    item->motion.restOffset = {item->motion.origin.x - anchor.x, item->motion.origin.y - anchor.y};
    item->motion.target = item->motion.origin; item->motion.initialized = true;
  }
  NSMutableDictionary *payload = [item.identity mutableCopy];
  payload[@"sourceGeneration"] = @(item.sourceGeneration); payload[@"contextID"] = @(item.contextID);
  payload[@"reason"] = reason; payload[@"surfaceDetached"] = @NO;
  item.removalPayload = payload; item.removalAnimated = animated; _retiredIdentities[presentationID] = [payload copy];
  _exitingPresentations[presentationID] = item;
  [_presentations removeObjectForKey:presentationID]; [_publicationOrder removeObject:presentationID]; [_controllerOrder removeObject:presentationID];
  if (!animated) { [self completeRemovalOfItem:item]; return; }
  [self layoutAnimated:YES]; [self publishLayout];
  __weak OPHost *weakSelf = self;
  dispatch_block_t completion = ^{
    OPHost *host = weakSelf;
    if (!host || item.removalFinished || host.exitingPresentations[presentationID] != item) return;
    @try {
      try { [host completeRemovalOfItem:item]; }
      catch (const std::exception &error) { [host emit:@"nativeRemovalFailed" payload:@{@"identity": item.identity, @"message": @(error.what())}]; }
    } @catch (NSException *exception) { [host emit:@"nativeRemovalFailed" payload:@{@"identity": item.identity, @"message": exception.reason ?: @"Native removal failed"}]; }
  };
  if (visible) [item animateOutWithCompletion:completion];
  else dispatch_async(dispatch_get_main_queue(), completion);
  dispatch_after(dispatch_time(DISPATCH_TIME_NOW, 2 * NSEC_PER_SEC), dispatch_get_main_queue(), completion);
}

- (OPPresentation *)presentationForNativeOperation:(NSDictionary *)payload {
  NSString *identifier = String(payload[@"presentationID"], "presentationID");
  NSString *threadID = String(payload[@"threadID"], "threadID");
  NSString *turnID = String(payload[@"turnID"], "turnID");
  uint32_t generation = Unsigned(payload[@"sourceGeneration"], "sourceGeneration");
  NSDictionary *source = Dictionary(payload[@"source"], "source");
  OPPresentation *item = _presentations[identifier];
  return item && item.sourceGeneration == generation && [item.identity[@"threadID"] isEqual:threadID] && [item.identity[@"turnID"] isEqual:turnID] && [item.identity[@"source"] isEqual:source] ? item : nil;
}

// The authenticated Mach receiver, not a JSON command, supplies the real right.
- (NSDictionary *)prepareNativeOperation:(NSDictionary *)payload sendRight:(CUMachSendRight *)sendRight {
  @try {
    try {
  [self requireLiveOwner];
  Dictionary(payload, "native operation");
  CUMachSendRight *right __attribute__((objc_precise_lifetime)) = sendRight;
  const mach_port_t fencePort = right.port;
  const uint64_t operationID = NativeOperationID(payload[@"operationID"]);
  OPPresentation *item = [self presentationForNativeOperation:payload];
  if (!item) return @{@"accepted": @NO, @"reason": @"presentation-identity-mismatch"};
  if (!fencePort) return @{@"accepted": @NO, @"reason": @"fence-send-right-unavailable"};
  if (item.pendingOperationID || operationID != item.lastCompletedOperationID + 1) return @{@"accepted": @NO, @"reason": @"operation-sequence-mismatch"};
  const uint32_t expectedContextID = Unsigned(payload[@"expectedContextID"], "expectedContextID");
  const uint32_t contextID = Unsigned(payload[@"contextID"], "contextID");
  if (item.contextID != expectedContextID) return @{@"accepted": @NO, @"reason": @"context-generation-mismatch"};
  NSString *kind = String(payload[@"kind"], "kind");
  const BOOL replacing = [kind isEqual:@"replace-context"];
  const BOOL inProgress = [kind isEqual:@"resize-in-progress"];
  if (!replacing && !inProgress && ![kind isEqual:@"resize"]) return @{@"accepted": @NO, @"reason": @"unsupported-operation-kind"};
  if ((replacing && contextID == item.contextID) || (!replacing && contextID != item.contextID)) return @{@"accepted": @NO, @"reason": @"operation-context-mismatch"};
  const NSSize source = NSMakeSize(Number(payload[@"width"], "width"), Number(payload[@"height"], "height"));
  if (source.width <= 0 || source.height <= 0) return @{@"accepted": @NO, @"reason": @"invalid-source-size"};
  if (inProgress) {
    if (![item.attachment prepareResizeWithFencePort:fencePort]) return @{@"accepted": @NO, @"reason": @"attachment-prepare-unavailable"};
    item.contentAspectSize = source;
  } else {
    const NSSize display = DisplaySize(source, _layoutInputs ? [_layoutInputs[@"maxDisplaySize"] doubleValue] : 200);
    if (![item.attachment prepareWithContextID:contextID displaySize:display replaceContext:replacing fencePort:fencePort]) return @{@"accepted": @NO, @"reason": @"attachment-prepare-unavailable"};
    [self setResizePreviewScalingActive:NO];
    item.contentAspectSize = source;
    item.displaySize = display;
    [self layoutAnimated:YES];
    item.contextID = contextID;
    item.sourceSize = source;
  }
  item.pendingOperationID = operationID;
  return @{@"accepted": @YES, @"identity": item.identity, @"presentationID": item.identity[@"presentationID"], @"sourceGeneration": @(item.sourceGeneration), @"contextID": @(item.contextID), @"operationID": @(operationID)};
    } catch (const std::exception &error) {
      return @{@"accepted": @NO, @"reason": @"invalid-native-operation", @"message": @(error.what())};
    }
  } @catch (NSException *exception) {
    return @{@"accepted": @NO, @"reason": @"native-operation-failed", @"message": exception.reason ?: @"Native operation failed"};
  }
}

- (NSDictionary *)completeNativeOperation:(NSDictionary *)payload {
  @try {
    try {
  [self requireLiveOwner];
  Dictionary(payload, "native operation");
  const uint64_t operationID = NativeOperationID(payload[@"operationID"]);
  OPPresentation *item = [self presentationForNativeOperation:payload];
  if (!item) return @{@"accepted": @NO, @"reason": @"presentation-identity-mismatch"};
  if (item.contextID != Unsigned(payload[@"contextID"], "contextID") || item.pendingOperationID != operationID) return @{@"accepted": @NO, @"reason": @"pending-operation-mismatch"};
  item.pendingOperationID = 0;
  item.lastCompletedOperationID = operationID;
  return @{@"accepted": @YES, @"identity": item.identity, @"presentationID": item.identity[@"presentationID"], @"sourceGeneration": @(item.sourceGeneration), @"contextID": @(item.contextID), @"operationID": @(operationID)};
    } catch (const std::exception &error) {
      return @{@"accepted": @NO, @"reason": @"invalid-native-operation", @"message": @(error.what())};
    }
  } @catch (NSException *exception) {
    return @{@"accepted": @NO, @"reason": @"native-operation-failed", @"message": exception.reason ?: @"Native operation failed"};
  }
}

- (NSDictionary *)command:(NSDictionary *)command {
  [self requireLiveOwner];
  NSDictionary *sender = Dictionary(command[@"senderContext"], "senderContext");
  if (Unsigned(sender[@"senderID"], "senderID") != _senderID || Unsigned(sender[@"senderGeneration"], "senderGeneration") != _senderGeneration || ![String(sender[@"hostToken"], "hostToken") isEqual:_token]) throw std::runtime_error("Native presentation sender context is stale or does not own this host.");
  NSString *operation = String(command[@"operation"], "operation");
  NSDictionary *payload = Dictionary(command[@"payload"], "payload");
  if ([operation isEqual:@"openProducerChannel"]) {
    NSDictionary *identity = Dictionary(payload[@"identity"], "identity");
    NSString *presentationID = String(identity[@"presentationID"], "presentationID");
    if (_producerChannels[presentationID] || _presentations[presentationID] || _retiredIdentities[presentationID]) throw std::runtime_error("This native source identity already has an owner.");
    NSError *error;
    __weak OPHost *weakSelf = self;
    OPProducerChannel *channel = [[OPProducerChannel alloc] initWithIdentity:identity expectedProducer:Dictionary(payload[@"producer"], "producer") operationHandler:^NSDictionary *(NSString *nativeOperation, NSDictionary *nativePayload, CUMachSendRight *right) {
      OPHost *host = weakSelf;
      if (!host || host.closed) return @{@"accepted": @NO, @"reason": @"host-closed"};
      @try {
        try {
          if ([nativeOperation isEqual:@"prepareOperation"]) return [host prepareNativeOperation:nativePayload sendRight:right];
          if ([nativeOperation isEqual:@"completeOperation"]) return [host completeNativeOperation:nativePayload];
          return [host command:@{@"operation": nativeOperation, @"payload": nativePayload, @"senderContext": @{@"senderID": @(host.senderID), @"senderGeneration": @(host.senderGeneration), @"hostToken": host.token}}];
        } catch (const std::exception &failure) { return @{@"accepted": @NO, @"reason": @"native-operation-failed", @"message": @(failure.what())}; }
      } @catch (NSException *failure) { return @{@"accepted": @NO, @"reason": @"native-operation-failed", @"message": failure.reason ?: @"Native source operation failed"}; }
    } errorHandler:^(NSError *failure) {
      OPHost *host = weakSelf;
      if (host && !host.closed) [host emit:@"producerChannelFailed" payload:@{@"identity": identity, @"error": failure.localizedDescription ?: @"Native producer channel failed"}];
    } error:&error];
    if (!channel) throw std::runtime_error(error.localizedDescription.UTF8String ?: "Unable to create the native producer channel.");
    _producerChannels[presentationID] = channel;
    [channel startWithCompletion:^(NSDictionary *endpoint, NSError *failure) {
      OPHost *host = weakSelf;
      if (!host || host.closed || host.producerChannels[presentationID] != channel) { [channel closeCarrier]; return; }
      [host emit:failure ? @"producerChannelFailed" : @"producerChannelReady" payload:failure ? @{@"identity": identity, @"error": failure.localizedDescription ?: @"Native producer channel failed"} : @{@"identity": identity, @"hostEndpoint": endpoint}];
    }];
    return @{@"accepted": @YES};
  }
  if ([operation isEqual:@"cancelProducerChannel"]) {
    NSDictionary *identity = Dictionary(payload[@"identity"], "identity");
    NSString *presentationID = String(identity[@"presentationID"], "presentationID");
    OPProducerChannel *channel = _producerChannels[presentationID];
    if (!channel) return @{@"accepted": @(_presentations[presentationID] == nil && _retiredIdentities[presentationID] == nil)};
    if (![channel.identity isEqual:identity]) return @{@"accepted": @NO};
    NSError *error;
    if (![channel cancelReservation:&error]) return @{@"accepted": @NO, @"reason": error.localizedDescription ?: @"The producer channel is already bound."};
    [_producerChannels removeObjectForKey:presentationID];
    return @{@"accepted": @YES};
  }
  if ([operation isEqual:@"retireExitedProducerChannel"]) {
    NSDictionary *identity = Dictionary(payload[@"identity"], "identity");
    NSString *presentationID = String(identity[@"presentationID"], "presentationID");
    OPProducerChannel *channel = _producerChannels[presentationID];
    if (!channel || ![channel.identity isEqual:identity]) throw std::runtime_error("The producer channel identity is stale or has no owner.");
    NSError *error = nil;
    NSDictionary *state = [channel retireExitedProducer:&error];
    if (!state || error) throw std::runtime_error(error.localizedDescription.UTF8String ?: "Unable to retire the exited producer channel.");
    return state;
  }
  if ([operation isEqual:@"forgetProducerChannel"]) {
    NSDictionary *identity = Dictionary(payload[@"identity"], "identity");
    NSString *presentationID = String(identity[@"presentationID"], "presentationID");
    OPProducerChannel *channel = _producerChannels[presentationID];
    if (!channel || ![channel.identity isEqual:identity] || _presentations[presentationID]) return @{@"accepted": @NO};
    NSDictionary *state = [channel snapshot];
    if (![state[@"closed"] boolValue] || ![state[@"surfaceDetached"] boolValue]) return @{@"accepted": @NO};
    [_producerChannels removeObjectForKey:presentationID];
    return @{@"accepted": @YES};
  }
  if ([operation isEqual:@"publishEncodedFrame"]) {
    NSString *presentationID = String(payload[@"presentationID"], "presentationID");
    OPProducerChannel *channel = _producerChannels[presentationID];
    OPPresentation *item = _presentations[presentationID];
    if (!channel || !item || ![channel validateFrameIdentity:payload] || item.contextID != channel.currentContextID) return @{@"accepted": @NO};
    if (![_enabledThreads containsObject:item.identity[@"threadID"]]) return @{@"accepted": @YES, @"forwarded": @NO};
    NSString *codec = String(payload[@"codec"], "codec");
    if (![codec isEqual:@"hvc1.1.6.L93.B0"]) throw std::runtime_error("Unsupported native frame codec.");
    String(payload[@"videoData"], "videoData");
    if (payload[@"decoderConfiguration"] != NSNull.null) String(payload[@"decoderConfiguration"], "decoderConfiguration");
    if (Number(payload[@"timestamp"], "timestamp") < 0) throw std::runtime_error("Native frame timestamp must not be negative.");
    ReadBoolean(payload[@"isKeyFrame"], "isKeyFrame");
    [self emit:@"nativeVideoFrame" payload:payload];
    return @{@"accepted": @YES, @"presentationID": presentationID};
  }
  if ([operation isEqual:@"registerNativeHost"]) {
    NSString *hostID = String(payload[@"hostID"], "hostID");
    NSWindow *owner = payload[@"nativeOwner"];
    if (![owner isKindOfClass:NSWindow.class] || owner.miniaturized || !owner.contentView || owner == _panel || owner == _controlPanel || ![NSApp.windows containsObject:owner]) throw std::runtime_error("Host registration requires a real, non-miniaturized owner window.");
    NSRect contentRect = ReadRect(payload[@"anchorContentRect"], "anchorContentRect");
    NSRect passthrough = ReadRect(payload[@"interactionPassthroughContentRect"], "interactionPassthroughContentRect");
    if (contentRect.size.width < 0 || contentRect.size.height < 0 || passthrough.size.width < 0 || passthrough.size.height < 0) throw std::runtime_error("Host content rectangles must have nonnegative sizes.");
    if (![payload[@"anchors"] isKindOfClass:NSArray.class]) throw std::runtime_error("Host anchors must be an array.");
    for (id value in payload[@"anchors"]) {
      NSDictionary *anchor = Dictionary(value, "anchor");
      ReadPoint(anchor[@"contentPoint"], "contentPoint");
      if (Unsigned(anchor[@"alignment"], "alignment", true) > 5) throw std::runtime_error("Host anchor alignment is unsupported.");
    }
    BOOL home = ReadBoolean(payload[@"codexHomeAvailable"], "codexHomeAvailable");
    NSDictionary *spring = nil;
    if (payload[@"springParameters"] && payload[@"springParameters"] != NSNull.null) {
      spring = Dictionary(payload[@"springParameters"], "springParameters");
      Number(spring[@"damping"], "spring.damping"); Number(spring[@"stiffness"], "spring.stiffness");
      if (Number(spring[@"mass"], "spring.mass") <= 0) throw std::runtime_error("Native spring mass must be positive.");
    }
    OPRegisteredHost *registered = [OPRegisteredHost new];
    registered.hostID = hostID; registered.owner = owner;
    registered.anchorContentRect = [NSValue valueWithRect:contentRect];
    registered.interactionPassthroughContentRect = [NSValue valueWithRect:passthrough];
    registered.anchors = [payload[@"anchors"] copy];
    registered.presentationScope = Unsigned(payload[@"presentationScope"], "presentationScope", true);
    registered.codexHomeAvailable = home;
    _registeredHosts[hostID] = registered;
    [self indexForHost:registered];
    [self registeredHostChanged:hostID animated:payload[@"animated"] ? ReadBoolean(payload[@"animated"], "animated") : NO springParameters:spring];
    return @{@"accepted": @YES, @"hostID": hostID};
  }
  if ([operation isEqual:@"unregisterNativeHost"]) {
    NSString *hostID = String(payload[@"hostID"], "hostID");
    [_registeredHosts removeObjectForKey:hostID];
    [self emit:@"nativeHostUnregistered" payload:@{@"hostID": hostID}];
    [self registeredHostChanged:hostID animated:NO springParameters:nil];
    return @{@"accepted": @YES};
  }
  if ([operation isEqual:@"moveStackToHost"]) {
    NSString *hostID = String(payload[@"hostID"], "hostID");
    NSNumber *alignment = nil;
    if (payload[@"alignment"] && payload[@"alignment"] != NSNull.null) {
      if (Unsigned(payload[@"alignment"], "alignment", true) > 5) throw std::runtime_error("Unsupported native anchor alignment.");
      alignment = payload[@"alignment"];
    }
    BOOL accepted = [self moveToHost:hostID alignment:alignment];
    if (!accepted) [self emit:@"nativeHostRequested" payload:@{@"hostID": hostID}];
    return @{@"accepted": @(accepted), @"isMovingToAnchor": @(_programmaticMove.has_value())};
  }
  if ([operation isEqual:@"setPreferredAnchorAlignment"]) {
    if (payload[@"alignment"] == NSNull.null) _preferredAlignment.reset();
    else { uint32_t alignment = Unsigned(payload[@"alignment"], "alignment", true); if (alignment > 5) throw std::runtime_error("Unsupported native anchor alignment."); _preferredAlignment = alignment; }
    [self layoutAnimated:NO]; return @{@"accepted": @YES};
  }
  if ([operation isEqual:@"setMaxDisplaySize"]) {
    if (!_layoutInputs) throw std::runtime_error("A native layout must be configured before changing its maximum display size.");
    double maximum = [self normalizedMaximumDisplaySize:Number(payload[@"maxDisplaySize"], "maxDisplaySize")];
    BOOL animated = ReadBoolean(payload[@"animated"], "animated");
    [self applyMaximumDisplaySize:maximum animated:animated];
    return @{@"accepted": @YES, @"maxDisplaySize": _layoutInputs[@"maxDisplaySize"]};
  }
  if ([operation isEqual:@"requestPlacement"]) {
    NSString *placement = String(payload[@"placement"], "placement");
    if (![placement isEqual:@"home"] && ![placement isEqual:@"pet"]) throw std::runtime_error("Native placement must be home or pet.");
    [self requestPlacement:placement];
    return @{@"accepted": @YES, @"pending": @(_pendingPlacement != nil || (_programmaticMove && (_programmaticMove->waitingForHostHandoff || _programmaticMove->suspendedForDOM)))};
  }
  if ([operation isEqual:@"interactWithPresentation"]) {
    NSString *presentationID = String(payload[@"presentationID"], "presentationID");
    NSString *threadID = String(payload[@"threadID"], "threadID");
    BOOL isLead = ReadBoolean(payload[@"isLead"], "isLead");
    OPPresentation *item = _presentations[presentationID];
    if (!item || ![item.identity[@"threadID"] isEqual:threadID] || ![[self controllerIDs] containsObject:presentationID]) return @{@"accepted": @NO};
    if (isLead && [[self controllerIDs].firstObject isEqual:presentationID]) [self emit:@"presentationClickRequested" payload:@{@"threadID": threadID, @"presentationID": presentationID}];
    [_controllerOrder removeObject:presentationID]; [_controllerOrder insertObject:presentationID atIndex:0];
    [self layoutAnimated:YES]; return @{@"accepted": @YES};
  }
  if ([operation isEqual:@"publishRemotePresentation"]) {
    NSString *presentationID = String(payload[@"presentationID"], "presentationID");
    NSString *threadID = String(payload[@"threadID"], "threadID");
    NSString *turnID = String(payload[@"turnID"], "turnID");
    NSDictionary *source = Dictionary(payload[@"source"], "source");
    String(source[@"targetId"], "source.targetId");
    String(source[@"viewId"], "source.viewId");
    String(source[@"processIdentity"], "source.processIdentity");
    Unsigned(source[@"pid"], "source.pid");
    Unsigned(source[@"windowId"], "source.windowId");
    uint32_t contextID = Unsigned(payload[@"contextID"], "contextID");
    uint32_t generation = Unsigned(payload[@"sourceGeneration"], "sourceGeneration");
    NSSize sourceSize = ReadSize(payload[@"sourceSize"], "sourceSize");
    if (sourceSize.width <= 0 || sourceSize.height <= 0) throw std::runtime_error("A remote presentation source size must be positive and finite.");
    BOOL contributes = ReadBoolean(payload[@"contributesToStackLayout"], "contributesToStackLayout");
    if ([_invalidatedTurns[threadID] containsObject:turnID]) return @{@"accepted": @NO};
    if (_retiredIdentities[presentationID]) throw std::runtime_error("A terminated presentation ID cannot be reused.");
    if (_presentations[presentationID]) throw std::runtime_error("The remote presentation ID already exists.");
    for (OPPresentation *completed in [_presentations.allValues copy]) {
      if (completed.completed && [completed.identity[@"threadID"] isEqual:threadID]) [self removeItem:completed reason:@"completed-cleared"];
    }
    double maximum = _layoutInputs ? [_layoutInputs[@"maxDisplaySize"] doubleValue] : 200;
    NSSize display = DisplaySize(sourceSize, maximum);
    OPPresentation *item = [[OPPresentation alloc] initWithParentLayer:_panel.contentView.layer displaySize:display];
    OPRemoteAttachment *attachment = [[OPRemoteAttachment alloc] initWithParent:item.shadowLayer frame:NSMakeRect(0, 0, display.width, display.height) contextID:contextID];
    if (!attachment) { [item.positionLayer removeFromSuperlayer]; [CATransaction flush]; throw std::runtime_error("The remote CoreAnimation attachment is unavailable."); }
    item.positionLayer.hidden = YES;
    attachment.hostedContentScaling = _resizePreviewScalingActive ? 1 : 0;
    item.identity = @{@"presentationID": presentationID, @"threadID": threadID, @"turnID": turnID, @"source": [source copy]};
    item.attachment = attachment;
    [item configureContentLayer];
    item.sourceGeneration = generation;
    item.contextID = contextID;
    item.sourceSize = sourceSize;
    item.contentAspectSize = sourceSize;
    item.displaySize = display;
    item.contributes = contributes;
    item.applicationIcon = ApplicationIconForSource(source);
    _presentations[presentationID] = item;
    [_publicationOrder addObject:presentationID];
    [self emit:@"presentationPublished" payload:@{@"identity": item.identity, @"contextID": @(contextID), @"sourceGeneration": @(generation)}];
    [self applyLayout];
    [item animateIn];
    return @{@"accepted": @YES, @"presentationID": presentationID, @"sourceGeneration": @(generation)};
  }
  if ([operation isEqual:@"configureLayout"]) {
    NullableString(payload[@"activeThreadID"], "activeThreadID");
    NullableString(payload[@"currentHostID"], "currentHostID");
    uint32_t alignment = Unsigned(payload[@"currentAlignment"], "currentAlignment", true);
    if (alignment > 5) throw std::runtime_error("Unsupported native stack alignment.");
    Unsigned(payload[@"codexPlacement"], "codexPlacement", true);
    Unsigned(payload[@"presentationScope"], "presentationScope", true);
    Unsigned(payload[@"visibleStackItemLimit"], "visibleStackItemLimit", true);
    double maximum = [self normalizedMaximumDisplaySize:Number(payload[@"maxDisplaySize"], "maxDisplaySize")];
    if (Number(payload[@"stackDisplayWidth"], "stackDisplayWidth") < 0 || Number(payload[@"stackDisplayHeight"], "stackDisplayHeight") < 0) throw std::runtime_error("Native stack display size cannot be negative.");
    if (payload[@"isMovingToAnchor"]) ReadBoolean(payload[@"isMovingToAnchor"], "isMovingToAnchor");
    ReadBoolean(payload[@"homeHandoffPending"], "homeHandoffPending");
    ReadBoolean(payload[@"codexHomeAvailable"], "codexHomeAvailable");
    for (NSString *key in @[@"hideControlTitle", @"hideForTaskMenuTitle", @"hideForAllActiveTasksMenuTitle", @"placementControlToolTip", @"closeControlToolTip"]) if (payload[key]) String(payload[key], key.UTF8String);
    NSMutableDictionary *inputs = [payload mutableCopy];
    inputs[@"maxDisplaySize"] = @(maximum);
    OPRegisteredHost *homeHost = _registeredHosts[@"codex-main-thread"];
    _codexHomeAvailable = [self registeredHostAvailable:homeHost] && homeHost.codexHomeAvailable;
    inputs[@"codexHomeAvailable"] = @(_codexHomeAvailable);
    _serviceAnchorAlignment = @(alignment);
    _layoutInputs = inputs;
    _lastNotifiedMaximum = maximum;
    if (payload[@"hideControlTitle"]) _controls.hideControlTitle = String(payload[@"hideControlTitle"], "hideControlTitle");
    [self applyLayout];
    return @{@"accepted": @YES, @"revision": @(_layoutRevision)};
  }
  if ([operation isEqual:@"setNativeVideoEnabled"]) {
    NSString *threadID = String(payload[@"threadID"], "threadID");
    BOOL enabled = ReadBoolean(payload[@"enabled"], "enabled");
    if (!ReadBoolean(payload[@"producerAcknowledged"], "producerAcknowledged")) return @{@"accepted": @NO};
    BOOL wasEnabled = [_enabledThreads containsObject:threadID];
    if (wasEnabled == enabled) return @{@"accepted": @YES};
    [_failedThreads removeObject:threadID];
    if (enabled) [_enabledThreads addObject:threadID];
    else {
      [_enabledThreads removeObject:threadID];
      [_readyThreads removeObject:threadID];
      [_failedThreads removeObject:threadID];
      if ([_layoutInputs[@"activeThreadID"] isEqual:threadID]) [self didRemoveDOMVideo];
    }
    [self emit:@"nativeVideoEnabledChanged" payload:@{@"threadID": threadID, @"enabled": @(enabled)}];
    [self applyLayout];
    return @{@"accepted": @YES};
  }
  if ([operation isEqual:@"setNativeVideoReady"]) {
    NSString *threadID = String(payload[@"threadID"], "threadID");
    BOOL ready = ReadBoolean(payload[@"ready"], "ready");
    if (![_enabledThreads containsObject:threadID]) return @{@"accepted": @NO};
    if (ready) {
      [_failedThreads removeObject:threadID];
      [_readyThreads addObject:threadID];
      if (_layoutInputs && !_programmaticMove) {
        NSMutableDictionary *inputs = [_layoutInputs mutableCopy];
        inputs[@"homeHandoffPending"] = @NO;
        _layoutInputs = inputs;
      }
    } else {
      [_readyThreads removeObject:threadID];
      [_failedThreads addObject:threadID];
      if ([_layoutInputs[@"activeThreadID"] isEqual:threadID]) [self didRemoveDOMVideo];
    }
    [self applyLayout];
    return @{@"accepted": @YES};
  }
  if ([operation isEqual:@"setDOMVideoHome"]) {
    NSString *threadID = String(payload[@"threadID"], "threadID");
    NSString *surfaceID = String(payload[@"surfaceID"], "surfaceID");
    const uint64_t revision = NativeOperationID(payload[@"revision"]);
    const BOOL available = ReadBoolean(payload[@"available"], "available");
    const BOOL visible = ReadBoolean(payload[@"visible"], "visible");
    const BOOL active = ReadBoolean(payload[@"active"], "active");
    const BOOL ready = ReadBoolean(payload[@"ready"], "ready");
    if ((visible || active || ready) && !available) throw std::runtime_error("An unavailable DOM home cannot be visible, active or ready.");
    if (ready && (!visible || !active)) throw std::runtime_error("DOM home readiness requires an active visible surface.");
    NSArray *ordered = payload[@"orderedPresentationIDs"];
    if (![ordered isKindOfClass:NSArray.class] || ordered.count > 5 || [NSSet setWithArray:ordered].count != ordered.count) throw std::runtime_error("DOM home requires at most five distinct actual presentation IDs.");
    for (id value in ordered) {
      NSString *presentationID = String(value, "presentationID");
      OPPresentation *item = _presentations[presentationID];
      if (!item || ![item.identity[@"threadID"] isEqual:threadID]) throw std::runtime_error("DOM home does not own this live native presentation.");
    }
    if (ready && (!ordered.count || ![_enabledThreads containsObject:threadID])) return @{@"accepted": @NO, @"reason": @"video-not-enabled"};
    NSMutableDictionary *surfaces = _domHomeSurfaces[threadID];
    NSDictionary *previous = surfaces[surfaceID];
    if (previous && revision <= [previous[@"revision"] unsignedLongLongValue]) return @{@"accepted": @NO, @"reason": @"stale-dom-revision", @"domHome": [self domHomeSnapshotForThread:threadID]};
    if (!surfaces) { surfaces = NSMutableDictionary.dictionary; _domHomeSurfaces[threadID] = surfaces; }
    if (!previous) {
      NSUInteger count = 0; for (NSDictionary *entries in _domHomeSurfaces.allValues) count += entries.count;
      if (count >= 4096) throw std::runtime_error("The DOM home surface limit was reached.");
    }
    surfaces[surfaceID] = @{@"surfaceID": surfaceID, @"revision": @(revision), @"available": @(available),
      @"visible": @(visible), @"active": @(active), @"ready": @(ready), @"orderedPresentationIDs": [ordered copy]};
    if (!ready && [_layoutInputs[@"activeThreadID"] isEqual:threadID] && ![self domHomeReadyForThread:threadID]) [self didRemoveDOMVideo];
    [self applyLayout];
    [CATransaction flush];
    return @{@"accepted": @YES, @"domHome": [self domHomeSnapshotForThread:threadID]};
  }
  if ([operation isEqual:@"completeThread"]) {
    NSString *threadID = String(payload[@"threadID"], "threadID");
    for (OPPresentation *item in [_presentations.allValues copy]) {
      if (![item.identity[@"threadID"] isEqual:threadID] || item.completed) continue;
      dispatch_source_t timer = dispatch_source_create(DISPATCH_SOURCE_TYPE_TIMER, 0, 0, dispatch_get_main_queue());
      if (!timer) throw std::runtime_error("Unable to create the native completion timer.");
      item.completed = YES;
      item.completionEffect = [[OCUCompletionEffect alloc] initWithApplicationIcon:item.applicationIcon];
      if (item.completionEffect) {
        [item.attachment.layer addSublayer:item.completionEffect.layer];
        [item.completionEffect showInSize:item.attachment.layer.bounds.size];
      }
      [self emit:@"presentationCompleted" payload:item.identity];
      item.completionTimer = timer;
      __weak OPHost *weakSelf = self;
      __weak OPPresentation *weakItem = item;
      dispatch_source_set_timer(timer, dispatch_time(DISPATCH_TIME_NOW, 30 * NSEC_PER_SEC), DISPATCH_TIME_FOREVER, 0);
      dispatch_source_set_event_handler(timer, ^{
        OPHost *host = weakSelf;
        OPPresentation *current = weakItem;
        if (!host || host.closed || !current || !current.completed || host.presentations[current.identity[@"presentationID"]] != current) return;
        @try {
          try {
            [host removeItem:current reason:@"completed-expiry"];
            [host applyLayout];
          } catch (const std::exception &error) {
            NSLog(@"Native completion expiry failed: %s", error.what());
          }
        } @catch (NSException *exception) {
          NSLog(@"Native completion expiry failed: %@", exception.reason);
        }
      });
      dispatch_resume(timer);
    }
    return @{@"accepted": @YES, @"completionEffectAvailable": @YES};
  }
  if ([operation isEqual:@"removePresentation"]) {
    NSString *presentationID = String(payload[@"presentationID"], "presentationID");
    NSString *threadID = String(payload[@"threadID"], "threadID");
    NSString *turnID = String(payload[@"turnID"], "turnID");
    uint32_t contextID = Unsigned(payload[@"contextID"], "contextID");
    uint32_t generation = Unsigned(payload[@"sourceGeneration"], "sourceGeneration");
    OPPresentation *item = _presentations[presentationID];
    if (!item || item.sourceGeneration != generation || item.contextID != contextID || ![item.identity[@"threadID"] isEqual:threadID] || ![item.identity[@"turnID"] isEqual:turnID]) return @{@"accepted": @NO};
    [self removeItem:item reason:@"source-ended"];
    [self applyLayout];
    return @{@"accepted": @YES};
  }
  if ([operation isEqual:@"invalidateTurn"]) {
    NSString *threadID = String(payload[@"threadID"], "threadID");
    NSString *turnID = String(payload[@"turnID"], "turnID");
    if (!_invalidatedTurns[threadID]) _invalidatedTurns[threadID] = NSMutableSet.set;
    [_invalidatedTurns[threadID] addObject:turnID];
    for (OPPresentation *item in [_presentations.allValues copy]) {
      if ([item.identity[@"threadID"] isEqual:threadID] && [item.identity[@"turnID"] isEqual:turnID]) [self removeItem:item reason:@"turn-invalidated"];
    }
    for (OPPresentation *item in [_exitingPresentations.allValues copy]) {
      if ([item.identity[@"threadID"] isEqual:threadID] && [item.identity[@"turnID"] isEqual:turnID]) { item.removalAnimated = NO; [self completeRemovalOfItem:item]; }
    }
    [self applyLayout];
    return @{@"accepted": @YES};
  }
  throw std::runtime_error("Unsupported native presentation operation.");
}

- (void)close {
  if (_hostCloseCompleted) return;
  _closed = YES;
  if (_ownerCloseObserver) [NSNotificationCenter.defaultCenter removeObserver:_ownerCloseObserver];
  _ownerCloseObserver = nil;
  for (id observer in _ownerFrameObservers) [NSNotificationCenter.defaultCenter removeObserver:observer];
  [_ownerFrameObservers removeAllObjects];
  [_controls stop]; _controls = nil;
  [_motionDriver releaseMotionDisplayLink]; _motionDriver = nil;
  _programmaticMove.reset(); _targetAnchor.reset();
  _dragActive = _resizeActive = NO;
  for (OPPresentation *item in [_presentations.allValues copy]) [self removeItem:item reason:@"host-closed"];
  for (OPPresentation *item in [_exitingPresentations.allValues copy]) [self completeRemovalOfItem:item];
  for (OPProducerChannel *channel in _producerChannels.allValues) { [channel confirmHostReleased]; [channel closeCarrier]; }
  [_producerChannels removeAllObjects];
  [_panel.parentWindow removeChildWindow:_panel];
  [_controlPanel.parentWindow removeChildWindow:_controlPanel];
  [_panel close];
  [_controlPanel close];
  _panel = nil;
  _controlPanel = nil;
  _owner = nil;
  _windowOwner = nil; _windowCurrentHostID = nil;
  _layoutInputs = nil;
  [_registeredHosts removeAllObjects]; [_hostIndices removeAllObjects]; [_hostObjects removeAllObjects];
  [_controllerOrder removeAllObjects]; _nativeHosts.clear();
  [_enabledThreads removeAllObjects];
  [_readyThreads removeAllObjects];
  [_failedThreads removeAllObjects];
  [_domHomeSurfaces removeAllObjects]; [_lastDOMHomeSnapshots removeAllObjects];
  _hostCloseCompleted = YES;
  [self emit:@"hostClosed" payload:@{}];
  if (_sink) _sink->Finish();
}

- (void)dealloc {
  if (!_hostCloseCompleted) [self close];
}
@end

struct HostBinding {
  __strong OPHost *host;
  std::shared_ptr<EventSink> sink;
  napi_async_cleanup_hook_handle cleanupHook = nullptr;
  bool environmentClosed = false;
};

static void DisposeBinding(HostBinding *binding) {
  binding->sink->Close();
  OPHost *host = binding->host;
  if ([NSThread isMainThread]) [host close];
  else dispatch_async(dispatch_get_main_queue(), ^{ [host close]; });
  binding->host = nil;
}

static void EnvironmentCleanup(napi_async_cleanup_hook_handle handle, void *data) {
  HostBinding *binding = static_cast<HostBinding *>(data);
  binding->environmentClosed = true;
  binding->sink->Close();
  OPHost *host = binding->host;
  void (^finish)(void) = ^{
    [host close];
    binding->host = nil;
    binding->cleanupHook = nullptr;
    napi_remove_async_cleanup_hook(handle);
  };
  if ([NSThread isMainThread]) finish();
  else dispatch_async(dispatch_get_main_queue(), finish);
}

static void FinalizeHost(napi_env env, void *data, void *) {
  HostBinding *binding = static_cast<HostBinding *>(data);
  if (!binding->environmentClosed) {
    (void)env;
    if (binding->cleanupHook) napi_remove_async_cleanup_hook(binding->cleanupHook);
    DisposeBinding(binding);
  }
  delete binding;
}

static napi_value Throw(napi_env env, const char *message) {
  napi_throw_error(env, nullptr, message);
  return nullptr;
}

static napi_value HostCommand(napi_env env, napi_callback_info info) {
  @autoreleasepool {
    @try {
      try {
        size_t argc = 1;
        napi_value args[1], receiver;
        Check(napi_get_cb_info(env, info, &argc, args, &receiver, nullptr));
        if (argc != 1) throw std::runtime_error("command requires one sender-bound envelope.");
        HostBinding *binding;
        Check(napi_unwrap(env, receiver, reinterpret_cast<void **>(&binding)));
        if (!binding || binding->environmentClosed || !binding->host) throw std::runtime_error("Native presentation host is closed.");
        if (![NSThread isMainThread]) throw std::runtime_error("Native presentation commands require the AppKit main thread.");
        return ToJS(env, [binding->host command:NativeCommandFromJS(env, args[0])]);
      } catch (const std::exception &error) { return Throw(env, error.what()); }
    } @catch (NSException *exception) { return Throw(env, exception.reason.UTF8String); }
  }
}

static napi_value HostClose(napi_env env, napi_callback_info info) {
  @autoreleasepool {
    @try {
      try {
        napi_value receiver;
        Check(napi_get_cb_info(env, info, nullptr, nullptr, &receiver, nullptr));
        HostBinding *binding;
        Check(napi_unwrap(env, receiver, reinterpret_cast<void **>(&binding)));
        if (binding && binding->host) {
          if (![NSThread isMainThread]) throw std::runtime_error("close requires the AppKit main thread.");
          [binding->host close];
        }
        return ToJS(env, @YES);
      } catch (const std::exception &error) { return Throw(env, error.what()); }
    } @catch (NSException *exception) { return Throw(env, exception.reason.UTF8String); }
  }
}

static napi_value Capabilities(napi_env env, napi_callback_info) {
  @autoreleasepool {
    try {
      return ToJS(env, @{@"platform": @"darwin", @"nodeAPIVersion": @8, @"appKitMainThread": @([NSThread isMainThread] && NSApp != nil), @"remoteContextAvailable": @(RemoteContextAvailable()), @"nativePanelImplementation": @YES, @"producerVideoControl": @NO, @"encodedVideo": @NO, @"encodedVideoRelay": @YES, @"springMotion": @YES, @"nativeControls": @YES, @"completionEffect": @YES, @"atomicPrepare": @YES, @"machSendRightCarrier": @YES});
    } catch (const std::exception &error) { return Throw(env, error.what()); }
  }
}

static napi_value CreateHost(napi_env env, napi_callback_info info) {
  @autoreleasepool {
    std::unique_ptr<HostBinding> binding;
    @try {
      try {
        if (![NSThread isMainThread] || !NSApp) throw std::runtime_error("createHost requires an existing AppKit application on its main thread.");
        size_t argc = 2;
        napi_value args[2];
        Check(napi_get_cb_info(env, info, &argc, args, nullptr, nullptr));
        if (argc != 2) throw std::runtime_error("createHost requires options and an event callback.");
        napi_valuetype type;
        Check(napi_typeof(env, args[1], &type));
        if (type != napi_function) throw std::runtime_error("The native presentation event callback is required.");
        napi_value handle, senderIDValue, generationValue;
        Check(napi_get_named_property(env, args[0], "ownerWindowHandle", &handle));
        Check(napi_get_named_property(env, args[0], "senderID", &senderIDValue));
        Check(napi_get_named_property(env, args[0], "senderGeneration", &generationValue));
        uint32_t senderID = Unsigned(FromJS(env, senderIDValue), "senderID");
        uint32_t generation = Unsigned(FromJS(env, generationValue), "senderGeneration");
        bool isBuffer;
        Check(napi_is_buffer(env, handle, &isBuffer));
        if (!isBuffer) throw std::runtime_error("ownerWindowHandle must be a native pointer Buffer from the desktop host.");
        void *bytes;
        size_t length;
        Check(napi_get_buffer_info(env, handle, &bytes, &length));
        if (length != sizeof(uintptr_t)) throw std::runtime_error("Unexpected native window handle size.");
        uintptr_t address;
        std::memcpy(&address, bytes, sizeof(address));
        NSWindow *owner = ResolveOwner(address);
        if (!owner) throw std::runtime_error("Native window handle does not identify a live AppKit owner.");
        binding = std::make_unique<HostBinding>();
        binding->sink = std::make_shared<EventSink>(env, args[1]);
        binding->host = [[OPHost alloc] initWithOwner:owner senderID:senderID generation:generation sink:binding->sink];
        if (!binding->host) throw std::runtime_error("Unable to create the native presentation host.");
        napi_value result;
        Check(napi_create_object(env, &result));
        Check(napi_set_named_property(env, result, "hostToken", ToJS(env, binding->host.token)));
        Check(napi_set_named_property(env, result, "ownerWindowID", ToJS(env, @(owner.windowNumber))));
        const napi_property_descriptor descriptors[] = {
          {"command", nullptr, HostCommand, nullptr, nullptr, nullptr, napi_default, nullptr},
          {"close", nullptr, HostClose, nullptr, nullptr, nullptr, napi_default, nullptr},
        };
        Check(napi_define_properties(env, result, 2, descriptors));
        Check(napi_add_async_cleanup_hook(env, EnvironmentCleanup, binding.get(), &binding->cleanupHook));
        napi_status wrapStatus = napi_wrap(env, result, binding.get(), FinalizeHost, nullptr, nullptr);
        if (wrapStatus != napi_ok) {
          napi_remove_async_cleanup_hook(binding->cleanupHook);
          Check(wrapStatus);
        }
        binding.release();
        return result;
      } catch (const std::exception &error) {
        if (binding && binding->sink) DisposeBinding(binding.get());
        return Throw(env, error.what());
      }
    } @catch (NSException *exception) {
      if (binding && binding->sink) DisposeBinding(binding.get());
      return Throw(env, exception.reason.UTF8String);
    }
  }
}

NAPI_MODULE_INIT() {
  const napi_property_descriptor descriptors[] = {
    {"getCapabilities", nullptr, Capabilities, nullptr, nullptr, nullptr, napi_default, nullptr},
    {"createHost", nullptr, CreateHost, nullptr, nullptr, nullptr, napi_default, nullptr},
  };
  if (napi_define_properties(env, exports, 2, descriptors) != napi_ok) return nullptr;
  return exports;
}
