#import "ScreenLockGuardian.h"
#import <Cocoa/Cocoa.h>
#import <Security/Security.h>
#import <sys/stat.h>
#import <fcntl.h>
#import <unistd.h>
#import <errno.h>
#import <QuartzCore/QuartzCore.h>

NSString *const CUScreenUnlockConfigurationPath=@"/Library/Application Support/Oh My DSH/ScreenUnlock/provider.plist";
NSString *const CUScreenUnlockInstalledPluginPath=@"/Library/Security/SecurityAgentPlugins/OhMyDSHScreenUnlock.bundle";

static NSError *CUGuardianError(NSString *description) {
  return [NSError errorWithDomain:CUScreenLockErrorDomain code:CUScreenLockUnavailable userInfo:@{NSLocalizedDescriptionKey:description}];
}
static void CUGuardianOnMain(dispatch_block_t work) { if(NSThread.isMainThread)work();else dispatch_sync(dispatch_get_main_queue(),work); }

@interface CUGuardianCancellation : NSObject <CUScreenLockCancellation>
@property NSLock *lock;
@property (copy) dispatch_block_t action;
- (instancetype)initWithAction:(dispatch_block_t)action;
@end
@implementation CUGuardianCancellation
- (instancetype)initWithAction:(dispatch_block_t)action { if((self=[super init])){_lock=[NSLock new];_action=[action copy];}return self; }
- (void)cancel { [self.lock lock];dispatch_block_t action=self.action;self.action=nil;[self.lock unlock];if(action)action(); }
- (void)dealloc { if(_action)_action(); }
@end

@interface CUPhysicalScreenInputMonitor : NSObject {
@public CFMachPortRef tap;
@public CFRunLoopSourceRef source;
}
@property pid_t ignoredProcessID;
@property (copy) dispatch_block_t handler;
@property BOOL finished;
- (BOOL)startWithError:(NSError **)error;
- (void)stop;
@end
static CGEventRef CUScreenInputTapCallback(CGEventTapProxy proxy,CGEventType type,CGEventRef event,void *context) {
  (void)proxy;CUPhysicalScreenInputMonitor *monitor=(__bridge CUPhysicalScreenInputMonitor *)context;
  if(monitor.finished)return event;
  if(type==kCGEventTapDisabledByTimeout||type==kCGEventTapDisabledByUserInput){if(monitor->tap)CGEventTapEnable(monitor->tap,true);return event;}
  if(!event||CGEventGetIntegerValueField(event,kCGEventSourceUnixProcessID)==monitor.ignoredProcessID)return event;
  dispatch_block_t handler=monitor.handler;[monitor stop];if(handler)handler();return event;
}
@implementation CUPhysicalScreenInputMonitor
- (BOOL)startWithError:(NSError **)error {
  if(!CGPreflightListenEventAccess()){if(error)*error=CUGuardianError(@"Physical-input monitoring requires Input Monitoring permission for the native helper.");return NO;}
  // Recovered mask and ignored source PID; other applications' synthesized events also count.
  tap=CGEventTapCreate(kCGSessionEventTap,kCGTailAppendEventTap,kCGEventTapOptionListenOnly,(CGEventMask)0x0fc01cfe,CUScreenInputTapCallback,(__bridge void *)self);
  if(!tap){if(error)*error=CUGuardianError(@"Unable to create the screen-lock physical-input event tap.");return NO;}
  source=CFMachPortCreateRunLoopSource(kCFAllocatorDefault,tap,0);
  if(!source){CFRelease(tap);tap=NULL;if(error)*error=CUGuardianError(@"Unable to create the screen-lock physical-input run-loop source.");return NO;}
  CFRunLoopAddSource(CFRunLoopGetMain(),source,kCFRunLoopCommonModes);CGEventTapEnable(tap,true);
  if(!CGEventTapIsEnabled(tap)){[self stop];if(error)*error=CUGuardianError(@"The screen-lock physical-input event tap is disabled.");return NO;}
  return YES;
}
- (void)stop {
  if(self.finished)return;self.finished=YES;self.handler=nil;
  if(source){CFRunLoopRemoveSource(CFRunLoopGetMain(),source,kCFRunLoopCommonModes);CFRelease(source);source=NULL;}
  if(tap){CGEventTapEnable(tap,false);CFMachPortInvalidate(tap);CFRelease(tap);tap=NULL;}
}
- (void)dealloc { if(source){CFRunLoopRemoveSource(CFRunLoopGetMain(),source,kCFRunLoopCommonModes);CFRelease(source);}if(tap){CFMachPortInvalidate(tap);CFRelease(tap);} }
@end

@interface CULockUISettlingObservation : NSObject <CUScreenLockCancellation>
@property NSMutableArray *observers;
@property dispatch_source_t fallback;
@property dispatch_source_t settle;
@property (copy) void (^completion)(NSError *);
@property BOOL finished;
@property BOOL sawLockUI;
- (void)start;
- (void)lockUIWasShown;
@end
@implementation CULockUISettlingObservation
- (instancetype)init { if((self=[super init]))_observers=[NSMutableArray new];return self; }
- (dispatch_source_t)timerAfter:(NSTimeInterval)delay action:(dispatch_block_t)action {
  dispatch_source_t timer=dispatch_source_create(DISPATCH_SOURCE_TYPE_TIMER,0,0,dispatch_get_main_queue());
  dispatch_source_set_timer(timer,dispatch_time(DISPATCH_TIME_NOW,(int64_t)(delay*NSEC_PER_SEC)),DISPATCH_TIME_FOREVER,0);dispatch_source_set_event_handler(timer,action);dispatch_resume(timer);return timer;
}
- (void)start {
  __weak CULockUISettlingObservation *observation=self;
  for(NSString *name in @[@"com.apple.screenLockUIIsShown",@"com.apple.sessionagent.screenLockUIIsShown"]){
    id token=[NSDistributedNotificationCenter.defaultCenter addObserverForName:name object:nil queue:NSOperationQueue.mainQueue usingBlock:^(__unused NSNotification *notification){[observation lockUIWasShown];}];if(token)[self.observers addObject:token];
  }
  self.fallback=[self timerAfter:CUScreenLockUIFallbackDelay action:^{[observation finish];}];
}
- (void)lockUIWasShown {
  if(self.finished||self.sawLockUI)return;self.sawLockUI=YES;
  if(self.fallback){dispatch_source_cancel(self.fallback);self.fallback=nil;}
  __weak CULockUISettlingObservation *observation=self;
  self.settle=[self timerAfter:CUScreenLockUISettleDelay action:^{[observation finish];}];
}
- (void)removeResources {
  for(id observer in self.observers)[NSDistributedNotificationCenter.defaultCenter removeObserver:observer];[self.observers removeAllObjects];
  if(self.fallback){dispatch_source_cancel(self.fallback);self.fallback=nil;}if(self.settle){dispatch_source_cancel(self.settle);self.settle=nil;}
}
- (void)finish { if(self.finished)return;self.finished=YES;[self removeResources];void (^completion)(NSError *)=self.completion;self.completion=nil;if(completion)completion(nil); }
- (void)cancel { CUGuardianOnMain(^{if(self.finished)return;self.finished=YES;self.completion=nil;[self removeResources];}); }
- (void)dealloc { for(id observer in _observers)[NSDistributedNotificationCenter.defaultCenter removeObserver:observer];if(_fallback)dispatch_source_cancel(_fallback);if(_settle)dispatch_source_cancel(_settle); }
@end

@interface CUOwnScreenLockGuardianResources ()
@property CUScreenLockController *controller;
@property pid_t ignoredProcessID;
@property NSMutableSet<NSUUID *> *assertionIdentifiers;
@property NSMutableArray<NSWindow *> *overlayWindows;
@property NSHashTable<id<CUScreenLockCancellation>> *tokens;
@property id screenObserver;
@end
@implementation CUOwnScreenLockGuardianResources
- (instancetype)initWithController:(CUScreenLockController *)controller ignoredProcessID:(pid_t)pid {
  if((self=[super init])){_controller=controller;_ignoredProcessID=pid;_assertionIdentifiers=[NSMutableSet new];_overlayWindows=[NSMutableArray new];_tokens=[NSHashTable weakObjectsHashTable];}return self;
}
- (NSDictionary *)capabilities { return @{@"available":@(NSApp!=nil&&CGPreflightListenEventAccess()),@"physical_input_permission":@(CGPreflightListenEventAccess()),@"overlay_available":@(NSApp!=nil),@"runtime_verified":@NO}; }
- (void)rebuildOverlayWindows {
  for(NSWindow *window in self.overlayWindows){[window orderOut:nil];[window close];}[self.overlayWindows removeAllObjects];
  for(NSScreen *screen in NSScreen.screens){
    NSWindow *window=[[NSWindow alloc]initWithContentRect:screen.frame styleMask:NSWindowStyleMaskBorderless backing:NSBackingStoreBuffered defer:NO screen:screen];
    window.releasedWhenClosed=NO;window.backgroundColor=NSColor.blackColor;window.opaque=YES;window.hasShadow=NO;window.ignoresMouseEvents=YES;
    window.level=CGShieldingWindowLevel()+1;window.collectionBehavior=(NSWindowCollectionBehavior)0x111;
    NSView *view=[[NSView alloc]initWithFrame:NSMakeRect(0,0,screen.frame.size.width,screen.frame.size.height)];view.wantsLayer=YES;view.layer.backgroundColor=NSColor.blackColor.CGColor;
    window.contentView=view;[self.overlayWindows addObject:window];[window orderFrontRegardless];
  }
}
- (void)hideOverlays {
  if(self.screenObserver){[NSNotificationCenter.defaultCenter removeObserver:self.screenObserver];self.screenObserver=nil;}
  for(NSWindow *window in self.overlayWindows){[window orderOut:nil];[window close];}[self.overlayWindows removeAllObjects];
}
- (id<CUScreenLockCancellation>)startPhysicalInputMonitoring:(dispatch_block_t)handler error:(NSError **)error {
  __block id<CUScreenLockCancellation> token=nil;__block NSError *failure=nil;
  CUGuardianOnMain(^{
    CUPhysicalScreenInputMonitor *monitor=[CUPhysicalScreenInputMonitor new];monitor.ignoredProcessID=self.ignoredProcessID;monitor.handler=handler;
    if(![monitor startWithError:&failure])return;
    token=[[CUGuardianCancellation alloc]initWithAction:^{CUGuardianOnMain(^{[monitor stop];});}];[self.tokens addObject:token];
  });if(error)*error=failure;return token;
}
- (id<CUScreenLockCancellation>)acquireOverlayAssertionWithError:(NSError **)error {
  __block id<CUScreenLockCancellation> token=nil;__block NSError *failure=nil;
  CUGuardianOnMain(^{
    if(!NSApp||!NSScreen.screens.count){failure=CUGuardianError(@"The screen-lock overlay has no AppKit screen surface.");return;}
    NSUUID *identifier=NSUUID.UUID;BOOL first=self.assertionIdentifiers.count==0;[self.assertionIdentifiers addObject:identifier];
    if(first){[self rebuildOverlayWindows];__weak CUOwnScreenLockGuardianResources *resources=self;self.screenObserver=[NSNotificationCenter.defaultCenter addObserverForName:NSApplicationDidChangeScreenParametersNotification object:nil queue:NSOperationQueue.mainQueue usingBlock:^(__unused NSNotification *notification){[resources rebuildOverlayWindows];}];}
    __weak CUOwnScreenLockGuardianResources *resources=self;
    token=[[CUGuardianCancellation alloc]initWithAction:^{CUGuardianOnMain(^{CUOwnScreenLockGuardianResources *live=resources;if(![live.assertionIdentifiers containsObject:identifier])return;[live.assertionIdentifiers removeObject:identifier];if(!live.assertionIdentifiers.count)[live hideOverlays];});}];[self.tokens addObject:token];
  });if(error)*error=failure;return token;
}
- (id<CUScreenLockCancellation>)observeLockUISettled:(void (^)(NSError *))completion error:(NSError **)error {
  __block CULockUISettlingObservation *observation=nil;
  CUGuardianOnMain(^{observation=[CULockUISettlingObservation new];observation.completion=completion;[observation start];[self.tokens addObject:observation];});if(error)*error=nil;return observation;
}
- (void)cancelAll { CUGuardianOnMain(^{for(id<CUScreenLockCancellation> token in self.tokens.allObjects)[token cancel];[self.tokens removeAllObjects];[self.assertionIdentifiers removeAllObjects];[self hideOverlays];}); }
- (void)cancelAllWithCompletion:(dispatch_block_t)completion { dispatch_async(dispatch_get_main_queue(),^{[self cancelAll];completion();}); }
- (void)dealloc {
  if(_screenObserver)[NSNotificationCenter.defaultCenter removeObserver:_screenObserver];
  NSArray *windows=[_overlayWindows copy];dispatch_async(dispatch_get_main_queue(),^{for(NSWindow *window in windows){[window orderOut:nil];[window close];}});
}
@end
static NSDictionary *CUReadScreenUnlockConfiguration(NSError **error) {
  NSString *directory=CUScreenUnlockConfigurationPath.stringByDeletingLastPathComponent;
  struct stat parent={0};char resolved[PATH_MAX];
  if(lstat(directory.fileSystemRepresentation,&parent)!=0||!S_ISDIR(parent.st_mode)||parent.st_uid!=0||(parent.st_mode&022)||
     !realpath(directory.fileSystemRepresentation,resolved)||![directory isEqualToString:[NSString stringWithUTF8String:resolved]]){
    if(error)*error=CUGuardianError(@"ownScreenUnlockProviderNotInstalled: the protected setup configuration is unavailable.");return nil;
  }
  int fd=open(CUScreenUnlockConfigurationPath.fileSystemRepresentation,O_RDONLY|O_NOFOLLOW|O_CLOEXEC);
  struct stat info={0};
  if(fd<0||fstat(fd,&info)!=0||!S_ISREG(info.st_mode)||info.st_uid!=0||(info.st_mode&022)||info.st_size<=0||info.st_size>65536){if(fd>=0)close(fd);if(error)*error=CUGuardianError(@"The screen-unlock configuration is not a protected root-owned regular file.");return nil;}
  NSMutableData *data=[NSMutableData dataWithLength:(NSUInteger)info.st_size];NSUInteger offset=0;
  while(offset<data.length){ssize_t size=read(fd,(char *)data.mutableBytes+offset,data.length-offset);if(size<0&&errno==EINTR)continue;if(size<=0)break;offset+=(NSUInteger)size;}close(fd);
  if(offset!=data.length){if(error)*error=CUGuardianError(@"The screen-unlock configuration could not be read completely.");return nil;}
  id parsed=[NSPropertyListSerialization propertyListWithData:data options:NSPropertyListImmutable format:NULL error:error];
  if(![parsed isKindOfClass:NSDictionary.class]){if(error)*error=CUGuardianError(@"The screen-unlock configuration is not a dictionary.");return nil;}
  NSDictionary *configuration=parsed;
  NSString *expectedDirectory=[NSString stringWithFormat:@"/private/tmp/ai.trisoul.computer-use-screen-unlock-%u",getuid()];
  if(![configuration[@"format"]isEqual:@1]||![configuration[@"userID"]isEqual:@(getuid())]||
     ![configuration[@"helperIdentifier"]isEqual:@"ai.trisoul.computer-use"]||
     ![configuration[@"pluginIdentifier"]isEqual:@"ai.trisoul.computer-use.screen-unlock.authorization-plugin"]||
     ![configuration[@"installedPlugin"]isEqual:CUScreenUnlockInstalledPluginPath]||
     ![configuration[@"mechanism"]isEqual:@"OhMyDSHScreenUnlock:screen-unlock,privileged"]||
     ![configuration[@"socketDirectory"]isEqual:expectedDirectory]||![configuration[@"socketPath"]isEqual:[expectedDirectory stringByAppendingPathComponent:@"LoginAuthorization.sock"]]){
    if(error)*error=CUGuardianError(@"The protected screen-unlock configuration does not match this helper user and fixed own plugin.");return nil;
  }
  NSString *pin=configuration[@"certificateSHA1"];
  if(![pin isKindOfClass:NSString.class]||!CUScreenLockPinnedSigningRequirement(configuration[@"helperIdentifier"],pin,error))return nil;
  NSString *manifestPath=[directory stringByAppendingPathComponent:@"installation.json"];
  int manifestFD=open(manifestPath.fileSystemRepresentation,O_RDONLY|O_NOFOLLOW|O_CLOEXEC);struct stat manifestInfo={0};
  if(manifestFD<0||fstat(manifestFD,&manifestInfo)!=0||!S_ISREG(manifestInfo.st_mode)||manifestInfo.st_uid!=0||(manifestInfo.st_mode&022)||manifestInfo.st_size<=0||manifestInfo.st_size>1048576){if(manifestFD>=0)close(manifestFD);if(error)*error=CUGuardianError(@"A committed protected screen-unlock installation manifest is required.");return nil;}
  NSMutableData *manifestData=[NSMutableData dataWithLength:(NSUInteger)manifestInfo.st_size];offset=0;
  while(offset<manifestData.length){ssize_t size=read(manifestFD,(char *)manifestData.mutableBytes+offset,manifestData.length-offset);if(size<0&&errno==EINTR)continue;if(size<=0)break;offset+=(NSUInteger)size;}close(manifestFD);
  id manifest=offset==manifestData.length?[NSJSONSerialization JSONObjectWithData:manifestData options:0 error:error]:nil;
  if(![manifest isKindOfClass:NSDictionary.class]||![manifest[@"format"]isEqual:@1]||![manifest[@"state"]isEqual:@"installed"]||![manifest[@"configuration"]isEqual:configuration]){if(error)*error=CUGuardianError(@"The own screen-unlock installation is incomplete or requires rollback.");return nil;}
  return configuration;
}

NSDictionary *CUScreenUnlockConfigurationStatus(void) {
  NSError *error=nil;NSDictionary *configuration=CUReadScreenUnlockConfiguration(&error);
  BOOL accessibility=AXIsProcessTrusted(),postEvents=CGPreflightPostEventAccess(),monitoring=CGPreflightListenEventAccess();
  return @{@"configured":@(configuration!=nil),@"configuration_path":CUScreenUnlockConfigurationPath,@"installed_plugin":CUScreenUnlockInstalledPluginPath,@"permissions":@{@"accessibility":@(accessibility),@"post_events":@(postEvents),@"input_monitoring":@(monitoring)},@"permissions_ready":@(accessibility&&postEvents&&monitoring),@"runtime_verified":@NO,@"error":error.localizedDescription?:NSNull.null};
}

id<CUScreenLockAuthorizedProvider> CUCreateConfiguredScreenLockProvider(CUScreenLockController *controller,CULoginAuthorizationBroker *broker,NSError **error) {
  NSDictionary *configuration=CUReadScreenUnlockConfiguration(error);if(!configuration)return nil;
  NSString *helperRequirement=CUScreenLockPinnedSigningRequirement(configuration[@"helperIdentifier"],configuration[@"certificateSHA1"],error);
  SecCodeRef selfCode=NULL;SecRequirementRef requirement=NULL;
  OSStatus status=SecCodeCopySelf(kSecCSDefaultFlags,&selfCode);
  if(status==errSecSuccess)status=SecRequirementCreateWithString((__bridge CFStringRef)helperRequirement,kSecCSDefaultFlags,&requirement);
  if(status==errSecSuccess)status=SecCodeCheckValidity(selfCode,kSecCSDefaultFlags,requirement);
  if(selfCode)CFRelease(selfCode);if(requirement)CFRelease(requirement);
  if(status!=errSecSuccess){if(error)*error=CUGuardianError(@"This native helper does not match the signing identity approved by setup.");return nil;}
  NSString *socketDirectory=configuration[@"socketDirectory"];
  if(![[NSFileManager defaultManager]createDirectoryAtPath:socketDirectory withIntermediateDirectories:NO attributes:@{NSFilePosixPermissions:@0700}error:error]){
    struct stat existing={0};if(lstat(socketDirectory.fileSystemRepresentation,&existing)!=0||!S_ISDIR(existing.st_mode)||existing.st_uid!=getuid()||(existing.st_mode&0777)!=0700){return nil;}
    if(error)*error=nil;
  }
  CULoginAuthorizationServer *server=[[CULoginAuthorizationServer alloc]initWithBroker:broker];
  // Privileged AuthorizationPlugin hosts are Apple-signed root processes, not the GUI SecurityAgent.
  NSString *agentRequirement=@"anchor apple and (identifier \"com.apple.authorizationhost\" or identifier \"com.apple.authorizationhosthelper.arm64\" or identifier \"com.apple.authorizationhosthelper.x86_64\")";
  if(![server startAtSocketPath:configuration[@"socketPath"] OSAgentRequirement:agentRequirement error:error])return nil;
  CUOwnScreenLockGuardianResources *resources=[[CUOwnScreenLockGuardianResources alloc]initWithController:controller ignoredProcessID:getpid()];
  CUAuthorizedScreenLockProvider *provider=[[CUAuthorizedScreenLockProvider alloc]initWithController:controller authorizationServer:server guardianResources:resources installedPlugin:[NSURL fileURLWithPath:CUScreenUnlockInstalledPluginPath]pluginIdentifier:configuration[@"pluginIdentifier"] certificateSHA1:configuration[@"certificateSHA1"]mechanism:configuration[@"mechanism"]];
  NSDictionary *capabilities=[provider capabilities];
  if(![capabilities[@"available"]boolValue]){[server cancel];[resources cancelAll];if(error)*error=CUGuardianError([capabilities[@"reason"]isKindOfClass:NSString.class]?capabilities[@"reason"]:@"The installed screen-unlock provider is unavailable.");return nil;}
  return provider;
}
