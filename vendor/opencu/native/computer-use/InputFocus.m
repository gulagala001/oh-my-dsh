#import "InputFocus.h"
#import <dlfcn.h>
#import <objc/runtime.h>
#import <unistd.h>
#import <errno.h>
#import <sys/sysctl.h>
#import <libproc.h>

typedef CGEventRef (^CUFocusEventHandler)(CGEventType type, CGEventRef event);
typedef CFMachPortRef (*CUFocusPidTapCreate)(pid_t, CGEventTapPlacement, CGEventTapOptions, CGEventMask, CGEventTapCallBack, void *);
typedef void *(*CUFocusMainConnection)(void);
typedef int32_t (*CUFocusUpdate)(void *);
typedef void (*CUFocusWindowLocation)(CGEventRef, CGPoint);
typedef OSStatus (*CUFocusGetKeyFocus)(ProcessSerialNumber *,Boolean *);
typedef OSStatus (*CUFocusGetProcessPid)(const ProcessSerialNumber *,pid_t *);
typedef OSStatus (*CUFocusReleaseKeyFocus)(uint32_t);

static CGEventMask CUFocusActivationMask(void) { return (1ULL<<13)|(1ULL<<19)|(1ULL<<20); }
static NSTimeInterval CUFocusNow(void) { return NSProcessInfo.processInfo.systemUptime; }
static NSTimeInterval CUFocusLastActionTime;
static pid_t CUFocusLastActionPid;
static NSLock *CUFocusActionLock(void) { static NSLock *lock;static dispatch_once_t once;dispatch_once(&once,^{lock=[NSLock new];});return lock; }
static void *CUFocusSymbol(const char *name) {
  static dispatch_once_t once;
  dispatch_once(&once,^{dlopen("/System/Library/PrivateFrameworks/SkyLight.framework/SkyLight",RTLD_LAZY|RTLD_LOCAL);});
  void *symbol=dlsym(RTLD_DEFAULT,name);
  if(!symbol){NSString *alternate=[@"_" stringByAppendingString:[NSString stringWithUTF8String:name]];symbol=dlsym(RTLD_DEFAULT,alternate.UTF8String);}
  return symbol;
}
static BOOL CUFocusSubtype(CGEventRef event, int16_t *subtype) {
  int64_t value=CGEventGetIntegerValueField(event,(CGEventField)83);
  if(value<INT16_MIN||value>INT16_MAX)return NO;
  *subtype=(int16_t)value;return YES;
}
static BOOL CUFocusActivated(CGEventType type,CGEventRef event) {
  int16_t subtype;return type==20||(type==13&&CUFocusSubtype(event,&subtype)&&subtype==1);
}
static BOOL CUFocusDeactivated(CGEventType type,CGEventRef event) {
  int16_t subtype;return type==19||(type==13&&CUFocusSubtype(event,&subtype)&&subtype==2);
}
static void CUFocusPost(pid_t pid,CGEventRef event) {
  CGEventSetTimestamp(event,(CGEventTimestamp)(CUFocusNow()*1e9));CGEventPostToPid(pid,event);
}
static CGEventRef CUFocusOtherEvent(NSEventType type,short subtype,CGWindowID window,CGEventFlags flags) {
  NSEvent *event=[NSEvent otherEventWithType:type location:NSZeroPoint modifierFlags:(NSEventModifierFlags)flags timestamp:0 windowNumber:window context:nil subtype:subtype data1:0 data2:0];
  CGEventRef result=event.CGEvent;
  if(!result)CUFail(@"BACKGROUND_UNAVAILABLE",@"This macOS runtime could not construct an application focus event.");
  return (CGEventRef)CFRetain(result);
}
static void CUFocusSleep(CUSession *session,NSUInteger milliseconds) {
  for(NSUInteger elapsed=0;elapsed<milliseconds;){[session check];NSUInteger interval=MIN(10,milliseconds-elapsed);usleep((useconds_t)interval*1000);elapsed+=interval;}
}
static id CUFocusApplication(pid_t pid) {
  AXUIElementRef element=AXUIElementCreateApplication(pid);if(!element)return nil;
  AXUIElementSetMessagingTimeout(element,.25);return CFBridgingRelease(element);
}
static pid_t CUFocusElementPid(id element) {
  pid_t pid=0;if(!element||AXUIElementGetPid((__bridge AXUIElementRef)element,&pid)!=kAXErrorSuccess)return 0;return pid;
}
typedef NS_ENUM(NSUInteger,CUFocusProcessStatus) { CUFocusProcessUnknown,CUFocusProcessSame,CUFocusProcessEnded };
static CUFocusProcessStatus CUFocusProcessIdentity(pid_t pid,NSString *expected) {
  if(pid<=0||!expected.length)return CUFocusProcessUnknown;
  struct proc_bsdinfo info={0};errno=0;int count=proc_pidinfo(pid,PROC_PIDTBSDINFO,0,&info,sizeof(info));int error=errno;
  if(count!=(int)sizeof(info))return count<=0&&error==ESRCH?CUFocusProcessEnded:CUFocusProcessUnknown;
  NSString *identity=[NSString stringWithFormat:@"%d:%llu:%llu",pid,info.pbi_start_tvsec,info.pbi_start_tvusec];
  return [identity isEqual:expected]?CUFocusProcessSame:CUFocusProcessEnded;
}
static BOOL CUFocusBelievesFrontmost(pid_t pid) {
  id application=CUFocusApplication(pid);id value=application?CUAX((__bridge AXUIElementRef)application,kAXFrontmostAttribute):nil;
  return [value isKindOfClass:NSNumber.class]&&[value boolValue];
}
static id CUFocusWindow(CUWindow *window) {
  id application=CUFocusApplication(window.pid);
  for(id candidate in CUAX((__bridge AXUIElementRef)application,kAXWindowsAttribute))if(CUAXWindowId((__bridge AXUIElementRef)candidate)==window.windowId)return candidate;
  return nil;
}
static NSInteger CUFocusProcessType(pid_t pid) {
  NSRunningApplication *application=[NSRunningApplication runningApplicationWithProcessIdentifier:pid];
  if(!application||!application.finishedLaunching)return 2;
  return application.activationPolicy==NSApplicationActivationPolicyProhibited?1:0;
}
static NSRunningApplication *CUFocusParentApplication(NSRunningApplication *application) {
  NSString *name=application.localizedName;if(![name containsString:@"("]||![name containsString:@")"])return nil;
  NSUInteger end=name.length;while(end&&[name characterAtIndex:end-1]==')')end--;
  NSRange opening=[name rangeOfString:@"(" options:NSBackwardsSearch range:NSMakeRange(0,end)];
  if(opening.location==NSNotFound)return nil;
  NSString *parent=[name substringWithRange:NSMakeRange(opening.location+1,end-opening.location-1)];
  NSMutableArray *matches=[NSMutableArray new];
  for(NSRunningApplication *candidate in NSWorkspace.sharedWorkspace.runningApplications)if([candidate.localizedName isEqual:parent]&&candidate.activationPolicy!=NSApplicationActivationPolicyProhibited)[matches addObject:candidate];
  return matches.count==1?matches[0]:nil;
}
static pid_t CUFocusLogicalApplication(pid_t pid,id focused,BOOL allowParent) {
  id application=CUFocusApplication(pid);focused=focused?:CUAX((__bridge AXUIElementRef)application,kAXFocusedUIElementAttribute);
  pid_t focusedPid=CUFocusElementPid(focused);
  NSRunningApplication *focusedApp=focusedPid?[NSRunningApplication runningApplicationWithProcessIdentifier:focusedPid]:nil;
  if(focusedApp&&focusedApp.activationPolicy!=NSApplicationActivationPolicyProhibited)return focusedPid;
  if(focusedPid){
    id focusedApplication=CUFocusApplication(focusedPid);
    pid_t appPid=CUFocusElementPid(focusedApplication);
    NSRunningApplication *app=[NSRunningApplication runningApplicationWithProcessIdentifier:appPid];
    if(app&&app.activationPolicy!=NSApplicationActivationPolicyProhibited)return appPid;
    id window=CUAX((__bridge AXUIElementRef)focusedApplication,kAXFocusedWindowAttribute)?:CUAX((__bridge AXUIElementRef)focusedApplication,kAXMainWindowAttribute);
    pid_t windowPid=CUFocusElementPid(window);app=[NSRunningApplication runningApplicationWithProcessIdentifier:windowPid];
    if(app&&app.activationPolicy!=NSApplicationActivationPolicyProhibited)return windowPid;
  }
  if(allowParent){NSRunningApplication *parent=CUFocusParentApplication([NSRunningApplication runningApplicationWithProcessIdentifier:pid]);if(parent)return parent.processIdentifier;}
  return NSWorkspace.sharedWorkspace.frontmostApplication.processIdentifier;
}

@interface CUFocusTapRun : NSObject
@property NSCondition *condition;
@property (copy) CUFocusEventHandler handler;
@property BOOL stopping;
@property BOOL ready;
@property BOOL attachedSource;
@property BOOL shouldAutoreenable;
@property (assign) CFMachPortRef port;
@property (assign) CFRunLoopRef loop;
- (void)stop;
@end

static pid_t CUFocusViewBridgePid(void) {
  int bytes=proc_listpids(PROC_UID_ONLY,getuid(),NULL,0);if(bytes<=0)return 0;
  pid_t *pids=malloc((size_t)bytes);if(!pids)return 0;
  int used=proc_listpids(PROC_UID_ONLY,getuid(),pids,bytes);pid_t match=0;
  for(NSUInteger i=0;used>0&&i<(NSUInteger)MIN(bytes,used)/sizeof(pid_t);i++){
    if(pids[i]<=0)continue;struct proc_bsdinfo info={0};
    if(proc_pidinfo(pids[i],PROC_PIDTBSDINFO,0,&info,sizeof(info))>0){
      NSString *name=[[NSString alloc]initWithBytes:info.pbi_name length:strnlen(info.pbi_name,sizeof(info.pbi_name)) encoding:NSUTF8StringEncoding];
      if([name isEqual:@"ViewBridgeAuxiliary"]){match=pids[i];break;}
    }
  }
  free(pids);return match;
}

static CGEventRef CUFocusTapCallback(CGEventTapProxy proxy,CGEventType type,CGEventRef event,void *context) {
  CUFocusTapRun *run=(__bridge CUFocusTapRun *)context;
  [run.condition lock];BOOL stopped=run.stopping;CUFocusEventHandler handler=run.handler;
  CFMachPortRef port=run.port;BOOL reenable=run.shouldAutoreenable;[run.condition unlock];
  if(stopped)return event;
  if(type==kCGEventTapDisabledByTimeout){if(reenable&&port)CGEventTapEnable(port,true);return event;}
  if(type==kCGEventTapDisabledByUserInput)return event;
  @try{return handler?handler(type,event):event;}@catch(NSException *error){return event;}
}

@implementation CUFocusTapRun
- (void)stop {
  [self.condition lock];self.stopping=YES;CFRunLoopRef loop=self.loop;
  if(loop)CFRetain(loop);CFMachPortRef port=self.port;if(port)CFRetain(port);
  self.handler=nil;[self.condition unlock];
  if(port){CGEventTapEnable(port,false);CFMachPortInvalidate(port);CFRelease(port);}
  if(loop){CFRunLoopStop(loop);CFRunLoopWakeUp(loop);CFRelease(loop);}
}
- (void)dealloc { if(_port)CFRelease(_port);if(_loop)CFRelease(_loop); }
@end

@interface CUFocusTap : NSObject
@property CUFocusTapRun *run;
- (instancetype)initWithPid:(pid_t)pid global:(BOOL)global mask:(CGEventMask)mask placement:(CGEventTapPlacement)placement handler:(CUFocusEventHandler)handler;
- (void)stop;
@end

@implementation CUFocusTap
- (instancetype)initWithPid:(pid_t)pid global:(BOOL)global mask:(CGEventMask)mask placement:(CGEventTapPlacement)placement handler:(CUFocusEventHandler)handler {
  self=[super init];if(!self)return nil;
  CUFocusTapRun *run=[CUFocusTapRun new];run.condition=[NSCondition new];run.handler=handler;run.shouldAutoreenable=YES;
  if(global)run.port=CGEventTapCreate(kCGAnnotatedSessionEventTap,placement,kCGEventTapOptionDefault,mask,CUFocusTapCallback,(__bridge void *)run);
  else {
    CUFocusPidTapCreate create=CUFocusSymbol("CGEventTapCreateForPid");
    if(create)run.port=create(pid,placement,kCGEventTapOptionDefault,mask,CUFocusTapCallback,(__bridge void *)run);
  }
  if(!run.port)return nil;self.run=run;
  NSThread *thread=[[NSThread alloc]initWithBlock:^{@autoreleasepool{
    CFRunLoopSourceRef source=CFMachPortCreateRunLoopSource(kCFAllocatorDefault,run.port,0);
    [run.condition lock];run.loop=(CFRunLoopRef)CFRetain(CFRunLoopGetCurrent());
    BOOL stop=run.stopping;
    if(source&&!stop){CFRunLoopAddSource(run.loop,source,kCFRunLoopCommonModes);CGEventTapEnable(run.port,true);run.attachedSource=YES;}
    run.ready=YES;[run.condition broadcast];[run.condition unlock];
    if(source&&!stop)CFRunLoopRun();
    if(source){CFRunLoopRemoveSource(run.loop,source,kCFRunLoopCommonModes);CFRelease(source);}
    [run stop];
  }}];
  thread.name=[NSString stringWithFormat:@"Computer Use Focus Tap %d",pid];thread.qualityOfService=NSQualityOfServiceUserInteractive;[thread start];
  [run.condition lock];while(!run.ready)[run.condition wait];BOOL attached=run.attachedSource;[run.condition unlock];return attached?self:nil;
}
- (void)stop { [self.run stop]; }
- (void)dealloc { [_run stop]; }
@end

typedef struct { BOOL believesActive; BOOL believesFocus; BOOL actualActive; } CUFocusState;
typedef struct { pid_t logical; pid_t physical; uint16_t flags; } CUFocusOwner;
typedef struct { pid_t physical;pid_t logical;pid_t originalTarget;uint8_t state;BOOL returned; } CUFocusTheft;
@class CUInputFocusController;

@interface CUFocusSignals : NSObject
@property NSLock *lock;
@property BOOL sawActivation;
@property BOOL sawActivated;
@property BOOL sawDeactivated;
@property NSTimeInterval lastEvent;
@end
@implementation CUFocusSignals
- (instancetype)init { self=[super init];if(self){_lock=[NSLock new];_lastEvent=CUFocusNow();}return self; }
@end

static BOOL CUFocusPoint(id value,CGPoint *point) {
  return value&&CFGetTypeID((__bridge CFTypeRef)value)==AXValueGetTypeID()&&AXValueGetValue((__bridge AXValueRef)value,kAXValueCGPointType,point)&&isfinite(point->x)&&isfinite(point->y);
}
static CGRect CUFocusBounds(id element) {
  CGRect frame;id value=CUAX((__bridge AXUIElementRef)element,CFSTR("AXFrame"));
  if(value&&CFGetTypeID((__bridge CFTypeRef)value)==AXValueGetTypeID()&&AXValueGetValue((__bridge AXValueRef)value,kAXValueCGRectType,&frame))return frame;
  CGPoint position;CGSize size;id p=CUAX((__bridge AXUIElementRef)element,kAXPositionAttribute),s=CUAX((__bridge AXUIElementRef)element,kAXSizeAttribute);
  if(!CUFocusPoint(p,&position)||!s||CFGetTypeID((__bridge CFTypeRef)s)!=AXValueGetTypeID()||!AXValueGetValue((__bridge AXValueRef)s,kAXValueCGSizeType,&size)||!isfinite(size.width)||!isfinite(size.height))return CGRectNull;
  return CGRectMake(position.x,position.y,size.width,size.height);
}
static BOOL CUFocusTargetAheadOfWindow(pid_t pid,CGWindowID window) {
  NSArray *windows=CFBridgingRelease(CGWindowListCopyWindowInfo(kCGWindowListOptionOnScreenOnly|kCGWindowListExcludeDesktopElements,kCGNullWindowID));
  NSUInteger index=[windows indexOfObjectPassingTest:^BOOL(NSDictionary *item,NSUInteger i,BOOL *stop){return [item[(id)kCGWindowNumber]unsignedIntValue]==window;}];
  if(index==NSNotFound)return NO;
  NSNumber *layer=windows[index][(id)kCGWindowLayer];
  for(NSUInteger i=0;i<index;i++)if([windows[i][(id)kCGWindowOwnerPID]intValue]==pid&&[windows[i][(id)kCGWindowLayer]isEqual:layer])return YES;
  return NO;
}

@interface CUFocusRegistration : NSObject
@property NSHashTable<CUInputFocusController *> *controllers;
@property CUFocusTap *keyboardTap;
@property NSArray<CUFocusTap *> *menuTaps;
@property BOOL suppressMenu;
@end
@implementation CUFocusRegistration
@end

@interface CUFocusPreventer : NSObject
@property NSRecursiveLock *lock;
@property NSMutableDictionary<NSNumber *,CUFocusRegistration *> *registrations;
@property CUFocusTap *globalTap;
@property CUFocusTap *viewBridgeTap;
@property pid_t viewBridgePid;
@property CUFocusOwner owner;
@property CUFocusOwner previousOwner;
@property CUFocusTheft theft;
@property BOOL blockNewFront;
@property dispatch_queue_t transitions;
+ (instancetype)shared;
- (void)registerController:(CUInputFocusController *)controller;
- (void)unregisterController:(CUInputFocusController *)controller;
- (CUFocusOwner)ownerForPid:(pid_t)pid;
- (CGEventRef)notification:(CGEventRef)event;
- (CGEventRef)keyboard:(CGEventRef)event;
- (void)suppressMenuForPid:(pid_t)pid menuPid:(NSNumber *)menuPid;
- (void)stopSuppressingMenuForPid:(pid_t)pid;
@end

@interface CUInputFocusController : NSObject
@property pid_t pid;
@property NSString *identity;
@property NSRecursiveLock *lock;
@property CUFocusState state;
@property CUFocusTap *activationTap;
@property id frontmostObserver;
@property (copy) BOOL (^activationSuppression)(CGEventType,CGEventRef);
@property BOOL closed;
- (instancetype)initWithPid:(pid_t)pid identity:(NSString *)identity;
- (void)enforce:(CUWindow *)window;
- (void)enforce:(CUWindow *)window axWindow:(id)axWindow;
- (void)safelyEnforce:(CUWindow *)window session:(CUSession *)session;
- (void)safelyEnforce:(CUWindow *)window axWindow:(id)axWindow session:(CUSession *)session;
- (void)deactivate;
- (void)setBelievesFocus:(BOOL)focused;
- (BOOL)close;
- (void)stopMonitoring;
@end

@implementation CUInputFocusController
- (instancetype)initWithPid:(pid_t)pid identity:(NSString *)identity {
  self=[super init];if(!self)return nil;_pid=pid;_identity=[identity copy];_lock=[NSRecursiveLock new];
  BOOL active=[NSRunningApplication runningApplicationWithProcessIdentifier:pid].active;
  CUFocusPreventer *preventer=CUFocusPreventer.shared;
  [preventer.lock lock];BOOL focused=preventer.owner.logical==pid;[preventer.lock unlock];
  _state=(CUFocusState){active,focused,active};
  __weak CUInputFocusController *weakSelf=self;
  _activationTap=[[CUFocusTap alloc]initWithPid:pid global:NO mask:CUFocusActivationMask() placement:kCGTailAppendEventTap handler:^CGEventRef(CGEventType type,CGEventRef event){
    CUInputFocusController *self=weakSelf;if(!self)return event;
    [self.lock lock];
    if(self.closed){[self.lock unlock];return event;}
    BOOL suppress=self.activationSuppression&&self.activationSuppression(type,event);
    if(!suppress){CUFocusState state=self.state;
      if(CUFocusActivated(type,event)){state.believesActive=YES;state.believesFocus=YES;}
      else if(CUFocusDeactivated(type,event)){state.believesActive=NO;state.believesFocus=NO;}
      self.state=state;
    }
    [self.lock unlock];return suppress?NULL:event;
  }];
  if(!_activationTap)CUFail(@"BACKGROUND_UNAVAILABLE",@"Could not observe focus events for the selected application.");
  _frontmostObserver=[NSWorkspace.sharedWorkspace.notificationCenter addObserverForName:NSWorkspaceDidActivateApplicationNotification object:nil queue:nil usingBlock:^(NSNotification *notification){
    CUInputFocusController *self=weakSelf;if(!self)return;
    NSRunningApplication *app=notification.userInfo[NSWorkspaceApplicationKey];
    [self.lock lock];if(!self.closed){CUFocusState state=self.state;state.actualActive=app.processIdentifier==self.pid;self.state=state;}[self.lock unlock];
  }];
  [preventer registerController:self];
  return self;
}
- (void)setBelievesFocus:(BOOL)focused { [self.lock lock];if(!self.closed){CUFocusState state=self.state;state.believesFocus=focused;self.state=state;}[self.lock unlock]; }
- (void)enforce:(CUWindow *)window { [self enforce:window axWindow:nil]; }
- (void)enforce:(CUWindow *)window axWindow:(id)axWindow {
  [self.lock lock];CUFocusState state=self.state;[self.lock unlock];if(state.believesFocus)return;
  if(state.believesActive){
    CGEventRef event=CUFocusOtherEvent((NSEventType)21,(short)0x8000,0,0);
    @try{CUFocusPost(self.pid,event);}@finally{CFRelease(event);}
    [self setBelievesFocus:YES];return;
  }
  id targetWindow=axWindow?:(window?CUFocusWindow(window):nil);CGPoint point;CGRect frame=CGRectNull;CGWindowID windowId=0;
  BOOL activationPoint=targetWindow&&CUFocusPoint(CUAX((__bridge AXUIElementRef)targetWindow,CFSTR("AXActivationPoint")),&point);
  if(activationPoint){windowId=CUAXWindowId((__bridge AXUIElementRef)targetWindow);frame=CUFocusBounds(targetWindow);}
  CGEventRef activation=CUFocusOtherEvent((NSEventType)13,1,windowId,windowId?0xc0000:0);
  CGEventRef down=NULL,up=NULL;
  @try{
    if(windowId&&activationPoint&&!CGRectIsNull(frame)){
      CUFocusWindowLocation location=CUFocusSymbol("CGEventSetWindowLocation");
      if(!location)CUFail(@"BACKGROUND_UNAVAILABLE",@"Window activation event locations are unavailable on this macOS version.");
      NSEvent *mouseDown=[NSEvent mouseEventWithType:NSEventTypeLeftMouseDown location:NSMakePoint(point.x,point.y) modifierFlags:0 timestamp:0 windowNumber:windowId context:nil eventNumber:1 clickCount:1 pressure:1];
      NSEvent *mouseUp=[NSEvent mouseEventWithType:NSEventTypeLeftMouseUp location:NSMakePoint(point.x,point.y) modifierFlags:0 timestamp:0 windowNumber:windowId context:nil eventNumber:2 clickCount:1 pressure:1];
      if(!mouseDown.CGEvent||!mouseUp.CGEvent)CUFail(@"BACKGROUND_UNAVAILABLE",@"Could not construct window activation pointer events.");
      down=(CGEventRef)CFRetain(mouseDown.CGEvent);up=(CGEventRef)CFRetain(mouseUp.CGEvent);
      for(NSValue *wrapped in @[[NSValue valueWithPointer:down],[NSValue valueWithPointer:up]]){
        CGEventRef event=wrapped.pointerValue;CGEventSetFlags(event,0);CGEventSetLocation(event,point);
        CGEventSetIntegerValueField(event,(CGEventField)3,0);CGEventSetIntegerValueField(event,(CGEventField)7,3);
        CGEventSetIntegerValueField(event,(CGEventField)91,windowId);CGEventSetIntegerValueField(event,(CGEventField)92,windowId);
        location(event,CGPointMake(point.x-CGRectGetMinX(frame),point.y-CGRectGetMinY(frame)));
      }
    }
    CUFocusPost(self.pid,activation);if(down)CUFocusPost(self.pid,down);if(up)CUFocusPost(self.pid,up);
    [self.lock lock];state=self.state;state.believesActive=YES;state.believesFocus=YES;self.state=state;[self.lock unlock];
  }@finally{CFRelease(activation);if(down)CFRelease(down);if(up)CFRelease(up);}
}
- (void)safelyEnforce:(CUWindow *)window session:(CUSession *)session { [self safelyEnforce:window axWindow:nil session:session]; }
- (void)safelyEnforce:(CUWindow *)window axWindow:(id)axWindow session:(CUSession *)session {
  [session check];NSRunningApplication *previous=NSWorkspace.sharedWorkspace.frontmostApplication;
  if(!previous||previous.processIdentifier==self.pid){
    [self enforce:window axWindow:axWindow];NSDate *start=[NSDate date];
    while([NSDate.date timeIntervalSinceDate:start]<=.25&&!CUFocusBelievesFrontmost(self.pid))CUFocusSleep(session,100);
    return;
  }
  CUFocusMainConnection mainConnection=CUFocusSymbol("CGSMainConnectionID");
  CUFocusUpdate disable=CUFocusSymbol("SLSDisableUpdate"),reenable=CUFocusSymbol("SLSReenableUpdate");
  if(!mainConnection||!disable||!reenable)CUFail(@"BACKGROUND_UNAVAILABLE",@"WindowServer update control is unavailable on this macOS version.");
  pid_t previousPid=previous.processIdentifier;id previousApplication=CUFocusApplication(previousPid);
  id previousWindow=CUAX((__bridge AXUIElementRef)previousApplication,kAXFocusedWindowAttribute);
  CGWindowID previousWindowId=previousWindow?CUAXWindowId((__bridge AXUIElementRef)previousWindow):0;
  CUFocusSignals *signals=[CUFocusSignals new];CUFocusTap *previousTap=nil,*keyboardTap=nil;
  __weak CUInputFocusController *weakSelf=self;void *connection=NULL;BOOL updatesDisabled=NO;NSException *enforceError=nil;
  @try{
    previousTap=[[CUFocusTap alloc]initWithPid:previousPid global:NO mask:CUFocusActivationMask() placement:kCGHeadInsertEventTap handler:^CGEventRef(CGEventType type,CGEventRef event){
      BOOL activated=CUFocusActivated(type,event),deactivated=CUFocusDeactivated(type,event);int16_t subtype=0;
      [signals.lock lock];signals.lastEvent=CUFocusNow();if(activated){signals.sawActivation=YES;signals.sawActivated=YES;}else if(deactivated)signals.sawActivation=YES;[signals.lock unlock];
      return activated||deactivated||(type==13&&CUFocusSubtype(event,&subtype)&&(subtype==22||subtype==23))?NULL:event;
    }];
    keyboardTap=[[CUFocusTap alloc]initWithPid:self.pid global:NO mask:(1ULL<<10)|(1ULL<<11)|(1ULL<<12) placement:kCGHeadInsertEventTap handler:^CGEventRef(CGEventType type,CGEventRef event){
      CUInputFocusController *controller=weakSelf;if(!controller)return event;
      if(CGEventGetIntegerValueField(event,(CGEventField)41)!=getpid()&&CGEventGetIntegerValueField(event,(CGEventField)40)==controller.pid){CGEventPostToPid(previousPid,event);return NULL;}return event;
    }];
    if(!previousTap||!keyboardTap)CUFail(@"BACKGROUND_UNAVAILABLE",@"Could not install temporary background focus observers.");
    [self.lock lock];self.activationSuppression=^BOOL(CGEventType type,CGEventRef event){
      BOOL activated=CUFocusActivated(type,event),deactivated=CUFocusDeactivated(type,event);int16_t subtype=0;
      [signals.lock lock];signals.lastEvent=CUFocusNow();if(activated)signals.sawActivation=YES;else if(deactivated){signals.sawActivation=YES;signals.sawDeactivated=YES;}[signals.lock unlock];
      return deactivated||(type==13&&CUFocusSubtype(event,&subtype)&&(subtype==22||subtype==23));
    };[self.lock unlock];
    connection=mainConnection();disable(connection);updatesDisabled=YES;
    @try{[self enforce:window axWindow:axWindow];}@catch(NSException *error){enforceError=error;}
    NSTimeInterval start=CUFocusNow(),lastActivationAttempt=0;BOOL reactivated=NO,needsActivationEvents=NO;
    [signals.lock lock];signals.lastEvent=start;[signals.lock unlock];
    for(;;){
      [session check];NSTimeInterval now=CUFocusNow(),elapsed=now-start;NSRunningApplication *frontmost=NSWorkspace.sharedWorkspace.frontmostApplication;
      if(frontmost.processIdentifier==self.pid){
        if(now-lastActivationAttempt>=.05){
          [signals.lock lock];signals.sawActivated=NO;signals.sawDeactivated=NO;signals.lastEvent=now;[signals.lock unlock];
          if(![previous activateWithOptions:0])CUFail(@"FOCUS_RESTORE_FAILED",@"The original frontmost application refused reactivation.");
          reactivated=YES;needsActivationEvents=YES;lastActivationAttempt=now;
        }
      }else if(!frontmost||frontmost.processIdentifier!=previousPid)CUFail(@"FOCUS_CHANGED",@"The frontmost application changed during background focus preparation.");
      else {
        BOOL believes=enforceError||CUFocusBelievesFrontmost(self.pid);
        if(previousWindowId&&CUFocusTargetAheadOfWindow(self.pid,previousWindowId)){
          AXUIElementPerformAction((__bridge AXUIElementRef)previousWindow,kAXRaiseAction);
          [signals.lock lock];signals.lastEvent=now;[signals.lock unlock];
          if(elapsed<1){CUFocusSleep(session,10);continue;}
        }
        if(believes||elapsed>=1){
          [signals.lock lock];BOOL activated=signals.sawActivated,deactivated=signals.sawDeactivated,activity=signals.sawActivation;NSTimeInterval lastEvent=signals.lastEvent;[signals.lock unlock];
          if((!needsActivationEvents||(activated&&deactivated))&&(!(enforceError||reactivated||activity)||now-lastEvent>=.1)){
            if(enforceError)@throw enforceError;break;
          }
        }
      }
      if(elapsed>=2)CUFail(@"FOCUS_TIMEOUT",@"Background focus did not settle before its two-second deadline.");
      CUFocusSleep(session,10);
    }
  }@catch(NSException *error){if(enforceError)@throw enforceError;@throw error;}@finally{
    if(updatesDisabled)reenable(connection);
    [self.lock lock];self.activationSuppression=nil;[self.lock unlock];
    [keyboardTap stop];[previousTap stop];
  }
}
- (void)deactivate {
  [self.lock lock];CUFocusState state=self.state;[self.lock unlock];
  if(!state.believesActive||state.actualActive)return;
  CGEventRef event=CUFocusOtherEvent((NSEventType)13,2,0,0);
  @try{CUFocusPost(self.pid,event);[self.lock lock];state=self.state;state.believesActive=NO;state.believesFocus=NO;self.state=state;[self.lock unlock];}@finally{CFRelease(event);}
}
- (BOOL)close {
  @try{
    [self.lock lock];BOOL closed=self.closed;[self.lock unlock];if(closed)return YES;
    CUFocusProcessStatus status=CUFocusProcessIdentity(self.pid,self.identity);if(status==CUFocusProcessUnknown)return NO;
    if(status==CUFocusProcessSame)[self deactivate];
    [self stopMonitoring];return YES;
  }@catch(NSException *error){return NO;}
}
- (void)stopMonitoring {
  [self.lock lock];if(self.closed){[self.lock unlock];return;}self.closed=YES;self.activationSuppression=nil;[self.lock unlock];
  if(self.frontmostObserver)[NSWorkspace.sharedWorkspace.notificationCenter removeObserver:self.frontmostObserver];self.frontmostObserver=nil;
  [self.activationTap stop];self.activationTap=nil;[CUFocusPreventer.shared unregisterController:self];
}
- (void)dealloc { [self stopMonitoring]; }
@end

@implementation CUFocusPreventer
+ (instancetype)shared { static CUFocusPreventer *instance;static dispatch_once_t once;dispatch_once(&once,^{instance=[CUFocusPreventer new];});return instance; }
- (instancetype)init {
  self=[super init];if(!self)return nil;_lock=[NSRecursiveLock new];_registrations=[NSMutableDictionary new];_theft.state=2;_transitions=dispatch_queue_create("computer-use.focus-transitions",DISPATCH_QUEUE_SERIAL);
  _viewBridgePid=CUFocusViewBridgePid();pid_t focusPid=0;ProcessSerialNumber process={0};Boolean unknown=false;
  CUFocusGetKeyFocus getFocus=CUFocusSymbol("CPSGetKeyFocusProcess");CUFocusGetProcessPid getPid=CUFocusSymbol("GetProcessPID");
  OSStatus focusStatus=getFocus?getFocus(&process,&unknown):-1,pidStatus=getPid?getPid(&process,&focusPid):-1;
  if(focusStatus==0&&pidStatus==0)_owner=[self ownerForPid:focusPid];
  else if(focusStatus==0&&pidStatus==-600&&!unknown&&_viewBridgePid&&![NSRunningApplication runningApplicationWithProcessIdentifier:_viewBridgePid])_owner=[self ownerForPid:_viewBridgePid];
  else _owner=(CUFocusOwner){NSWorkspace.sharedWorkspace.frontmostApplication.processIdentifier,0,0};
  _previousOwner=(CUFocusOwner){0,0,0xfefe};__weak CUFocusPreventer *weakSelf=self;
  _globalTap=[[CUFocusTap alloc]initWithPid:0 global:YES mask:1ULL<<21 placement:kCGTailAppendEventTap handler:^CGEventRef(CGEventType type,CGEventRef event){CUFocusPreventer *self=weakSelf;return self?[self notification:event]:event;}];
  if(_viewBridgePid)_viewBridgeTap=[[CUFocusTap alloc]initWithPid:_viewBridgePid global:NO mask:(1ULL<<10)|(1ULL<<11)|(1ULL<<12) placement:kCGTailAppendEventTap handler:^CGEventRef(CGEventType type,CGEventRef event){CUFocusPreventer *self=weakSelf;return self?[self keyboard:event]:event;}];
  return self;
}
- (CUFocusOwner)ownerForPid:(pid_t)pid {
  pid_t bridge=CUFocusViewBridgePid();
  if(bridge&&pid==bridge){
    id application=CUFocusApplication(pid),focused=CUAX((__bridge AXUIElementRef)application,kAXFocusedUIElementAttribute);
    NSTimeInterval now=CUFocusNow();
    NSLock *actionLock=CUFocusActionLock();[actionLock lock];NSTimeInterval actionTime=CUFocusLastActionTime;pid_t actionPid=CUFocusLastActionPid;[actionLock unlock];
    BOOL recentAction=!focused&&now-actionTime<1;
    if(recentAction){
      for(NSUInteger attempt=0;attempt<12&&!focused;attempt++){usleep(15000);focused=CUAX((__bridge AXUIElementRef)application,kAXFocusedUIElementAttribute);}
      [actionLock lock];actionPid=CUFocusLastActionPid;[actionLock unlock];
    }
    pid_t logical=recentAction&&actionPid?actionPid:CUFocusLogicalApplication(pid,focused,NO);
    focused=CUAX((__bridge AXUIElementRef)application,kAXFocusedUIElementAttribute);
    pid_t focusedPid=CUFocusElementPid(focused);
    NSRunningApplication *focusedApplication=focusedPid?[NSRunningApplication runningApplicationWithProcessIdentifier:focusedPid]:nil;
    BOOL indirect=!focused||(!focusedPid)||(focusedApplication&&focusedApplication.activationPolicy!=NSApplicationActivationPolicyProhibited);
    return (CUFocusOwner){logical,pid,(uint16_t)(0x8100|indirect)};
  }
  NSRunningApplication *app=[NSRunningApplication runningApplicationWithProcessIdentifier:pid];
  if(app&&app.activationPolicy==NSApplicationActivationPolicyProhibited)return (CUFocusOwner){CUFocusLogicalApplication(pid,nil,YES),pid,0x8000};
  return (CUFocusOwner){pid,0,0};
}
- (void)registerController:(CUInputFocusController *)controller {
  if(!self.globalTap)CUFail(@"BACKGROUND_UNAVAILABLE",@"Could not install the process-notification focus observer.");
  [self.lock lock];CUFocusRegistration *registration=self.registrations[@(controller.pid)];
  if(!registration){
    registration=[CUFocusRegistration new];registration.controllers=[NSHashTable weakObjectsHashTable];__weak CUFocusPreventer *weakSelf=self;
    registration.keyboardTap=[[CUFocusTap alloc]initWithPid:controller.pid global:NO mask:(1ULL<<10)|(1ULL<<11)|(1ULL<<12) placement:kCGTailAppendEventTap handler:^CGEventRef(CGEventType type,CGEventRef event){CUFocusPreventer *self=weakSelf;return self?[self keyboard:event]:event;}];
    if(!registration.keyboardTap){[self.lock unlock];CUFail(@"BACKGROUND_UNAVAILABLE",@"Could not install the application's focus-steal observer.");}
    self.registrations[@(controller.pid)]=registration;
  }
  [registration.controllers addObject:controller];[self.lock unlock];
}
- (void)unregisterController:(CUInputFocusController *)controller {
  [self.lock lock];CUFocusRegistration *registration=self.registrations[@(controller.pid)];[registration.controllers removeObject:controller];
  if(!registration.controllers.count){
    [registration.keyboardTap stop];for(CUFocusTap *tap in registration.menuTaps)[tap stop];[self.registrations removeObjectForKey:@(controller.pid)];
    if(self.theft.state!=2&&self.theft.logical==controller.pid)self.theft=(CUFocusTheft){.state=2};
    if(self.owner.logical==controller.pid)self.blockNewFront=NO;
    if(!self.registrations.count){self.theft=(CUFocusTheft){.state=2};self.blockNewFront=NO;}
  }
  [self.lock unlock];
}
- (CGEventRef)keyboard:(CGEventRef)event {
  if(CGEventGetIntegerValueField(event,(CGEventField)41)==getpid())return event;
  [self.lock lock];CGEventRef result=event;
  @try{
    CUFocusTheft theft=self.theft;
    if(theft.state!=2&&![self protectedPid:theft.logical]){self.theft=(CUFocusTheft){.state=2};self.blockNewFront=NO;}
    else if(theft.state!=2&&CGEventGetIntegerValueField(event,(CGEventField)40)==theft.physical){CGEventPostToPid(theft.originalTarget,event);result=NULL;}
  }@finally{[self.lock unlock];}
  return result;
}
- (BOOL)protectedPid:(pid_t)pid { return self.registrations[@(pid)].controllers.count>0; }
- (void)changedOwner:(CUFocusOwner)owner physical:(pid_t)physical event:(CGEventRef)event {
  CUFocusOwner previous=self.owner;self.previousOwner=previous;self.owner=owner;CUFocusTheft theft=self.theft;
  BOOL corresponding=theft.state!=2&&!theft.returned;
  if(owner.logical!=previous.logical){
    for(NSNumber *pid in self.registrations){
      BOOL gained=pid.intValue==owner.logical,lost=pid.intValue==previous.logical;
      if((gained||lost)&&!(corresponding&&theft.logical==pid.intValue)){
        NSArray<CUInputFocusController *> *controllers=self.registrations[pid].controllers.allObjects;
        dispatch_async(self.transitions,^{for(CUInputFocusController *controller in controllers)[controller setBelievesFocus:gained];});
      }
    }
  }
  BOOL firstTheft=NO,matchedTheft=NO;
  if(theft.state!=2){
    if(theft.physical==physical){matchedTheft=YES;if(theft.state==0){firstTheft=YES;theft.state=1;}}
    else if(theft.originalTarget!=physical)theft=(CUFocusTheft){.state=2};
    self.theft=theft;
  }
  BOOL release=firstTheft;
  if(!matchedTheft&&(previous.flags&0x8100)==0x8100&&(owner.flags&0x8100)==0x8100&&owner.logical!=previous.logical&&[self protectedPid:owner.logical]&&![self protectedPid:previous.logical]){
    id application=CUFocusApplication(previous.logical),element=CUAX((__bridge AXUIElementRef)application,kAXFocusedUIElementAttribute);
    NSMutableSet *visited=[NSMutableSet new];
    for(NSUInteger depth=0;element&&depth<300;depth++){
      if([visited containsObject:element])break;[visited addObject:element];
      pid_t pid=CUFocusElementPid(element);NSInteger type=pid?CUFocusProcessType(pid):2;
      if(type<2){
        if(type==1){pid_t previousPid=previous.logical;dispatch_async(self.transitions,^{@try{for(NSNumber *subtype in @[@0x4000,@0x8000]){CGEventRef notification=CUFocusOtherEvent((NSEventType)21,(short)subtype.intValue,0,0);@try{CUFocusPost(previousPid,notification);}@finally{CFRelease(notification);}}}@catch(NSException *error){}});}
        else release=YES;break;
      }
      element=CUAX((__bridge AXUIElementRef)element,kAXParentAttribute);
    }
  }
  BOOL released=NO;
  if(release){
    int64_t theftId=CGEventGetIntegerValueField(event,(CGEventField)71);CUFocusReleaseKeyFocus releaseFocus=CUFocusSymbol("CPSReleaseKeyFocusWithID");
    if(releaseFocus&&theftId>=0&&theftId<=UINT32_MAX)released=releaseFocus((uint32_t)theftId)==0;
  }
  if((owner.flags&0x8100)==0x8100)self.blockNewFront=released;
}
- (CGEventRef)notification:(CGEventRef)event {
  int64_t target=CGEventGetIntegerValueField(event,(CGEventField)40),subtype=CGEventGetIntegerValueField(event,(CGEventField)64);
  if(target<INT32_MIN||target>INT32_MAX||subtype<0||subtype>UINT16_MAX)return event;
  [self.lock lock];CGEventRef result=event;
  @try{
    if(subtype==0x4000){
      int64_t physical=CGEventGetIntegerValueField(event,(CGEventField)73);if(physical<INT32_MIN||physical>INT32_MAX)return event;
      CUFocusOwner owner=[self ownerForPid:(pid_t)physical];
      if([self protectedPid:owner.logical]&&owner.logical!=self.owner.logical){self.theft=(CUFocusTheft){(pid_t)physical,owner.logical,(pid_t)target,0,NO};result=NULL;}
      else self.theft=(CUFocusTheft){.state=2};
    }else if(subtype==0x8000){
      CUFocusTheft theft=self.theft;if(theft.state!=2&&!theft.returned&&theft.originalTarget==target){theft.returned=YES;self.theft=theft;result=NULL;}
    }else if(self.viewBridgePid&&target==self.viewBridgePid){
      int64_t physical=CGEventGetIntegerValueField(event,(CGEventField)73);if(physical<INT32_MIN||physical>INT32_MAX)return event;
      if(subtype==0xf102)[self changedOwner:[self ownerForPid:(pid_t)physical] physical:(pid_t)physical event:event];
      else if(subtype==2){if(self.theft.state!=2&&self.theft.physical==physical)self.theft=(CUFocusTheft){.state=2};if(self.blockNewFront)result=NULL;}
    }
  }@finally{[self.lock unlock];}
  return result;
}
- (void)suppressMenuForPid:(pid_t)pid menuPid:(NSNumber *)menuPid {
  [self.lock lock];CUFocusRegistration *registration=self.registrations[@(pid)];if(!registration){[self.lock unlock];return;}
  for(CUFocusTap *tap in registration.menuTaps)[tap stop];registration.menuTaps=nil;registration.suppressMenu=NO;
  CGEventMask mask=(1ULL<<1)|(1ULL<<2)|(1ULL<<6)|(1ULL<<3)|(1ULL<<4)|(1ULL<<7)|(1ULL<<25)|(1ULL<<26)|(1ULL<<27);
  __weak CUFocusPreventer *weakSelf=self;
  CUFocusEventHandler handler=^CGEventRef(CGEventType type,CGEventRef event){
    CUFocusPreventer *self=weakSelf;if(!self)return event;[self.lock lock];BOOL suppress=self.registrations[@(pid)].suppressMenu;[self.lock unlock];if(!suppress)return event;
    int64_t window=CGEventGetIntegerValueField(event,(CGEventField)51);if(window<0||window>UINT32_MAX)return event;
    NSArray *windows=CFBridgingRelease(CGWindowListCopyWindowInfo(kCGWindowListOptionIncludingWindow,(CGWindowID)window));
    NSDictionary *info=windows.firstObject;if(!info)return event;pid_t owner=[info[(id)kCGWindowOwnerPID]intValue];
    return owner==pid||(menuPid&&owner==menuPid.intValue)?event:NULL;
  };
  NSMutableArray *taps=[NSMutableArray new];CUFocusTap *tap=[[CUFocusTap alloc]initWithPid:pid global:NO mask:mask placement:kCGHeadInsertEventTap handler:handler];if(tap)[taps addObject:tap];
  if(menuPid){tap=[[CUFocusTap alloc]initWithPid:menuPid.intValue global:NO mask:mask placement:kCGHeadInsertEventTap handler:handler];if(tap)[taps addObject:tap];}
  if(taps.count!=(menuPid?2:1)){for(CUFocusTap *created in taps)[created stop];[self.lock unlock];CUFail(@"BACKGROUND_UNAVAILABLE",@"Could not observe menu-dismissal events for the selected processes.");}
  registration.menuTaps=taps;registration.suppressMenu=YES;[self.lock unlock];
}
- (void)stopSuppressingMenuForPid:(pid_t)pid {
  [self.lock lock];CUFocusRegistration *registration=self.registrations[@(pid)];registration.suppressMenu=NO;
  for(CUFocusTap *tap in registration.menuTaps)[tap stop];registration.menuTaps=nil;[self.lock unlock];
}
@end

static const void *CUFocusSessionControllers=&CUFocusSessionControllers;
static const void *CUFocusWindowController=&CUFocusWindowController;
static CUInputFocusController *CUFocusController(CUSession *session,CUWindow *target) {
  [session check];if(![CUIdentity(target.pid)isEqual:target.processIdentity])CUFail(@"STALE_TARGET",@"The selected process is no longer the observed application.");
  @synchronized(session){
    [session check];NSMutableDictionary *controllers=objc_getAssociatedObject(session,CUFocusSessionControllers);
    if(!controllers){controllers=[NSMutableDictionary new];objc_setAssociatedObject(session,CUFocusSessionControllers,controllers,OBJC_ASSOCIATION_RETAIN_NONATOMIC);}
    CUInputFocusController *controller=controllers[@(target.pid)];
    if(controller&&![controller.identity isEqual:target.processIdentity]){[controller stopMonitoring];[controllers removeObjectForKey:@(target.pid)];controller=nil;}
    if(!controller){controller=[[CUInputFocusController alloc]initWithPid:target.pid identity:target.processIdentity];controllers[@(target.pid)]=controller;}
    objc_setAssociatedObject(target,CUFocusWindowController,controller,OBJC_ASSOCIATION_RETAIN_NONATOMIC);return controller;
  }
}
void CUEnforceInputFocus(CUSession *session,CUWindow *target) { [CUFocusController(session,target)safelyEnforce:target session:session];target.syntheticFocusHeld=YES; }
void CUEnforceInputFocusForAXWindow(CUSession *session,CUWindow *target,AXUIElementRef window) {
  // A captured nil window is meaningful; do not resolve a fresh window here.
  [CUFocusController(session,target)safelyEnforce:nil axWindow:(__bridge id)window session:session];target.syntheticFocusHeld=YES;
}
void CUWithTransientInputFocus(CUSession *session,CUWindow *target,void (^perform)(void)) {
  [session check];if(![CUIdentity(target.pid)isEqual:target.processIdentity])CUFail(@"STALE_TARGET",@"The selected process is no longer the observed application.");
  CUInputFocusController *temporary=[[CUInputFocusController alloc]initWithPid:target.pid identity:target.processIdentity];
  @try{[temporary enforce:target];[session check];perform();}
  @finally{@try{[temporary deactivate];}@finally{[temporary stopMonitoring];}}
}
BOOL CUInputFocusBelievesFocused(CUSession *session,CUWindow *target) {
  CUInputFocusController *controller=CUFocusController(session,target);
  [controller.lock lock];BOOL focused=!controller.closed&&controller.state.believesFocus;[controller.lock unlock];return focused;
}
void CUInputFocusActionPerformed(CUSession *session,CUWindow *target) {
  NSLock *lock=CUFocusActionLock();[lock lock];CUFocusLastActionTime=CUFocusNow();CUFocusLastActionPid=target.pid;[lock unlock];
}
void CUInputFocusSuppressMenu(CUSession *session,CUWindow *target,NSNumber *menuPid) {
  if(menuPid&&(![menuPid isKindOfClass:NSNumber.class]||menuPid.doubleValue!=menuPid.intValue||menuPid.intValue<=0))CUFail(@"INVALID_PROCESS",@"Menu process must be a positive process identifier.");
  CUFocusController(session,target);[CUFocusPreventer.shared suppressMenuForPid:target.pid menuPid:menuPid];
}
void CUInputFocusStopSuppressingMenu(CUSession *session,CUWindow *target) { if(objc_getAssociatedObject(target,CUFocusWindowController))[CUFocusPreventer.shared stopSuppressingMenuForPid:target.pid]; }
BOOL CUInputFocusHandleAXNotification(CUSession *session,pid_t pid,NSString *processIdentity,CFStringRef notification,AXUIElementRef element) {
  if(!session||!notification||pid<=0||!processIdentity.length)return NO;
  BOOL created=CFEqual(notification,kAXWindowCreatedNotification),opened=CFEqual(notification,kAXMenuOpenedNotification);
  BOOL stop=CFEqual(notification,kAXUIElementDestroyedNotification)||CFEqual(notification,kAXMenuClosedNotification);
  if(!created&&!opened&&!stop)return YES;
  @try{@synchronized(session){
    [session check];NSDictionary *controllers=objc_getAssociatedObject(session,CUFocusSessionControllers);
    CUInputFocusController *controller=controllers[@(pid)];if(!controller)return YES;
    if(![controller.identity isEqual:processIdentity]||CUFocusProcessIdentity(pid,processIdentity)!=CUFocusProcessSame)return NO;
    [controller.lock lock];BOOL closed=controller.closed;[controller.lock unlock];if(closed)return YES;
    if(stop){[CUFocusPreventer.shared stopSuppressingMenuForPid:pid];return YES;}
    // The original large-string storage points 32 bytes before this literal.
    if(created&&![[NSRunningApplication runningApplicationWithProcessIdentifier:pid].bundleIdentifier isEqual:@"com.apple.controlcenter"])return YES;
    if(!element)return NO;
    typedef AXError(*ActualPid)(AXUIElementRef,pid_t *);ActualPid actualPid=CUFocusSymbol("_AXUIElementGetActualPid");
    pid_t menuPid=0;if(!actualPid||actualPid(element,&menuPid)!=kAXErrorSuccess||menuPid<=0)return NO;
    [CUFocusPreventer.shared suppressMenuForPid:pid menuPid:@(menuPid)];return YES;
  }}@catch(NSException *error){return NO;}
}
BOOL CUDeactivateInputFocus(CUWindow *target) {
  @try{
    CUInputFocusController *controller=objc_getAssociatedObject(target,CUFocusWindowController);if(!controller){target.syntheticFocusHeld=NO;return YES;}
    if(controller.closed){target.syntheticFocusHeld=NO;return YES;}
    CUFocusProcessStatus status=CUFocusProcessIdentity(controller.pid,controller.identity);if(status==CUFocusProcessUnknown)return NO;
    if(status==CUFocusProcessSame)[controller deactivate];else[controller stopMonitoring];
    target.syntheticFocusHeld=NO;return YES;
  }@catch(NSException *error){return NO;}
}
BOOL CUCloseInputFocus(CUSession *session) {
  @try{@synchronized(session){
    NSMutableDictionary *controllers=objc_getAssociatedObject(session,CUFocusSessionControllers);BOOL released=YES;
    for(NSNumber *pid in controllers.allKeys.copy){CUInputFocusController *controller=controllers[pid];if([controller close])[controllers removeObjectForKey:pid];else released=NO;}
    for(CUWindow *target in session.windows.allValues){
      CUInputFocusController *controller=objc_getAssociatedObject(target,CUFocusWindowController);
      if(controller.closed){objc_setAssociatedObject(target,CUFocusWindowController,nil,OBJC_ASSOCIATION_RETAIN_NONATOMIC);target.syntheticFocusHeld=NO;}
    }
    if(!controllers.count)objc_setAssociatedObject(session,CUFocusSessionControllers,nil,OBJC_ASSOCIATION_RETAIN_NONATOMIC);return released;
  }}@catch(NSException *error){return NO;}
}
