#import "motion-driver.h"

#include <atomic>

#pragma clang diagnostic push
#pragma clang diagnostic ignored "-Wdeprecated-declarations"

@interface OPMotionDisplayLinkDriver () {
  CVDisplayLinkRef _displayLink;
  std::atomic<bool> _framePending;
  OPMotionFrameHandler _frameHandler;
  CFTimeInterval _lastMotionTimestamp;
  BOOL _needsMotion;
  BOOL _contrastSampling;
}
- (void)displayLinkDidRequestFrameAtTimestamp:(CFTimeInterval)timestamp;
@end

// sky.node 0x25808 retains the callback context for the duration of this call.
static CVReturn OPStackDisplayLinkCallback(
    CVDisplayLinkRef displayLink, const CVTimeStamp* now,
    const CVTimeStamp* outputTime, CVOptionFlags flagsIn,
    CVOptionFlags* flagsOut, void* context) {
  (void)displayLink;
  (void)now;
  (void)flagsIn;
  (void)flagsOut;
  __strong OPMotionDisplayLinkDriver* driver
      __attribute__((objc_precise_lifetime)) =
          (__bridge OPMotionDisplayLinkDriver*)context;
  const CFTimeInterval timestamp = static_cast<double>(outputTime->hostTime) /
                                    CVGetHostClockFrequency();
  [driver displayLinkDidRequestFrameAtTimestamp:timestamp];
  return kCVReturnSuccess;
}

@implementation OPMotionDisplayLinkDriver

@synthesize needsMotion = _needsMotion;
@synthesize contrastSampling = _contrastSampling;

- (instancetype)initWithFrameHandler:(OPMotionFrameHandler)frameHandler {
  self = [super init];
  if (self) {
    _displayLink = nullptr;
    _framePending.store(false, std::memory_order_relaxed);
    _frameHandler = [frameHandler copy];
    _lastMotionTimestamp = 0;
    _needsMotion = NO;
    _contrastSampling = NO;
  }
  return self;
}

- (BOOL)isRunning {
  return _displayLink && CVDisplayLinkIsRunning(_displayLink);
}

- (CFTimeInterval)lastMotionTimestamp {
  return _lastMotionTimestamp;
}

- (void)recordMotionTimestamp:(CFTimeInterval)timestamp {
  _lastMotionTimestamp = timestamp;
}

// sky.node 0x25728 resets the motion clock only on the inactive-to-active edge.
- (CVReturn)startMotionDisplayLink {
  if (!_needsMotion) _lastMotionTimestamp = CACurrentMediaTime();
  _needsMotion = YES;
  return [self startDisplayLink];
}

// sky.node 0x25760 creates once and reuses a stopped native display link.
- (CVReturn)startDisplayLink {
  if (_displayLink && CVDisplayLinkIsRunning(_displayLink)) {
    return kCVReturnSuccess;
  }
  if (!_displayLink) {
    const CVReturn created = CVDisplayLinkCreateWithActiveCGDisplays(&_displayLink);
    if (created != kCVReturnSuccess) {
      NSLog(@"OpenCU could not create stack display link result=%d", created);
      return created;
    }
    CVDisplayLinkSetOutputCallback(_displayLink, OPStackDisplayLinkCallback,
                                   (__bridge void*)self);
    if (CVDisplayLinkIsRunning(_displayLink)) return kCVReturnSuccess;
  }
  _lastMotionTimestamp = CACurrentMediaTime();
  _framePending.store(false, std::memory_order_release);
  return CVDisplayLinkStart(_displayLink);
}

// sky.node 0x25868 clears frame/motion state only when a link exists.
- (void)stopMotionDisplayLink {
  if (!_displayLink) return;
  CVDisplayLinkStop(_displayLink);
  _framePending.store(false, std::memory_order_release);
  _needsMotion = NO;
}

- (void)stopDisplayLinkIfIdle {
  if (!_needsMotion && !_contrastSampling) [self stopMotionDisplayLink];
}

- (void)releaseMotionDisplayLink {
  [self stopMotionDisplayLink];
  if (_displayLink) {
    CVDisplayLinkRelease(_displayLink);
    _displayLink = nullptr;
  }
}

// sky.node 0x28e38 / 0x28e4c keep contrast sampling alive independently.
- (CVReturn)startControlIconContrastSampling {
  _contrastSampling = YES;
  return [self startDisplayLink];
}

- (void)stopControlIconContrastSampling {
  if (!_contrastSampling) return;
  _contrastSampling = NO;
  [self stopDisplayLinkIfIdle];
}

// sky.node 0x258e8 / 0x25994 coalesce CV callbacks before main-queue delivery.
- (void)displayLinkDidRequestFrameAtTimestamp:(CFTimeInterval)timestamp {
  bool expected = false;
  if (!_framePending.compare_exchange_strong(expected, true,
                                             std::memory_order_acq_rel,
                                             std::memory_order_acquire)) {
    return;
  }
  __weak OPMotionDisplayLinkDriver* weakDriver = self;
  dispatch_async(dispatch_get_main_queue(), ^{
    OPMotionDisplayLinkDriver* driver = weakDriver;
    if (!driver) return;
    driver->_framePending.store(false, std::memory_order_release);
    if (!driver->_displayLink || !CVDisplayLinkIsRunning(driver->_displayLink)) return;
    OPMotionFrameHandler handler = driver->_frameHandler;
    if (handler) handler(timestamp);
    [driver stopDisplayLinkIfIdle];
  });
}

- (void)dealloc {
  [self releaseMotionDisplayLink];
}

@end

#pragma clang diagnostic pop
