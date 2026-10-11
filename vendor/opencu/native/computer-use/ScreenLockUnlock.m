#import "ScreenLockUnlock.h"
#import <Cocoa/Cocoa.h>
#import <Security/Security.h>
#import <libproc.h>
#import <sys/stat.h>
#import <dlfcn.h>
#import <math.h>
#import <unistd.h>

static NSError *CUUnlockError(CUScreenLockErrorCode code,NSString *description) {
  return [NSError errorWithDomain:CUScreenLockErrorDomain code:code userInfo:@{NSLocalizedDescriptionKey:description}];
}
static BOOL CUOwnMechanismRegistered(NSString *rightName,NSString *mechanism,NSMutableSet<NSString *> *visited,NSUInteger remaining) {
  if(!remaining||[visited containsObject:rightName])return NO;[visited addObject:rightName];
  CFDictionaryRef raw=NULL;if(AuthorizationRightGet(rightName.UTF8String,&raw)!=errAuthorizationSuccess||!raw)return NO;
  NSDictionary *right=CFBridgingRelease(raw);NSArray *mechanisms=right[@"mechanisms"];
  if([mechanisms isKindOfClass:NSArray.class]&&[mechanisms containsObject:mechanism])return YES;
  id rules=right[@"rule"];if([rules isKindOfClass:NSString.class])rules=@[rules];
  if([rules isKindOfClass:NSArray.class])for(id child in rules)if([child isKindOfClass:NSString.class]&&CUOwnMechanismRegistered(child,mechanism,visited,remaining-1))return YES;
  return NO;
}
static id CUUnlockAttribute(AXUIElementRef element,CFStringRef attribute) {
  CFTypeRef value=NULL;if(AXUIElementCopyAttributeValue(element,attribute,&value)!=kAXErrorSuccess)return nil;
  return CFBridgingRelease(value);
}
static BOOL CUUnlockFrame(AXUIElementRef element,CGRect *frame) {
  id position=CUUnlockAttribute(element,kAXPositionAttribute),size=CUUnlockAttribute(element,kAXSizeAttribute);
  CGPoint point;CGSize dimensions;
  if(!position||!size||CFGetTypeID((__bridge CFTypeRef)position)!=AXValueGetTypeID()||CFGetTypeID((__bridge CFTypeRef)size)!=AXValueGetTypeID()||
     !AXValueGetValue((__bridge AXValueRef)position,kAXValueCGPointType,&point)||!AXValueGetValue((__bridge AXValueRef)size,kAXValueCGSizeType,&dimensions)||
     !isfinite(point.x)||!isfinite(point.y)||!isfinite(dimensions.width)||!isfinite(dimensions.height)||dimensions.width<0||dimensions.height<0)return NO;
  *frame=CGRectMake(point.x,point.y,dimensions.width,dimensions.height);return YES;
}
static void CUUnlockDescendants(AXUIElementRef element,NSInteger depth,NSMutableArray *elements) {
  if(depth<0)return;
  NSArray *children=CUUnlockAttribute(element,kAXChildrenAttribute);
  if([children isKindOfClass:NSArray.class])for(id child in children)if(CFGetTypeID((__bridge CFTypeRef)child)==AXUIElementGetTypeID())CUUnlockDescendants((__bridge AXUIElementRef)child,depth-1,elements);
  [elements addObject:(__bridge id)element];
}
static pid_t CULoginWindowPID(void) {
  int estimatedCount=proc_listallpids(NULL,0);if(estimatedCount<=0)return 0;
  NSMutableData *data=[NSMutableData dataWithLength:((NSUInteger)estimatedCount+32)*sizeof(pid_t)];
  int count=proc_listallpids(data.mutableBytes,(int)data.length);pid_t *pids=data.mutableBytes;
  count=MIN(count,(int)(data.length/sizeof(pid_t)));
  for(int i=0;i<count;i++){
    char name[PROC_PIDPATHINFO_MAXSIZE]={0};
    if(proc_name(pids[i],name,sizeof(name))>0&&strcmp(name,"loginwindow")==0)return pids[i];
  }
  return 0;
}
static NSArray *CULoginElements(pid_t *pid) {
  *pid=CULoginWindowPID();if(*pid<=0)return nil;
  AXUIElementRef application=AXUIElementCreateApplication(*pid);NSMutableArray *elements=[NSMutableArray new];
  CUUnlockDescendants(application,8,elements);CFRelease(application);return elements;
}
static AXUIElementRef CUElementWithIdentifier(NSArray *elements,NSString *identifier) {
  for(id item in elements){AXUIElementRef element=(__bridge AXUIElementRef)item;if([CUUnlockAttribute(element,kAXIdentifierAttribute)isEqual:identifier])return element;}
  return NULL;
}
static AXUIElementRef CULoginSelectionElement(NSArray *elements) {
  AXUIElementRef user=CUElementWithIdentifier(elements,@"FocusedUser");CGRect userFrame;
  if(!user||!CUUnlockFrame(user,&userFrame))return NULL;
  AXUIElementRef selected=NULL;double bestVertical=INFINITY,bestHorizontal=INFINITY;
  for(id item in elements){
    AXUIElementRef element=(__bridge AXUIElementRef)item;
    if(![CUUnlockAttribute(element,kAXRoleAttribute)isEqual:(__bridge NSString *)kAXStaticTextRole])continue;
    id identifier=CUUnlockAttribute(element,kAXIdentifierAttribute);
    if(identifier&&(![identifier isKindOfClass:NSString.class]||[identifier length]))continue;
    // Read only static labels. The password field's current value is never read or logged.
    id label=CUUnlockAttribute(element,kAXValueAttribute);if(![label isKindOfClass:NSString.class]||![label length])continue;
    id enabled=CUUnlockAttribute(element,kAXEnabledAttribute);if(enabled&&(![enabled isKindOfClass:NSNumber.class]||![enabled boolValue]))continue;
    CGRect frame;if(!CUUnlockFrame(element,&frame))continue;
    double vertical=CGRectGetMinY(frame)-CGRectGetMaxY(userFrame),horizontal=fabs(CGRectGetMidX(frame)-CGRectGetMidX(userFrame));
    if(vertical<0||vertical>120||horizontal>240)continue;
    if(vertical<bestVertical||(vertical==bestVertical&&horizontal<bestHorizontal)){selected=element;bestVertical=vertical;bestHorizontal=horizontal;}
  }
  return selected;
}
static void *CUUnlockSymbol(const char *name) {
  static dispatch_once_t once;static void *framework;
  dispatch_once(&once,^{framework=dlopen("/System/Library/PrivateFrameworks/SkyLight.framework/SkyLight",RTLD_LAZY|RTLD_LOCAL);});
  void *symbol=dlsym(RTLD_DEFAULT,name);
  if(!symbol&&framework)symbol=dlsym(framework,name);
  return symbol;
}
static BOOL CUClickLoginElement(AXUIElementRef element,pid_t pid,NSError **error) {
  typedef void (*WindowLocation)(CGEventRef,CGPoint);WindowLocation setWindowLocation=CUUnlockSymbol("CGEventSetWindowLocation");
  typedef AXError (*WindowID)(AXUIElementRef,CGWindowID *);WindowID readWindowID=CUUnlockSymbol("_AXUIElementGetWindow");
  CGRect frame,windowFrame;id window=CUUnlockAttribute(element,kAXWindowAttribute);CGWindowID windowID=0;
  if(!CGPreflightPostEventAccess()||!setWindowLocation||!readWindowID||!window||!CUUnlockFrame(element,&frame)||
     !CUUnlockFrame((__bridge AXUIElementRef)window,&windowFrame)||readWindowID((__bridge AXUIElementRef)window,&windowID)!=kAXErrorSuccess||!windowID){
    if(error)*error=CUUnlockError(CUScreenLockUnavailable,@"The login element's window-directed input path is unavailable.");return NO;
  }
  CGPoint point=CGPointMake(CGRectGetMidX(frame),CGRectGetMidY(frame));
  CGEventRef events[2]={NULL,NULL};
  for(NSUInteger i=0;i<2;i++){
    NSEvent *mouse=[NSEvent mouseEventWithType:i==0?NSEventTypeLeftMouseDown:NSEventTypeLeftMouseUp location:NSMakePoint(point.x,point.y) modifierFlags:0 timestamp:0 windowNumber:windowID context:nil eventNumber:(NSInteger)i+1 clickCount:1 pressure:1];
    if(!mouse.CGEvent)break;events[i]=CGEventCreateCopy(mouse.CGEvent);if(!events[i])break;
    CGEventSetLocation(events[i],point);CGEventSetFlags(events[i],0);CGEventSetIntegerValueField(events[i],(CGEventField)3,0);CGEventSetIntegerValueField(events[i],(CGEventField)7,3);
    CGEventSetIntegerValueField(events[i],(CGEventField)91,windowID);CGEventSetIntegerValueField(events[i],(CGEventField)92,windowID);
    CGEventSetIntegerValueField(events[i],kCGEventSourceUserData,0x545249534f554c);
    setWindowLocation(events[i],CGPointMake(point.x-windowFrame.origin.x,point.y-windowFrame.origin.y));
  }
  BOOL complete=events[0]&&events[1];
  if(complete)for(NSUInteger i=0;i<2;i++){CGEventSetTimestamp(events[i],(CGEventTimestamp)clock_gettime_nsec_np(CLOCK_UPTIME_RAW));CGEventPostToPid(pid,events[i]);}
  for(NSUInteger i=0;i<2;i++)if(events[i])CFRelease(events[i]);
  if(!complete&&error)*error=CUUnlockError(CUScreenLockUnavailable,@"Unable to construct the complete login click packet.");return complete;
}
static BOOL CUSubmitLoginReturn(pid_t pid,NSError **error) {
  if(!CGPreflightPostEventAccess()){if(error)*error=CUUnlockError(CUScreenLockPermissionDenied,@"The helper lacks event-posting permission.");return NO;}
  CGEventFlags previous=CGEventSourceFlagsState(kCGEventSourceStateCombinedSessionState);
  CGEventSourceRef source=CGEventSourceCreate(kCGEventSourceStatePrivate);CGEventRef events[4]={NULL,NULL,NULL,NULL};
  BOOL complete=source!=NULL;
  for(NSUInteger i=0;i<4&&complete;i++){
    events[i]=CGEventCreateKeyboardEvent(source,i==0||i==3?0:36,i!=2);complete=events[i]!=NULL;
    if(events[i]){if(i==0||i==3)CGEventSetType(events[i],kCGEventFlagsChanged);CGEventSetFlags(events[i],i==3?previous:0);CGEventSetIntegerValueField(events[i],kCGEventSourceUserData,0x545249534f554c);}
  }
  if(complete)for(NSUInteger i=0;i<4;i++){CGEventSetTimestamp(events[i],(CGEventTimestamp)clock_gettime_nsec_np(CLOCK_UPTIME_RAW));CGEventPostToPid(pid,events[i]);}
  for(NSUInteger i=0;i<4;i++)if(events[i])CFRelease(events[i]);if(source)CFRelease(source);
  if(!complete&&error)*error=CUUnlockError(CUScreenLockUnavailable,@"Unable to construct the complete login Return packet.");return complete;
}

@interface CUScreenUnlockOperation : NSObject <CUScreenLockInputOperation>
@property dispatch_queue_t queue;
@property CUScreenLockController *controller;
@property CULoginAuthorizationBroker *broker;
@property (copy) BOOL (^acceptingAttempt)(CULoginAuthorizationAttempt *);
@property (copy) void (^completion)(BOOL,NSError *);
@property (copy) BOOL (^validateProvider)(NSError **);
@property (atomic) CULoginAuthorizationAttempt *attempt;
@property (atomic) BOOL cancellationRequested;
@property uint64_t inputDeadline;
@property uint64_t verificationDeadline;
@property BOOL stopped;
- (void)start;
@end

@implementation CUScreenUnlockOperation
- (instancetype)init { if((self=[super init]))_queue=dispatch_queue_create("ai.trisoul.computer-use.screen-unlock-operation",DISPATCH_QUEUE_SERIAL);return self; }
- (void)finish:(BOOL)didUnlock error:(NSError *)error {
  if(self.stopped)return;self.stopped=YES;[self.attempt revoke];self.attempt=nil;
  void (^completion)(BOOL,NSError *)=self.completion;self.completion=nil;self.acceptingAttempt=nil;self.validateProvider=nil;
  if(completion)completion(didUnlock,error);
}
- (void)after:(NSTimeInterval)interval perform:(dispatch_block_t)work {
  dispatch_after(dispatch_time(DISPATCH_TIME_NOW,(int64_t)(interval*NSEC_PER_SEC)),self.queue,^{if(!self.stopped)work();});
}
- (void)prepareLoginUI {
  if(self.stopped)return;if(self.cancellationRequested){[self finish:NO error:CUUnlockError(CUScreenLockCancelled,@"The screen-unlock operation was cancelled.")];return;}
  NSError *error=nil;NSNumber *locked=[self.controller readLockedStateWithError:&error];
  if(!locked){[self finish:NO error:error];return;}if(!locked.boolValue){[self finish:NO error:nil];return;}
  pid_t pid=0;NSArray *elements=CULoginElements(&pid);AXUIElementRef password=CUElementWithIdentifier(elements,@"UserPasswordTextField");
  if(self.cancellationRequested){[self finish:NO error:CUUnlockError(CUScreenLockCancelled,@"The screen-unlock operation was cancelled.")];return;}
  if(password){
    AXError result=AXUIElementSetAttributeValue(password,kAXValueAttribute,CFSTR(""));
    if(result!=kAXErrorSuccess){[self finish:NO error:CUUnlockError(CUScreenLockUnavailable,@"The login password field could not be cleared.")];return;}
    [self after:CUScreenLockSubmitDelay perform:^{[self submitForPID:pid];}];return;
  }
  if(clock_gettime_nsec_np(CLOCK_UPTIME_RAW)>=self.inputDeadline){[self finish:NO error:nil];return;}
  AXUIElementRef selection=CULoginSelectionElement(elements);
  if(selection&&!CUClickLoginElement(selection,pid,&error)){[self finish:NO error:error];return;}
  [self after:CUScreenLockPollInterval perform:^{[self prepareLoginUI];}];
}
- (void)submitForPID:(pid_t)pid {
  if(self.stopped)return;NSError *error=nil;
  if(self.cancellationRequested){[self finish:NO error:CUUnlockError(CUScreenLockCancelled,@"The screen-unlock operation was cancelled.")];return;}
  if(!self.validateProvider(&error)){[self finish:NO error:error];return;}
  self.attempt=[self.broker beginLoginAuthorizationAttempt];
  if(self.cancellationRequested||!self.acceptingAttempt(self.attempt)||self.cancellationRequested){[self finish:NO error:CUUnlockError(CUScreenLockCancelled,@"The owning unlock guard no longer accepts authorization.")];return;}
  self.verificationDeadline=clock_gettime_nsec_np(CLOCK_UPTIME_RAW)+(uint64_t)(CUScreenLockVerificationDelay*NSEC_PER_SEC);
  if(!CUSubmitLoginReturn(pid,&error)){[self finish:NO error:error];return;}
  __weak CUScreenUnlockOperation *operation=self;
  uint64_t submittedAt=clock_gettime_nsec_np(CLOCK_UPTIME_RAW);
  NSTimeInterval authorizationTimeout=submittedAt<self.verificationDeadline?(self.verificationDeadline-submittedAt)/(double)NSEC_PER_SEC:0;
  [self.attempt waitForResolutionWithTimeout:authorizationTimeout completion:^(CULoginAuthorizationResolution resolution){
    CUScreenUnlockOperation *live=operation;if(!live)return;
    dispatch_async(live.queue,^{
      if(live.stopped)return;
      if(resolution!=CULoginAuthorizationConsumed){[live finish:NO error:nil];return;}
      uint64_t now=clock_gettime_nsec_np(CLOCK_UPTIME_RAW);NSTimeInterval remaining=now<live.verificationDeadline?(live.verificationDeadline-now)/(double)NSEC_PER_SEC:0;
      [live after:remaining perform:^{NSError *stateError=nil;NSNumber *locked=[live.controller readLockedStateWithError:&stateError];[live finish:locked&&!locked.boolValue error:stateError];}];
    });
  }];
}
- (void)start {
  dispatch_async(self.queue,^{
    if(self.stopped||self.cancellationRequested){[self finish:NO error:CUUnlockError(CUScreenLockCancelled,@"The screen-unlock operation was cancelled.")];return;}
    NSError *error=nil;if(!self.validateProvider(&error)){[self finish:NO error:error];return;}
    if(!AXIsProcessTrusted()){[self finish:NO error:CUUnlockError(CUScreenLockPermissionDenied,@"The native helper lacks trusted Accessibility access.")];return;}
    self.inputDeadline=clock_gettime_nsec_np(CLOCK_UPTIME_RAW)+(uint64_t)(CUScreenLockAuthorizationTimeout*NSEC_PER_SEC);[self prepareLoginUI];
  });
}
- (void)cancel { [self cancelWithCompletion:^{}]; }
- (void)cancelWithCompletion:(dispatch_block_t)completion {
  self.cancellationRequested=YES;[self.attempt revoke];
  // This barrier follows any in-flight AX/post call. Later timers see the terminal flag.
  dispatch_async(self.queue,^{[self finish:NO error:CUUnlockError(CUScreenLockCancelled,@"The screen-unlock operation was cancelled.")];completion();});
}
@end

@interface CUAuthorizedScreenLockProvider ()
@property CUScreenLockController *controller;
@property CULoginAuthorizationServer *authorizationServer;
@property id<CUScreenLockGuardianResources> guardianResources;
@property NSURL *installedPlugin;
@property NSString *requirement;
@property NSString *mechanism;
@property NSError *configurationError;
@property dispatch_queue_t queue;
@property NSMutableSet<CUScreenUnlockOperation *> *operations;
@property NSMutableArray<void (^)(NSError *)> *shutdownCompletions;
@property (atomic) BOOL shuttingDown;
@property BOOL shutdownRunning;
@property BOOL shutdownFinished;
@end
@implementation CUAuthorizedScreenLockProvider
- (void)initializeLifecycle {
  _queue=dispatch_queue_create("ai.trisoul.computer-use.screen-lock-provider",DISPATCH_QUEUE_SERIAL);dispatch_queue_set_specific(_queue,(__bridge const void *)_queue,(void *)1,NULL);_operations=[NSMutableSet new];_shutdownCompletions=[NSMutableArray new];
}
- (void)withQueue:(dispatch_block_t)work { if(dispatch_get_specific((__bridge const void *)self.queue))work();else dispatch_sync(self.queue,work); }
- (instancetype)initWithController:(CUScreenLockController *)controller authorizationServer:(CULoginAuthorizationServer *)authorizationServer guardianResources:(id<CUScreenLockGuardianResources>)guardianResources installedPlugin:(NSURL *)installedPlugin pluginIdentifier:(NSString *)pluginIdentifier teamIdentifier:(NSString *)teamIdentifier mechanism:(NSString *)mechanism {
  if((self=[super init])){[self initializeLifecycle];_controller=controller;_authorizationServer=authorizationServer;_guardianResources=guardianResources;_installedPlugin=installedPlugin;_mechanism=[mechanism copy];NSError *error=nil;_requirement=CUScreenLockSigningRequirement(pluginIdentifier,teamIdentifier,&error);_configurationError=error;}
  return self;
}
- (instancetype)initWithController:(CUScreenLockController *)controller authorizationServer:(CULoginAuthorizationServer *)authorizationServer guardianResources:(id<CUScreenLockGuardianResources>)guardianResources installedPlugin:(NSURL *)installedPlugin pluginIdentifier:(NSString *)pluginIdentifier certificateSHA1:(NSString *)certificateSHA1 mechanism:(NSString *)mechanism {
  if((self=[super init])){[self initializeLifecycle];_controller=controller;_authorizationServer=authorizationServer;_guardianResources=guardianResources;_installedPlugin=installedPlugin;_mechanism=[mechanism copy];NSError *error=nil;_requirement=CUScreenLockPinnedSigningRequirement(pluginIdentifier,certificateSHA1,&error);_configurationError=error;}
  return self;
}
- (BOOL)validateWithError:(NSError **)error {
  NSError *failure=self.configurationError;
  if(!failure&&self.shuttingDown)failure=CUUnlockError(CUScreenLockUnavailable,@"The authorized screen-unlock provider is shutting down.");
  if(!failure&&![[self.authorizationServer snapshot][@"available"]boolValue])failure=CUUnlockError(CUScreenLockUnavailable,@"privilegedGuardianUnavailable: the authenticated authorization server is not active.");
  if(!failure&&!AXIsProcessTrusted())failure=CUUnlockError(CUScreenLockPermissionDenied,@"Screen unlocking requires Accessibility permission for the native helper.");
  if(!failure&&!CGPreflightPostEventAccess())failure=CUUnlockError(CUScreenLockPermissionDenied,@"Screen unlocking requires event-posting permission for the native helper.");
  if(!failure&&![[self.guardianResources capabilities][@"available"]boolValue])failure=CUUnlockError(CUScreenLockUnavailable,@"The physical-input and overlay guardian resources are unavailable.");
  NSString *path=self.installedPlugin.path;struct stat installed={0};char resolved[PATH_MAX];
  NSString *expectedMechanism=[NSString stringWithFormat:@"%@:screen-unlock,privileged",path.lastPathComponent.stringByDeletingPathExtension];
  if(!failure&&![self.mechanism isEqualToString:expectedMechanism])failure=CUUnlockError(CUScreenLockUnavailable,@"The own plugin mechanism does not match its fixed installed bundle.");
  if(!failure&&(![path hasPrefix:@"/Library/Security/SecurityAgentPlugins/"]||lstat(path.fileSystemRepresentation,&installed)!=0||!S_ISDIR(installed.st_mode)||installed.st_uid!=0||(installed.st_mode&022)||
                !realpath(path.fileSystemRepresentation,resolved)||![path isEqualToString:[NSString stringWithUTF8String:resolved]]))failure=CUUnlockError(CUScreenLockUnavailable,@"The own authorization plugin is not installed in a protected system plugin directory.");
  SecStaticCodeRef code=NULL;SecRequirementRef requirement=NULL;
  if(!failure){OSStatus status=SecStaticCodeCreateWithPath((__bridge CFURLRef)self.installedPlugin,kSecCSDefaultFlags,&code);if(status==errSecSuccess)status=SecRequirementCreateWithString((__bridge CFStringRef)self.requirement,kSecCSDefaultFlags,&requirement);if(status==errSecSuccess)status=SecStaticCodeCheckValidity(code,kSecCSStrictValidate,requirement);if(status!=errSecSuccess)failure=CUUnlockError(CUScreenLockAuthorizationRejected,@"The installed own authorization plugin's signature was rejected.");}
  if(code)CFRelease(code);if(requirement)CFRelease(requirement);
  if(!failure&&!CUOwnMechanismRegistered(@"system.login.screensaver",self.mechanism,[NSMutableSet new],8))failure=CUUnlockError(CUScreenLockUnavailable,@"The OS screensaver right does not register the own unlock mechanism.");
  if(error)*error=failure;return failure==nil;
}
- (NSDictionary *)capabilities { NSError *error=nil;BOOL available=[self validateWithError:&error];return @{@"available":@(available),@"reason":error.localizedDescription?:NSNull.null,@"authorization":@"installed-own-security-agent-mechanism",@"runtime_verified":@NO}; }
- (id<CUScreenLockCancellation>)startPhysicalInputMonitoring:(dispatch_block_t)handler error:(NSError **)error { if(![self validateWithError:error])return nil;return [self.guardianResources startPhysicalInputMonitoring:handler error:error]; }
- (id<CUScreenLockCancellation>)acquireOverlayAssertionWithError:(NSError **)error { if(![self validateWithError:error])return nil;return [self.guardianResources acquireOverlayAssertionWithError:error]; }
- (id<CUScreenLockCancellation>)observeLockUISettled:(void (^)(NSError *))completion error:(NSError **)error { if(![self validateWithError:error])return nil;return [self.guardianResources observeLockUISettled:completion error:error]; }
- (id<CUScreenLockInputOperation>)unlockWithBroker:(CULoginAuthorizationBroker *)broker acceptingAttempt:(BOOL (^)(CULoginAuthorizationAttempt *))acceptingAttempt completion:(void (^)(BOOL,NSError *))completion {
  CUScreenUnlockOperation *operation=[CUScreenUnlockOperation new];operation.controller=self.controller;operation.broker=broker;operation.acceptingAttempt=acceptingAttempt;
  __weak CUAuthorizedScreenLockProvider *provider=self;operation.validateProvider=^BOOL(NSError **error){CUAuthorizedScreenLockProvider *live=provider;if(!live){if(error)*error=CUUnlockError(CUScreenLockUnavailable,@"The authorization provider was released.");return NO;}return [live validateWithError:error];};
  __weak CUScreenUnlockOperation *weakOperation=operation;
  operation.completion=^(BOOL didUnlock,NSError *error){CUAuthorizedScreenLockProvider *live=provider;if(!live){completion(didUnlock,error);return;}dispatch_async(live.queue,^{CUScreenUnlockOperation *finished=weakOperation;if(finished)[live.operations removeObject:finished];completion(didUnlock,error);});};
  __block BOOL accepted=NO;[self withQueue:^{if(!self.shuttingDown){[self.operations addObject:operation];accepted=YES;}}];if(!accepted)return nil;
  [operation start];return operation;
}
- (void)finishShutdownResources {
  dispatch_group_t group=dispatch_group_create();__block NSError *failure=nil;
  dispatch_group_enter(group);[self.authorizationServer shutdownWithCompletion:^(NSError *error){failure=error;dispatch_group_leave(group);}];
  dispatch_group_enter(group);[self.guardianResources cancelAllWithCompletion:^{dispatch_group_leave(group);}];
  dispatch_group_notify(group,self.queue,^{
    self.shutdownRunning=NO;self.shutdownFinished=failure==nil;
    NSArray *callbacks=[self.shutdownCompletions copy];[self.shutdownCompletions removeAllObjects];
    for(void (^callback)(NSError *) in callbacks)callback(failure);
  });
}
- (void)shutdownWithCompletion:(void (^)(NSError *))completion {
  self.shuttingDown=YES;
  dispatch_async(self.queue,^{
    if(self.shutdownFinished){completion(nil);return;}
    [self.shutdownCompletions addObject:[completion copy]];if(self.shutdownRunning)return;self.shutdownRunning=YES;
    NSArray<CUScreenUnlockOperation *> *operations=self.operations.allObjects;
    if(!operations.count){[self finishShutdownResources];return;}
    __block NSUInteger pending=operations.count;
    for(CUScreenUnlockOperation *operation in operations)[operation cancelWithCompletion:^{dispatch_async(self.queue,^{if(--pending==0)[self finishShutdownResources];});}];
  });
}
@end
