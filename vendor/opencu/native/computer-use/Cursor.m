#import "ComputerUse.h"
#import "CursorMotion.h"
#import <CommonCrypto/CommonDigest.h>
#import <QuartzCore/QuartzCore.h>
#import <objc/message.h>
#import <dlfcn.h>
#import <unistd.h>

NSNotificationName const CUCursorCaptureSourceDidChangeNotification = @"CUCursorCaptureSourceDidChangeNotification";
static NSHashTable<CUCursor *> *ownedCursors;
@interface CUCursorPetLocation : NSObject
@property (copy) NSString *label;
@property uint64_t generation;
@property CGPoint point;
@end
@implementation CUCursorPetLocation
@end
static NSMapTable<CUSession *, CUCursorPetLocation *> *petLocations;
static double CUCursorNow(void) { return NSProcessInfo.processInfo.systemUptime; }
typedef int32_t (*CUCursorConnectionFunction)(void);
typedef CGError (*CUCursorLevelFunction)(int32_t, CGWindowID, int32_t);
static CUCursorConnectionFunction cursorConnection;
static CUCursorLevelFunction cursorSetLevel;
static BOOL CUCursorWindowServerAvailable(void) {
  static dispatch_once_t once;
  dispatch_once(&once, ^{
    void *handle = dlopen("/System/Library/PrivateFrameworks/SkyLight.framework/SkyLight", RTLD_LAZY | RTLD_LOCAL);
    if (handle) {
      cursorConnection = (CUCursorConnectionFunction)dlsym(handle, "CGSMainConnectionID");
      cursorSetLevel = (CUCursorLevelFunction)dlsym(handle, "CGSSetWindowLevel");
    }
  });
  return cursorConnection && cursorSetLevel;
}
static BOOL CUCursorSetOverlayLevel(NSInteger windowNumber) {
  if (windowNumber < 1) return NO;
  if ((uint64_t)windowNumber > UINT32_MAX) CUFail(@"cursor_overlay_unavailable", @"The native cursor window number is invalid.");
  if (!CUCursorWindowServerAvailable()) CUFail(@"cursor_overlay_unavailable", @"The source native cursor WindowServer overlay operation is unavailable.");
  // Original slot 0x10148dfa8 is hash-resolved CGSSetWindowLevel, not a guessed SLS operation.
  (void)cursorSetLevel(cursorConnection(), (CGWindowID)windowNumber, CGWindowLevelForKey(kCGOverlayWindowLevelKey));
  return YES;
}
static id CUCursorBlurFilter(void) {
  // Original 0x100f903d4 XOR-decodes CAFilter; 0x100f96438 resolves filterWithName:.
  Class filterClass = NSClassFromString(@"CAFilter"); SEL factory = NSSelectorFromString(@"filterWithName:");
  if (!filterClass || ![filterClass respondsToSelector:factory]) return nil;
  id filter = ((id (*)(id, SEL, id))objc_msgSend)(filterClass, factory, @"gaussianBlur");
  if (![filter isKindOfClass:NSObject.class]) return nil;
  [filter setValue:@7 forKey:@"inputRadius"];
  [filter setValue:nil forKey:@"inputHardEdges"];
  [filter setValue:nil forKey:@"inputNormalizeEdges"];
  return filter;
}
static NSDictionary *CUCursorRect(CGRect rect) {
  return @{@"x":@(rect.origin.x),@"y":@(rect.origin.y),@"width":@(rect.size.width),@"height":@(rect.size.height)};
}
static void CUCursorMain(dispatch_block_t action, BOOL wait) {
  if (NSThread.isMainThread) { action(); return; }
  dispatch_semaphore_t done = wait ? dispatch_semaphore_create(0) : nil;
  CFRunLoopPerformBlock(CFRunLoopGetMain(), kCFRunLoopCommonModes, ^{ action(); if (done) dispatch_semaphore_signal(done); });
  CFRunLoopWakeUp(CFRunLoopGetMain());
  if (done) dispatch_semaphore_wait(done, DISPATCH_TIME_FOREVER);
}
static NSImage *CUCursorImage(void) {
  static NSImage *image;
  if (image) return image;
  NSURL *url = [NSBundle.mainBundle URLForResource:@"SoftwareCursor" withExtension:@"png"];
  NSData *data = url ? [NSData dataWithContentsOfURL:url] : nil;
  if (!data || data.length > 256 * 1024) CUFail(@"cursor_resource_unavailable", @"The native SoftwareCursor resource is missing.");
  unsigned char digest[CC_SHA256_DIGEST_LENGTH];
  CC_SHA256(data.bytes, (CC_LONG)data.length, digest);
  static const unsigned char expected[CC_SHA256_DIGEST_LENGTH] = {
    0x59,0xad,0xde,0x55,0xd0,0x87,0xac,0x27,0x9b,0xa6,0xef,0x08,0x01,0xb2,0x96,0x99,
    0x8a,0x08,0xf3,0xed,0xdd,0x7b,0xb9,0x1a,0xb0,0xb3,0xf5,0xc8,0xe5,0x38,0xd3,0xf5
  };
  if (memcmp(digest, expected, sizeof(expected))) CUFail(@"cursor_resource_unavailable", @"The native SoftwareCursor resource does not match its source identity.");
  NSBitmapImageRep *bitmap = [NSBitmapImageRep imageRepWithData:data];
  if (bitmap.pixelsWide != 200 || bitmap.pixelsHigh != 230 || !bitmap.hasAlpha) CUFail(@"cursor_resource_unavailable", @"The native SoftwareCursor image has invalid dimensions.");
  image = [[NSImage alloc] initWithData:data];
  if (!image) CUFail(@"cursor_resource_unavailable", @"The native SoftwareCursor image could not be decoded.");
  // Original SoftwareCursorStyle.makeView: 0x10009e784; hotspot: 0x10009e778.
  image.size = NSMakeSize(20, 23);
  return image;
}

@interface CUCursorWindow : NSWindow
@end
@implementation CUCursorWindow
- (NSRect)constrainFrameRect:(NSRect)frame toScreen:(NSScreen *)screen { return frame; }
@end

@interface CUCursor : NSObject
@property (weak) CUSession *session;
@property (copy) NSString *label;
@property (copy) NSString *identity;
@property (copy) NSString *ownerIdentity;
@property uint64_t lifecycleGeneration;
@property uint64_t sequence;
@property pid_t pid;
@property CGWindowID target;
@property CGWindowID correspondingWindow;
@property NSInteger menusOpen;
@property BOOL appIsActive;
@property BOOL overlay;
@property BOOL temporaryOverlay;
@property BOOL initialPetPending;
@property CGPoint initialPetPoint;
@property CGPoint local;
@property CGPoint displayLocal;
@property CGPoint motionStart;
@property CGPoint motionEnd;
@property CGPoint motionFramePoint;
@property CUCursorPath motionPath;
@property CUCursorSpring motionX;
@property CUCursorSpring motionY;
@property BOOL motionActive;
@property BOOL motionScoot;
@property BOOL motionReady;
@property BOOL motionCancelled;
@property uint64_t motionGeneration;
@property BOOL motionWaitsForCompletion;
@property BOOL fadeActive;
@property uint64_t fadeGeneration;
@property BOOL fadeFilterAvailable;
@property BOOL overlayPrimitiveAvailable;
@property double motionStarted;
@property CADisplayLink *motionDisplayLink;
@property dispatch_semaphore_t motionWaiter;
@property BOOL down;
@property BOOL wantsVisible;
@property BOOL visible;
@property BOOL refreshing;
@property BOOL notificationScheduled;
@property BOOL targetDestroyed;
@property double updatedWall;
@property CGRect targetBounds;
@property CUCursorWindow *window;
@property NSImageView *imageView;
@property NSObject *opaqueToken;
@property NSMutableArray<id> *workspaceObservers;
@property (assign) AXObserverRef axObserver;
@property (assign) AXUIElementRef axApplication;
@property (assign) AXUIElementRef axWindow;
@property NSSet<NSString *> *axApplicationNotifications;
@property NSSet<NSString *> *axWindowNotifications;
- (void)close;
- (void)refresh;
- (void)configureObservers;
- (void)removeObservers;
- (void)sourceChanged;
- (BOOL)ownsLiveSession;
- (void)receiveApplicationNotification:(CFStringRef)notification;
- (void)cancelMotion;
- (void)advanceMotion:(CADisplayLink *)displayLink;
- (void)cancelFade;
- (void)fadeOut;
@end

static void CUCursorAXChanged(AXObserverRef observer, AXUIElementRef element, CFStringRef notification, void *context) {
  (void)observer;
  CUCursor *cursor = (__bridge CUCursor *)context;
  if (CFEqual(notification, kAXUIElementDestroyedNotification) && cursor.axWindow && CFEqual(element, cursor.axWindow)) cursor.targetDestroyed = YES;
  @try { [cursor receiveApplicationNotification:notification]; [cursor refresh]; } @catch (NSException *error) { [cursor close]; }
}

@implementation CUCursor
- (void)cancelFade {
  self.fadeGeneration++; self.fadeActive = NO;
  [self.window.contentView.layer removeAnimationForKey:@"cursorBlurTransition"];
  self.window.contentView.layer.filters = nil; self.window.alphaValue = 1;
}
- (void)fadeOut {
  if (self.fadeActive) return;
  if (!self.window.isVisible) { [self close]; return; }
  [self cancelMotion]; self.wantsVisible = NO; self.fadeActive = YES;
  uint64_t generation = ++self.fadeGeneration; CUCursorWindow *window = self.window;
  CALayer *layer = window.contentView.layer; id filter = CUCursorBlurFilter();
  self.fadeFilterAvailable = filter != nil;
  if (layer && filter) {
    layer.filters = @[filter];
    CABasicAnimation *blur = [CABasicAnimation animationWithKeyPath:@"filters.gaussianBlur.inputRadius"];
    blur.fromValue = @0; blur.toValue = @7; blur.duration = .44;
    blur.timingFunction = [CAMediaTimingFunction functionWithName:kCAMediaTimingFunctionEaseInEaseOut];
    [layer addAnimation:blur forKey:@"cursorBlurTransition"];
  }
  __weak CUCursor *weak = self;
  // Original 0x1000990a8 and completion 0x1000a0abc. Blur parity is reported separately.
  [NSAnimationContext runAnimationGroup:^(NSAnimationContext *context) {
    context.duration = .44; context.timingFunction = [CAMediaTimingFunction functionWithName:kCAMediaTimingFunctionEaseInEaseOut];
    window.animator.alphaValue = 0;
  } completionHandler:^{
    CUCursor *cursor = weak;
    if (!cursor || cursor.fadeGeneration != generation || cursor.window != window) return;
    [window orderOut:nil]; window.alphaValue = 1; [cursor close];
  }];
}
- (void)cancelMotion {
  self.motionGeneration++; self.motionActive = NO; self.motionCancelled = YES;
  self.temporaryOverlay = NO; self.initialPetPending = NO;
  [self.motionDisplayLink invalidate]; self.motionDisplayLink = nil;
  if (self.motionWaiter) { dispatch_semaphore_signal(self.motionWaiter); self.motionWaiter = nil; }
}
- (void)advanceMotion:(CADisplayLink *)displayLink {
  if (!self.motionActive || displayLink != self.motionDisplayLink) return;
  if (![self ownsLiveSession]) { [self close]; return; }
  CUCursorSpring x = self.motionX, y = self.motionY;
  double elapsed = CUCursorNow() - self.motionStarted;
  CUCursorSpringAdvance(&x, elapsed);
  if (self.motionScoot) CUCursorSpringAdvance(&y, elapsed);
  self.motionX = x; self.motionY = y;
  BOOL complete = CUCursorSpringComplete(x, self.motionScoot ? &y : NULL);
  CGPoint point; double progress;
  if (self.motionScoot) {
    point = complete ? self.motionEnd : CGPointMake(x.position, y.position);
    CGPoint delta = CUCursorSubtract(self.motionEnd, self.motionStart);
    double squared = delta.x*delta.x + delta.y*delta.y;
    progress = squared < .001 ? 1 : CUCursorClamp(((point.x-self.motionStart.x)*delta.x + (point.y-self.motionStart.y)*delta.y) / squared, 0, 1);
  } else {
    progress = complete ? 1 : x.position;
    point = CUCursorPathPoint(self.motionPath, progress, NULL);
  }
  self.motionFramePoint = point;
  self.sequence++;
  @try { [self refresh]; } @catch (NSException *error) { [self close]; return; }
  if (!self.visible) { [self cancelMotion]; return; }
  self.displayLocal = CGPointMake(point.x + 4, self.targetBounds.size.height - point.y + 4 - 23);
  double remaining = hypot(self.motionEnd.x-point.x, self.motionEnd.y-point.y);
  if (!self.motionReady && (complete || (!self.motionWaitsForCompletion && progress >= .995 && remaining <= 3.157))) {
    self.motionReady = YES;
    if (self.motionWaiter) { dispatch_semaphore_signal(self.motionWaiter); self.motionWaiter = nil; }
  }
  if (complete) {
    self.motionActive = NO; self.temporaryOverlay = NO;
    [self.motionDisplayLink invalidate]; self.motionDisplayLink = nil;
    @try { [self refresh]; } @catch (NSException *error) { [self close]; }
  }
}
- (void)receiveApplicationNotification:(CFStringRef)notification {
  // Original AppMonitor.receive at 0x1000a1034: menu count is independent of app activity.
  if (CFEqual(notification, kAXMenuOpenedNotification)) {
    if (self.menusOpen == NSIntegerMax) { [self close]; return; }
    self.menusOpen++;
  } else if (CFEqual(notification, kAXMenuClosedNotification)) {
    if (self.menusOpen == NSIntegerMin) { [self close]; return; }
    self.menusOpen--;
  } else if (CFEqual(notification, kAXFocusedWindowChangedNotification) && self.window.isVisible) {
    CFTypeRef focused = NULL;
    if (AXUIElementCopyAttributeValue(self.axApplication, kAXFocusedWindowAttribute, &focused) == kAXErrorSuccess && focused) {
      if (CFGetTypeID(focused) == AXUIElementGetTypeID()) {
        CGWindowID window = CUAXWindowId((AXUIElementRef)focused);
        if (window) { self.correspondingWindow = window; self.wantsVisible = YES; }
      }
      CFRelease(focused);
    }
  }
}
- (BOOL)ownsLiveSession {
  CUSession *session = self.session;
  return session && !atomic_load(&session->cancelled) && session.cursor == self && self.lifecycleGeneration == session.lifecycleGeneration && [self.label isEqual:session.label];
}
- (void)sourceChanged {
  if (self.notificationScheduled) return;
  self.notificationScheduled = YES;
  CUSession *session = self.session;
  __weak CUCursor *weak = self;
  dispatch_async(dispatch_get_main_queue(), ^{
    CUCursor *cursor = weak;
    if (cursor) cursor.notificationScheduled = NO;
    if (session) [NSNotificationCenter.defaultCenter postNotificationName:CUCursorCaptureSourceDidChangeNotification object:session];
  });
}
- (void)removeObservers {
  NSNotificationCenter *center = NSWorkspace.sharedWorkspace.notificationCenter;
  for (id observer in self.workspaceObservers) [center removeObserver:observer];
  self.workspaceObservers = nil;
  if (self.axObserver) {
    for (NSString *name in self.axApplicationNotifications) AXObserverRemoveNotification(self.axObserver, self.axApplication, (__bridge CFStringRef)name);
    for (NSString *name in self.axWindowNotifications) AXObserverRemoveNotification(self.axObserver, self.axWindow, (__bridge CFStringRef)name);
    CFRunLoopRemoveSource(CFRunLoopGetMain(), AXObserverGetRunLoopSource(self.axObserver), kCFRunLoopCommonModes);
    CFRelease(self.axObserver); self.axObserver = NULL;
  }
  if (self.axWindow) { CFRelease(self.axWindow); self.axWindow = NULL; }
  if (self.axApplication) { CFRelease(self.axApplication); self.axApplication = NULL; }
  self.axApplicationNotifications = nil; self.axWindowNotifications = nil;
}
- (void)configureObservers {
  [self removeObservers];
  self.menusOpen = 0;
  self.workspaceObservers = [NSMutableArray new];
  __weak CUCursor *weak = self;
  NSArray<NSNotificationName> *names = @[NSWorkspaceDidActivateApplicationNotification, NSWorkspaceDidDeactivateApplicationNotification,
    NSWorkspaceDidHideApplicationNotification, NSWorkspaceDidUnhideApplicationNotification, NSWorkspaceDidTerminateApplicationNotification,
    NSWorkspaceActiveSpaceDidChangeNotification, NSWorkspaceDidWakeNotification];
  for (NSNotificationName name in names) {
    id observer = [NSWorkspace.sharedWorkspace.notificationCenter addObserverForName:name object:nil queue:NSOperationQueue.mainQueue usingBlock:^(NSNotification *notification) {
      (void)notification;
      CUCursor *cursor = weak;
      if (cursor) @try { [cursor refresh]; } @catch (NSException *error) { [cursor close]; }
    }];
    [self.workspaceObservers addObject:observer];
  }
  AXObserverRef observer = NULL;
  if (AXObserverCreate(self.pid, CUCursorAXChanged, &observer) != kAXErrorSuccess) return;
  self.axObserver = observer; self.axApplication = AXUIElementCreateApplication(self.pid);
  NSMutableSet<NSString *> *appNames = [NSMutableSet new];
  for (NSString *name in @[(__bridge NSString *)kAXFocusedWindowChangedNotification, (__bridge NSString *)kAXWindowCreatedNotification,
    (__bridge NSString *)kAXMenuOpenedNotification, (__bridge NSString *)kAXMenuClosedNotification])
    if (AXObserverAddNotification(observer, self.axApplication, (__bridge CFStringRef)name, (__bridge void *)self) == kAXErrorSuccess) [appNames addObject:name];
  self.axApplicationNotifications = appNames;
  CFTypeRef windows = NULL;
  if (AXUIElementCopyAttributeValue(self.axApplication, kAXWindowsAttribute, &windows) == kAXErrorSuccess && windows) {
    if (CFGetTypeID(windows) == CFArrayGetTypeID()) for (id value in (__bridge NSArray *)windows) {
      AXUIElementRef candidate = (__bridge AXUIElementRef)value;
      if (CFGetTypeID(candidate) == AXUIElementGetTypeID() && CUAXWindowId(candidate) == self.target) { self.axWindow = (AXUIElementRef)CFRetain(candidate); break; }
    }
    CFRelease(windows);
  }
  NSMutableSet<NSString *> *windowNames = [NSMutableSet new];
  if (self.axWindow) for (NSString *name in @[(__bridge NSString *)kAXMovedNotification, (__bridge NSString *)kAXResizedNotification,
    (__bridge NSString *)kAXWindowMiniaturizedNotification, (__bridge NSString *)kAXWindowDeminiaturizedNotification, (__bridge NSString *)kAXUIElementDestroyedNotification])
    if (AXObserverAddNotification(observer, self.axWindow, (__bridge CFStringRef)name, (__bridge void *)self) == kAXErrorSuccess) [windowNames addObject:name];
  self.axWindowNotifications = windowNames;
  CFRunLoopAddSource(CFRunLoopGetMain(), AXObserverGetRunLoopSource(observer), kCFRunLoopCommonModes);
}
- (void)close {
  BOOL hadSource = self.window != nil || self.opaqueToken != nil;
  [self cancelMotion]; [self cancelFade];
  self.overlay = NO; self.overlayPrimitiveAvailable = NO; self.fadeFilterAvailable = NO;
  [self removeObservers]; self.wantsVisible = NO; self.visible = NO; self.down = NO; self.opaqueToken = nil;
  if (self.window) {
    CUSession *session = self.session;
    if (session && self.window.windowNumber > 0) {
      if (!session.retiredCursorWindows) session.retiredCursorWindows = [NSMutableSet new];
      [session.retiredCursorWindows addObject:@(self.window.windowNumber)];
    }
    [self.window orderOut:nil]; [self.window close]; self.window = nil; self.imageView = nil; [CATransaction flush];
  }
  if (hadSource) [self sourceChanged];
}
- (void)refresh {
  if (self.refreshing) return;
  self.refreshing = YES;
  @try {
    if (![self ownsLiveSession] || self.targetDestroyed || ![CUIdentity(self.pid) isEqual:self.identity] || ![CUIdentity(getpid()) isEqual:self.ownerIdentity]) { [self close]; return; }
    NSArray *windows = CFBridgingRelease(CGWindowListCopyWindowInfo(kCGWindowListOptionOnScreenOnly, kCGNullWindowID));
    NSDictionary *target = nil, *corresponding = nil; NSUInteger correspondingIndex = NSNotFound, cursorIndex = NSNotFound;
    for (NSUInteger index = 0; index < windows.count; index++) {
      NSDictionary *info = windows[index]; CGWindowID number = [info[(id)kCGWindowNumber] unsignedIntValue];
      if (number == self.target && [info[(id)kCGWindowOwnerPID] intValue] == self.pid) target = info;
      if (number == self.correspondingWindow && [info[(id)kCGWindowOwnerPID] intValue] == self.pid) { corresponding = info; correspondingIndex = index; }
      if (self.window && number == self.window.windowNumber && [info[(id)kCGWindowOwnerPID] intValue] == getpid()) cursorIndex = index;
    }
    CGRect bounds = CGRectZero;
    BOOL valid = target && CGRectMakeWithDictionaryRepresentation((__bridge CFDictionaryRef)target[(id)kCGWindowBounds], &bounds) &&
      isfinite(bounds.origin.x) && isfinite(bounds.origin.y) && isfinite(bounds.size.width) && isfinite(bounds.size.height) && bounds.size.width > 0 && bounds.size.height > 0;
    if (self.fadeActive && valid) { self.visible = self.window.isVisible; return; }
    if (!self.wantsVisible || !valid) {
      if (self.visible || self.window.isVisible) { self.visible = NO; [self.window orderOut:nil]; [CATransaction flush]; [self sourceChanged]; }
      return;
    }
    BOOL changed = !CGRectEqualToRect(bounds, self.targetBounds); self.targetBounds = bounds;
    if (!self.window) {
      if (!self.workspaceObservers) [self configureObservers];
      NSImage *image = CUCursorImage();
      // Original Window initializer: 0x1000968f8; constrainFrameRect: 0x100096ee8.
      self.window = [[CUCursorWindow alloc] initWithContentRect:NSMakeRect(0, 0, 20, 23) styleMask:NSWindowStyleMaskBorderless backing:NSBackingStoreBuffered defer:YES];
      self.window.title = @"Software Cursor"; self.window.collectionBehavior = (NSWindowCollectionBehavior)0x40048;
      self.window.releasedWhenClosed = NO; self.window.ignoresMouseEvents = YES; self.window.backgroundColor = NSColor.clearColor; self.window.opaque = NO;
      NSViewController *controller = [NSViewController new]; self.imageView = [[NSImageView alloc] initWithFrame:NSMakeRect(0, 0, 20, 23)];
      self.imageView.image = image; self.imageView.wantsLayer = YES; controller.view = self.imageView; self.window.contentViewController = controller;
      self.opaqueToken = [NSObject new]; changed = YES;
    }
    // Original convertPointFromCGCoordinates selects the screen containing (0,0).
    CGFloat top = 0;
    for (NSScreen *screen in NSScreen.screens) if (CGRectContainsPoint(NSRectToCGRect(screen.frame), CGPointZero)) { top = NSMaxY(screen.frame); break; }
    CGPoint point = CGPointMake(bounds.origin.x + self.displayLocal.x, bounds.origin.y + self.displayLocal.y);
    NSRect frame = NSMakeRect(point.x - 4, top - point.y + 4 - 23, 20, 23);
    if (self.initialPetPending) {
      CGPoint pet = self.initialPetPoint;
      frame.origin = CGPointMake(pet.x-4, pet.y+4-23);
      self.displayLocal = CGPointMake(pet.x-bounds.origin.x, top-pet.y-bounds.origin.y);
      CGPoint destination = CGPointMake(bounds.origin.x+self.local.x, top-bounds.origin.y-self.local.y);
      self.temporaryOverlay = !CGPointEqualToPoint(pet, destination); self.initialPetPending = NO;
    }
    if (self.motionActive) {
      frame.origin.x = round(bounds.origin.x + self.motionFramePoint.x);
      frame.origin.y = round(top - CGRectGetMaxY(bounds) + self.motionFramePoint.y);
    }
    if (!NSEqualRects(frame, self.window.frame)) { [self.window setFrame:frame display:NO]; changed = YES; }
    // Original 0x10009d254 excludes this cursor window when checking the pet-origin overlay reason.
    if (self.temporaryOverlay && self.correspondingWindow &&
        [NSWindow windowNumberAtPoint:CGPointMake(frame.origin.x+4, NSMaxY(frame)-4) belowWindowWithWindowNumber:self.window.windowNumber] == self.correspondingWindow) {
      self.temporaryOverlay = NO; changed = YES;
    }
    self.appIsActive = [NSRunningApplication runningApplicationWithProcessIdentifier:self.pid].isActive;
    BOOL overlay = self.appIsActive || self.menusOpen > 0 || self.temporaryOverlay;
    if (self.overlay != overlay) {
      self.overlay = overlay; changed = YES;
      if (overlay) {
        self.overlayPrimitiveAvailable = CUCursorSetOverlayLevel(self.window.windowNumber);
      }
    }
    NSInteger level = overlay ? 102 : [corresponding[(id)kCGWindowLayer] integerValue];
    if (self.window.level != level) { self.window.level = level; changed = YES; }
    if (overlay) {
      if (!self.window.isVisible || changed) [self.window orderFront:nil];
    } else if (corresponding && (cursorIndex == NSNotFound || cursorIndex + 1 != correspondingIndex)) {
      [self.window orderWindow:NSWindowAbove relativeTo:self.correspondingWindow]; changed = YES;
    } else if (!corresponding) { self.visible = NO; [self.window orderOut:nil]; [self sourceChanged]; return; }
    [self.window displayIfNeeded]; [CATransaction flush];
    if (!self.visible) { self.visible = YES; changed = YES; }
    if (changed) [self sourceChanged];
  } @finally { self.refreshing = NO; }
}
@end

static CUCursor *CUCursorEnsure(CUSession *session, CUWindow *target) {
  CUCursor *cursor = session.cursor;
  if (cursor && (cursor.lifecycleGeneration != session.lifecycleGeneration || ![cursor.label isEqual:session.label] || cursor.target != target.windowId || cursor.pid != target.pid || ![cursor.identity isEqual:target.processIdentity] || cursor.targetDestroyed)) {
    [cursor close]; session.cursor = nil; cursor = nil;
  }
  if (!cursor) {
    cursor = [CUCursor new]; cursor.session = session; cursor.label = session.label; cursor.lifecycleGeneration = session.lifecycleGeneration;
    cursor.identity = target.processIdentity; cursor.ownerIdentity = CUIdentity(getpid()); cursor.pid = target.pid; cursor.target = target.windowId; cursor.correspondingWindow = target.windowId; session.cursor = cursor;
    if (!ownedCursors) ownedCursors = [NSHashTable weakObjectsHashTable];
    [ownedCursors addObject:cursor]; [cursor configureObservers];
  }
  return cursor;
}

void CUCursorUpdate(CUSession *session, CUWindow *target, CGPoint local, CUCursorPhase phase) {
  if (!session || !target || atomic_load(&session->cancelled)) return;
  if (!isfinite(local.x) || !isfinite(local.y)) CUFail(@"invalid_arguments", @"Cursor coordinates must be finite.");
  NSString *label = [session.label copy]; uint64_t generation = session.lifecycleGeneration;
  double wall = NSDate.date.timeIntervalSince1970 * 1000;
  __block NSException *failure = nil;
  CUCursorMain(^{
    if (atomic_load(&session->cancelled) || generation != session.lifecycleGeneration || ![session.label isEqual:label]) return;
    @try {
      CUCursor *cursor = CUCursorEnsure(session, target);
      [cursor cancelFade];
      BOOL changesDestination = !CGPointEqualToPoint(cursor.local, local);
      cursor.local = local; cursor.updatedWall = wall; cursor.sequence++; cursor.wantsVisible = YES;
      if (!cursor.motionActive || (phase == CUCursorMove && changesDestination)) { [cursor cancelMotion]; cursor.displayLocal = local; }
      if (phase == CUCursorDown) cursor.down = YES;
      if (phase == CUCursorUp || phase == CUCursorClick) cursor.down = NO;
      [cursor refresh]; [cursor sourceChanged];
    } @catch (NSException *error) { failure = error; [session.cursor close]; }
  }, YES);
  if (failure) @throw failure;
}

BOOL CUCursorMoveTo(CUSession *session, CUWindow *target, CGPoint local, NSInteger nextInteractionTiming, BOOL animated) {
  if (!session || !target || atomic_load(&session->cancelled)) return NO;
  if (!isfinite(local.x) || !isfinite(local.y)) CUFail(@"invalid_arguments", @"Cursor coordinates must be finite.");
  dispatch_semaphore_t waiter = dispatch_semaphore_create(0);
  __block CUCursor *moving = nil; __block uint64_t movementGeneration = 0; __block BOOL ready = NO; __block NSException *failure = nil;
  CUCursorMain(^{
    if (atomic_load(&session->cancelled)) return;
    @try {
      CUCursor *cursor = CUCursorEnsure(session, target); BOOL wasVisible = cursor.window.isVisible;
      [cursor cancelFade];
      CGPoint startLocal = cursor.displayLocal;
      [cursor cancelMotion]; cursor.motionCancelled = NO; cursor.motionReady = NO;
      cursor.local = local; cursor.updatedWall = NSDate.date.timeIntervalSince1970 * 1000; cursor.sequence++; cursor.wantsVisible = YES;
      CUCursorPetLocation *pet = [petLocations objectForKey:session];
      BOOL hasPet = pet && pet.generation == session.lifecycleGeneration && [pet.label isEqual:session.label];
      if ((!wasVisible && !hasPet) || !animated) {
        cursor.displayLocal = local; [cursor refresh]; ready = cursor.visible; return;
      }
      if (!wasVisible) { cursor.initialPetPending = YES; cursor.initialPetPoint = pet.point; }
      [cursor refresh];
      if (!cursor.visible || !cursor.window.screen) return;
      if (!wasVisible) startLocal = cursor.displayLocal;
      double height = cursor.targetBounds.size.height;
      CGPoint start = CGPointMake(startLocal.x-4, height-startLocal.y+4-23), end = CGPointMake(local.x-4, height-local.y+4-23);
      if (CGPointEqualToPoint(start, end)) { cursor.temporaryOverlay = NO; cursor.displayLocal = local; [cursor refresh]; ready = YES; return; }
      // Original 0x100097c1c suppresses motion only when both pointer endpoints are occluded.
      CGPoint startPointer = CGPointMake(cursor.window.frame.origin.x+4, NSMaxY(cursor.window.frame)-4);
      CGPoint endPointer = CGPointMake(cursor.window.frame.origin.x+end.x-start.x+4, cursor.window.frame.origin.y+end.y-start.y+23-4);
      if (cursor.correspondingWindow && [NSWindow windowNumberAtPoint:startPointer belowWindowWithWindowNumber:0] != cursor.correspondingWindow &&
          [NSWindow windowNumberAtPoint:endPointer belowWindowWithWindowNumber:0] != cursor.correspondingWindow) {
        cursor.temporaryOverlay = NO; cursor.displayLocal = local; [cursor refresh]; ready = YES; return;
      }
      cursor.motionStart = start; cursor.motionEnd = end; cursor.motionFramePoint = start; cursor.motionScoot = hypot(end.x-start.x, end.y-start.y) <= CUCursorMotionDefaults.scootThreshold;
      if (cursor.motionScoot) {
        cursor.motionX = CUCursorSpringMake(start.x, end.x, CUCursorMotionDefaults.positionResponse, CUCursorMotionDefaults.positionDamping, CUCursorMotionDefaults.positionTolerance);
        cursor.motionY = CUCursorSpringMake(start.y, end.y, CUCursorMotionDefaults.positionResponse, CUCursorMotionDefaults.positionDamping, CUCursorMotionDefaults.positionTolerance);
      } else {
        CUCursorPath path = CUCursorChoosePath(start, end, CGRectMake(0, 0, cursor.targetBounds.size.width, height)); cursor.motionPath = path;
        double response = CUCursorPathResponse(path, CUCursorMeasurePath(path, CGRectMake(0, 0, cursor.targetBounds.size.width, height)));
        cursor.motionX = CUCursorSpringMake(0, 1, response, CUCursorMotionDefaults.pathDamping, .01);
      }
      cursor.motionWaitsForCompletion = (nextInteractionTiming & 1) != 0;
      cursor.motionActive = YES; cursor.motionStarted = CUCursorNow(); cursor.motionWaiter = waiter;
      cursor.motionDisplayLink = [cursor.window.screen displayLinkWithTarget:cursor selector:@selector(advanceMotion:)];
      if (!cursor.motionDisplayLink) CUFail(@"cursor_animation_unavailable", @"A native cursor display link is unavailable.");
      [cursor.motionDisplayLink addToRunLoop:NSRunLoop.mainRunLoop forMode:NSRunLoopCommonModes];
      moving = cursor; movementGeneration = cursor.motionGeneration;
    } @catch (NSException *error) { failure = error; [session.cursor close]; }
  }, YES);
  if (failure) @throw failure;
  if (!moving) return ready;
  for (;;) {
    if (NSThread.isMainThread) {
      if (moving.motionReady || moving.motionCancelled || moving.motionGeneration != movementGeneration) break;
      [NSRunLoop.mainRunLoop runMode:NSDefaultRunLoopMode beforeDate:[NSDate dateWithTimeIntervalSinceNow:.008]];
    } else if (dispatch_semaphore_wait(waiter, dispatch_time(DISPATCH_TIME_NOW, 8 * NSEC_PER_MSEC)) == 0) break;
    if (atomic_load(&session->cancelled)) { CUCursorMain(^{ [moving close]; }, YES); break; }
  }
  CUCursorMain(^{ ready = moving.motionGeneration == movementGeneration && moving.motionReady && !moving.motionCancelled && [moving ownsLiveSession]; }, YES);
  return ready;
}

void CUCursorSetPetLocation(CUSession *session, CGPoint globalCocoaPoint, BOOL available) {
  if (!session || atomic_load(&session->cancelled)) return;
  if (available && (!isfinite(globalCocoaPoint.x) || !isfinite(globalCocoaPoint.y))) CUFail(@"invalid_arguments", @"Pet coordinates must be finite.");
  NSString *label = [session.label copy]; uint64_t generation = session.lifecycleGeneration;
  CUCursorMain(^{
    if (atomic_load(&session->cancelled) || generation != session.lifecycleGeneration || ![label isEqual:session.label]) return;
    if (!petLocations) petLocations = [NSMapTable weakToStrongObjectsMapTable];
    if (!available) { [petLocations removeObjectForKey:session]; return; }
    // Original setPetLocationWithX:y:available:withReply: -> 0x1001f7100. No product sender is connected.
    CUCursorPetLocation *pet = [CUCursorPetLocation new]; pet.label = label; pet.generation = generation; pet.point = globalCocoaPoint;
    [petLocations setObject:pet forKey:session];
  }, YES);
}

static NSDictionary *CUCursorPhysicalWindow(CUCursor *cursor) {
  if (!cursor.window || cursor.window.windowNumber <= 0 || !cursor.window.isVisible || !cursor.visible || ![cursor ownsLiveSession]) return nil;
  NSArray *windows = CFBridgingRelease(CGWindowListCopyWindowInfo(kCGWindowListOptionOnScreenOnly, kCGNullWindowID));
  NSDictionary *physical = nil; BOOL targetPresent = NO;
  for (NSDictionary *window in windows) {
    CGWindowID number = [window[(id)kCGWindowNumber] unsignedIntValue];
    if (number == cursor.target && [window[(id)kCGWindowOwnerPID] intValue] == cursor.pid) targetPresent = YES;
    if (number == cursor.window.windowNumber && [window[(id)kCGWindowOwnerPID] intValue] == getpid()) physical = window;
  }
  return targetPresent ? physical : nil;
}
static CUCursor *CUCursorFindOwner(pid_t pid, CGWindowID target, NSString *label) {
  CUCursor *owner = nil;
  for (CUCursor *cursor in ownedCursors.allObjects) {
    if (cursor.pid != pid || cursor.target != target || ![cursor.label isEqual:label] || ![cursor ownsLiveSession]) continue;
    if (owner) return nil;
    owner = cursor;
  }
  return owner;
}
NSDictionary *CUCursorCaptureSource(pid_t targetPID, CGWindowID targetWindowId, NSString *ownerSessionLabel) {
  if (!ownerSessionLabel.length) return nil;
  __block NSDictionary *result = nil;
  CUCursorMain(^{
    CUCursor *cursor = CUCursorFindOwner(targetPID, targetWindowId, ownerSessionLabel);
    if (!cursor) return;
    @try {
      [cursor refresh]; NSDictionary *physical = CUCursorPhysicalWindow(cursor); CGRect bounds;
      if (!physical || !cursor.opaqueToken || !CGRectMakeWithDictionaryRepresentation((__bridge CFDictionaryRef)physical[(id)kCGWindowBounds], &bounds)) return;
      result = @{@"cursorWindowID":@(cursor.window.windowNumber),@"ownerPID":@(getpid()),@"ownerProcessIdentity":cursor.ownerIdentity,
        @"targetPID":@(cursor.pid),@"targetWindowId":@(cursor.target),@"targetProcessIdentity":cursor.identity,@"ownerSessionLabel":cursor.label,
        @"opaqueToken":cursor.opaqueToken,@"lifecycleGeneration":@(cursor.lifecycleGeneration),@"visible":@YES,
        @"cursorStyleParityAvailable":@YES,@"cursorMotionParityAvailable":@YES,@"cursorOverlayParityAvailable":@YES,@"cursorFadeParityAvailable":@(cursor.fadeFilterAvailable),
        @"petLocationIntegration":@NO,@"temporaryOverlay":@(cursor.temporaryOverlay),
        @"overlayPrimitiveAvailable":@(cursor.overlayPrimitiveAvailable),
        @"menusOpen":@(cursor.menusOpen),@"appIsActive":@(cursor.appIsActive),@"targetCGBounds":CUCursorRect(cursor.targetBounds),
        @"cursorCGBounds":CUCursorRect(bounds),@"cursorCocoaBounds":CUCursorRect(NSRectToCGRect(cursor.window.frame)),@"sequence":@(cursor.sequence)};
    } @catch (NSException *error) { [cursor close]; }
  }, YES);
  return result;
}
BOOL CUCursorCaptureSourceIsCurrent(NSDictionary *source) {
  if (![source isKindOfClass:NSDictionary.class] || !source[@"opaqueToken"]) return NO;
  __block BOOL current = NO;
  CUCursorMain(^{ for (CUCursor *cursor in ownedCursors.allObjects) {
    if (source[@"opaqueToken"] != cursor.opaqueToken || ![cursor ownsLiveSession] || [source[@"cursorWindowID"] unsignedIntValue] != cursor.window.windowNumber ||
      [source[@"ownerPID"] intValue] != getpid() || ![source[@"ownerProcessIdentity"] isEqual:cursor.ownerIdentity] || [source[@"targetPID"] intValue] != cursor.pid ||
      [source[@"targetWindowId"] unsignedIntValue] != cursor.target || ![source[@"targetProcessIdentity"] isEqual:cursor.identity] ||
      ![source[@"ownerSessionLabel"] isEqual:cursor.label] || [source[@"lifecycleGeneration"] unsignedLongLongValue] != cursor.lifecycleGeneration) continue;
    @try { current = [CUIdentity(cursor.pid) isEqual:cursor.identity] && [CUIdentity(getpid()) isEqual:cursor.ownerIdentity] && CUCursorPhysicalWindow(cursor) != nil; }
    @catch (NSException *error) { current = NO; }
    break;
  } }, YES);
  return current;
}
NSDictionary *CUCursorSnapshot(pid_t pid, CGWindowID window, NSString *ownerSessionLabel) {
  if (!ownerSessionLabel.length) return nil;
  __block NSDictionary *result = nil;
  CUCursorMain(^{
    CUCursor *cursor = CUCursorFindOwner(pid, window, ownerSessionLabel);
    if (!cursor) return;
    @try {
      [cursor refresh]; if (!CUCursorPhysicalWindow(cursor)) return;
      result = @{@"source":cursor.label,@"isActive":@YES,@"process_identity":cursor.identity,@"window_id":@(cursor.target),@"sequence":@(cursor.sequence),
        @"x":@(cursor.local.x),@"y":@(cursor.local.y),@"buttons":@(cursor.down ? 1 : 0),@"geometry":CUCursorRect(cursor.targetBounds),@"at":@(cursor.updatedWall)};
    } @catch (NSException *error) { [cursor close]; }
  }, YES);
  return result;
}
BOOL CUCursorGetPosition(CUSession *session, CUWindow *target, CGPoint *local) {
  if (!session || !target || !local || atomic_load(&session->cancelled)) return NO;
  __block CGPoint position = CGPointZero; __block BOOL available = NO;
  CUCursorMain(^{
    CUCursor *cursor = session.cursor;
    if (!cursor || ![cursor ownsLiveSession] || cursor.pid != target.pid || cursor.target != target.windowId || ![cursor.identity isEqual:target.processIdentity]) return;
    if (![CUIdentity(cursor.pid) isEqual:cursor.identity]) return;
    position = cursor.local; available = isfinite(position.x) && isfinite(position.y);
  }, YES);
  if (available) *local = position;
  return available;
}
BOOL CUCursorHide(CUSession *session, NSString *label, BOOL wait) {
  __block NSSet<NSNumber *> *retired = nil;
  CUCursorMain(^{
    if (atomic_load(&session->cancelled)) [petLocations removeObjectForKey:session];
    CUCursor *cursor = session.cursor;
    if (cursor && [cursor.label isEqual:label]) {
      if (atomic_load(&session->cancelled)) { [cursor close]; session.cursor = nil; }
      else {
        if (!session.retiredCursorWindows) session.retiredCursorWindows = [NSMutableSet new];
        if (cursor.window.windowNumber > 0) [session.retiredCursorWindows addObject:@(cursor.window.windowNumber)];
        [cursor fadeOut];
      }
    }
    if (wait) retired = [session.retiredCursorWindows copy];
  }, wait);
  if (!wait || !retired.count) return YES;
  double deadline = CUCursorNow() + .5;
  for (;;) {
    NSArray *windows = CFBridgingRelease(CGWindowListCopyWindowInfo(kCGWindowListOptionOnScreenOnly, kCGNullWindowID)); BOOL visible = NO;
    for (NSDictionary *window in windows) if ([window[(id)kCGWindowOwnerPID] intValue] == getpid() && [retired containsObject:window[(id)kCGWindowNumber]]) { visible = YES; break; }
    if (windows && !visible) { CUCursorMain(^{ [session.retiredCursorWindows minusSet:retired]; }, YES); return YES; }
    if (CUCursorNow() >= deadline || NSThread.isMainThread) return NO;
    usleep(8000);
  }
}
