#import "ComputerUse.h"
#import "InputFocus.h"
#import "WindowRegistry.h"
#import <dlfcn.h>
#import <unistd.h>
#import <objc/runtime.h>
#import <Carbon/Carbon.h>
#import <time.h>

@interface CUInputMouseTarget : NSObject
@property pid_t pid;
@property CGWindowID windowId;
@property CGRect frame;
@property(strong) id element;
@end
@implementation CUInputMouseTarget
@end

static CUInputMouseTarget *CUResolveMouseTarget(CUSession *session,CUWindow *target,CGPoint screen,id element);
static void CUInputCheckMouseTarget(CUInputMouseTarget *target);
static CGPoint CUInputMoveTo(CUSession *session,CUWindow *target,CGPoint scaled,NSInteger timing,BOOL animated);
static void CUInputPositionElement(CUSession *session,CUWindow *target,AXUIElementRef element,NSInteger timing,BOOL animated);

static const void *CUInputPositions=&CUInputPositions;
// OpenCU enables the sourced cursor branch; this is not Codex's remote rollout default.
static const BOOL CUInputCursorEnabled=YES;
static NSString *CUInputPositionKey(CUWindow *target) {return [NSString stringWithFormat:@"%d:%@",target.pid,target.processIdentity];}
static void CUInputCheckCoordinateMapping(CUWindow *target) {
  CGRect rect=target.sourceVisibleRect;double scale=target.sourcePointsPerPixel;
  if(!isfinite(scale)||scale<=0||CGRectIsNull(rect)||CGRectIsInfinite(rect)||
     !isfinite(rect.origin.x)||!isfinite(rect.origin.y)||!isfinite(rect.size.width)||!isfinite(rect.size.height)||
     rect.size.width<=0||rect.size.height<=0)
    CUFail(@"STALE_SCREENSHOT",@"Capture a screenshot with a valid coordinate mapping before using coordinates.");
}
static CGFloat CUInputTruncatedPixel(CGFloat value) {
  if(!isfinite(value)||value< -0x1p63||value>=0x1p63)
    CUFail(@"INVALID_POINT",@"The point cannot be represented as a signed 64-bit screenshot coordinate.");
  return trunc(value);
}
static CGPoint CUInputPointFromScaled(CUWindow *target,CGPoint scaled) {
  CUInputCheckCoordinateMapping(target);
  // Source pixels -> global screen points -> the cursor adapter's selected-window local space.
  CGAffineTransform transform=CGAffineTransformMakeScale(target.sourcePointsPerPixel,target.sourcePointsPerPixel);
  CGPoint screen=CGPointApplyAffineTransform(scaled,transform);
  screen=CGPointApplyAffineTransform(screen,CGAffineTransformMakeTranslation(target.sourceVisibleRect.origin.x,target.sourceVisibleRect.origin.y));
  if(!isfinite(screen.x)||!isfinite(screen.y))CUFail(@"INVALID_POINT",@"The screenshot coordinate cannot be mapped to a finite screen point.");
  return CGPointMake(screen.x-target.bounds.origin.x,screen.y-target.bounds.origin.y);
}
static void CUInputRememberPoint(CUSession *session,CUWindow *target,CGPoint scaled) {
  @synchronized(session){NSMutableDictionary *positions=objc_getAssociatedObject(session,CUInputPositions);if(!positions){positions=[NSMutableDictionary new];objc_setAssociatedObject(session,CUInputPositions,positions,OBJC_ASSOCIATION_RETAIN_NONATOMIC);}positions[CUInputPositionKey(target)]=[NSValue valueWithPoint:NSMakePoint(scaled.x,scaled.y)];}
}
static CGPoint CUInputCurrentPoint(CUSession *session,CUWindow *target) {
  @synchronized(session){NSValue *position=objc_getAssociatedObject(session,CUInputPositions)[CUInputPositionKey(target)];NSPoint point=position?position.pointValue:NSZeroPoint;return CUInputPointFromScaled(target,CGPointMake(point.x,point.y));}
}

static void *CUSymbol(const char *name) {
  static dispatch_once_t once;dispatch_once(&once,^{dlopen("/System/Library/PrivateFrameworks/SkyLight.framework/SkyLight",RTLD_LAZY|RTLD_GLOBAL);});
  return dlsym(RTLD_DEFAULT,name);
}
static void CUStamp(CGEventRef event,CUInputMouseTarget *target,CGPoint local,int count,int button) {
  typedef void(*SetLocation)(CGEventRef,CGPoint);SetLocation location=CUSymbol("CGEventSetWindowLocation");
  if(!location)CUFail(@"BACKGROUND_UNAVAILABLE",@"Window-directed events are unavailable on this macOS version.");
  location(event,local);CGEventSetIntegerValueField(event,(CGEventField)91,target.windowId);CGEventSetIntegerValueField(event,(CGEventField)92,target.windowId);
  if(CGEventGetType(event)==kCGEventScrollWheel)CGEventSetIntegerValueField(event,(CGEventField)51,target.windowId);
  else{CGEventSetIntegerValueField(event,kCGMouseEventClickState,count);CGEventSetIntegerValueField(event,kCGMouseEventButtonNumber,button);CGEventSetIntegerValueField(event,(CGEventField)7,3);}
}
static void CUPost(CGEventRef event,CUWindow *target) {
  CGEventSetTimestamp(event,(CGEventTimestamp)(NSProcessInfo.processInfo.systemUptime*1e9));
  CGEventPostToPid(target.pid,event);
}
static void CUPostPointer(CGEventRef event,CUInputMouseTarget *target) {
  CGEventSetTimestamp(event,(CGEventTimestamp)(NSProcessInfo.processInfo.systemUptime*1e9));
  CGEventPostToPid(target.pid,event);
}
static void CUInputCheckPid(pid_t pid) {
  NSString *bundle=[NSRunningApplication runningApplicationWithProcessIdentifier:pid].bundleIdentifier;
  if([@[@"com.apple.UserNotificationCenter",@"com.apple.LocalAuthenticationRemoteService",@"com.apple.SecurityAgent"]containsObject:bundle])
    CUFail(@"INPUT_TARGET_RESTRICTED",@"Input to this system security application is not permitted.");
}
static void CUInputCheckMouseTarget(CUInputMouseTarget *target) {CUInputCheckPid(target.pid);}
static CGPoint CUPoint(NSDictionary *args,NSString *xKey,NSString *yKey,CUWindow *target) {
  CUInputCheckCoordinateMapping(target);
  id x=args[xKey],y=args[yKey];if(![x isKindOfClass:NSNumber.class]||![y isKindOfClass:NSNumber.class]||!isfinite([x doubleValue])||!isfinite([y doubleValue]))CUFail(@"INVALID_POINT",@"Finite screenshot x and y coordinates are required.");
  return CGPointMake(CUInputTruncatedPixel([x doubleValue]),CUInputTruncatedPixel([y doubleValue]));
}
static int64_t CUNextMouseEventNumber(void) {
  static NSLock *lock;static int64_t next;static dispatch_once_t once;dispatch_once(&once,^{lock=[NSLock new];});
  [lock lock];if(next==INT64_MAX){[lock unlock];CUFail(@"INPUT_FAILED",@"The pointer event sequence is exhausted.");}int64_t number=next++;[lock unlock];return number;
}
static CGEventRef CUCreateMouseEvent(CUWindow *window,CUInputMouseTarget *target,CGEventType type,CGPoint local,int count,CGMouseButton button,CGEventFlags flags,int64_t number) {
  CGPoint screen=CGPointMake(window.bounds.origin.x+local.x,window.bounds.origin.y+local.y);
  CGPoint eventLocal=CGPointMake(screen.x-target.frame.origin.x,screen.y-target.frame.origin.y);
  NSEvent *mouse=[NSEvent mouseEventWithType:(NSEventType)type location:NSMakePoint(screen.x,screen.y) modifierFlags:0 timestamp:0 windowNumber:target.windowId context:nil eventNumber:number clickCount:count pressure:1];
  CGEventRef event=mouse.CGEvent;
  if(!event)CUFail(@"INPUT_FAILED",@"Could not create the pointer event.");
  event=(CGEventRef)CFRetain(event);
  @try{CGEventSetFlags(event,flags);CGEventSetLocation(event,screen);CUStamp(event,target,eventLocal,count,button);}@catch(NSException *error){CFRelease(event);@throw;}
  return event;
}
static void CUPointerCursor(CUSession *session,CUWindow *target,CGEventType type,CGPoint local) {
  CUCursorPhase phase=(type==kCGEventLeftMouseDown||type==kCGEventRightMouseDown||type==kCGEventOtherMouseDown)?CUCursorDown:(type==kCGEventLeftMouseUp||type==kCGEventRightMouseUp||type==kCGEventOtherMouseUp)?CUCursorUp:CUCursorMove;
  CUCursorUpdate(session,target,local,phase);
}
static void CUCursorElement(CUSession *session,CUWindow *target) {
  CGPoint point;if(CUCursorGetPosition(session,target,&point))CUCursorUpdate(session,target,point,CUCursorClick);
}
static AXUIElementRef CUElementFor(CUSession *session,CUWindow *target,NSDictionary *args) {
  [session check];NSString *token=args[@"element_token"];NSNumber *index=args[@"element_index"];
  if(token){
    if(![token isKindOfClass:NSString.class])CUFail(@"INVALID_ELEMENT",@"Element token must be a string from the observation.");
    NSArray *parts=[token componentsSeparatedByString:@":"];
    if(parts.count!=2||![parts[0] isEqualToString:target.snapshotId])CUFail(@"STALE_ELEMENT",@"Read the current window state before acting on this element.");
    NSScanner *scanner=[NSScanner scannerWithString:parts[1]];scanner.charactersToBeSkipped=nil;unsigned long long value;
    if(![scanner scanUnsignedLongLong:&value]||!scanner.isAtEnd)CUFail(@"INVALID_ELEMENT",@"Malformed element token.");index=@(value);
  }
  if(![index isKindOfClass:NSNumber.class]||index.doubleValue!=index.unsignedIntegerValue)CUFail(@"INVALID_ELEMENT",@"Element index must be a nonnegative integer from the observation.");
  CUElement *element=target.elements[index];if(!element)CUFail(@"STALE_ELEMENT",@"The element is absent from the latest observation.");
  pid_t pid=0;if(AXUIElementGetPid(element.ax,&pid)!=kAXErrorSuccess||pid!=target.pid)CUFail(@"STALE_ELEMENT",@"The element no longer belongs to the selected process.");
  AXUIElementRef window=(__bridge AXUIElementRef)CUAX(element.ax,kAXWindowAttribute);
  if(window&&CUAXWindowId(window)!=target.windowId)CUFail(@"WRONG_WINDOW",@"The element moved to another window.");
  CUElement *replacement=CURefetchRecordedElement(session,target,element,YES,YES);
  if(!replacement.ax)CUFail(@"STALE_ELEMENT",@"The observed element no longer has a unique current match.");return replacement.ax;
}
static void CUSleep(CUSession *session,NSUInteger milliseconds) {
  for(NSUInteger elapsed=0;elapsed<milliseconds;){[session check];NSUInteger interval=MIN(8,milliseconds-elapsed);usleep((useconds_t)interval*1000);elapsed+=interval;}
}
static NSDictionary *CUPointerEvent(CUWindow *target,CUInputMouseTarget *route,CGEventType type,CGPoint point,int count,CGMouseButton button,CGEventFlags flags,int64_t number) {
  CGEventRef event=CUCreateMouseEvent(target,route,type,point,count,button,flags,number);
  return @{@"event":CFBridgingRelease(event),@"point":[NSValue valueWithPoint:NSMakePoint(point.x,point.y)]};
}
static NSArray<NSDictionary *> *CUClickPacket(CUSession *session,CUWindow *target,CUInputMouseTarget *route,CGPoint from,CGPoint to,BOOL drag,CGMouseButton button,NSUInteger count,CGEventFlags flags) {
  CGEventType down=button==0?kCGEventLeftMouseDown:button==1?kCGEventRightMouseDown:kCGEventOtherMouseDown;
  CGEventType up=button==0?kCGEventLeftMouseUp:button==1?kCGEventRightMouseUp:kCGEventOtherMouseUp;
  CGEventType moved=button==0?kCGEventLeftMouseDragged:button==1?kCGEventRightMouseDragged:kCGEventOtherMouseDragged;
  NSMutableArray *packet=[NSMutableArray new];
  for(NSUInteger click=1;click<=count;click++){
    [session check];int64_t number=CUNextMouseEventNumber();
    NSDictionary *release=CUPointerEvent(target,route,up,drag?to:from,(int)click,button,flags,number);
    NSMutableDictionary *press=[CUPointerEvent(target,route,down,from,(int)click,button,flags,number)mutableCopy];press[@"release"]=release;
    [packet addObject:press];
    if(drag){
      int64_t draggedNumber=CUNextMouseEventNumber();CGPoint middle=CGPointMake((from.x+to.x)/2,(from.y+to.y)/2);
      for(NSValue *value in @[[NSValue valueWithPoint:NSMakePoint(from.x,from.y)],[NSValue valueWithPoint:NSMakePoint(middle.x,middle.y)],[NSValue valueWithPoint:NSMakePoint(to.x,to.y)]]){
        NSPoint point=value.pointValue;[packet addObject:CUPointerEvent(target,route,moved,CGPointMake(point.x,point.y),0,button,flags,draggedNumber)];
      }
    }
    [packet addObject:release];
  }
  return packet;
}
static void CUSendClickPacket(CUSession *session,CUWindow *target,CUInputMouseTarget *route,NSArray<NSDictionary *> *packet,BOOL drag,NSUInteger duration) {
  NSDictionary *pendingRelease=nil;
  @try{
    for(NSUInteger index=0;index<packet.count;index++){
      NSDictionary *item=packet[index];
      [session check];CGEventRef event=(__bridge CGEventRef)item[@"event"];CGEventType type=CGEventGetType(event);NSPoint point=[item[@"point"]pointValue];
      if(item[@"release"])pendingRelease=item[@"release"];
      CUPostPointer(event,route);
      if(type==kCGEventLeftMouseUp||type==kCGEventRightMouseUp||type==kCGEventOtherMouseUp)pendingRelease=nil;
      CUPointerCursor(session,target,type,CGPointMake(point.x,point.y));
      if(index+1<packet.count&&!drag)CUSleep(session,item[@"release"]?duration:50);
    }
  }@finally{
    if(pendingRelease){CGEventRef event=(__bridge CGEventRef)pendingRelease[@"event"];CUPostPointer(event,route);NSPoint point=[pendingRelease[@"point"]pointValue];CUPointerCursor(session,target,CGEventGetType(event),CGPointMake(point.x,point.y));}
  }
}
static NSUInteger CUInputDuration(NSDictionary *args,NSUInteger fallback) {
  id duration=args[@"duration_ms"];if(!duration)return fallback;
  if(![duration isKindOfClass:NSNumber.class]||!isfinite([duration doubleValue])||[duration doubleValue]<0||[duration doubleValue]>30000||[duration doubleValue]!=[duration unsignedIntegerValue])CUFail(@"INVALID_DURATION",@"duration_ms must be an integer from 0 to 30000 milliseconds.");
  return [duration unsignedIntegerValue];
}
static NSString *CUActionName(id value) {
  if(![value isKindOfClass:NSString.class]||![value length])CUFail(@"INVALID_ACTION",@"An accessibility action name is required.");
  NSDictionary *aliases=@{@"press":@"AXPress",@"show_menu":@"AXShowMenu",@"confirm":@"AXConfirm",@"cancel":@"AXCancel",@"pick":@"AXPick"};return aliases[value]?:value;
}
static NSArray *CUActions(AXUIElementRef element) {
  CFArrayRef available=NULL;AXError error=AXUIElementCopyActionNames(element,&available);
  if(error!=kAXErrorSuccess){if(available)CFRelease(available);return @[];}
  return available?CFBridgingRelease(available):@[];
}
static BOOL CUInputPrepareMenu(CUSession *session,CUWindow *target,AXUIElementRef element) {
  if(![CUAX(element,kAXRoleAttribute)isEqual:@"AXMenuBarItem"])return NO;
  id children=CUAX(element,kAXChildrenAttribute),menu=nil;
  if(![children isKindOfClass:NSArray.class])return NO;
  for(id child in children){
    [session check];if(CFGetTypeID((__bridge CFTypeRef)child)==AXUIElementGetTypeID()&&
      [CUAX((__bridge AXUIElementRef)child,kAXRoleAttribute)isEqual:@"AXMenu"]){menu=child;break;}
  }
  if(!menu)return NO;
  AXUIElementRef window=CUWindowRegistryCopyLastCaptureWindow(target);
  @try{
    CUEnforceInputFocusForAXWindow(session,target,window);[session check];
    CUWindowRegistryDidPrepareMenu(target,element,(__bridge AXUIElementRef)menu);
    CUInputFocusActionPerformed(session,target);return YES;
  }@finally{if(window)CFRelease(window);}
}
static NSDictionary *CUPerformAction(CUSession *session,CUWindow *target,AXUIElementRef element,NSString *action) {
  if(![CUActions(element) containsObject:action])CUFail(@"UNSUPPORTED_ACTION",@"That action is not offered by this observed element.");
  [session check];AXError error=AXUIElementPerformAction(element,(__bridge CFStringRef)action);
  if(error!=kAXErrorSuccess)CUFail(@"ACTION_FAILED",[NSString stringWithFormat:@"The control refused the action (AX error %d).",error]);
  CUInputFocusActionPerformed(session,target);
  CUCursorElement(session,target);return CUResult(@{@"route":@"accessibility",@"effect":@"unverifiable"});
}
static NSArray<NSString *> *CUInputAttributes(AXUIElementRef element) {
  CFArrayRef attributes=NULL;AXError error=AXUIElementCopyAttributeNames(element,&attributes);
  if(error!=kAXErrorSuccess){if(attributes)CFRelease(attributes);return @[];}
  return attributes?CFBridgingRelease(attributes):@[];
}
static id CUInputParent(AXUIElementRef element) {
  id parent=CUAX(element,kAXParentAttribute);
  return parent&&CFGetTypeID((__bridge CFTypeRef)parent)==AXUIElementGetTypeID()?parent:nil;
}
static BOOL CUClickMayCauseSelection(CUSession *session,AXUIElementRef element) {
  id current=element?(__bridge id)element:nil;
  for(NSUInteger i=0;current&&i<300;i++){
    [session check];AXUIElementRef ax=(__bridge AXUIElementRef)current;NSString *role=CUAX(ax,kAXRoleAttribute);
    if([role isEqual:(__bridge NSString *)kAXApplicationRole])return NO;
    NSArray *attributes=CUInputAttributes(ax);
    if(![role isEqual:@"AXMenuItem"]&&![role isEqual:@"AXMenuBarItem"]&&[attributes containsObject:(__bridge NSString *)kAXSelectedAttribute]){
      Boolean settable=false;
      if(AXUIElementIsAttributeSettable(ax,kAXSelectedAttribute,&settable)==kAXErrorSuccess&&settable)return YES;
    }
    for(NSString *attribute in @[@"AXSelectedRows",@"AXSelectedCells",@"AXSelectedChildren"])if([attributes containsObject:attribute])return YES;
    current=CUInputParent(ax);
  }
  return NO;
}
static BOOL CUCatalystApplication(CUWindow *target) {
  AXUIElementRef application=AXUIElementCreateApplication(target.pid);AXUIElementSetMessagingTimeout(application,.25);
  id value=CUAX(application,CFSTR("_AXExhibitsMacCatalystBehavior"));CFRelease(application);
  return [value isKindOfClass:NSNumber.class]&&[value boolValue];
}
static BOOL CUInsideWebView(CUSession *session,AXUIElementRef element) {
  if(!element)return NO;
  id current=(__bridge id)element;
  for(NSUInteger i=0;current&&i<300;i++){
    [session check];AXUIElementRef ax=(__bridge AXUIElementRef)current;
    if([CUAX(ax,kAXRoleAttribute)isEqual:@"AXWebArea"])return YES;
    current=CUInputParent(ax);
  }
  pid_t pid=0;if(AXUIElementGetPid(element,&pid)!=kAXErrorSuccess)return NO;
  return [[NSRunningApplication runningApplicationWithProcessIdentifier:pid].bundleIdentifier hasPrefix:@"com.openai.atlas"];
}
static BOOL CUPrepareClickFocus(CUSession *session,CUWindow *target,AXUIElementRef element,BOOL insideWebView,BOOL heldKey,CGEventFlags flags) {
  if(CUInputFocusBelievesFocused(session,target))return NO;
  if(heldKey||flags||insideWebView||CUClickMayCauseSelection(session,element)){CUEnforceInputFocus(session,target);return YES;}
  if(element&&CUCatalystApplication(target)&&(CUClickMayCauseSelection(session,element)||[CUAX(element,kAXRoleAttribute)isEqual:@"AXMenuButton"])){CUEnforceInputFocus(session,target);return YES;}
  return NO;
}
static id CUInputHit(AXUIElementRef application,CGPoint point) {
  AXUIElementRef hit=NULL;AXError error=AXUIElementCopyElementAtPosition(application,point.x,point.y,&hit);
  if(error!=kAXErrorSuccess){if(hit)CFRelease(hit);return nil;}
  return hit?CFBridgingRelease(hit):nil;
}
static BOOL CUInputFrame(AXUIElementRef element,CGRect *frame) {
  id value=CUAX(element,CFSTR("AXFrame"));
  return value&&CFGetTypeID((__bridge CFTypeRef)value)==AXValueGetTypeID()&&
    AXValueGetValue((__bridge AXValueRef)value,kAXValueCGRectType,frame);
}
static BOOL CUInputFrameWithFallback(AXUIElementRef element,CGRect *frame) {
  if(CUInputFrame(element,frame))return YES;
  id position=CUAX(element,kAXPositionAttribute),size=CUAX(element,kAXSizeAttribute);CGPoint p;CGSize s;
  if(!position||!size||CFGetTypeID((__bridge CFTypeRef)position)!=AXValueGetTypeID()||CFGetTypeID((__bridge CFTypeRef)size)!=AXValueGetTypeID()||
     !AXValueGetValue((__bridge AXValueRef)position,kAXValueCGPointType,&p)||!AXValueGetValue((__bridge AXValueRef)size,kAXValueCGSizeType,&s))return NO;
  *frame=CGRectMake(p.x,p.y,s.width,s.height);return YES;
}
static pid_t CUInputActualPid(AXUIElementRef element) {
  typedef AXError(*Getter)(AXUIElementRef,pid_t *);Getter getter=CUSymbol("_AXUIElementGetActualPid");
  if(!getter)CUFail(@"BACKGROUND_UNAVAILABLE",@"The accessibility process resolver is unavailable.");
  pid_t pid=-1;AXError error=getter(element,&pid);
  if(error!=kAXErrorSuccess)CUFail(@"POINTER_TARGET_FAILED",@"The accessibility target process could not be resolved.");
  return pid;
}
static BOOL CUInputWindowId(AXUIElementRef element,CGWindowID *windowId) {
  typedef AXError(*Getter)(AXUIElementRef,CGWindowID *);Getter getter=CUSymbol("_AXUIElementGetWindow");
  if(!getter)CUFail(@"BACKGROUND_UNAVAILABLE",@"The accessibility window resolver is unavailable.");
  return getter(element,windowId)==kAXErrorSuccess;
}
static CGWindowID CUInputRequiredWindowId(AXUIElementRef element) {
  CGWindowID windowId=0;if(!CUInputWindowId(element,&windowId))CUFail(@"POINTER_TARGET_FAILED",@"The pointer target does not expose its window number.");return windowId;
}
static CGWindowID CUInputWindowForPid(CUSession *session,AXUIElementRef element,pid_t pid) {
  id current=(__bridge id)element;
  for(NSUInteger i=0;current&&i<300;i++){
    [session check];AXUIElementRef ax=(__bridge AXUIElementRef)current;pid_t candidate=0;
    if(AXUIElementGetPid(ax,&candidate)==kAXErrorSuccess&&candidate==pid)return CUInputRequiredWindowId(ax);
    current=CUInputParent(ax);
  }
  CUFail(@"POINTER_TARGET_FAILED",@"No ancestor belongs to the application receiving this pointer input.");return 0;
}
static id CUInputOutOfProcessElement(CUSession *session,AXUIElementRef element,pid_t appPid,pid_t *pid) {
  id current=(__bridge id)element;
  for(NSUInteger i=0;current&&i<300;i++){
    [session check];AXUIElementRef ax=(__bridge AXUIElementRef)current;pid_t candidate=0;
    NSRunningApplication *app=AXUIElementGetPid(ax,&candidate)==kAXErrorSuccess?[NSRunningApplication runningApplicationWithProcessIdentifier:candidate]:nil;
    if(app&&app.finishedLaunching){
      if(app.activationPolicy!=NSApplicationActivationPolicyProhibited||candidate==appPid)return nil;
      *pid=candidate;return current;
    }
    current=CUInputParent(ax);
  }
  return nil;
}
static BOOL CUInputOutOfProcessWindow(CUSession *session,AXUIElementRef element,pid_t appPid,pid_t *pid,CGWindowID *windowId) {
  pid_t effectivePid=0;id effective=CUInputOutOfProcessElement(session,element,appPid,&effectivePid);
  if(!effective)return NO;
  id current=effective;
  for(NSUInteger i=0;current&&i<300;i++){
    [session check];AXUIElementRef ax=(__bridge AXUIElementRef)current;CGWindowID candidate=0;
    if(CUInputWindowId(ax,&candidate)){*pid=effectivePid;*windowId=candidate;return YES;}
    NSString *role=CUAX(ax,kAXRoleAttribute);if([role isEqual:@"AXWindow"]||[role isEqual:@"AXSheet"])break;
    current=CUInputParent(ax);
  }
  CUFail(@"POINTER_TARGET_FAILED",@"The embedded process does not expose an ancestor window number.");return NO;
}
static NSDictionary *CUInputCGWindow(CGWindowID windowId) {
  if(!windowId)return nil;
  const void *value=(const void *)(uintptr_t)windowId;CFArrayRef ids=CFArrayCreate(NULL,&value,1,NULL);
  CFArrayRef descriptions=CGWindowListCreateDescriptionFromArray(ids);CFRelease(ids);
  NSArray *windows=descriptions?CFBridgingRelease(descriptions):nil;id first=windows.firstObject;
  if(![first isKindOfClass:NSDictionary.class])return nil;
  id number=first[(__bridge NSString *)kCGWindowNumber];
  if(![number isKindOfClass:NSNumber.class]||[number doubleValue]<0||[number doubleValue]>UINT32_MAX||[number doubleValue]!=[number unsignedIntValue])CUFail(@"POINTER_TARGET_FAILED",@"The system window description has an invalid number.");
  return first;
}
static NSDictionary *CUInputCGWindowAtPoint(CGPoint point) {
  for(NSScreen *screen in NSScreen.screens){
    if(!NSMouseInRect(NSMakePoint(point.x,point.y),screen.frame,NO))continue;
    NSInteger number=[NSWindow windowNumberAtPoint:NSMakePoint(point.x,NSHeight(screen.frame)-point.y) belowWindowWithWindowNumber:0];
    if(number<0||(uint64_t)number>UINT32_MAX)CUFail(@"POINTER_TARGET_FAILED",@"The pointer window number is invalid.");
    return CUInputCGWindow((CGWindowID)number);
  }
  return nil;
}
static CUInputMouseTarget *CUResolveMouseTarget(CUSession *session,CUWindow *target,CGPoint screen,id element) {
  AXUIElementRef application=AXUIElementCreateApplication(target.pid);AXUIElementSetMessagingTimeout(application,.25);
  @try{
    id axWindow=nil;id windows=CUAX(application,kAXWindowsAttribute);
    if([windows isKindOfClass:NSArray.class])for(id candidate in windows){
      if(CFGetTypeID((__bridge CFTypeRef)candidate)==AXUIElementGetTypeID()&&CUAXWindowId((__bridge AXUIElementRef)candidate)==target.windowId){axWindow=candidate;break;}
    }
    if(!axWindow)CUFail(@"POINTER_TARGET_FAILED",@"The selected accessibility window is no longer available.");
    AXUIElementRef window=(__bridge AXUIElementRef)axWindow;pid_t appPid=0;
    if(AXUIElementGetPid(application,&appPid)!=kAXErrorSuccess)CUFail(@"POINTER_TARGET_FAILED",@"The selected application is no longer available.");
    if(!element)element=CUInputHit(application,screen);
    pid_t routePid=0;CGWindowID routeWindow=0;BOOL hasRoute=NO,direct=NO;
    pid_t actualPid=CUInputActualPid(window);
    if(actualPid==appPid){
      if(!element)direct=[[NSRunningApplication runningApplicationWithProcessIdentifier:appPid].bundleIdentifier hasPrefix:@"com.openai.atlas"];
      else{
        id children=CUAX((__bridge AXUIElementRef)element,kAXChildrenAttribute),effective=element;
        if([children isKindOfClass:NSArray.class]&&[children count]&&CFGetTypeID((__bridge CFTypeRef)children[0])==AXUIElementGetTypeID())effective=children[0];
        hasRoute=CUInputOutOfProcessWindow(session,(__bridge AXUIElementRef)effective,appPid,&routePid,&routeWindow);direct=!hasRoute;
      }
    }else{routePid=actualPid;routeWindow=CUInputRequiredWindowId(window);hasRoute=YES;}
    if(!direct){
      NSDictionary *under=CUInputCGWindowAtPoint(screen);
      if(under&&[under[(__bridge NSString *)kCGWindowNumber]unsignedIntValue]==CUInputRequiredWindowId(window)){
        AXUIElementRef system=AXUIElementCreateSystemWide();id systemHit=CUInputHit(system,screen);CFRelease(system);
        if(systemHit){element=systemHit;hasRoute=CUInputOutOfProcessWindow(session,(__bridge AXUIElementRef)element,appPid,&routePid,&routeWindow);direct=!hasRoute;}
      }
      if(!direct&&!hasRoute)CUFail(@"POINTER_TARGET_FAILED",@"The pointer point does not resolve to the selected application window.");
      if(!direct)element=nil;
    }
    CUInputMouseTarget *resolved=[CUInputMouseTarget new];resolved.element=element;
    if(direct){
      resolved.pid=appPid;CGWindowID windowId=0;pid_t hitPid=0;
      if(element&&CUInputWindowId((__bridge AXUIElementRef)element,&windowId)){
        if(AXUIElementGetPid((__bridge AXUIElementRef)element,&hitPid)!=kAXErrorSuccess||hitPid!=appPid)windowId=CUInputWindowForPid(session,(__bridge AXUIElementRef)element,appPid);
      }else windowId=CUInputRequiredWindowId(window);
      resolved.windowId=windowId;CGRect frame=CGRectZero;CUInputFrameWithFallback(window,&frame);resolved.frame=frame;
    }else{
      NSDictionary *info=CUInputCGWindow(routeWindow);CGRect frame=CGRectZero;
      id bounds=info[(__bridge NSString *)kCGWindowBounds];
      if(!info)CUFail(@"POINTER_TARGET_FAILED",@"The embedded pointer target window is no longer available.");
      if([bounds isKindOfClass:NSDictionary.class])CGRectMakeWithDictionaryRepresentation((__bridge CFDictionaryRef)bounds,&frame);
      resolved.pid=routePid;resolved.windowId=routeWindow;resolved.frame=frame;
    }
    return resolved;
  }@finally{CFRelease(application);}
}
static BOOL CUInputGeometryBoundary(NSString *role) {
  return role&&[@[@"AXWindow",@"AXSheet",@"AXMenu",@"AXPopover"]containsObject:role];
}
static BOOL CUInputClipsChildren(AXUIElementRef element,NSString *role) {
  if(CUInputGeometryBoundary(role)||[role isEqual:@"AXScrollArea"])return YES;
  if(![role isEqual:@"AXGroup"])return NO;
  NSArray *actions=CUActions(element);
  for(NSString *action in @[@"AXScrollLeftByPage",@"AXScrollRightByPage",@"AXScrollUpByPage",@"AXScrollDownByPage"])
    if([actions containsObject:action])return YES;
  return NO;
}
static BOOL CUInputParentClip(CUSession *session,AXUIElementRef element,CGRect *clip) {
  CGRect visible=CGRectInfinite;id current=(__bridge id)element;
  while(current){
    [session check];AXUIElementRef ax=(__bridge AXUIElementRef)current;NSString *role=CUAX(ax,kAXRoleAttribute);
    if([role isEqual:@"AXApplication"])break;
    CGRect frame;if(!CUInputFrame(ax,&frame))return NO;
    if(CUInputClipsChildren(ax,role)){
      visible=CGRectIntersection(visible,frame);
      if(CGRectIsEmpty(visible)||CGRectIsNull(visible))return NO;
    }
    if(CUInputGeometryBoundary(role))break;
    current=CUInputParent(ax);
  }
  if(CGRectEqualToRect(visible,CGRectInfinite))return NO;
  *clip=visible;return YES;
}
static BOOL CUInputAttributeSettable(AXUIElementRef element,CFStringRef attribute) {
  Boolean settable=false;return [CUInputAttributes(element)containsObject:(__bridge NSString *)attribute]&&
    AXUIElementIsAttributeSettable(element,attribute,&settable)==kAXErrorSuccess&&settable;
}
static void CUInputSetAttribute(AXUIElementRef element,CFStringRef attribute,id value) {
  AXError error=AXUIElementSetAttributeValue(element,attribute,(__bridge CFTypeRef)value);
  if(error!=kAXErrorSuccess)CUFail(@"INPUT_FAILED",[NSString stringWithFormat:@"The accessibility input was refused (AX error %d).",error]);
}
static CGRect CUInputContentFrame(CUSession *session,AXUIElementRef element) {
  id children=CUAX(element,kAXChildrenAttribute);NSMutableArray *stack=[children isKindOfClass:NSArray.class]?[children mutableCopy]:[NSMutableArray new],*seen=[NSMutableArray new];
  CGRect content=CGRectNull;
  while(stack.count){
    [session check];id current=stack.lastObject;[stack removeLastObject];
    if(CFGetTypeID((__bridge CFTypeRef)current)!=AXUIElementGetTypeID())continue;
    AXUIElementRef ax=(__bridge AXUIElementRef)current;NSString *role=CUAX(ax,kAXRoleAttribute);
    if([role isEqual:@"AXScrollBar"])continue;
    BOOL duplicate=NO;for(id previous in seen)if(CFEqual((__bridge CFTypeRef)previous,(__bridge CFTypeRef)current)){duplicate=YES;break;}
    if(duplicate)continue;[seen addObject:current];
    CGRect frame;if(CUInputFrameWithFallback(ax,&frame)&&!CGRectIsEmpty(frame))content=CGRectUnion(content,frame);
    if([role isEqual:@"AXScrollArea"]||([role isEqual:@"AXGroup"]&&CUInputClipsChildren(ax,role)))continue;
    children=CUAX(ax,kAXChildrenAttribute);if([children isKindOfClass:NSArray.class])[stack addObjectsFromArray:children];
  }
  return content;
}
static BOOL CUInputScrollAreaToFrame(CUSession *session,AXUIElementRef element,CGRect requested) {
  CGRect viewport;if(CGRectIsInfinite(requested)||CGRectIsEmpty(requested)||!CUInputFrameWithFallback(element,&viewport)||CGRectContainsRect(viewport,requested))return NO;
  BOOL handled=NO,changed=NO;
  for(NSNumber *verticalValue in @[@YES,@NO]){
    [session check];BOOL vertical=verticalValue.boolValue;id bar=CUAX(element,vertical?CFSTR("AXVerticalScrollBar"):CFSTR("AXHorizontalScrollBar"));
    if(!bar||CFGetTypeID((__bridge CFTypeRef)bar)!=AXUIElementGetTypeID())continue;
    AXUIElementRef scrollBar=(__bridge AXUIElementRef)bar;id enabled=CUAX(scrollBar,kAXEnabledAttribute);
    if([enabled isKindOfClass:NSNumber.class]&&![enabled boolValue])continue;
    handled=YES;
    double requestMin=vertical?CGRectGetMinY(requested):CGRectGetMinX(requested),requestMax=vertical?CGRectGetMaxY(requested):CGRectGetMaxX(requested);
    double viewMin=vertical?CGRectGetMinY(viewport):CGRectGetMinX(viewport),viewMax=vertical?CGRectGetMaxY(viewport):CGRectGetMaxX(viewport),viewSize=viewMax-viewMin;
    if(requestMin>=viewMin&&requestMax<=viewMax)continue;
    CGRect content=CUInputContentFrame(session,element);double contentSize=vertical?CGRectGetHeight(content):CGRectGetWidth(content),remaining=contentSize-viewSize;
    if(remaining<=0)continue;
    double shift=requestMax-requestMin>viewSize?((requestMin+requestMax)-(viewMin+viewMax))*.5:requestMin<viewMin?requestMin-viewMin:requestMax-viewMax;
    id value=CUAX(scrollBar,kAXValueAttribute);double offset;
    if([value isKindOfClass:NSNumber.class]&&CFGetTypeID((__bridge CFTypeRef)value)!=CFBooleanGetTypeID())offset=MIN(1,MAX(0,[value doubleValue]))*remaining;
    else offset=MIN(remaining,MAX(0,viewMin-(vertical?CGRectGetMinY(content):CGRectGetMinX(content))));
    double normalized=MIN(remaining,MAX(0,offset+shift))/remaining;
    if(!isfinite(normalized))CUFail(@"INPUT_FAILED",@"The accessibility scroll geometry is invalid.");
    CUInputSetAttribute(scrollBar,kAXValueAttribute,@(normalized));changed=YES;
  }
  if(handled)return changed;
  if(CUInputAttributeSettable(element,CFSTR("AXMakeScreenRectVisible"))){
    AXValueRef value=AXValueCreate(kAXValueCGRectType,&requested);if(!value)CUFail(@"INPUT_FAILED",@"Could not create the visible text rectangle.");
    @try{CUInputSetAttribute(element,CFSTR("AXMakeScreenRectVisible"),(__bridge id)value);}@finally{CFRelease(value);}return YES;
  }
  return NO;
}
static BOOL CUInputScrollToVisible(CUSession *session,AXUIElementRef element,CGRect requested) {
  NSMutableArray *operations=[NSMutableArray new];id current=(__bridge id)element;BOOL suppressed=NO;
  while(current){
    [session check];AXUIElementRef ax=(__bridge AXUIElementRef)current;NSString *role=CUAX(ax,kAXRoleAttribute);
    if(CUInputGeometryBoundary(role))break;
    if(!suppressed){
      if([CUActions(ax)containsObject:@"AXScrollToVisible"]){[operations addObject:@{@"element":current,@"kind":@0}];suppressed=YES;}
      else if([role isEqual:@"AXCell"]&&CUInputAttributeSettable(ax,CFSTR("AXScrollToVisible"))){[operations addObject:@{@"element":current,@"kind":@1}];suppressed=YES;}
    }
    if(!suppressed&&[role isEqual:@"AXScrollArea"])[operations addObject:@{@"element":current,@"kind":@2}];
    suppressed=suppressed&&!CUInputClipsChildren(ax,role);current=CUInputParent(ax);
  }
  BOOL changed=NO;
  for(NSDictionary *operation in operations){
    [session check];AXUIElementRef ax=(__bridge AXUIElementRef)operation[@"element"];NSInteger kind=[operation[@"kind"]integerValue];
    if(kind==0){AXError error=AXUIElementPerformAction(ax,CFSTR("AXScrollToVisible"));if(error!=kAXErrorSuccess)CUFail(@"INPUT_FAILED",@"The accessibility scroll action was refused.");changed=YES;}
    else if(kind==1){CUInputSetAttribute(ax,CFSTR("AXScrollToVisible"),@YES);changed=YES;}
    else changed=CUInputScrollAreaToFrame(session,ax,requested)||changed;
  }
  if(changed){
    for(NSUInteger elapsed=0;elapsed<500;elapsed+=25){
      [session check];CGRect frame,clip;if(CUInputFrame(element,&frame)&&CUInputParentClip(session,element,&clip)&&CGRectContainsPoint(clip,CGPointMake(CGRectGetMidX(frame),CGRectGetMidY(frame))))break;
      CUSleep(session,25);
    }
  }
  return changed;
}
static BOOL CUInputChessSquare(CUWindow *target,AXUIElementRef element) {
  NSString *title=nil;if(!CURecordedAXTitle(target,element,&title)||!title.length)return NO;
  NSRange rank=[title rangeOfComposedCharacterSequenceAtIndex:[title length]-1];if(!rank.location)return NO;
  NSRange file=[title rangeOfComposedCharacterSequenceAtIndex:rank.location-1];
  return [@[@"a",@"b",@"c",@"d",@"e",@"f",@"g",@"h"]containsObject:[title substringWithRange:file]]&&
    [@[@"1",@"2",@"3",@"4",@"5",@"6",@"7",@"8"]containsObject:[title substringWithRange:rank]];
}
static BOOL CUInputChessPoint(CUSession *session,CUWindow *target,AXUIElementRef element,CGPoint *point) {
  if(![CUAX(element,kAXRoleAttribute)isEqual:@"AXButton"]||!CUInputChessSquare(target,element))return NO;
  pid_t pid=0;if(AXUIElementGetPid(element,&pid)!=kAXErrorSuccess||
     ![[NSRunningApplication runningApplicationWithProcessIdentifier:pid].bundleIdentifier isEqual:@"com.apple.Chess"])return NO;
  NSRunningApplication *running=[NSRunningApplication runningApplicationsWithBundleIdentifier:@"com.apple.Chess"].firstObject;if(!running)return NO;
  AXUIElementRef application=AXUIElementCreateApplication(running.processIdentifier);AXUIElementSetMessagingTimeout(application,.25);
  @try{
    CGRect frame;if(!CUInputFrameWithFallback(element,&frame))return NO;
    id hit=CUInputHit(application,CGPointMake(CGRectGetMidX(frame),CGRectGetMidY(frame)));
    if(!hit||CFEqual((__bridge AXUIElementRef)hit,element))return NO;
    id parent=CUInputParent(element);if(!parent||!CUInputFrameWithFallback((__bridge AXUIElementRef)parent,&frame))return NO;
    // Codex's sampling workaround is restricted to Chess square buttons.
    double x=0,y=0;NSUInteger count=0;
    for(NSUInteger row=0;row<64;row++)for(NSUInteger column=0;column<64;column++){
      [session check];CGPoint candidate=CGPointMake(CGRectGetMinX(frame)+CGRectGetWidth(frame)/64*(column+.5),CGRectGetMinY(frame)+CGRectGetHeight(frame)/64*(row+.5));
      hit=CUInputHit(application,candidate);
      if(hit&&CFEqual((__bridge AXUIElementRef)hit,element)){x+=candidate.x;y+=candidate.y;count++;}
    }
    if(!count)return NO;*point=CGPointMake(x/count,y/count);return YES;
  }@finally{CFRelease(application);}
}
static BOOL CUInputStandardClickablePoint(CUSession *session,AXUIElementRef element,CGPoint *point){
  CGRect frame,clip;
  if(!CUInputFrame(element,&frame))CUFail(@"ELEMENT_NOT_VISIBLE",@"The observed element has no accessibility frame for a pointer click.");
  *point=CGPointMake(CGRectGetMidX(frame),CGRectGetMidY(frame));
  return CUInputParentClip(session,element,&clip)&&CGRectContainsPoint(clip,*point);
}
static BOOL CUInputClickablePoint(CUSession *session,CUWindow *target,AXUIElementRef element,CGPoint *point){
  return CUInputChessPoint(session,target,element,point)||CUInputStandardClickablePoint(session,element,point);
}
static CGPoint CUInputMoveTo(CUSession *session,CUWindow *target,CGPoint scaled,NSInteger timing,BOOL animated) {
  [session check];CUInputRememberPoint(session,target,scaled);CGPoint local=CUInputPointFromScaled(target,scaled);
  CUInputMouseTarget *route=CUResolveMouseTarget(session,target,CGPointMake(target.bounds.origin.x+local.x,target.bounds.origin.y+local.y),nil);
  CUInputCheckMouseTarget(route);
  if(CUInputCursorEnabled&&!CUCursorMoveTo(session,target,local,timing,animated)){[session check];CUFail(@"CURSOR_MOVE_FAILED",@"The virtual cursor could not complete the requested movement.");}
  [session check];CGEventRef event=CUCreateMouseEvent(target,route,kCGEventMouseMoved,local,1,kCGMouseButtonLeft,0,CUNextMouseEventNumber());
  @try{CUPostPointer(event,route);}@finally{CFRelease(event);}
  CUPointerCursor(session,target,kCGEventMouseMoved,local);
  return local;
}
static void CUInputPositionElement(CUSession *session,CUWindow *target,AXUIElementRef element,NSInteger timing,BOOL animated) {
  CGPoint screen;
  if(!CUInputChessPoint(session,target,element,&screen)){
    CGRect frame;if(!CUInputFrameWithFallback(element,&frame))CUFail(@"ELEMENT_NOT_VISIBLE",@"The observed element does not expose a frame.");
    CUInputScrollToVisible(session,element,frame);
    if(!CUInputStandardClickablePoint(session,element,&screen))return;
  }
  if(CUInputCursorEnabled){CGPoint local=CGPointMake(screen.x-target.bounds.origin.x,screen.y-target.bounds.origin.y);
    if(!CUCursorMoveTo(session,target,local,timing,animated)){[session check];CUFail(@"CURSOR_MOVE_FAILED",@"The virtual cursor could not complete the element movement.");}}
}
static CGPoint CUElementPoint(CUSession *session,CUWindow *target,AXUIElementRef element){
  CGPoint point;
  if(!CUInputClickablePoint(session,target,element,&point))CUFail(@"ELEMENT_NOT_VISIBLE",@"The observed element has no clickable center within its parent geometry.");
  return CGPointMake(point.x-target.bounds.origin.x,point.y-target.bounds.origin.y);
}
static BOOL CUInputIsFocusableField(AXUIElementRef element) {
  if(![@[@"AXTextArea",@"AXTextField",@"AXDateTimeArea"]containsObject:CUAX(element,kAXRoleAttribute)]||
     ![CUInputAttributes(element)containsObject:(__bridge NSString *)kAXFocusedAttribute])return NO;
  Boolean settable=false;AXError error=AXUIElementIsAttributeSettable(element,kAXFocusedAttribute,&settable);
  if(error==kAXErrorSuccess)return settable;
  id enabled=CUAX(element,kAXEnabledAttribute);return ![enabled isKindOfClass:NSNumber.class]||[enabled boolValue];
}
static void CUInputForcePointerClick(CUSession *session,CUWindow *target,AXUIElementRef element) {
  CGPoint point=CUElementPoint(session,target,element);BOOL insideWeb=CUInsideWebView(session,element);
  BOOL synthetic=CUPrepareClickFocus(session,target,element,insideWeb,NO,0);CGEventFlags flags=0;
  if(!synthetic&&!CUInputFocusBelievesFocused(session,target))flags=kCGEventFlagMaskCommand;
  CUInputMouseTarget *route=CUResolveMouseTarget(session,target,CGPointMake(target.bounds.origin.x+point.x,target.bounds.origin.y+point.y),(__bridge id)element);
  CUInputCheckMouseTarget(route);
  NSArray *packet=CUClickPacket(session,target,route,point,point,NO,kCGMouseButtonLeft,1,flags);
  CUSendClickPacket(session,target,route,packet,NO,50);CUInputFocusActionPerformed(session,target);
}
static void CUInputFocusFieldIfNeeded(CUSession *session,CUWindow *target,AXUIElementRef element) {
  if(!CUInputIsFocusableField(element))return;
  id focused=CUAX(element,kAXFocusedAttribute);if([focused isKindOfClass:NSNumber.class]&&[focused boolValue])return;
  pid_t pid=0;BOOL safari=AXUIElementGetPid(element,&pid)==kAXErrorSuccess&&
    [[NSRunningApplication runningApplicationWithProcessIdentifier:pid].bundleIdentifier isEqual:@"com.apple.Safari"];
  if(safari&&[CUInputAttributes(element)containsObject:@"AXDOMClassList"]){CUInputForcePointerClick(session,target,element);return;}
  CUInputSetAttribute(element,kAXFocusedAttribute,@YES);
  focused=CUAX(element,kAXFocusedAttribute);
  if(![focused isKindOfClass:NSNumber.class]||![focused boolValue])CUInputForcePointerClick(session,target,element);
}
static BOOL CUWebClickNeedsPointer(CUSession *session,CUWindow *target,AXUIElementRef element) {
  CGPoint local;
  @try{local=CUElementPoint(session,target,element);}@catch(NSException *error){
    if(![error.name isEqual:@"ELEMENT_NOT_VISIBLE"])@throw;
    return NO;
  }
  AXUIElementRef application=AXUIElementCreateApplication(target.pid);AXUIElementSetMessagingTimeout(application,.25);
  id hit=CUInputHit(application,CGPointMake(target.bounds.origin.x+local.x,target.bounds.origin.y+local.y));CFRelease(application);
  for(NSUInteger i=0;hit&&i<300;i++){
    [session check];AXUIElementRef current=(__bridge AXUIElementRef)hit;if(CFEqual(current,element))return YES;
    hit=CUInputParent(current);
  }
  return NO;
}
static void CUWheel(CUSession *session,CUWindow *target,CGPoint local,int32_t dx,int32_t dy) {
  CGPoint screen=CGPointMake(target.bounds.origin.x+local.x,target.bounds.origin.y+local.y);
  CUInputMouseTarget *route=CUResolveMouseTarget(session,target,screen,nil);
  CUInputCheckMouseTarget(route);
  CGEventSourceRef source=CGEventSourceCreate(kCGEventSourceStateHIDSystemState);
  if(!source)CUFail(@"INPUT_FAILED",@"Could not create the scroll event source.");
  CGEventRef event=CGEventCreateScrollWheelEvent2(source,kCGScrollEventUnitPixel,1,dy,dx,0);CFRelease(source);
  if(!event)CUFail(@"INPUT_FAILED",@"Could not create the scroll event.");
  @try{
    CGEventSetLocation(event,screen);
    CUStamp(event,route,CGPointMake(screen.x-route.frame.origin.x,screen.y-route.frame.origin.y),0,0);
    CUPostPointer(event,route);
  }@finally{CFRelease(event);}
}
static NSDictionary *CUScroll(CUSession *session,CUWindow *target,NSDictionary *args,AXUIElementRef element) {
  NSString *direction=args[@"direction"];
  if(![@[@"up",@"down",@"left",@"right"]containsObject:direction])CUFail(@"INVALID_SCROLL",@"Scroll direction must be up, down, left, or right.");
  id amount=args[@"amount"]?:args[@"pages"]?:@1;
  if(![amount isKindOfClass:NSNumber.class]||!isfinite([amount doubleValue])||[amount doubleValue]<=0)CUFail(@"INVALID_SCROLL",@"Scroll pages must be a finite number greater than zero.");
  if(args[@"by"]&&![args[@"by"]isEqual:@"page"])CUFail(@"INVALID_SCROLL",@"Native scroll amounts use pages.");
  CUInputCheckCoordinateMapping(target);CGRect extent=target.sourceVisibleRect;CGPoint local;
  if(element){
    CUInputPositionElement(session,target,element,1,YES);
    CUInputFrameWithFallback(element,&extent);
    CGPoint screen;
    if(CUInputClickablePoint(session,target,element,&screen)){
      double scale=target.sourcePointsPerPixel;
      CGPoint scaled=CGPointMake(CUInputTruncatedPixel((screen.x-target.sourceVisibleRect.origin.x)/scale),CUInputTruncatedPixel((screen.y-target.sourceVisibleRect.origin.y)/scale));
      CUInputMoveTo(session,target,scaled,1,YES);
    }
    local=CUInputCurrentPoint(session,target);
  }else{local=CUInputMoveTo(session,target,CUPoint(args,@"x",@"y",target),1,YES);}
  BOOL horizontal=[direction isEqual:@"left"]||[direction isEqual:@"right"];
  double distance=round([amount doubleValue]*MAX(100,horizontal?extent.size.width:extent.size.height));
  if(!isfinite(distance)||distance>INT32_MAX)CUFail(@"INVALID_SCROLL",@"The requested scroll distance is too large.");
  int32_t total=(int32_t)distance,sign=([direction isEqual:@"down"]||[direction isEqual:@"left"])?-1:1;
  [session check];CUWheel(session,target,local,horizontal?total*sign:0,horizontal?0:total*sign);
  return CUResult(@{@"route":@"window_scroll",@"effect":@"unverifiable"});
}
static CGKeyCode CUKey(NSString *key) {
  if(![key isKindOfClass:NSString.class]||!key.length)CUFail(@"UNKNOWN_KEY",@"A supported key name is required.");
  static NSDictionary *codes;static dispatch_once_t once;dispatch_once(&once,^{codes=@{@"a":@0,@"s":@1,@"d":@2,@"f":@3,@"h":@4,@"g":@5,@"z":@6,@"x":@7,@"c":@8,@"v":@9,@"b":@11,@"q":@12,@"w":@13,@"e":@14,@"r":@15,@"y":@16,@"t":@17,@"1":@18,@"2":@19,@"3":@20,@"4":@21,@"6":@22,@"5":@23,@"=":@24,@"9":@25,@"7":@26,@"-":@27,@"8":@28,@"0":@29,@"]":@30,@"o":@31,@"u":@32,@"[":@33,@"i":@34,@"p":@35,@"enter":@36,@"return":@36,@"l":@37,@"j":@38,@"'":@39,@"k":@40,@";":@41,@"\\":@42,@",":@43,@"/":@44,@"n":@45,@"m":@46,@".":@47,@"tab":@48,@"space":@49,@"`":@50,@"backspace":@51,@"escape":@53,@"esc":@53,@"home":@115,@"pageup":@116,@"delete":@117,@"end":@119,@"pagedown":@121,@"left":@123,@"right":@124,@"down":@125,@"up":@126,@"f1":@122,@"f2":@120,@"f3":@99,@"f4":@118,@"f5":@96,@"f6":@97,@"f7":@98,@"f8":@100,@"f9":@101,@"f10":@109,@"f11":@103,@"f12":@111};});
  NSNumber *code=codes[key.lowercaseString];
  if(!code)code=@{@"f13":@105,@"f14":@107,@"f15":@113,@"f16":@106,@"f17":@64,@"f18":@79,@"f19":@80,@"f20":@90,@"help":@114,@"insert":@114,@"kp_decimal":@65,@"kp_multiply":@67,@"kp_add":@69,@"kp_clear":@71,@"kp_divide":@75,@"kp_enter":@76,@"kp_subtract":@78,@"kp_equal":@81,@"kp_0":@82,@"kp_1":@83,@"kp_2":@84,@"kp_3":@85,@"kp_4":@86,@"kp_5":@87,@"kp_6":@88,@"kp_7":@89,@"kp_8":@91,@"kp_9":@92}[key.lowercaseString];
  if(!code)code=@{@"caps_lock":@57,@"shift_lock":@57}[key.lowercaseString];
  if(!code)code=@{@"cmd":@55,@"command":@55,@"super":@55,@"meta":@55,@"super_l":@55,@"meta_l":@55,@"super_r":@54,@"meta_r":@54,@"shift":@56,@"shift_l":@56,@"shift_r":@60,@"ctrl":@59,@"control":@59,@"ctrl_l":@59,@"control_l":@59,@"ctrl_r":@62,@"control_r":@62,@"alt":@58,@"option":@58,@"alt_l":@58,@"alt_r":@61,@"fn":@63}[key.lowercaseString];
  if(!code)CUFail(@"UNKNOWN_KEY",[NSString stringWithFormat:@"Unsupported key: %@",key]);return code.unsignedShortValue;
}
static CGEventFlags CUFlags(NSArray *modifiers) {
  if(![modifiers isKindOfClass:NSArray.class])CUFail(@"UNKNOWN_MODIFIER",@"Keyboard modifiers must be an array.");
  CGEventFlags flags=0;for(NSString *modifier in modifiers){if(![modifier isKindOfClass:NSString.class])CUFail(@"UNKNOWN_MODIFIER",@"Keyboard modifiers must be strings.");NSString *m=modifier.lowercaseString;if([@[@"cmd",@"command",@"super",@"meta"] containsObject:m])flags|=kCGEventFlagMaskCommand;else if([@[@"ctrl",@"control"] containsObject:m])flags|=kCGEventFlagMaskControl;else if([@[@"alt",@"option"] containsObject:m])flags|=kCGEventFlagMaskAlternate;else if([m isEqualToString:@"shift"])flags|=kCGEventFlagMaskShift;else if([m isEqual:@"fn"])flags|=kCGEventFlagMaskSecondaryFn;else CUFail(@"UNKNOWN_MODIFIER",@"Unknown keyboard modifier.");}return flags;
}
static CGEventFlags CUModifierFlag(CGKeyCode key) {
  switch(key){case 54:case 55:return kCGEventFlagMaskCommand;case 56:case 60:return kCGEventFlagMaskShift;case 58:case 61:return kCGEventFlagMaskAlternate;case 59:case 62:return kCGEventFlagMaskControl;case 63:return kCGEventFlagMaskSecondaryFn;default:return 0;}
}
static CGEventFlags CUKeyFlags(NSString *key,CGEventFlags flags) {
  return flags|CUModifierFlag(CUKey(key));
}
static BOOL CUModifierKey(CGKeyCode key) {
  return CUModifierFlag(key)!=0;
}
static CGEventRef CUCreateKeyEventWithSource(CGEventSourceRef source,CGKeyCode key,CGEventFlags flags,NSString *text,BOOL down) {
  CGEventRef event=CGEventCreateKeyboardEvent(source,key,down);if(!event)CUFail(@"INPUT_FAILED",@"Could not create the keyboard event.");
  @try{
    CGEventSetFlags(event,flags);
    if(text){NSUInteger length=text.length;if(length>NSUIntegerMax/sizeof(UniChar))CUFail(@"INPUT_FAILED",@"The keyboard text is too large.");NSMutableData *buffer=[NSMutableData dataWithLength:length*sizeof(UniChar)];[text getCharacters:buffer.mutableBytes range:NSMakeRange(0,length)];CGEventKeyboardSetUnicodeString(event,length,buffer.bytes);}
  }@catch(NSException *error){CFRelease(event);@throw;}
  return event;
}
static CGEventRef CUCreateKeyEvent(CGKeyCode key,CGEventFlags flags,NSString *text,BOOL down) {
  CGEventSourceRef source=CGEventSourceCreate(kCGEventSourceStateHIDSystemState);if(!source)CUFail(@"INPUT_FAILED",@"Could not create the keyboard event source.");
  @try{return CUCreateKeyEventWithSource(source,key,flags,text,down);}@finally{CFRelease(source);}
}
static void CUKeyEvent(CUWindow *target,CGKeyCode key,CGEventFlags flags,NSString *text,BOOL down) {
  CGEventRef event=CUCreateKeyEvent(key,flags,text,down);
  @try{CUPost(event,target);}@finally{CFRelease(event);}
}
static CGEventRef CUCreateKeyboardFlagsWithSource(CGEventSourceRef source,CGEventFlags flags){
  CGEventRef event=CGEventCreate(source);if(!event)CUFail(@"INPUT_FAILED",@"Could not create the modifier event.");
  CGEventSetType(event,kCGEventFlagsChanged);CGEventSetFlags(event,flags);
  return event;
}
static NSDictionary *CUKeyboardStroke(CGEventSourceRef source,NSDictionary *stroke) {
  CGKeyCode key=[stroke[@"key_code"]unsignedShortValue];CGEventFlags flags=[stroke[@"flags"]unsignedLongLongValue];
  NSString *text=stroke[@"text"];CGEventFlags previous=CGEventSourceFlagsState(kCGEventSourceStateCombinedSessionState);
  NSMutableArray *down=[NSMutableArray new],*up=[NSMutableArray new];
  if((previous&0x1e0000)!=flags)[down addObject:CFBridgingRelease(CUCreateKeyboardFlagsWithSource(source,flags))];
  [down addObject:CFBridgingRelease(CUCreateKeyEventWithSource(source,key,flags,text,YES))];
  [up addObject:CFBridgingRelease(CUCreateKeyEventWithSource(source,key,flags,text,NO))];
  if((previous&0x1e0000)!=flags)[up addObject:CFBridgingRelease(CUCreateKeyboardFlagsWithSource(source,previous))];
  return @{@"down":down,@"up":up};
}
static NSArray *CUKeyboardPacketsWithSource(CGEventSourceRef source,NSArray *strokes) {
  NSMutableArray *packets=[NSMutableArray new];for(NSDictionary *stroke in strokes)[packets addObject:CUKeyboardStroke(source,stroke)];return packets;
}
static NSArray *CUKeyboardPackets(NSArray *strokes) {
  CGEventSourceRef source=CGEventSourceCreate(kCGEventSourceStateHIDSystemState);if(!source)CUFail(@"INPUT_FAILED",@"Could not create the keyboard event source.");
  @try{return CUKeyboardPacketsWithSource(source,strokes);}@finally{CFRelease(source);}
}
static void CUKeyboardPost(CGEventRef event,pid_t pid) {
  CGEventSetTimestamp(event,(CGEventTimestamp)(NSProcessInfo.processInfo.systemUptime*1e9));CGEventPostToPid(pid,event);
}
static void CUKeyboardDelay(CUSession *session,uint64_t nanoseconds) {
  while(nanoseconds){[session check];uint64_t interval=MIN(nanoseconds,8000000);struct timespec delay={0,(long)interval};
    while(nanosleep(&delay,&delay)<0&&errno==EINTR)[session check];nanoseconds-=interval;}
}
static void CUSendKeyboard(CUSession *session,pid_t pid,NSArray *packets,uint64_t delay,NSNumber *holdingDuration) {
  NSMutableArray *pending=[NSMutableArray new];
  @try{
    for(NSDictionary *packet in packets){
      NSMutableDictionary *state=[@{@"packet":packet,@"down":@0,@"up":@0}mutableCopy];[pending addObject:state];
      for(id event in packet[@"down"]){[session check];CUKeyboardPost((__bridge CGEventRef)event,pid);state[@"down"]=@([state[@"down"]unsignedIntegerValue]+1);if(delay)CUKeyboardDelay(session,delay);}
      if(!holdingDuration){for(id event in packet[@"up"]){[session check];CUKeyboardPost((__bridge CGEventRef)event,pid);state[@"up"]=@([state[@"up"]unsignedIntegerValue]+1);if(delay)CUKeyboardDelay(session,delay);}[pending removeLastObject];}
    }
    if(holdingDuration)CUSleep(session,holdingDuration.unsignedIntegerValue);
  }@finally{
    // Release packets already delivered even when cancellation interrupts a hold.
    for(NSDictionary *state in pending){NSDictionary *packet=state[@"packet"];NSUInteger down=[state[@"down"]unsignedIntegerValue],up=[state[@"up"]unsignedIntegerValue];NSArray *releases=packet[@"up"];
      for(NSUInteger i=up;i<releases.count;i++){if(!down||(i==0&&down<[packet[@"down"]count]))continue;CUKeyboardPost((__bridge CGEventRef)releases[i],pid);}}
  }
}
static CGEventFlags CUCarbonKeyFlags(UInt32 modifiers) {
  CGEventFlags flags=0;if(modifiers&shiftKey)flags|=kCGEventFlagMaskShift;if(modifiers&optionKey)flags|=kCGEventFlagMaskAlternate;if(modifiers&controlKey)flags|=kCGEventFlagMaskControl;return flags;
}
static NSArray *CUKeyboardTextStrokesOnMain(CUSession *session,NSString *text) {
  TISInputSourceRef source=TISCopyCurrentKeyboardLayoutInputSource();if(!source)CUFail(@"KEYBOARD_LAYOUT_UNAVAILABLE",@"Could not read the current keyboard layout.");
  @try{
    CFDataRef data=TISGetInputSourceProperty(source,kTISPropertyUnicodeKeyLayoutData);const UCKeyboardLayout *layout=data?(const UCKeyboardLayout *)CFDataGetBytePtr(data):NULL;
    if(!layout)CUFail(@"KEYBOARD_LAYOUT_UNAVAILABLE",@"The current input source does not provide a Unicode keyboard layout.");
    static const UInt32 modifiers[]={0,512,2048,2560,4096,4608,6144,6656};
    UInt32 keyboardType=LMGetKbdType();NSMutableArray *strokes=[NSMutableArray new];
    // The source searches UTF-16 units, not composed characters or a US fallback.
    for(NSUInteger i=0;i<text.length;i++){
      [session check];UniChar wanted=[text characterAtIndex:i];if(wanted==10)wanted=13;BOOL matched=NO;
      for(NSUInteger m=0;m<8&&!matched;m++)for(UInt16 key=0;key<128;key++){
        UInt32 deadState=0;UniChar translated[4];UniCharCount length=0;
        OSStatus error=UCKeyTranslate(layout,key,kUCKeyActionDisplay,(modifiers[m]>>8)&0xff,keyboardType,0,&deadState,4,&length,translated);
        if(error==noErr&&length&&translated[0]==wanted){
          [strokes addObject:@{@"key_code":@(key),@"flags":@(CUCarbonKeyFlags(modifiers[m])),@"text":[NSString stringWithCharacters:translated length:length]}];matched=YES;break;
        }
      }
      if(!matched)CUFail(@"KEYBOARD_TEXT_UNSUPPORTED",[NSString stringWithFormat:@"The current keyboard layout cannot produce the UTF-16 unit 0x%04X at position %lu. Use paste to insert this text; no keyboard input was sent.",(unsigned int)wanted,(unsigned long)i+1]);
    }
    return strokes;
  }@finally{CFRelease(source);}
}
static NSArray *CUKeyboardTextStrokes(CUSession *session,NSString *text) {
  __block NSArray *strokes;__block NSException *failure;
  void (^generate)(void)=^{@try{strokes=CUKeyboardTextStrokesOnMain(session,text);}@catch(NSException *error){failure=error;}};
  if(NSThread.isMainThread)generate();else dispatch_sync(dispatch_get_main_queue(),generate);
  if(failure)@throw failure;return strokes;
}
static AXUIElementRef CUFocused(CUWindow *target) {
  AXUIElementRef app=AXUIElementCreateApplication(target.pid);id focused=CUAX(app,kAXFocusedUIElementAttribute);
  // Custom-rendered apps may expose the focused window without exposing an
  // individual responder. Keep window identity mandatory; a missing control
  // alone must not block keyboard shortcuts or coordinate-focused editors.
  if(!focused){
    id window=CUAX(app,kAXFocusedWindowAttribute);CFRelease(app);
    if(!window)return NULL;
    if(CUAXWindowId((__bridge AXUIElementRef)window)!=target.windowId)CUFail(@"NO_TARGET_FOCUS",@"Keyboard focus is in a different window. Select the intended window again.");
    return (AXUIElementRef)CFRetain((__bridge CFTypeRef)window);
  }
  CFRelease(app);AXUIElementRef element=(__bridge AXUIElementRef)focused;AXUIElementRef window=(__bridge AXUIElementRef)CUAX(element,kAXWindowAttribute);
  if(!window||CUAXWindowId(window)!=target.windowId)CUFail(@"NO_TARGET_FOCUS",@"Focus an input in the selected window before typing.");
  return (AXUIElementRef)CFRetain(element);
}
static void CUFinishKeyboardFocus(CUWindow *target,BOOL synthetic){
  if(!synthetic||NSWorkspace.sharedWorkspace.frontmostApplication.processIdentifier==target.pid)return;
  if(target.webAccessibility){target.syntheticFocusHeld=YES;return;}
  if(!CUDeactivateInputFocus(target))CUFail(@"FOCUS_RELEASE_FAILED",@"Could not release the application's synthetic input focus.");
}
BOOL CUReleaseInputFocus(CUWindow *target){
  return CUDeactivateInputFocus(target);
}
static void CUWithKeyboardFocus(CUSession *session,CUWindow *target,void (^deliver)(pid_t)){
  if(!CUInputFocusBelievesFocused(session,target)){
    if(!CUHasRecordedAXCapture(target))CUObserve(session,@{@"pid":@(target.pid),@"window_id":@(target.windowId),@"include_accessibility_tree":@YES,@"include_screenshot":@YES});
    CUEnforceInputFocus(session,target);
  }
  AXUIElementRef app=AXUIElementCreateApplication(target.pid);pid_t pid=target.pid;
  @try{
    if(AXUIElementGetPid(app,&pid)!=kAXErrorSuccess)CUFail(@"KEYBOARD_TARGET_FAILED",@"The keyboard application could not be resolved.");
    id focused=CUAX(app,kAXFocusedUIElementAttribute);
    if(focused&&CFGetTypeID((__bridge CFTypeRef)focused)==AXUIElementGetTypeID()){
      pid_t embedded=0;if(CUInputOutOfProcessElement(session,(__bridge AXUIElementRef)focused,pid,&embedded))pid=embedded;
    }
    CUInputCheckPid(pid);[session check];deliver(pid);CUInputFocusActionPerformed(session,target);
  }@finally{CFRelease(app);}
}
NSDictionary *CUInput(CUSession *session,NSString *name,NSDictionary *args) {
  if(!AXIsProcessTrusted())CUFail(@"ACCESSIBILITY_PERMISSION",@"Enable Accessibility for Oh My DSH Computer Use.");
  CUWindow *target=CUResolveWindow(session,args);[session check];
  BOOL indexed=args[@"element_index"]||args[@"element_token"];AXUIElementRef element=indexed?CUElementFor(session,target,args):NULL;
  if([name isEqual:@"paste"]){
    AXUIElementRef focused=CUFocused(target);if(!focused)CUFail(@"NO_TARGET_FOCUS",@"Focus an input in the selected window before pasting.");
    __block BOOL synthetic=NO;
    @try{return CUPaste(session,args,focused,^{
      AXUIElementRef current=CUFocused(target);BOOL same=current&&CFEqual(current,focused);if(current)CFRelease(current);
      if(!same)CUFail(@"NO_TARGET_FOCUS",@"Focus changed while preparing paste. Select the intended input again.");
      synthetic=NSWorkspace.sharedWorkspace.frontmostApplication.processIdentifier!=target.pid;CUEnforceInputFocus(session,target);
      current=CUFocused(target);same=current&&CFEqual(current,focused);if(current)CFRelease(current);
      if(!same)CUFail(@"NO_TARGET_FOCUS",@"The input focus changed before paste delivery. Select the intended input again.");
      [session check];CUKeyEvent(target,9,kCGEventFlagMaskCommand,nil,YES);CUKeyEvent(target,9,kCGEventFlagMaskCommand,nil,NO);CUInputFocusActionPerformed(session,target);
    });}@finally{@try{CUFinishKeyboardFocus(target,synthetic);}@finally{CFRelease(focused);}}
  }
  if([name isEqualToString:@"scroll"])return CUScroll(session,target,args,element);
  if([name isEqualToString:@"perform_secondary_action"]){
    if(!element)CUFail(@"ELEMENT_REQUIRED",@"performSecondaryAction requires an observed element.");
    NSString *action=CUActionName(args[@"action"]);
    if([action isEqual:@"AXPick"]&&[CUActions(element)containsObject:action]&&CUInputPrepareMenu(session,target,element))
      return CUResult(@{@"route":@"menu_prepare",@"effect":@"unverifiable"});
    return CUPerformAction(session,target,element,action);
  }
  if([name isEqualToString:@"set_value"]){
    if(!element)CUFail(@"ELEMENT_REQUIRED",@"setValue requires an observed element.");
    id value=args[@"value"]?:@"";id old=CUAX(element,kAXValueAttribute);
    if([old isKindOfClass:NSNumber.class])value=@([value doubleValue]);
    AXError error=AXUIElementSetAttributeValue(element,kAXValueAttribute,(__bridge CFTypeRef)value);
    if(error!=kAXErrorSuccess)CUFail(@"NOT_SETTABLE",[NSString stringWithFormat:@"The control refused its value (AX error %d).",error]);
    // AX success only acknowledges the setter. Controlled editors can revert it
    // on their next update; keep the same element and verify after settling.
    for(NSUInteger sample=0;sample<4;sample++){
      CUSleep(session,100);
      if(![CUAX(element,kAXValueAttribute) isEqual:value])CUFail(@"VALUE_NOT_CONFIRMED",@"The input did not retain the requested value. Read its current state, focus the intended input and use paste/typeText if appropriate; verify the content before sending. The value may have changed; do not blindly repeat this action.");
    }
    return CUResult(@{@"route":@"accessibility",@"effect":@"confirmed"});
  }
  if([name isEqual:@"click"]){
    id count=args[@"count"]?:@1;if(![count isKindOfClass:NSNumber.class]||[count doubleValue]<1||[count doubleValue]>INT32_MAX||[count doubleValue]!=[count longLongValue])CUFail(@"INVALID_CLICK_COUNT",@"Click count must be a positive integer.");
    if(![@[@"left",@"middle",@"right"]containsObject:args[@"button"]?:@"left"])CUFail(@"INVALID_BUTTON",@"Mouse button must be left, middle, or right.");
    id enabled=element?CUAX(element,kAXEnabledAttribute):nil;if([enabled isKindOfClass:NSNumber.class]&&![enabled boolValue])CUFail(@"ELEMENT_DISABLED",@"The observed control is disabled.");
  }
  if([name isEqualToString:@"click"]&&element){
    CUInputPositionElement(session,target,element,0,YES);
    NSString *button=args[@"button"]?:@"left",*action=args[@"action"]?CUActionName(args[@"action"]):nil;
    NSArray *actions=CUActions(element);
    if(args[@"action"]&&![actions containsObject:action])CUFail(@"UNSUPPORTED_ACTION",@"That action is not offered by this observed element.");
    CGEventFlags flags=CUFlags(args[@"hold_modifiers"]?:@[]);
    BOOL held=args[@"hold_key"]||flags||args[@"duration_ms"];
    if(args[@"action"]&&held)CUFail(@"INVALID_ACTION",@"Held input applies to pointer clicks; invoke accessibility actions separately.");
    if(action)return CUPerformAction(session,target,element,action);
    if(!held&&[args[@"count"]integerValue]<=1&&[button isEqual:@"left"]){
      // Source preparation consumes a menu-bar click without an extra AX or pointer action.
      if(CUInputPrepareMenu(session,target,element))return CUResult(@{@"route":@"menu_prepare",@"effect":@"unverifiable"});
      action=[actions containsObject:@"AXPick"]?@"AXPick":[actions containsObject:@"AXPress"]?@"AXPress":nil;
      if(action&&(!CUInsideWebView(session,element)||!CUWebClickNeedsPointer(session,target,element))){
        if(!CUInputFocusBelievesFocused(session,target)&&CUCatalystApplication(target)&&
           (CUClickMayCauseSelection(session,element)||[CUAX(element,kAXRoleAttribute)isEqual:@"AXMenuButton"]))CUEnforceInputFocus(session,target);
        return CUPerformAction(session,target,element,action);
      }
    }
  }
  if([name isEqualToString:@"click"]||[name isEqualToString:@"drag"]){
    BOOL drag=[name isEqualToString:@"drag"];CGPoint scaled=CGPointZero,from;
    if(element&&!drag)from=CUElementPoint(session,target,element);
    else{scaled=CUPoint(args,drag?@"from_x":@"x",drag?@"from_y":@"y",target);from=CUInputPointFromScaled(target,scaled);}
    CGPoint to=drag?CUInputPointFromScaled(target,CUPoint(args,@"to_x",@"to_y",target)):from;
    if(!element)CUInputMoveTo(session,target,scaled,drag?0:1,YES);
    NSString *buttonName=args[@"button"]?:@"left";CGMouseButton button=[buttonName isEqualToString:@"right"]?kCGMouseButtonRight:[buttonName isEqualToString:@"middle"]?kCGMouseButtonCenter:kCGMouseButtonLeft;
    if(![@[@"left",@"middle",@"right"] containsObject:buttonName])CUFail(@"INVALID_BUTTON",@"Mouse button must be left, middle, or right.");
    NSUInteger count=drag?1:[args[@"count"]unsignedIntegerValue]?:1;
    NSUInteger duration=drag?0:MAX(50,CUInputDuration(args,50));
    NSString *holdKey=args[@"hold_key"];CGKeyCode heldCode=holdKey?CUKey(holdKey):0;
    CGEventFlags heldFlags=CUFlags(args[@"hold_modifiers"]?:@[]);if(holdKey)heldFlags=CUKeyFlags(holdKey,heldFlags);
    BOOL holdsInput=holdKey||heldFlags,modifier=holdKey&&CUModifierKey(heldCode),heldDown=NO,flagsDown=NO;
    CGEventRef keyPress=NULL,keyRelease=NULL,flagsBefore=NULL,flagsAfter=NULL;pid_t heldPid=target.pid;
    id inputElement=element?(__bridge id)element:nil;
    if(!inputElement){AXUIElementRef app=AXUIElementCreateApplication(target.pid);AXUIElementSetMessagingTimeout(app,.25);inputElement=CUInputHit(app,CGPointMake(target.bounds.origin.x+from.x,target.bounds.origin.y+from.y));CFRelease(app);}
    AXUIElementRef sourceElement=inputElement?(__bridge AXUIElementRef)inputElement:NULL;
    BOOL insideWebView=CUInsideWebView(session,sourceElement),synthetic=NO;
    CGEventFlags pointerFlags=heldFlags;
    @try{
    synthetic=CUPrepareClickFocus(session,target,sourceElement,insideWebView,holdKey!=nil,heldFlags);
    if(!synthetic&&!CUInputFocusBelievesFocused(session,target))pointerFlags|=kCGEventFlagMaskCommand;
    CUInputMouseTarget *route=CUResolveMouseTarget(session,target,CGPointMake(target.bounds.origin.x+from.x,target.bounds.origin.y+from.y),inputElement);
    heldPid=route.pid;
    CUInputCheckMouseTarget(route);
    NSArray *packet=CUClickPacket(session,target,route,from,to,drag,button,count,pointerFlags);
    if(holdsInput){
      CGEventFlags previousFlags=CGEventSourceFlagsState(kCGEventSourceStateCombinedSessionState);
      CGEventSourceRef source=CGEventSourceCreate(kCGEventSourceStateHIDSystemState);if(!source)CUFail(@"INPUT_FAILED",@"Could not create the held keyboard event source.");
      @try{
        if((previousFlags&0x1e0000)!=heldFlags){flagsBefore=CUCreateKeyboardFlagsWithSource(source,heldFlags);flagsAfter=CUCreateKeyboardFlagsWithSource(source,previousFlags);}
        if(holdKey&&!modifier){keyPress=CUCreateKeyEventWithSource(source,heldCode,heldFlags,nil,YES);keyRelease=CUCreateKeyEventWithSource(source,heldCode,heldFlags,nil,NO);}
      }@finally{CFRelease(source);}
      [session check];if(flagsBefore){CUKeyboardPost(flagsBefore,heldPid);flagsDown=YES;}
      if(keyPress){CUKeyboardPost(keyPress,heldPid);heldDown=YES;}
    }
    CUSendClickPacket(session,target,route,packet,drag,duration);
    CUInputFocusActionPerformed(session,target);
    }@finally{
      @try{@try{if(heldDown)CUKeyboardPost(keyRelease,heldPid);}@finally{if(flagsDown)CUKeyboardPost(flagsAfter,heldPid);}}
      @finally{if(keyPress)CFRelease(keyPress);if(keyRelease)CFRelease(keyRelease);if(flagsBefore)CFRelease(flagsBefore);if(flagsAfter)CFRelease(flagsAfter);}
    }
    return CUResult(@{@"route":@"window_pointer",@"effect":@"unverifiable"});
  }
  if([name isEqualToString:@"press_key"]){
    id chords=args[@"chords"];
    if(chords&&(![chords isKindOfClass:NSArray.class]||![chords count]))CUFail(@"INVALID_KEY_SEQUENCE",@"Keyboard chords must be a nonempty array.");
    if(chords&&(args[@"key"]||args[@"modifiers"]))CUFail(@"INVALID_KEY_SEQUENCE",@"Use either a single key chord or a chords array.");
    NSArray *sequence=chords?:@[@{@"key":args[@"key"]?:NSNull.null,@"modifiers":args[@"modifiers"]?:@[]}];
    NSNumber *duration=args[@"duration_ms"]?@(CUInputDuration(args,0)):nil;NSMutableArray *strokes=[NSMutableArray new];
    // Validate the whole sequence before delivering any input.
    for(id chord in sequence){
      [session check];
      if(![chord isKindOfClass:NSDictionary.class])CUFail(@"INVALID_KEY_SEQUENCE",@"Each keyboard chord must be an object.");
      CGKeyCode key=CUKey(chord[@"key"]);if(CUModifierKey(key))CUFail(@"UNKNOWN_KEY",@"pressKey requires a non-modifier key, for example super+a. Use click key options to hold a modifier during a click.");
      CGEventFlags flags=CUKeyFlags(chord[@"key"],CUFlags(chord[@"modifiers"]?:@[]));[strokes addObject:@{@"key_code":@(key),@"flags":@(flags)}];
    }
    CUWithKeyboardFocus(session,target,^(pid_t pid){NSArray *packets=CUKeyboardPackets(strokes);CUSendKeyboard(session,pid,packets,0,duration);});
    return CUResult(@{@"route":@"window_keyboard",@"effect":@"unverifiable"});
  }
  if([name isEqualToString:@"type_text"]){
    NSString *text=args[@"text"];if(![text isKindOfClass:NSString.class])CUFail(@"INVALID_TEXT",@"Text must be a string.");
    CGEventSourceRef source=CGEventSourceCreate(kCGEventSourceStateHIDSystemState);if(!source)CUFail(@"INPUT_FAILED",@"Could not create the keyboard event source.");
    @try{
      // Validate the entire layout mapping before focus changes or input posts.
      NSArray *strokes=CUKeyboardTextStrokes(session,text);
      CUWithKeyboardFocus(session,target,^(pid_t pid){
        NSArray *packets=CUKeyboardPacketsWithSource(source,strokes);
        NSString *bundle=[NSRunningApplication runningApplicationWithProcessIdentifier:target.pid].bundleIdentifier;
        CUSendKeyboard(session,pid,packets,[bundle isEqual:@"com.apple.ScreenContinuity"]?5000000:250000,nil);
      });
    }@finally{CFRelease(source);}
    return CUResult(@{@"route":@"window_keyboard",@"effect":@"unverifiable"});
  }
  if([name isEqualToString:@"select_text"]){
    if(!element)CUFail(@"ELEMENT_REQUIRED",@"selectText requires an observed text element.");
    Boolean settable=false;
    if(![CUInputAttributes(element)containsObject:(__bridge NSString *)kAXSelectedTextRangeAttribute]||
       AXUIElementIsAttributeSettable(element,kAXSelectedTextRangeAttribute,&settable)!=kAXErrorSuccess||!settable)
      CUFail(@"SELECTION_UNSUPPORTED",@"The observed element does not offer a settable text range.");
    NSString *needle=args[@"text"];
    if(![needle isKindOfClass:NSString.class]||!needle.length)CUFail(@"INVALID_SELECTION",@"Selected text must be nonempty.");
    NSString *prefix=args[@"prefix"],*suffix=args[@"suffix"],*kind=args[@"selection_type"]?:@"text";
    if((prefix&&![prefix isKindOfClass:NSString.class])||(suffix&&![suffix isKindOfClass:NSString.class]))CUFail(@"INVALID_SELECTION",@"Selection prefix and suffix must be strings.");
    if(![kind isKindOfClass:NSString.class])CUFail(@"INVALID_SELECTION",@"Selection type must be a string.");
    NSDictionary *aliases=@{@"select":@"text",@"before":@"cursor_before",@"after":@"cursor_after"};kind=aliases[kind]?:kind;
    if(![@[@"text",@"cursor_before",@"cursor_after"] containsObject:kind])CUFail(@"INVALID_SELECTION",@"selection_type must be text, cursor_before, or cursor_after.");
    NSRange r;[session check];
    if(!CURecordedSourceTextRange(target,element,needle,prefix,suffix,&r))
      CUFail(@"TEXT_NOT_FOUND",@"The requested text and context do not identify one range in the captured source text.");
    if(r.location>NSIntegerMax||r.length>(NSUInteger)NSIntegerMax-r.location)CUFail(@"INVALID_SELECTION",@"The captured text range is too large.");
    if([kind isEqualToString:@"cursor_before"])r.length=0;else if([kind isEqualToString:@"cursor_after"]){r.location=NSMaxRange(r);r.length=0;}
    CFRange range=CFRangeMake(r.location,r.length);AXValueRef selection=AXValueCreate(kAXValueCFRangeType,&range);
    if(!selection)CUFail(@"SELECTION_FAILED",@"Could not create the captured text range.");
    @try{
      if(CUInputCursorEnabled){
        CFTypeRef bounds=NULL;AXError error=AXUIElementCopyParameterizedAttributeValue(element,kAXBoundsForRangeParameterizedAttribute,selection,&bounds);
        @try{CGRect frame;if(error==kAXErrorSuccess&&bounds&&CFGetTypeID(bounds)==AXValueGetTypeID()&&AXValueGetValue((AXValueRef)bounds,kAXValueCGRectType,&frame))CUInputScrollToVisible(session,element,frame);}
        @finally{if(bounds)CFRelease(bounds);}
      }
      CUInputFocusFieldIfNeeded(session,target,element);[session check];
      AXError error=AXUIElementSetAttributeValue(element,kAXSelectedTextRangeAttribute,selection);
      if(error!=kAXErrorSuccess)CUFail(@"SELECTION_FAILED",@"The element refused text selection.");
    }@finally{CFRelease(selection);}
    return CUResult(@{@"route":@"accessibility",@"effect":@"unverifiable"});
  }
  CUFail(@"UNSUPPORTED_OPERATION",[NSString stringWithFormat:@"Native operation is not implemented: %@",name]);return nil;
}
