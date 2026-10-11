#import "ComputerUse.h"
#import "WindowRegistry.h"
#import "PreviewProducer.h"
#import <dlfcn.h>

@interface CUWindowOrderingTask : NSObject {
  _Atomic(bool) _cancelled;
}
@property pid_t frontmostPID;
@property pid_t controlledPID;
@property(copy) NSArray<NSNumber *> *observedWindowIDs;
@property(copy) dispatch_block_t completion;
@property dispatch_semaphore_t cancellation;
@property dispatch_group_t active;
- (void)start;
- (void)cancel;
@end

@interface CUApplicationWindowRegistry : NSObject
@property pid_t pid;
@property(copy) NSString *processIdentity;
@property(strong) id application;
@property(strong) NSMutableDictionary<NSNumber *,id> *windows;
@property(strong,nullable) id lastWindow;
@property(strong,nullable) id focusedMenuBarItem;
@property(strong,nullable) id openedMenu;
@property uint32_t lastWindowID;
@property NSUInteger generation;
@property AXObserverRef observer;
@property(strong,nullable) id terminationObserver;
@property BOOL notificationCoverage;
@property BOOL closed;
@property(strong,nullable) CUWindowOrderingTask *orderingTask;
@property(strong) NSMutableSet<CUWindowOrderingTask *> *orderingTasks;
- (void)close;
- (void)changed;
- (void)menuDidOpen;
- (void)receive:(CFStringRef)notification element:(AXUIElementRef)element;
@end

static NSMutableDictionary<NSNumber *,CUApplicationWindowRegistry *> *CUApplicationRegistries;
static NSMutableDictionary<NSArray *,NSNumber *> *CURecentPresentationWindows;
static NSMutableSet<NSArray *> *CUEndedPresentationTurns;
static CUWindowRegistryChangeHandler CUWindowRegistryChanged;
static CUWindowRegistryControlProvider CUWindowRegistryControl;
static CUWindowRegistryNotificationHandler CUWindowRegistryNotification;

static BOOL CURegistryHasInputOwner(pid_t pid) {
  CUWindowRegistryControlProvider provider;@synchronized(CUApplicationWindowRegistry.class){provider=CUWindowRegistryControl;}
  return provider&&provider(pid);
}

static void CURegistryOnMain(dispatch_block_t block) {
  if(NSThread.isMainThread){block();return;}
  __block NSException *failure;
  dispatch_sync(dispatch_get_main_queue(),^{@try{block();}@catch(NSException *error){failure=error;}});
  if(failure)@throw failure;
}
static BOOL CURegistryAXElement(id value) { return value&&CFGetTypeID((__bridge CFTypeRef)value)==AXUIElementGetTypeID(); }
static id CURegistryAttribute(id element,CFStringRef attribute) { return CURegistryAXElement(element)?CUAX((__bridge AXUIElementRef)element,attribute):nil; }
static uint32_t CURegistryWindowID(id element) { return CURegistryAXElement(element)?CUAXWindowId((__bridge AXUIElementRef)element):0; }
static BOOL CURegistryClearAttention(AXUIElementRef element) {
  typedef OSStatus (*ProcessForPID)(pid_t,ProcessSerialNumber *);
  typedef int32_t (*SetAttention)(ProcessSerialNumber *,uint8_t);
  static ProcessForPID processForPID;static SetAttention setAttention;static dispatch_once_t once;
  dispatch_once(&once,^{
    void *library=dlopen("/System/Library/Frameworks/ApplicationServices.framework/Frameworks/HIServices.framework/HIServices",RTLD_LAZY|RTLD_LOCAL);
    if(library){processForPID=(ProcessForPID)dlsym(library,"GetProcessForPID");setAttention=(SetAttention)dlsym(library,"_SetApplicationDesiresAttention");}
  });
  if(!processForPID||!setAttention)return NO;
  pid_t pid=0;ProcessSerialNumber psn={0};
  if(AXUIElementGetPid(element,&pid)==kAXErrorSuccess&&processForPID(pid,&psn)==noErr)setAttention(&psn,0);
  return YES;
}
static id CURegistryPrimary(id application) {
  id window=CURegistryAttribute(application,kAXFocusedWindowAttribute);
  if(!CURegistryAXElement(window))window=CURegistryAttribute(application,kAXMainWindowAttribute);
  if(!CURegistryAXElement(window)){
    id windows=CURegistryAttribute(application,kAXWindowsAttribute);
    window=[windows isKindOfClass:NSArray.class]?[windows lastObject]:nil;
  }
  return CURegistryAXElement(window)?window:nil;
}

@implementation CUWindowOrderingTask
- (instancetype)init { if((self=[super init])){_cancellation=dispatch_semaphore_create(0);_active=dispatch_group_create();}return self; }
- (void)cancel { if(!atomic_exchange(&_cancelled,true))dispatch_semaphore_signal(self.cancellation); }
- (void)start {
  dispatch_group_enter(self.active);
  dispatch_async(dispatch_get_global_queue(QOS_CLASS_USER_INITIATED,0),^{@autoreleasepool{
    @try{
      if(!atomic_load(&self->_cancelled)&&CURegistryHasInputOwner(self.controlledPID)){
        id application=CFBridgingRelease(AXUIElementCreateApplication(self.frontmostPID));
        id focused=CURegistryAttribute(application,kAXFocusedWindowAttribute);uint32_t focusedID=CURegistryWindowID(focused);
        if(CURegistryAXElement(focused))for(NSUInteger attempt=0;attempt<20;attempt++){
          if(dispatch_semaphore_wait(self.cancellation,dispatch_time(DISPATCH_TIME_NOW,5*NSEC_PER_MSEC))==0||atomic_load(&self->_cancelled))break;
          CFArrayRef windowList=CGWindowListCreate(kCGWindowListOptionOnScreenOnly|kCGWindowListExcludeDesktopElements,kCGNullWindowID);
          NSMutableArray<NSNumber *> *ordered=[NSMutableArray new];
          if(windowList){for(CFIndex index=0;index<CFArrayGetCount(windowList);index++)[ordered addObject:@((uint32_t)(uintptr_t)CFArrayGetValueAtIndex(windowList,index))];CFRelease(windowList);}
          NSUInteger focusedIndex=[ordered indexOfObject:@(focusedID)];BOOL raise=NO;
          if(focusedIndex!=NSNotFound)for(NSNumber *observed in self.observedWindowIDs)if([ordered indexOfObject:observed]<focusedIndex){raise=YES;break;}
          if(raise){if(!atomic_load(&self->_cancelled)&&CURegistryHasInputOwner(self.controlledPID))AXUIElementPerformAction((__bridge AXUIElementRef)focused,kAXRaiseAction);break;}
        }
      }
    }@catch(NSException *error){(void)error;}
    dispatch_block_t completion=self.completion;self.completion=nil;
    dispatch_group_leave(self.active);
    if(completion)dispatch_async(dispatch_get_main_queue(),completion);
  }});
}
@end

static void CURegistryNotification(AXObserverRef observer,AXUIElementRef element,CFStringRef notification,void *context) {
  (void)observer;
  CUApplicationWindowRegistry *record=(__bridge CUApplicationWindowRegistry *)context;
  if(!record.closed)[record receive:notification element:element];
}

@implementation CUApplicationWindowRegistry
- (void)changed {
  NSAssert(NSThread.isMainThread,@"AX window registry belongs to the owner main thread.");
  self.generation++;
  if(CUWindowRegistryChanged)CUWindowRegistryChanged(self.pid,self.processIdentity);
}
- (void)remember:(id)element {
  uint32_t windowID=CURegistryWindowID(element);
  if(!windowID)return;
  self.windows[@(windowID)]=element;
  [self changed];
}
- (void)prune {
  // Source 0x100087cc4 retains an entry iff its AX windowID read is nonzero.
  BOOL changed=NO;
  for(NSNumber *key in self.windows.allKeys)if(!CURegistryWindowID(self.windows[key])){[self.windows removeObjectForKey:key];changed=YES;}
  if(changed)[self changed];
}
- (void)menuDidOpen {
  [self.orderingTask cancel];self.orderingTask=nil;
  if(!CURegistryHasInputOwner(self.pid))return;
  NSArray<NSNumber *> *observed=[self.windows.allKeys copy];NSMutableSet<NSNumber *> *pids=[NSMutableSet new];
  for(NSNumber *windowID in observed){
    NSArray *information=CFBridgingRelease(CGWindowListCopyWindowInfo(kCGWindowListOptionIncludingWindow,windowID.unsignedIntValue));
    for(NSDictionary *window in information)if([window[(id)kCGWindowNumber]unsignedIntValue]==windowID.unsignedIntValue){NSNumber *pid=window[(id)kCGWindowOwnerPID];if(pid)[pids addObject:pid];break;}
  }
  NSRunningApplication *frontmost=NSWorkspace.sharedWorkspace.frontmostApplication;
  if(!pids.count||!frontmost||[pids containsObject:@(frontmost.processIdentifier)])return;
  CUWindowOrderingTask *task=[CUWindowOrderingTask new];task.frontmostPID=frontmost.processIdentifier;task.controlledPID=self.pid;task.observedWindowIDs=observed;
  __weak CUApplicationWindowRegistry *weakSelf=self;__weak CUWindowOrderingTask *weakTask=task;
  task.completion=^{CUApplicationWindowRegistry *owner=weakSelf;CUWindowOrderingTask *current=weakTask;if(owner&&current){[owner.orderingTasks removeObject:current];if(owner.orderingTask==current)owner.orderingTask=nil;}};
  self.orderingTask=task;[self.orderingTasks addObject:task];[task start];
}
- (void)receive:(CFStringRef)notification element:(AXUIElementRef)element {
  if(self.closed)return;
  if(CFEqual(notification,kAXWindowCreatedNotification)||CFEqual(notification,kAXSheetCreatedNotification)){
    [self remember:(__bridge id)element];
    if(CURegistryHasInputOwner(self.pid)&&!CURegistryClearAttention(element))self.notificationCoverage=NO;
    if(CFEqual(notification,kAXWindowCreatedNotification)&&self.observer&&
       [[NSRunningApplication runningApplicationWithProcessIdentifier:self.pid].bundleIdentifier isEqual:@"com.apple.controlcenter"]){
      AXError error=AXObserverAddNotification(self.observer,element,kAXUIElementDestroyedNotification,(__bridge void *)self);
      if(error!=kAXErrorSuccess&&error!=kAXErrorNotificationAlreadyRegistered)self.notificationCoverage=NO;
    }
  }else if(CFEqual(notification,kAXUIElementDestroyedNotification)){
    if(self.observer){
      AXError error=AXObserverRemoveNotification(self.observer,element,kAXUIElementDestroyedNotification);
      if(error!=kAXErrorSuccess&&error!=kAXErrorNotificationNotRegistered&&error!=kAXErrorInvalidUIElement)self.notificationCoverage=NO;
    }
  }else if(CFEqual(notification,kAXMenuOpenedNotification)){
    // A newly opened menu may not have its native window ID yet (source .25/.01).
    id retained=(__bridge id)element;
    self.openedMenu=retained;
    CFAbsoluteTime deadline=CFAbsoluteTimeGetCurrent()+.25;
    while(!CURegistryWindowID(retained)&&CFAbsoluteTimeGetCurrent()<deadline)[NSThread sleepForTimeInterval:.01];
    [self remember:retained];
    [self menuDidOpen];
  }else if(CFEqual(notification,kAXMenuClosedNotification)){
    [self.orderingTask cancel];self.orderingTask=nil;
    self.openedMenu=nil;self.focusedMenuBarItem=nil;
    BOOL changed=NO;
    for(NSNumber *key in self.windows.allKeys)if(CFEqual((__bridge CFTypeRef)self.windows[key],element)){[self.windows removeObjectForKey:key];changed=YES;}
    if(changed)[self changed];
  }else if(CFEqual(notification,kAXWindowMovedNotification)||CFEqual(notification,kAXWindowResizedNotification)){
    [self changed];
  }
  if(CUWindowRegistryNotification&&!CUWindowRegistryNotification(self.pid,self.processIdentity,notification,element))self.notificationCoverage=NO;
}
- (void)close {
  if(self.closed)return;
  self.closed=YES;
  for(CUWindowOrderingTask *task in self.orderingTasks)[task cancel];self.orderingTask=nil;
  if(self.observer){CFRunLoopRemoveSource(CFRunLoopGetMain(),AXObserverGetRunLoopSource(self.observer),kCFRunLoopCommonModes);CFRelease(self.observer);self.observer=NULL;}
  if(self.terminationObserver){[NSWorkspace.sharedWorkspace.notificationCenter removeObserver:self.terminationObserver];self.terminationObserver=nil;}
  [self.windows removeAllObjects];self.lastWindow=nil;self.focusedMenuBarItem=nil;self.openedMenu=nil;self.application=nil;
}
- (void)dealloc { if(_observer)CFRelease(_observer); }
@end

static CUApplicationWindowRegistry *CURegistryApplication(pid_t pid,NSString *identity) {
  NSCAssert(NSThread.isMainThread,@"AX window registry belongs to the owner main thread.");
  if(pid<=0||!identity.length||![CUIdentity(pid)isEqual:identity])return nil;
  if(!CUApplicationRegistries)CUApplicationRegistries=[NSMutableDictionary new];
  CUApplicationWindowRegistry *record=CUApplicationRegistries[@(pid)];
  if(record&&(![record.processIdentity isEqual:identity]||record.closed)){[record close];[CUApplicationRegistries removeObjectForKey:@(pid)];record=nil;}
  if(record)return record;
  record=[CUApplicationWindowRegistry new];record.pid=pid;record.processIdentity=identity;
  record.application=CFBridgingRelease(AXUIElementCreateApplication(pid));record.windows=[NSMutableDictionary new];record.orderingTasks=[NSMutableSet new];record.generation=1;
  CUApplicationRegistries[@(pid)]=record;
  // Source AppController initialization admits the primary window and its sheets,
  // not every window returned by a WindowServer inventory.
  id primary=CURegistryPrimary(record.application);
  if(primary){
    [record remember:primary];
    NSMutableArray *pending=[NSMutableArray new];id children=CURegistryAttribute(primary,kAXChildrenAttribute);
    if([children isKindOfClass:NSArray.class])[pending addObjectsFromArray:children];
    NSMutableSet *visited=[NSMutableSet setWithObject:primary];
    for(NSUInteger offset=0;offset<pending.count;offset++){
      id element=pending[offset];
      if(!CURegistryAXElement(element)||[visited containsObject:element])continue;
      [visited addObject:element];
      if([CURegistryAttribute(element,kAXRoleAttribute)isEqual:(__bridge NSString *)kAXSheetRole]){
        [record remember:element];
        children=CURegistryAttribute(element,kAXChildrenAttribute);
        if([children isKindOfClass:NSArray.class])[pending addObjectsFromArray:children];
      }
    }
  }
  AXObserverRef observer=NULL;
  if(AXObserverCreate(pid,CURegistryNotification,&observer)==kAXErrorSuccess){
    record.observer=observer;record.notificationCoverage=YES;
    for(NSString *name in @[(__bridge NSString *)kAXWindowCreatedNotification,(__bridge NSString *)kAXMenuOpenedNotification,
      (__bridge NSString *)kAXMenuClosedNotification,(__bridge NSString *)kAXSheetCreatedNotification,
      (__bridge NSString *)kAXWindowMovedNotification,(__bridge NSString *)kAXWindowResizedNotification]){
      AXError error=AXObserverAddNotification(observer,(__bridge AXUIElementRef)record.application,(__bridge CFStringRef)name,(__bridge void *)record);
      if(error!=kAXErrorSuccess&&error!=kAXErrorNotificationAlreadyRegistered)record.notificationCoverage=NO;
    }
    CFRunLoopAddSource(CFRunLoopGetMain(),AXObserverGetRunLoopSource(observer),kCFRunLoopCommonModes);
  }
  __weak CUApplicationWindowRegistry *weak=record;
  record.terminationObserver=[NSWorkspace.sharedWorkspace.notificationCenter addObserverForName:NSWorkspaceDidTerminateApplicationNotification object:nil queue:NSOperationQueue.mainQueue usingBlock:^(NSNotification *notification){
    CUApplicationWindowRegistry *current=weak;NSRunningApplication *app=notification.userInfo[NSWorkspaceApplicationKey];
    if(current&&app.processIdentifier==current.pid){[current close];if(CUApplicationRegistries[@(current.pid)]==current)[CUApplicationRegistries removeObjectForKey:@(current.pid)];[current changed];}
  }];
  return record;
}

void CUWindowRegistrySetChangeHandler(CUWindowRegistryChangeHandler handler) { CURegistryOnMain(^{CUWindowRegistryChanged=[handler copy];}); }
void CUWindowRegistrySetControlProvider(CUWindowRegistryControlProvider provider) { @synchronized(CUApplicationWindowRegistry.class){CUWindowRegistryControl=[provider copy];} }
void CUWindowRegistrySetNotificationHandler(CUWindowRegistryNotificationHandler handler) { CURegistryOnMain(^{CUWindowRegistryNotification=[handler copy];}); }
BOOL CUWindowRegistryCancelOperations(CUSession *session) {
  if(NSThread.isMainThread)return NO;
  NSMutableSet *pids=[NSMutableSet new];for(CUWindow *target in session.windows.allValues)[pids addObject:@(target.pid)];
  NSMutableArray<CUWindowOrderingTask *> *tasks=[NSMutableArray new];
  CURegistryOnMain(^{for(NSNumber *pid in pids)for(CUWindowOrderingTask *task in CUApplicationRegistries[pid].orderingTasks){[task cancel];[tasks addObject:task];}});
  dispatch_time_t deadline=dispatch_time(DISPATCH_TIME_NOW,5*NSEC_PER_SEC);
  for(CUWindowOrderingTask *task in tasks)if(dispatch_group_wait(task.active,deadline)!=0)return NO;
  return YES;
}
BOOL CUWindowRegistryHasFocusedMenuBarItem(CUWindow *target) {
  __block BOOL focused=NO;
  CURegistryOnMain(^{CUApplicationWindowRegistry *record=CURegistryApplication(target.pid,target.processIdentity);focused=record.focusedMenuBarItem!=nil;});
  return focused;
}
AXUIElementRef CUWindowRegistryCopyLastCaptureWindow(CUWindow *target) {
  __block AXUIElementRef window=NULL;
  CURegistryOnMain(^{CUApplicationWindowRegistry *record=CURegistryApplication(target.pid,target.processIdentity);if(record.lastWindow)window=(AXUIElementRef)CFRetain((__bridge CFTypeRef)record.lastWindow);});
  return window;
}
void CUWindowRegistryDidPrepareMenu(CUWindow *target,AXUIElementRef menuBarItem,AXUIElementRef menu) {
  if(!target||!menuBarItem||!menu)return;
  id retainedItem=(__bridge id)menuBarItem,retainedMenu=(__bridge id)menu;
  CURegistryOnMain(^{
    CUApplicationWindowRegistry *record=CURegistryApplication(target.pid,target.processIdentity);if(!record)return;
    record.focusedMenuBarItem=retainedItem;record.openedMenu=retainedMenu;
  });
}
void CUWindowRegistryDidCapture(CUWindow *target,AXUIElementRef selectedWindow) {
  if(!target)return;
  id retained=(__bridge id)selectedWindow;
  CURegistryOnMain(^{
    CUApplicationWindowRegistry *record=CURegistryApplication(target.pid,target.processIdentity);
    uint32_t windowID=CURegistryWindowID(retained);
    if(!record)return;
    if(!selectedWindow){record.lastWindow=nil;record.lastWindowID=0;[record changed];return;}
    if(windowID!=target.windowId)return;
    record.lastWindow=retained;record.lastWindowID=windowID;[record changed];
  });
}
NSDictionary *CUWindowRegistryContext(CUWindow *target,NSString *threadID,NSString *turnID,NSArray<NSNumber *> *presentations) {
  __block NSDictionary *context;
  CURegistryOnMain(^{
    CUApplicationWindowRegistry *record=CURegistryApplication(target.pid,target.processIdentity);if(!record)return;
    [record prune];
    NSArray *turnKey=threadID.length&&turnID.length?@[threadID,turnID]:nil;
    NSArray *key=turnKey&&![CUEndedPresentationTurns containsObject:turnKey]?@[threadID,turnID,@(record.pid),record.processIdentity]:nil;
    NSNumber *recent=key?CURecentPresentationWindows[key]:nil;
    if(recent&&!record.windows[recent])recent=nil;
    uint32_t mainID=CURegistryWindowID(CURegistryAttribute(record.application,kAXMainWindowAttribute));
    NSMutableDictionary *snapshot=[@{@"pid":@(record.pid),@"processIdentity":record.processIdentity,@"windows":[record.windows copy],
      @"presentationWindowIDs":[presentations copy],@"windowContextGeneration":@(record.generation),
      @"sourceWindowCacheParityAvailable":@NO,@"notificationCoverage":@(record.notificationCoverage)}mutableCopy];
    if(recent)snapshot[@"mostRecentWindowID"]=recent;
    if(mainID)snapshot[@"mainWindowID"]=@(mainID);
    if(record.lastWindow){
      uint32_t selected=record.lastWindowID;
      NSString *role=CURegistryAttribute(record.lastWindow,kAXRoleAttribute),*subrole=CURegistryAttribute(record.lastWindow,kAXSubroleAttribute);
      NSNumber *owner=CUPreviewOwnerWindowID(selected,role,subrole,[CURegistryAttribute(record.lastWindow,kAXModalAttribute)boolValue],
        CUPreviewParentWindowID(selected,snapshot),recent,mainID?@(mainID):nil,CUPreviewExistingParentWindowID(snapshot));
      uint32_t chosen=owner?owner.unsignedIntValue:selected;
      snapshot[@"lastWindowID"]=@(selected);snapshot[@"ownerWindowID"]=@(chosen);
      if(key&&chosen==selected&&[role isEqual:@"AXWindow"]&&![subrole isEqual:@"AXFloatingWindow"]&&![subrole isEqual:@"AXDialog"]){
        if(!CURecentPresentationWindows)CURecentPresentationWindows=[NSMutableDictionary new];
        CURecentPresentationWindows[key]=@(selected);snapshot[@"mostRecentWindowID"]=@(selected);
      }
    }
    context=snapshot;
  });
  return context;
}
NSDictionary *CUWindowRegistryPrimaryWindow(pid_t pid,NSString *identity) {
  __block NSDictionary *result;
  CURegistryOnMain(^{
    CUApplicationWindowRegistry *record=CURegistryApplication(pid,identity);if(!record)return;
    id primary=CURegistryPrimary(record.application);uint32_t windowID=CURegistryWindowID(primary);
    if(windowID)result=@{@"pid":@(pid),@"window_id":@(windowID),@"process_identity":identity};
  });
  return result;
}
void CUWindowRegistryEndTurn(NSString *threadID,NSString *turnID) {
  CURegistryOnMain(^{
    if(!CUEndedPresentationTurns)CUEndedPresentationTurns=[NSMutableSet new];
    [CUEndedPresentationTurns addObject:@[threadID,turnID]];
    for(NSArray *key in CURecentPresentationWindows.allKeys)if([key[0]isEqual:threadID]&&[key[1]isEqual:turnID])[CURecentPresentationWindows removeObjectForKey:key];
  });
}
void CUWindowRegistryClose(void) {
  CUWindowRegistrySetControlProvider(nil);
  CURegistryOnMain(^{CUWindowRegistryChanged=nil;CUWindowRegistryNotification=nil;for(CUApplicationWindowRegistry *record in CUApplicationRegistries.allValues)[record close];[CUApplicationRegistries removeAllObjects];[CURecentPresentationWindows removeAllObjects];[CUEndedPresentationTurns removeAllObjects];});
}
