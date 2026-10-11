#import "ComputerUse.h"
#import "PreviewBridge.h"
#import "InputFocus.h"
#import "Clipboard.h"
#import "WindowRegistry.h"
#import "ScreenLockGuardian.h"
#import "../transport/CUMachChannel.h"
#import <sys/socket.h>
#import <sys/un.h>
#import <sys/stat.h>
#import <unistd.h>
#import <signal.h>
#import <sys/file.h>
#import <fcntl.h>

static NSMutableSet<CUSession *> *sessions;
static NSMutableDictionary<NSString *,CUSession *> *owners;
static NSMutableDictionary<NSNumber *,id> *queues;
static NSObject *registry;
static NSString *socketPath;
static int listener=-1;
static _Atomic(bool) serviceClosing;
static CUScreenLockController *screenLockController;
static CUScreenLockCoordinator *screenLockCoordinator;
static id<CUScreenLockAuthorizedProvider> screenLockProvider;
static NSString *screenLockConfigurationError;

static NSArray<NSNumber *> *CUActivePresentationWindows(NSString *threadID,NSString *turnID) {
  NSCAssert(NSThread.isMainThread,@"Presentation registry belongs to the owner main thread.");
  NSMutableArray *windowIDs=[NSMutableArray new];NSArray *active;
  @synchronized(registry){active=sessions.allObjects;}
  for(CUSession *candidate in active){
    CUPreviewBridge *bridge=candidate.previewBridge;if(!bridge||bridge.closed)continue;
    NSDictionary *identity=bridge.identity;
    if(![identity[@"threadID"]isEqual:threadID]||![identity[@"turnID"]isEqual:turnID])continue;
    NSDictionary *state=[bridge snapshot];
    if([state[@"state"]isEqual:@"ending"]||[state[@"state"]isEqual:@"closed"])continue;
    NSNumber *windowID=identity[@"windowId"];if(windowID&&![windowIDs containsObject:windowID])[windowIDs addObject:windowID];
  }
  return windowIDs;
}

@protocol CUSetupShowing <NSObject>
- (void)setup:(id)sender;
@end

static void CUWrite(CUSession *session,NSDictionary *message) {
  NSData *json=[NSJSONSerialization dataWithJSONObject:message options:0 error:nil];if(!json)return;
  NSMutableData *line=[json mutableCopy];[line appendBytes:"\n" length:1];
  [session.writeLock lock];
  const uint8_t *bytes=line.bytes;NSUInteger left=line.length;
  while(left&&session.socket>=0){ssize_t sent=write(session.socket,bytes,left);if(sent<0&&errno==EINTR)continue;if(sent<=0)break;left-=sent;bytes+=sent;}
  [session.writeLock unlock];
}
static void CUReply(CUSession *session,id identifier,id result) { if(identifier)CUWrite(session,@{@"jsonrpc":@"2.0",@"id":identifier,@"result":result?:@{}}); }
static NSDictionary *CUError(NSException *error) {
  NSMutableDictionary *value=[@{@"error":@{@"code":error.name,@"message":error.reason?:@"Native operation failed"}}mutableCopy];
  if([error.userInfo[@"nativePresentation"]isKindOfClass:NSDictionary.class])value[@"nativePresentation"]=error.userInfo[@"nativePresentation"];
  return @{@"isError":@YES,@"structuredContent":value,@"content":@[@{@"type":@"text",@"text":error.reason?:@"Native operation failed"}]};
}
static NSDictionary *CUBridgeWait(void (^operation)(CUPreviewBridgeCompletion)) {
  if(NSThread.isMainThread)CUFail(@"NATIVE_OWNER_QUEUE",@"Native presentation requests must wait outside the AppKit thread.");
  dispatch_semaphore_t done=dispatch_semaphore_create(0);
  __block NSDictionary *result;__block NSError *failure;
  dispatch_async(dispatch_get_main_queue(),^{
    @try{operation(^(NSDictionary *value,NSError *error){result=value;failure=error;dispatch_semaphore_signal(done);});}
    @catch(NSException *error){failure=[NSError errorWithDomain:@"ai.trisoul.computer-use.service" code:1 userInfo:@{NSLocalizedDescriptionKey:error.reason?:@"Native presentation failed."}];dispatch_semaphore_signal(done);}
  });
  // Bridge operations own bounded deadlines and retain unconfirmed resources.
  dispatch_semaphore_wait(done,DISPATCH_TIME_FOREVER);
  if(failure)@throw [NSException exceptionWithName:@"NATIVE_PRESENTATION_FAILED" reason:failure.localizedDescription userInfo:result?@{@"nativePresentation":result}:nil];
  return result?:@{};
}
static CUPreviewBridge *CUCurrentBridge(CUSession *session,NSDictionary *arguments) {
  CUPreviewBridge *bridge=session.previewBridge;
  if(!bridge)CUFail(@"NATIVE_PRESENTATION_UNAVAILABLE",@"This capture has no native presentation.");
  if(arguments){
    if(![arguments[@"bridgeSessionId"] isEqual:bridge.bridgeSessionId])CUFail(@"STALE_PRESENTATION",@"The native presentation connection changed.");
    for(NSString *key in bridge.identity)if(![arguments[key]isEqual:bridge.identity[key]])CUFail(@"STALE_PRESENTATION",@"The native presentation source identity changed.");
  }
  return bridge;
}
static BOOL CUCloseBridge(CUSession *session) {
  @try{
    CUBridgeWait(^(CUPreviewBridgeCompletion completion){
      CUPreviewBridge *bridge=session.previewBridge;
      if(!bridge){completion(@{@"closed":@YES},nil);return;}
      [bridge closeWithCompletion:^(NSDictionary *result,NSError *error){if(!error&&bridge.closed&&session.previewBridge==bridge)session.previewBridge=nil;completion(result,error);}];
    });return YES;
  }@catch(NSException *error){return NO;}
}
static BOOL CUCleanupOperation(BOOL (^operation)(void)) {
  @try{return operation();}
  @catch(NSException *error){NSLog(@"Native cleanup remains pending (%@).",error.name);return NO;}
}
static BOOL CURelease(CUSession *session) {
  if(!CUWindowRegistryCancelOperations(session))return NO;
  BOOL released=YES;for(CUWindow *target in session.windows.allValues)if(!CUReleaseInputFocus(target))released=NO;
  if(released&&!CUCloseInputFocus(session))released=NO;
  if(!released)return NO;
  @synchronized(registry){for(NSString *key in [owners.allKeys copy])if(owners[key]==session)[owners removeObjectForKey:key];}
  [session.windows removeAllObjects];return YES;
}
static void CUPrepareScreenLock(CUSession *session) {
  [session check];
  if(!screenLockCoordinator)CUFail(@"RUNTIME_NOT_READY",@"The screen-lock coordinator is not initialized.");
  dispatch_semaphore_t done=dispatch_semaphore_create(0);__block NSError *failure;
  [screenLockCoordinator prepareForRequestForThread:session.threadID owner:session.ownerID cancelled:^{return atomic_load(&session->cancelled);}
    completion:^(BOOL unlocked,NSError *error){(void)unlocked;failure=error;dispatch_semaphore_signal(done);}];
  dispatch_semaphore_wait(done,DISPATCH_TIME_FOREVER);
  [session check];if(failure)CUFail(@"SCREEN_LOCK_UNAVAILABLE",failure.localizedDescription);
}
static void CUStopWithCompletion(CUSession *session,id identifier,BOOL disconnect,void (^completion)(BOOL)) {
  NSString *label;
  @synchronized(registry){
    if(session.disconnected){if(completion)completion(YES);return;}
    atomic_store(&session->cancelled,true);session.stopping=YES;session.lifecycleGeneration++;
    if(!session.stopRequests)session.stopRequests=[NSMutableArray new];
    [session.stopRequests addObject:@{@"identifier":identifier?:NSNull.null,@"disconnect":@(disconnect),@"completion":completion?[completion copy]:NSNull.null}];
    if(session.cleanupRunning)return;
    session.cleanupRunning=YES;label=session.label;
  }
  dispatch_group_t lockRelease=dispatch_group_create();__block NSError *lockError;
  if(screenLockCoordinator){
    dispatch_group_enter(lockRelease);
    [screenLockCoordinator serviceConnectionInvalidatedForOwner:session.ownerID completion:^(NSError *error){lockError=error;dispatch_group_leave(lockRelease);}];
  }
  CUCursorHide(session,label,NO);
  dispatch_group_notify(session.active,dispatch_get_global_queue(QOS_CLASS_USER_INITIATED,0),^{
    dispatch_group_wait(lockRelease,DISPATCH_TIME_FOREVER);
    BOOL cursorHidden=CUCleanupOperation(^BOOL{return CUCursorHide(session,label,YES);});
    BOOL presentationStopped=CUCloseBridge(session);
    BOOL previewStopped=presentationStopped&&CUCleanupOperation(^BOOL{return CUStopPreview(session);});
    BOOL inputReleased=CUCleanupOperation(^BOOL{return CURelease(session);}),released=cursorHidden&&previewStopped&&inputReleased&&!lockError;
    NSArray *requests;BOOL shouldDisconnect=NO;
    @synchronized(registry){
      requests=[session.stopRequests copy];[session.stopRequests removeAllObjects];
      for(NSDictionary *request in requests)if([request[@"disconnect"]boolValue])shouldDisconnect=YES;
      session.cleanupRunning=NO;session.stopping=!released||shouldDisconnect;
      if(released&&shouldDisconnect){session.disconnected=YES;[sessions removeObject:session];}
    }
    NSDictionary *result=released?CUResult(@{@"status":@"ended",@"session":label?:@""}):CUError([NSException exceptionWithName:@"NATIVE_CLEANUP_PENDING" reason:@"Native input, capture or presentation cleanup remains unconfirmed. Retry closing this session." userInfo:nil]);
    for(NSDictionary *request in requests){
      if(request[@"identifier"]!=NSNull.null)CUReply(session,request[@"identifier"],result);
      if(request[@"completion"]!=NSNull.null){void (^done)(BOOL)=request[@"completion"];done(released);}
    }
    if(released&&shouldDisconnect){
      [session.writeLock lock];if(session.socket>=0){close(session.socket);session.socket=-1;}[session.writeLock unlock];
    }else if(shouldDisconnect){
      dispatch_after(dispatch_time(DISPATCH_TIME_NOW,100*NSEC_PER_MSEC),dispatch_get_global_queue(QOS_CLASS_USER_INITIATED,0),^{CUStopWithCompletion(session,nil,YES,nil);});
    }
  });
}
static void CUStop(CUSession *session,id identifier,BOOL disconnect){CUStopWithCompletion(session,identifier,disconnect,nil);}
static void CUPrepareShutdown(void (^completion)(BOOL)) {
  atomic_store(&serviceClosing,true);
  NSArray *active;@synchronized(registry){active=sessions.allObjects;}
  dispatch_group_t done=dispatch_group_create();NSObject *resultLock=[NSObject new];__block BOOL released=YES;
  for(CUSession *session in active){
    dispatch_group_enter(done);
    CUStopWithCompletion(session,nil,NO,^(BOOL success){@synchronized(resultLock){if(!success)released=NO;}dispatch_group_leave(done);});
  }
  dispatch_group_notify(done,dispatch_get_main_queue(),^{
    if(!released){atomic_store(&serviceClosing,false);completion(NO);return;}
    if(!screenLockProvider){completion(YES);return;}
    [screenLockProvider shutdownWithCompletion:^(NSError *error){
      dispatch_async(dispatch_get_main_queue(),^{
        if(error){screenLockConfigurationError=error.localizedDescription;atomic_store(&serviceClosing,false);}
        completion(error==nil);
      });
    }];
  });
}
static NSDictionary *CUTool(CUSession *session,NSString *name,NSDictionary *args) {
  BOOL presentationCleanup=[name isEqual:@"end_native_presentation"]||[name isEqual:@"end_native_presentation_turn"]||[name isEqual:@"confirm_native_presentation_provider_destroyed"]||[name isEqual:@"native_presentation_frame_ack"]||[name isEqual:@"native_presentation_status"];
  if(!presentationCleanup)[session check];
  if([name isEqualToString:@"check_permissions"])return CUResult(@{@"accessibility":AXIsProcessTrusted()?@YES:@NO,@"screen_recording":CGPreflightScreenCaptureAccess()?@YES:@NO,@"image_clipboard":@{@"available":@YES,@"format":@"image/png",@"max_bytes":@(2*1024*1024)},@"screen_lock":@{@"provider":screenLockProvider?[screenLockProvider capabilities]:@{@"available":@NO},@"configuration":CUScreenUnlockConfigurationStatus(),@"error":screenLockConfigurationError?:NSNull.null},@"source":@{@"bundle_id":NSBundle.mainBundle.bundleIdentifier?:@"",@"pid":@(getpid()),@"attribution":@"driver-daemon"}});
  if([name isEqualToString:@"copy_image_to_clipboard"])return CUCopyImageToClipboard(session,args);
  if([name isEqualToString:@"show_setup"]){
    __block BOOL shown=NO;
    dispatch_sync(dispatch_get_main_queue(),^{id delegate=NSApp.delegate;if([delegate respondsToSelector:@selector(setup:)]){[(id<CUSetupShowing>)delegate setup:nil];shown=YES;}});
    if(!shown)CUFail(@"RUNTIME_NOT_READY",@"The native application is not ready to show its permission window.");
    return CUResult(@{@"shown":@YES});
  }
  if([name isEqualToString:@"list_apps"])return CUResult(@{@"apps":CUApps()});
  if([name isEqualToString:@"list_windows"]){NSArray *windows=CUWindows(args[@"pid"]);return CUResult(@{@"windows":windows,@"process_identity":args[@"pid"]?CUIdentity([args[@"pid"]intValue]):@""});}
  if([name isEqual:@"get_primary_window"]){
    pid_t pid=[args[@"pid"]intValue];NSString *identity=CUIdentity(pid);
    if(args[@"process_identity"]&&![args[@"process_identity"]isEqual:identity])CUFail(@"STALE_PROCESS",@"The application restarted; bind it again.");
    NSDictionary *primary=CUWindowRegistryPrimaryWindow(pid,identity);
    return CUResult(@{@"window":primary?:NSNull.null,@"process_identity":identity});
  }
  if([name isEqual:@"get_native_presentation_target"]){
    if(![args[@"threadID"]isEqual:session.threadID]||![args[@"turnID"]isKindOfClass:NSString.class]||![args[@"turnID"]length])CUFail(@"INVALID_TURN",@"Native presentation ownership requires the actual session turn.");
    CUWindow *target=CUResolveWindow(session,args);
    return CUResult(CUBridgeWait(^(CUPreviewBridgeCompletion completion){
      NSDictionary *context=CUWindowRegistryContext(target,args[@"threadID"],args[@"turnID"],CUActivePresentationWindows(args[@"threadID"],args[@"turnID"]));
      NSNumber *owner=context[@"ownerWindowID"];
      CUWindow *presentation=[CUWindow new];presentation.pid=target.pid;presentation.processIdentity=target.processIdentity;presentation.windowId=owner.unsignedIntValue;
      NSArray *associated=owner?CUPreviewAssociatedWindowIDs(context,presentation):nil;
      NSDictionary *result=owner.unsignedIntValue?@{@"available":@YES,@"window_id":owner,@"process_identity":target.processIdentity,@"pid":@(target.pid),@"associated_window_ids":associated?:@[],@"window_context_generation":context[@"windowContextGeneration"],@"source_window_cache_parity":context[@"sourceWindowCacheParityAvailable"]}:@{@"available":@NO,@"reason":@"No completed source capture selected a presentation window."};
      completion(result,nil);
    }));
  }
  if([name isEqual:@"end_native_presentation_turn"]){
    return CUResult(CUBridgeWait(^(CUPreviewBridgeCompletion completion){
      if(![args[@"threadID"]isKindOfClass:NSString.class]||![args[@"turnID"]isKindOfClass:NSString.class]||![args[@"turnID"]length])CUFail(@"INVALID_TURN",@"Native presentation cleanup requires the actual session turn.");
      if(args[@"bridgeSessionId"])CUCurrentBridge(session,args);
      else if(![args[@"threadID"]isEqual:session.threadID])CUFail(@"INVALID_TURN",@"Native presentation cleanup requires the actual session turn.");
      CUWindowRegistryEndTurn(args[@"threadID"],args[@"turnID"]);completion(@{@"ended":@YES},nil);
    }));
  }
  if([name isEqual:@"list_share_windows"]){
    NSMutableArray *windows=[NSMutableArray new];
    __block pid_t frontmostPid=0;
    dispatch_sync(dispatch_get_main_queue(),^{frontmostPid=NSWorkspace.sharedWorkspace.frontmostApplication.processIdentifier;});
    CGWindowID focusedWindow=0;
    if(frontmostPid>0){
      AXUIElementRef frontmost=AXUIElementCreateApplication(frontmostPid);
      id focused=CUAX(frontmost,kAXFocusedWindowAttribute);
      if(focused&&CFGetTypeID((__bridge CFTypeRef)focused)==AXUIElementGetTypeID())focusedWindow=CUAXWindowId((__bridge AXUIElementRef)focused);
      CFRelease(frontmost);
    }
    for(NSDictionary *window in CUWindows(nil)){
      if([window[@"layer"] intValue]!=0||![window[@"is_on_screen"] boolValue]||[window[@"bounds"][@"width"] doubleValue]<=0||[window[@"bounds"][@"height"] doubleValue]<=0)continue;
      NSRunningApplication *app=[NSRunningApplication runningApplicationWithProcessIdentifier:[window[@"pid"]intValue]];
      if(!app.bundleIdentifier||app.activationPolicy!=NSApplicationActivationPolicyRegular)continue;
      @try{NSMutableDictionary *value=[window mutableCopy];value[@"app_id"]=app.bundleIdentifier;value[@"process_identity"]=CUIdentity(app.processIdentifier);value[@"active"]=@(focusedWindow>0&&app.processIdentifier==frontmostPid&&[window[@"window_id"]unsignedIntValue]==focusedWindow);[windows addObject:value];}@catch(NSException *error){if(![error.name isEqual:@"APP_EXITED"])@throw;}
    }
    __block pid_t currentFrontmostPid=0;
    dispatch_sync(dispatch_get_main_queue(),^{currentFrontmostPid=NSWorkspace.sharedWorkspace.frontmostApplication.processIdentifier;});
    CGWindowID currentFocusedWindow=0;
    if(currentFrontmostPid==frontmostPid&&frontmostPid>0){
      AXUIElementRef frontmost=AXUIElementCreateApplication(frontmostPid);
      id focused=CUAX(frontmost,kAXFocusedWindowAttribute);
      if(focused&&CFGetTypeID((__bridge CFTypeRef)focused)==AXUIElementGetTypeID())currentFocusedWindow=CUAXWindowId((__bridge AXUIElementRef)focused);
      CFRelease(frontmost);
    }
    if(currentFrontmostPid!=frontmostPid||currentFocusedWindow!=focusedWindow)for(NSMutableDictionary *window in windows)window[@"active"]=@NO;
    return CUResult(@{@"windows":windows});
  }
  // User-requested window sharing has its own read-only session and observation
  // baseline. It must not claim input ownership or replace a model's AX IDs.
  if([name isEqual:@"get_window_share"]){
    if(![args[@"pid"] isKindOfClass:NSNumber.class]||![args[@"process_identity"] isKindOfClass:NSString.class])CUFail(@"INVALID_TARGET",@"Choose a current window before sharing it.");
    if(![CUIdentity([args[@"pid"]intValue]) isEqual:args[@"process_identity"]])CUFail(@"STALE_PROCESS",@"The selected application restarted. Choose its window again.");
    NSRunningApplication *app=[NSRunningApplication runningApplicationWithProcessIdentifier:[args[@"pid"]intValue]];
    if(!app.bundleIdentifier||app.activationPolicy!=NSApplicationActivationPolicyRegular)CUFail(@"INVALID_TARGET",@"Choose a visible application window to share.");
    NSMutableDictionary *request=[args mutableCopy];request[@"include_accessibility_tree"]=@YES;request[@"include_screenshot"]=@YES;request[@"max_dimension"]=@1600;
    NSMutableDictionary *result=[CUObserve(session,request) mutableCopy],*state=[result[@"structuredContent"] mutableCopy];state[@"app_id"]=app.bundleIdentifier;state[@"app_name"]=app.localizedName?:app.bundleIdentifier;result[@"structuredContent"]=state;return result;
  }
  // Preview connections observe only. They never acquire the input lease or
  // mutate another connection's AX references and screenshot coordinates.
  // Explicit user click on a preview: reveal this exact window, not another
  // window belonging to the same app. This does not claim the input lease.
  if([name isEqual:@"show_window"]){
    if(![args[@"process_identity"] isKindOfClass:NSString.class]||![CUIdentity([args[@"pid"]intValue]) isEqual:args[@"process_identity"]])CUFail(@"STALE_PROCESS",@"The application restarted; select its window again.");
    CUWindow *target=CUResolveWindow(session,args);
    AXUIElementRef app=AXUIElementCreateApplication(target.pid);
    @try{
      NSArray *windows=CUAX(app,kAXWindowsAttribute);AXUIElementRef selected=NULL;
      for(id window in windows)if(CUAXWindowId((__bridge AXUIElementRef)window)==target.windowId){selected=(__bridge AXUIElementRef)window;break;}
      if(!selected)CUFail(@"STALE_WINDOW",@"The selected window is unavailable.");
      AXUIElementSetAttributeValue(selected,kAXMinimizedAttribute,kCFBooleanFalse);
      AXError raised=AXUIElementPerformAction(selected,kAXRaiseAction);
      if(raised!=kAXErrorSuccess)CUFail(@"REVEAL_FAILED",@"Could not raise the selected window.");
      __block BOOL activated=NO;dispatch_sync(dispatch_get_main_queue(),^{activated=[[NSRunningApplication runningApplicationWithProcessIdentifier:target.pid]activateWithOptions:0];});
      if(!activated)CUFail(@"REVEAL_FAILED",@"Could not activate the selected application.");
      AXUIElementPerformAction(selected,kAXRaiseAction);
      return CUResult(@{@"shown":@YES,@"window_id":@(target.windowId)});
    }@finally{CFRelease(app);}
  }
  if([name isEqual:@"start_preview"])return CUStartPreview(session,args);
  if([name isEqual:@"preview_frame"])return CUReadPreview(session,args);
  if([name isEqual:@"native_presentation_status"]){
    return CUResult(CUBridgeWait(^(CUPreviewBridgeCompletion completion){
      CUPreviewBridge *bridge=session.previewBridge;
      if(!bridge){completion(@{@"exists":@NO},nil);return;}
      for(NSString *key in bridge.identity)if(![args[key]isEqual:bridge.identity[key]])CUFail(@"STALE_PRESENTATION",@"The capture is associated with a different presentation.");
      NSMutableDictionary *result=[[bridge snapshot]mutableCopy];result[@"exists"]=@YES;completion(result,nil);
    }));
  }
  if([name isEqual:@"start_native_presentation"]){
    return CUResult(CUBridgeWait(^(CUPreviewBridgeCompletion completion){
      [session check];
      if(session.previewBridge)CUFail(@"NATIVE_PRESENTATION_BUSY",@"Close the previous source before publishing another presentation.");
      NSError *error;
      if(!session.notificationQueue)session.notificationQueue=dispatch_queue_create("ai.trisoul.computer-use.notifications",DISPATCH_QUEUE_SERIAL);
      __weak CUSession *weak=session;
      CUPreviewBridge *bridge=[[CUPreviewBridge alloc]initWithSession:session arguments:args notificationHandler:^(NSString *method,NSDictionary *parameters){
        CUSession *owner=weak;if(!owner)return;
        dispatch_async(owner.notificationQueue,^{CUWrite(owner,@{@"jsonrpc":@"2.0",@"method":method,@"params":parameters});});
      } error:&error];
      if(!bridge){completion(nil,error);return;}
      session.previewBridge=bridge;[bridge startWithCompletion:completion];
    }));
  }
  if([@[@"native_presentation_command",@"native_presentation_frame_ack",@"end_native_presentation",@"confirm_native_presentation_provider_destroyed"]containsObject:name]){
    return CUResult(CUBridgeWait(^(CUPreviewBridgeCompletion completion){
      CUPreviewBridge *bridge=CUCurrentBridge(session,args);
      if([name isEqual:@"native_presentation_frame_ack"])[bridge acknowledgeEncodedFrame:args completion:completion];
      else if([name isEqual:@"native_presentation_command"]){
        if(![args[@"command"]isKindOfClass:NSString.class])CUFail(@"INVALID_REQUEST",@"A native presentation command is required.");
        [bridge performCommand:args[@"command"] arguments:args completion:completion];
      }else{
        CUPreviewBridgeCompletion closed=^(NSDictionary *result,NSError *error){if(!error&&bridge.closed&&session.previewBridge==bridge)session.previewBridge=nil;completion(result,error);};
        if([name isEqual:@"end_native_presentation"])[bridge closeWithCompletion:closed];
        else [bridge confirmProviderDestroyedWithProof:args completion:closed];
      }
    }));
  }
  if([name isEqual:@"preview_session_status"]){
    NSString *connectionID=[args[@"connection_id"]isKindOfClass:NSString.class]?args[@"connection_id"]:nil;
    BOOL connected=NO;@synchronized(registry){for(CUSession *candidate in sessions)if(connectionID?[candidate.ownerID isEqual:connectionID]:[candidate.label isEqual:args[@"session_label"]]){connected=YES;break;}}
    return CUResult(@{@"connected":@(connected)});
  }
  if([name isEqualToString:@"launch_app"]){
    __block NSURL *url;__block NSRunningApplication *application;__block NSError *failure;
    dispatch_sync(dispatch_get_main_queue(),^{
      if(args[@"bundle_id"])url=[NSWorkspace.sharedWorkspace URLForApplicationWithBundleIdentifier:args[@"bundle_id"]];
      else if([args[@"name"] hasPrefix:@"/"])url=[NSURL fileURLWithPath:args[@"name"]];
      else for(NSDictionary *a in CUApps())if([a[@"name"] isEqual:args[@"name"]]){url=[NSURL fileURLWithPath:a[@"launch_path"]];break;}
    });
    if(!url)CUFail(@"APP_NOT_FOUND",@"The requested application could not be found.");
    dispatch_semaphore_t done=dispatch_semaphore_create(0);
    dispatch_async(dispatch_get_main_queue(),^{
      if(atomic_load(&session->cancelled)){dispatch_semaphore_signal(done);return;}
      NSWorkspaceOpenConfiguration *configuration=[NSWorkspaceOpenConfiguration configuration];configuration.activates=NO;
      [NSWorkspace.sharedWorkspace openApplicationAtURL:url configuration:configuration completionHandler:^(NSRunningApplication *app,NSError *error){application=app;failure=error;dispatch_semaphore_signal(done);}];
    });
    // LaunchServices cannot retract a dispatched launch. Wait for its completion
    // before acknowledging stop, so no application opens after that boundary.
    dispatch_semaphore_wait(done,DISPATCH_TIME_FOREVER);
    [session check];
    if(failure||!application)CUFail(@"APP_LAUNCH_FAILED",failure.localizedDescription?:@"Application startup timed out.");
    return CUResult(@{@"pid":@(application.processIdentifier),@"bundle_id":application.bundleIdentifier?:@""});
  }
  [session check];
  NSString *key=[NSString stringWithFormat:@"%@:%@",args[@"pid"],args[@"window_id"]];
  @synchronized(registry){CUSession *owner=owners[key];if(owner&&owner!=session)CUFail(@"TARGET_BUSY",@"Another Computer Use session owns this window.");owners[key]=session;}
  if([@[@"get_window_state",@"click",@"drag",@"scroll",@"set_value",@"type_text",@"paste",@"press_key",@"select_text",@"perform_secondary_action"]containsObject:name])CUPrepareScreenLock(session);
  if([name isEqualToString:@"get_window_state"])return CUObserve(session,args);
  return CUInput(session,name,args);
}
static void CUHandle(CUSession *session,NSDictionary *request) {
  id identifier=request[@"id"];NSString *method=request[@"method"];NSDictionary *params=request[@"params"]?:@{};
  if(![method isKindOfClass:NSString.class]||![params isKindOfClass:NSDictionary.class]){
    if(identifier)CUWrite(session,@{@"jsonrpc":@"2.0",@"id":identifier,@"error":@{@"code":@(-32600),@"message":@"Expected a method string and a params object"}});return;
  }
  if([method isEqualToString:@"initialize"]){
    NSMutableDictionary *identity=[@{@"protocol":@(TRISOUL_PROTOCOL),@"build":@TRISOUL_BUILD_ID,@"pid":@(getpid()),@"connectionId":session.ownerID}mutableCopy];
    NSDictionary *processIdentity=CUMachCurrentProcessIdentity(NULL);if(processIdentity)[identity addEntriesFromDictionary:processIdentity];
    CUReply(session,identifier,@{@"protocolVersion":@"2024-11-05",@"capabilities":@{@"tools":@{}},@"serverInfo":@{@"name":@"trisoul-computer-use",@"version":@TRISOUL_VERSION},@"_meta":@{@"trisoul":identity}});return;
  }
  if([method isEqualToString:@"notifications/initialized"])return;
  if([method isEqualToString:@"notifications/cancelled"]){CUStop(session,nil,NO);return;}
  if([method isEqualToString:@"shutdown"]){
    CUPrepareShutdown(^(BOOL released){
      if(!released){CUWrite(session,@{@"jsonrpc":@"2.0",@"id":identifier?:NSNull.null,@"error":@{@"code":@(-32000),@"message":@"Native resources have not completed shutdown. Retry after cleanup."}});return;}
      CUReply(session,identifier,@{@"stopped":@YES});[NSApp terminate:nil];
    });return;
  }
  if([method isEqualToString:@"tools/list"]){
    NSMutableArray *tools=[NSMutableArray new];for(NSString *name in @[@"check_permissions",@"show_setup",@"show_window",@"list_apps",@"list_windows",@"list_share_windows",@"get_window_share",@"launch_app",@"get_window_state",@"start_session",@"end_session",@"click",@"drag",@"scroll",@"set_value",@"type_text",@"paste",@"press_key",@"select_text",@"perform_secondary_action",@"start_preview",@"preview_frame",@"preview_session_status"])[tools addObject:@{@"name":name,@"description":name,@"inputSchema":@{@"type":@"object"}}];
    [tools addObject:@{@"name":@"copy_image_to_clipboard",@"description":@"Copy a complete PNG for an explicit user screenshot action.",@"inputSchema":@{@"type":@"object",@"properties":@{@"session":@{@"type":@"string"},@"pngBase64":@{@"type":@"string",@"minLength":@4,@"maxLength":@(4*((2*1024*1024+2)/3))}},@"required":@[@"pngBase64"]}}];
    CUReply(session,identifier,@{@"tools":tools});return;
  }
  if(![method isEqualToString:@"tools/call"]){if(identifier)CUWrite(session,@{@"jsonrpc":@"2.0",@"id":identifier,@"error":@{@"code":@(-32601),@"message":@"Unknown method"}});return;}
  NSString *name=params[@"name"];NSDictionary *args=params[@"arguments"]?:@{};
  if(![name isKindOfClass:NSString.class]||![args isKindOfClass:NSDictionary.class]){CUReply(session,identifier,CUError([NSException exceptionWithName:@"INVALID_REQUEST" reason:@"Tool name and arguments are required." userInfo:nil]));return;}
  if(atomic_load(&serviceClosing)&&![@[@"end_session",@"end_native_presentation",@"native_presentation_status",@"native_presentation_frame_ack",@"confirm_native_presentation_provider_destroyed",@"preview_session_status"]containsObject:name]){CUReply(session,identifier,CUError([NSException exceptionWithName:@"SERVICE_CLOSING" reason:@"The native service is releasing its resources." userInfo:nil]));return;}
  if([name isEqualToString:@"start_session"]){
    __block uint64_t generation;
    @synchronized(registry){
      if(session.stopping||session.cleanupRunning||session.disconnected||session.previewBridge||dispatch_group_wait(session.active,DISPATCH_TIME_NOW)!=0){CUReply(session,identifier,CUError([NSException exceptionWithName:@"SESSION_BUSY" reason:@"Wait for the previous operations and presentation cleanup to finish." userInfo:nil]));return;}
      generation=++session.lifecycleGeneration;
      session.stopping=YES;atomic_store(&session->cancelled,true);dispatch_group_enter(session.active);
    }
    dispatch_async(session.queue,^{
      dispatch_semaphore_t lockRelease=dispatch_semaphore_create(0);__block NSError *lockError;
      if(screenLockCoordinator){
        [screenLockCoordinator serviceConnectionInvalidatedForOwner:session.ownerID completion:^(NSError *error){lockError=error;dispatch_semaphore_signal(lockRelease);}];
        dispatch_semaphore_wait(lockRelease,DISPATCH_TIME_FOREVER);
      }
      BOOL cursorHidden=CUCleanupOperation(^BOOL{return CUCursorHide(session,session.label,YES);});
      BOOL inputReleased=CUCleanupOperation(^BOOL{return CURelease(session);});
      BOOL released=cursorHidden&&inputReleased&&!lockError;
      @synchronized(registry){
        if(released&&session.lifecycleGeneration==generation&&!session.cleanupRunning&&!atomic_load(&serviceClosing)){session.label=[args[@"session"]isKindOfClass:NSString.class]?args[@"session"]:NSUUID.UUID.UUIDString;session.threadID=[args[@"thread_id"]isKindOfClass:NSString.class]?args[@"thread_id"]:nil;session.stopping=NO;atomic_store(&session->cancelled,false);}
        else released=NO;
      }
      CUReply(session,identifier,released?CUResult(@{@"session":session.label}):CUError([NSException exceptionWithName:@"NATIVE_CLEANUP_PENDING" reason:@"The native session cannot start before input and screen-lock cleanup completes." userInfo:nil]));
      dispatch_group_leave(session.active);
    });return;
  }
  if(args[@"session"]&&![args[@"session"] isEqual:session.label]){CUReply(session,identifier,CUError([NSException exceptionWithName:@"WRONG_SESSION" reason:@"This connection cannot operate on another session." userInfo:nil]));return;}
  if([name isEqualToString:@"end_session"]){CUStop(session,identifier,NO);return;}
  dispatch_queue_t queue=session.queue;
  BOOL presentationControl=[name isEqual:@"start_native_presentation"]||[name hasPrefix:@"native_presentation_"]||[name isEqual:@"end_native_presentation"]||[name isEqual:@"confirm_native_presentation_provider_destroyed"];
  if([@[@"native_presentation_frame_ack",@"native_presentation_status",@"end_native_presentation",@"confirm_native_presentation_provider_destroyed"]containsObject:name])queue=dispatch_get_global_queue(QOS_CLASS_USER_INITIATED,0);
  else if([args[@"pid"] isKindOfClass:NSNumber.class]&&![name isEqual:@"start_preview"]&&!presentationControl){@synchronized(registry){if(!queues[args[@"pid"]])queues[args[@"pid"]]=dispatch_queue_create("ai.trisoul.computer-use.target",DISPATCH_QUEUE_SERIAL);queue=queues[args[@"pid"]];}}
  dispatch_group_enter(session.active);
  dispatch_async(queue,^{@autoreleasepool{@try{CUReply(session,identifier,CUTool(session,name,args));}@catch(NSException *error){CUReply(session,identifier,CUError(error));}@finally{dispatch_group_leave(session.active);}}});
}
static int CUConnect(NSString *path) {
  if([path lengthOfBytesUsingEncoding:NSUTF8StringEncoding]>=sizeof(((struct sockaddr_un *)0)->sun_path))return -1;
  int fd=socket(AF_UNIX,SOCK_STREAM,0);struct sockaddr_un address={0};address.sun_family=AF_UNIX;strlcpy(address.sun_path,path.fileSystemRepresentation,sizeof(address.sun_path));
  if(connect(fd,(struct sockaddr *)&address,sizeof(address))!=0){close(fd);return -1;}return fd;
}
static int CUProxy(NSString *path,BOOL stop) {
  int fd=CUConnect(path);if(fd<0){fprintf(stderr,"Native service is unavailable at the configured socket.\n");return 1;}
  if(stop){const char *message="{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"shutdown\"}\n";write(fd,message,strlen(message));char result[2048];read(fd,result,sizeof(result));close(fd);return 0;}
  dispatch_async(dispatch_get_global_queue(QOS_CLASS_USER_INITIATED,0),^{char bytes[65536];ssize_t count;while((count=read(STDIN_FILENO,bytes,sizeof(bytes)))>0){ssize_t offset=0;while(offset<count){ssize_t sent=write(fd,bytes+offset,count-offset);if(sent<=0)return;offset+=sent;}}shutdown(fd,SHUT_WR);});
  char bytes[65536];ssize_t count;while((count=read(fd,bytes,sizeof(bytes)))>0){ssize_t offset=0;while(offset<count){ssize_t sent=write(STDOUT_FILENO,bytes+offset,count-offset);if(sent<=0){close(fd);return 1;}offset+=sent;}}close(fd);return 0;
}
@interface CUApp : NSObject <NSApplicationDelegate,NSWindowDelegate,CUSetupShowing>
@property NSStatusItem *statusItem;
@property NSWindow *setupWindow;
@property NSTextField *accessibilityStatus;
@property NSTextField *screenStatus;
@property NSTimer *permissionTimer;
@property BOOL terminationPending;
@property BOOL terminationApproved;
@end
@implementation CUApp
- (void)applicationDidFinishLaunching:(NSNotification *)notification {
  self.statusItem=[NSStatusBar.systemStatusBar statusItemWithLength:NSVariableStatusItemLength];self.statusItem.button.title=@"CU";
  NSMenu *menu=[NSMenu new];NSMenuItem *stop=[menu addItemWithTitle:@"停止所有电脑操作" action:@selector(stopAll:) keyEquivalent:@""];stop.target=self;
  NSMenuItem *setup=[menu addItemWithTitle:@"权限设置…" action:@selector(setup:) keyEquivalent:@""];setup.target=self;
  [menu addItem:NSMenuItem.separatorItem];[menu addItemWithTitle:@"退出" action:@selector(terminate:) keyEquivalent:@""];self.statusItem.menu=menu;
  if([NSProcessInfo.processInfo.arguments containsObject:@"--setup"])[self setup:nil];
}
- (BOOL)applicationShouldHandleReopen:(NSApplication *)application hasVisibleWindows:(BOOL)flag { [self setup:nil];return YES; }
- (void)stopAll:(id)sender { @synchronized(registry){for(CUSession *session in sessions)CUStop(session,nil,NO);} }
- (void)setup:(id)sender {
  if(!self.setupWindow){self.setupWindow=[[NSWindow alloc]initWithContentRect:NSMakeRect(0,0,500,320) styleMask:NSWindowStyleMaskTitled|NSWindowStyleMaskClosable backing:NSBackingStoreBuffered defer:NO];self.setupWindow.title=@"Oh My DSH Computer Use";self.setupWindow.releasedWhenClosed=NO;self.setupWindow.delegate=self;
    NSTextField *heading=[NSTextField labelWithString:@"让 Oh My DSH 操作你的 Mac"];heading.font=[NSFont boldSystemFontOfSize:22];heading.frame=NSMakeRect(26,255,448,35);[self.setupWindow.contentView addSubview:heading];
    NSTextField *help=[NSTextField wrappingLabelWithString:@"开启以下权限后，就可以在对话中选择应用、查看画面并交给助手操作。你可以随时从对话或菜单栏停止。"];help.textColor=NSColor.secondaryLabelColor;help.frame=NSMakeRect(26,195,448,50);[self.setupWindow.contentView addSubview:help];
    NSTextField *axTitle=[NSTextField labelWithString:@"辅助功能"];axTitle.font=[NSFont boldSystemFontOfSize:14];axTitle.frame=NSMakeRect(26,162,220,22);[self.setupWindow.contentView addSubview:axTitle];
    self.accessibilityStatus=[NSTextField labelWithString:@""];self.accessibilityStatus.frame=NSMakeRect(26,140,220,20);[self.setupWindow.contentView addSubview:self.accessibilityStatus];
    NSButton *ax=[NSButton buttonWithTitle:@"打开辅助功能设置" target:self action:@selector(accessibility:)];ax.frame=NSMakeRect(285,143,190,35);[self.setupWindow.contentView addSubview:ax];
    NSTextField *screenTitle=[NSTextField labelWithString:@"屏幕录制"];screenTitle.font=[NSFont boldSystemFontOfSize:14];screenTitle.frame=NSMakeRect(26,102,220,22);[self.setupWindow.contentView addSubview:screenTitle];
    self.screenStatus=[NSTextField labelWithString:@""];self.screenStatus.frame=NSMakeRect(26,80,220,20);[self.setupWindow.contentView addSubview:self.screenStatus];
    NSButton *screen=[NSButton buttonWithTitle:@"打开屏幕录制设置" target:self action:@selector(screen:)];screen.frame=NSMakeRect(285,83,190,35);[self.setupWindow.contentView addSubview:screen];
    NSTextField *footer=[NSTextField wrappingLabelWithString:@"请在系统设置中找到 Oh My DSH Computer Use。\n授权后，这里的状态和 Oh My DSH 面板会自动更新。"];footer.font=[NSFont systemFontOfSize:11];footer.textColor=NSColor.secondaryLabelColor;footer.frame=NSMakeRect(26,20,448,40);[self.setupWindow.contentView addSubview:footer];[self.setupWindow center];}
  [self refreshPermissions:nil];[self.permissionTimer invalidate];self.permissionTimer=[NSTimer scheduledTimerWithTimeInterval:1.5 target:self selector:@selector(refreshPermissions:) userInfo:nil repeats:YES];
  [self.setupWindow makeKeyAndOrderFront:nil];[NSApp activateIgnoringOtherApps:YES];
}
- (void)refreshPermissions:(id)sender {
  BOOL ax=AXIsProcessTrusted(),screen=CGPreflightScreenCaptureAccess();
  self.accessibilityStatus.stringValue=ax?@"已开启 · 可以操作控件":@"待开启 · 用于操作控件";self.accessibilityStatus.textColor=ax?NSColor.systemGreenColor:NSColor.secondaryLabelColor;
  self.screenStatus.stringValue=screen?@"已开启 · 可以查看画面":@"待开启 · 用于查看画面";self.screenStatus.textColor=screen?NSColor.systemGreenColor:NSColor.secondaryLabelColor;
}
- (void)windowWillClose:(NSNotification *)notification { if(notification.object==self.setupWindow){[self.permissionTimer invalidate];self.permissionTimer=nil;} }
- (void)accessibility:(id)sender { AXIsProcessTrustedWithOptions((__bridge CFDictionaryRef)@{(__bridge id)kAXTrustedCheckOptionPrompt:@YES});[NSWorkspace.sharedWorkspace openURL:[NSURL URLWithString:@"x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility"]]; }
- (void)screen:(id)sender { CGRequestScreenCaptureAccess();[NSWorkspace.sharedWorkspace openURL:[NSURL URLWithString:@"x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture"]]; }
- (NSApplicationTerminateReply)applicationShouldTerminate:(NSApplication *)sender {
  (void)sender;
  if(self.terminationApproved)return NSTerminateNow;
  if(!self.terminationPending){
    self.terminationPending=YES;
    CUPrepareShutdown(^(BOOL released){
      self.terminationPending=NO;
      if(!released){NSLog(@"Native Computer Use shutdown remains pending; resources were retained.");return;}
      self.terminationApproved=YES;[NSApp terminate:nil];
    });
  }
  // Cleanup needs the ordinary AppKit queue, not the nested termination loop.
  return NSTerminateCancel;
}
- (void)applicationWillTerminate:(NSNotification *)notification { CUWindowRegistryClose();if(listener>=0)close(listener);if(socketPath)unlink(socketPath.fileSystemRepresentation); }
@end
int main(int argc,const char *argv[]) {
  @autoreleasepool {
    // Installation helpers run without creating AppKit windows or a daemon.
    if(argc==4&&strcmp(argv[1],"swap-bundles")==0){if(renameatx_np(AT_FDCWD,argv[2],AT_FDCWD,argv[3],RENAME_SWAP)!=0){perror("swap-bundles");return 1;}return 0;}
    if(argc==3&&strcmp(argv[1],"install-lock")==0){
      int fd=open(argv[2],O_CREAT|O_RDWR|O_NOFOLLOW,0600);struct stat file;
      if(fd<0||fstat(fd,&file)!=0||!S_ISREG(file.st_mode)||file.st_uid!=getuid()){fprintf(stderr,"Invalid installation lock.\n");return 1;}
      if(flock(fd,LOCK_EX)!=0){close(fd);return 1;}
      puts("locked");fflush(stdout);char bytes[64];while(read(STDIN_FILENO,bytes,sizeof(bytes))>0){}close(fd);return 0;
    }
    signal(SIGPIPE,SIG_IGN);NSArray *args=NSProcessInfo.processInfo.arguments;NSUInteger index=[args indexOfObject:@"--socket"];
    if(index!=NSNotFound&&index+1>=args.count){fprintf(stderr,"--socket requires a path.\n");return 2;}
    socketPath=index==NSNotFound?[NSTemporaryDirectory() stringByAppendingPathComponent:[NSString stringWithFormat:@"trisoul-cu-%u.sock",getuid()]]:args[index+1];
    if([args containsObject:@"mcp"])return CUProxy(socketPath,NO);if([args containsObject:@"stop"])return CUProxy(socketPath,YES);
    if([socketPath lengthOfBytesUsingEncoding:NSUTF8StringEncoding]>=sizeof(((struct sockaddr_un *)0)->sun_path)){fprintf(stderr,"Socket path is too long.\n");return 2;}
    sessions=[NSMutableSet new];owners=[NSMutableDictionary new];queues=[NSMutableDictionary new];registry=[NSObject new];
    CUWindowRegistrySetControlProvider(^BOOL(pid_t pid){
      NSString *prefix=[NSString stringWithFormat:@"%d:",pid];
      @synchronized(registry){for(NSString *key in owners){CUSession *owner=owners[key];if([key hasPrefix:prefix]&&!owner.stopping&&!owner.disconnected&&!atomic_load(&owner->cancelled))return YES;}}
      return NO;
    });
    CUWindowRegistrySetNotificationHandler(^BOOL(pid_t pid,NSString *identity,CFStringRef notification,AXUIElementRef element){
      NSString *prefix=[NSString stringWithFormat:@"%d:",pid];NSMutableSet<CUSession *> *active=[NSMutableSet new];
      @synchronized(registry){
        for(NSString *key in owners){CUSession *owner=owners[key];if([key hasPrefix:prefix]&&!owner.stopping&&!owner.disconnected&&!atomic_load(&owner->cancelled))[active addObject:owner];}
      }
      BOOL handled=YES;
      for(CUSession *owner in active)if(!CUInputFocusHandleAXNotification(owner,pid,identity,notification,element))handled=NO;
      return handled;
    });
    CUSetPreviewWindowContextProvider(^NSDictionary *(CUSession *session,CUWindow *target){
      NSDictionary *identity=session.previewBridge.identity;
      NSString *threadID=identity[@"threadID"],*turnID=identity[@"turnID"];
      return CUWindowRegistryContext(target,threadID,turnID,threadID&&turnID?CUActivePresentationWindows(threadID,turnID):@[]);
    });
    CUWindowRegistrySetChangeHandler(^(pid_t pid,NSString *identity){
      dispatch_async(dispatch_get_main_queue(),^{
        NSArray *active;@synchronized(registry){active=sessions.allObjects;}
        for(CUSession *session in active){
          NSDictionary *source=CUPreviewSourceIdentity(session,NULL);
          if([source[@"pid"]intValue]==pid&&[source[@"processIdentity"]isEqual:identity]){
            @try{CURefreshPreviewAssociatedWindows(session,NULL);}@catch(NSException *error){NSLog(@"Window-associated capture refresh failed (%@).",error.name);}
          }
        }
      });
    });
    listener=socket(AF_UNIX,SOCK_STREAM,0);struct sockaddr_un address={0};address.sun_family=AF_UNIX;strlcpy(address.sun_path,socketPath.fileSystemRepresentation,sizeof(address.sun_path));
    umask(0077);
    struct stat existing;
    if(lstat(socketPath.fileSystemRepresentation,&existing)==0){
      int live=CUConnect(socketPath);
      if(live>=0){close(live);fprintf(stderr,"Native service is already running.\n");return 0;}
      if(!S_ISSOCK(existing.st_mode)||existing.st_uid!=getuid()){fprintf(stderr,"Socket path is occupied by a different file or user.\n");return 1;}
      unlink(socketPath.fileSystemRepresentation);
    }
    if(bind(listener,(struct sockaddr *)&address,sizeof(address))!=0||listen(listener,16)!=0){fprintf(stderr,"Could not bind the native socket: %s\n",strerror(errno));return 1;}chmod(socketPath.fileSystemRepresentation,0600);
    NSApplication *app=NSApplication.sharedApplication;[app setActivationPolicy:NSApplicationActivationPolicyAccessory];CUApp *delegate=[CUApp new];app.delegate=delegate;
    screenLockController=[CUScreenLockController new];CULoginAuthorizationBroker *authorizationBroker=[CULoginAuthorizationBroker new];NSError *configurationError;
    screenLockProvider=CUCreateConfiguredScreenLockProvider(screenLockController,authorizationBroker,&configurationError);
    screenLockConfigurationError=configurationError.localizedDescription;
    screenLockCoordinator=[[CUScreenLockCoordinator alloc]initWithController:screenLockController broker:authorizationBroker provider:screenLockProvider enabled:^BOOL{return screenLockProvider!=nil;}];
    screenLockCoordinator.physicalInteractionHandler=^(BOOL hadPending){
      (void)hadPending;
      NSSet *affected=[NSSet setWithArray:[screenLockCoordinator snapshot][@"last_physical_owners"]?:@[]];
      NSArray *active;@synchronized(registry){active=sessions.allObjects;}
      for(CUSession *session in active)if([affected containsObject:session.ownerID])CUStop(session,nil,NO);
    };
    dispatch_async(dispatch_get_global_queue(QOS_CLASS_USER_INITIATED,0),^{while(YES){int fd=accept(listener,NULL,NULL);if(fd<0)break;uid_t uid;gid_t gid;if(getpeereid(fd,&uid,&gid)!=0||uid!=getuid()){close(fd);continue;}
      CUSession *session=[CUSession new];session.socket=fd;@synchronized(registry){[sessions addObject:session];}
      dispatch_async(dispatch_get_global_queue(QOS_CLASS_USER_INITIATED,0),^{@autoreleasepool{NSMutableData *buffer=[NSMutableData new];char bytes[65536];ssize_t count;
        while((count=read(fd,bytes,sizeof(bytes)))>0){[buffer appendBytes:bytes length:count];if(buffer.length>4*1024*1024)break;while(YES){NSRange newline=[buffer rangeOfData:[NSData dataWithBytes:"\n" length:1] options:0 range:NSMakeRange(0,buffer.length)];if(newline.location==NSNotFound)break;NSData *line=[buffer subdataWithRange:NSMakeRange(0,newline.location)];[buffer replaceBytesInRange:NSMakeRange(0,newline.location+1) withBytes:NULL length:0];id request=[NSJSONSerialization JSONObjectWithData:line options:0 error:nil];if([request isKindOfClass:NSDictionary.class])CUHandle(session,request);}}
        CUStop(session,nil,YES);
      }});
    }});
    signal(SIGTERM,SIG_IGN);dispatch_source_t terminateSource=dispatch_source_create(DISPATCH_SOURCE_TYPE_SIGNAL,SIGTERM,0,dispatch_get_main_queue());dispatch_source_set_event_handler(terminateSource,^{[NSApp terminate:nil];});dispatch_resume(terminateSource);
    [app run];
  }return 0;
}
