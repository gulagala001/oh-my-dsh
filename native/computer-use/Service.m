#import "ComputerUse.h"
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
static NSDictionary *CUError(NSException *error) { return @{@"isError":@YES,@"structuredContent":@{@"error":@{@"code":error.name,@"message":error.reason?:@"Native operation failed"}},@"content":@[@{@"type":@"text",@"text":error.reason?:@"Native operation failed"}]}; }
static BOOL CURelease(CUSession *session) {
  BOOL released=YES;for(CUWindow *target in session.windows.allValues)if(!CUReleaseInputFocus(target))released=NO;
  if(!released)return NO;
  @synchronized(registry){for(NSString *key in [owners.allKeys copy])if(owners[key]==session)[owners removeObjectForKey:key];}
  [session.windows removeAllObjects];return YES;
}
static void CUStop(CUSession *session,id identifier,BOOL disconnect) {
  NSString *label;
  @synchronized(registry){atomic_store(&session->cancelled,true);session.stopping=YES;label=session.label;}
  CUCursorHide(session,label,NO);
  dispatch_group_notify(session.active,dispatch_get_global_queue(QOS_CLASS_USER_INITIATED,0),^{
    // Never wait for AppKit while holding the session registry lock.
    BOOL cursorHidden=CUCursorHide(session,label,YES);
    BOOL previewStopped=CUStopPreview(session);
    if(!previewStopped&&disconnect){dispatch_after(dispatch_time(DISPATCH_TIME_NOW,100*NSEC_PER_MSEC),dispatch_get_global_queue(QOS_CLASS_USER_INITIATED,0),^{CUStop(session,nil,YES);});return;}
    @synchronized(registry){
      if(!previewStopped&&!disconnect){CUReply(session,identifier,CUError([NSException exceptionWithName:@"PREVIEW_CLEANUP_PENDING" reason:@"Window capture has not stopped yet. Retry closing the live view." userInfo:nil]));return;}
      if(!cursorHidden&&!disconnect){CUReply(session,identifier,CUError([NSException exceptionWithName:@"CURSOR_CLEANUP_PENDING" reason:@"The cursor surface has not disappeared yet. Retry stop before resuming control." userInfo:nil]));return;}
      // A late EOF/duplicate stop must not release a newly started lease.
      if([session.label isEqual:label]&&session.stopping){
        if(!CURelease(session)){
          if(disconnect)dispatch_after(dispatch_time(DISPATCH_TIME_NOW,100*NSEC_PER_MSEC),dispatch_get_global_queue(QOS_CLASS_USER_INITIATED,0),^{CUStop(session,nil,YES);});
          else CUReply(session,identifier,CUError([NSException exceptionWithName:@"FOCUS_CLEANUP_PENDING" reason:@"The selected window has not released background focus yet. Retry stop before resuming control." userInfo:nil]));
          return;
        }
        session.stopping=NO;
      }
      if(identifier)CUReply(session,identifier,CUResult(@{@"status":@"ended",@"session":label}));
      if(disconnect){[session.writeLock lock];if(session.socket>=0){close(session.socket);session.socket=-1;}[session.writeLock unlock];[sessions removeObject:session];}
    }
  });
}
static NSDictionary *CUTool(CUSession *session,NSString *name,NSDictionary *args) {
  [session check];
  if([name isEqualToString:@"check_permissions"])return CUResult(@{@"accessibility":AXIsProcessTrusted()?@YES:@NO,@"screen_recording":CGPreflightScreenCaptureAccess()?@YES:@NO,@"source":@{@"bundle_id":NSBundle.mainBundle.bundleIdentifier?:@"",@"pid":@(getpid()),@"attribution":@"driver-daemon"}});
  if([name isEqualToString:@"show_setup"]){
    __block BOOL shown=NO;
    dispatch_sync(dispatch_get_main_queue(),^{id delegate=NSApp.delegate;if([delegate respondsToSelector:@selector(setup:)]){[(id<CUSetupShowing>)delegate setup:nil];shown=YES;}});
    if(!shown)CUFail(@"RUNTIME_NOT_READY",@"The native application is not ready to show its permission window.");
    return CUResult(@{@"shown":@YES});
  }
  if([name isEqualToString:@"list_apps"])return CUResult(@{@"apps":CUApps()});
  if([name isEqualToString:@"list_windows"]){NSArray *windows=CUWindows(args[@"pid"]);return CUResult(@{@"windows":windows,@"process_identity":args[@"pid"]?CUIdentity([args[@"pid"]intValue]):@""});}
  if([name isEqual:@"list_share_windows"]){
    NSMutableArray *windows=[NSMutableArray new];
    for(NSDictionary *window in CUWindows(nil)){
      if([window[@"layer"] intValue]!=0||![window[@"is_on_screen"] boolValue]||[window[@"bounds"][@"width"] doubleValue]<=0||[window[@"bounds"][@"height"] doubleValue]<=0)continue;
      NSRunningApplication *app=[NSRunningApplication runningApplicationWithProcessIdentifier:[window[@"pid"]intValue]];
      if(!app.bundleIdentifier||app.activationPolicy!=NSApplicationActivationPolicyRegular)continue;
      @try{NSMutableDictionary *value=[window mutableCopy];value[@"app_id"]=app.bundleIdentifier;value[@"process_identity"]=CUIdentity(app.processIdentifier);value[@"active"]=@(app.active);[windows addObject:value];}@catch(NSException *error){if(![error.name isEqual:@"APP_EXITED"])@throw;}
    }
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
      __block BOOL activated=NO;dispatch_sync(dispatch_get_main_queue(),^{activated=[[NSRunningApplication runningApplicationWithProcessIdentifier:target.pid]activateWithOptions:NSApplicationActivateIgnoringOtherApps];});
      if(!activated)CUFail(@"REVEAL_FAILED",@"Could not activate the selected application.");
      AXUIElementPerformAction(selected,kAXRaiseAction);
      return CUResult(@{@"shown":@YES,@"window_id":@(target.windowId)});
    }@finally{CFRelease(app);}
  }
  if([name isEqual:@"start_preview"])return CUStartPreview(session,args);
  if([name isEqual:@"preview_frame"])return CUReadPreview(session,args);
  if([name isEqual:@"preview_session_status"]){
    BOOL connected=NO;@synchronized(registry){for(CUSession *candidate in sessions)if([candidate.label isEqual:args[@"session_label"]]){connected=YES;break;}}
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
  if([name isEqualToString:@"get_window_state"])return CUObserve(session,args);
  return CUInput(session,name,args);
}
static void CUHandle(CUSession *session,NSDictionary *request) {
  id identifier=request[@"id"];NSString *method=request[@"method"];NSDictionary *params=request[@"params"]?:@{};
  if(![method isKindOfClass:NSString.class]||![params isKindOfClass:NSDictionary.class]){
    if(identifier)CUWrite(session,@{@"jsonrpc":@"2.0",@"id":identifier,@"error":@{@"code":@(-32600),@"message":@"Expected a method string and a params object"}});return;
  }
  if([method isEqualToString:@"initialize"]){
    CUReply(session,identifier,@{@"protocolVersion":@"2024-11-05",@"capabilities":@{@"tools":@{}},@"serverInfo":@{@"name":@"trisoul-computer-use",@"version":@TRISOUL_VERSION},@"_meta":@{@"trisoul":@{@"protocol":@(TRISOUL_PROTOCOL),@"build":@TRISOUL_BUILD_ID,@"pid":@(getpid())}}});return;
  }
  if([method isEqualToString:@"notifications/initialized"])return;
  if([method isEqualToString:@"notifications/cancelled"]){CUStop(session,nil,NO);return;}
  if([method isEqualToString:@"shutdown"]){
    NSArray *active;@synchronized(registry){active=sessions.allObjects;for(CUSession *s in active)atomic_store(&s->cancelled,true);}
    dispatch_async(dispatch_get_global_queue(QOS_CLASS_USER_INITIATED,0),^{for(CUSession *s in active)dispatch_group_wait(s.active,DISPATCH_TIME_FOREVER);CUReply(session,identifier,@{@"stopped":@YES});dispatch_async(dispatch_get_main_queue(),^{[NSApp terminate:nil];});});return;
  }
  if([method isEqualToString:@"tools/list"]){
    NSMutableArray *tools=[NSMutableArray new];for(NSString *name in @[@"check_permissions",@"show_setup",@"show_window",@"list_apps",@"list_windows",@"list_share_windows",@"get_window_share",@"launch_app",@"get_window_state",@"start_session",@"end_session",@"click",@"drag",@"scroll",@"set_value",@"type_text",@"paste",@"press_key",@"select_text",@"start_preview",@"preview_frame",@"preview_session_status"])[tools addObject:@{@"name":name,@"description":name,@"inputSchema":@{@"type":@"object"}}];CUReply(session,identifier,@{@"tools":tools});return;
  }
  if(![method isEqualToString:@"tools/call"]){if(identifier)CUWrite(session,@{@"jsonrpc":@"2.0",@"id":identifier,@"error":@{@"code":@(-32601),@"message":@"Unknown method"}});return;}
  NSString *name=params[@"name"];NSDictionary *args=params[@"arguments"]?:@{};
  if(![name isKindOfClass:NSString.class]||![args isKindOfClass:NSDictionary.class]){CUReply(session,identifier,CUError([NSException exceptionWithName:@"INVALID_REQUEST" reason:@"Tool name and arguments are required." userInfo:nil]));return;}
  if([name isEqualToString:@"start_session"]){
    @synchronized(registry){
      if(session.stopping||dispatch_group_wait(session.active,DISPATCH_TIME_NOW)!=0){CUReply(session,identifier,CUError([NSException exceptionWithName:@"SESSION_BUSY" reason:@"Wait for the previous operations to finish." userInfo:nil]));return;}
      CUCursorHide(session,session.label,NO);if(!CURelease(session)){CUReply(session,identifier,CUError([NSException exceptionWithName:@"FOCUS_CLEANUP_PENDING" reason:@"Wait for background focus to be released before starting a new session." userInfo:nil]));return;}session.label=[args[@"session"] isKindOfClass:NSString.class]?args[@"session"]:NSUUID.UUID.UUIDString;atomic_store(&session->cancelled,false);CUReply(session,identifier,CUResult(@{@"session":session.label}));
    }return;
  }
  if(args[@"session"]&&![args[@"session"] isEqual:session.label]){CUReply(session,identifier,CUError([NSException exceptionWithName:@"WRONG_SESSION" reason:@"This connection cannot operate on another session." userInfo:nil]));return;}
  if([name isEqualToString:@"end_session"]){CUStop(session,identifier,NO);return;}
  dispatch_queue_t queue=session.queue;
  if([args[@"pid"] isKindOfClass:NSNumber.class]&&![name isEqual:@"start_preview"]){@synchronized(registry){if(!queues[args[@"pid"]])queues[args[@"pid"]]=dispatch_queue_create("ai.trisoul.computer-use.target",DISPATCH_QUEUE_SERIAL);queue=queues[args[@"pid"]];}}
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
  NSArray *active;@synchronized(registry){active=sessions.allObjects;for(CUSession *session in active)atomic_store(&session->cancelled,true);}
  BOOL busy=NO;for(CUSession *session in active)if(dispatch_group_wait(session.active,DISPATCH_TIME_NOW)!=0){busy=YES;break;}
  if(!busy)return NSTerminateNow;
  dispatch_async(dispatch_get_global_queue(QOS_CLASS_USER_INITIATED,0),^{
    for(CUSession *session in active)dispatch_group_wait(session.active,DISPATCH_TIME_FOREVER);
    // AppKit runs a nested termination loop. Dispatching back onto the main
    // queue from a main-queue shutdown request deadlocks that loop.
    CFRunLoopPerformBlock(CFRunLoopGetMain(),kCFRunLoopCommonModes,^{[NSApp replyToApplicationShouldTerminate:YES];});
    CFRunLoopWakeUp(CFRunLoopGetMain());
  });
  return NSTerminateLater;
}
- (void)applicationWillTerminate:(NSNotification *)notification { if(listener>=0)close(listener);if(socketPath)unlink(socketPath.fileSystemRepresentation); }
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
    dispatch_async(dispatch_get_global_queue(QOS_CLASS_USER_INITIATED,0),^{while(YES){int fd=accept(listener,NULL,NULL);if(fd<0)break;uid_t uid;gid_t gid;if(getpeereid(fd,&uid,&gid)!=0||uid!=getuid()){close(fd);continue;}
      CUSession *session=[CUSession new];session.socket=fd;@synchronized(registry){[sessions addObject:session];}
      dispatch_async(dispatch_get_global_queue(QOS_CLASS_USER_INITIATED,0),^{@autoreleasepool{NSMutableData *buffer=[NSMutableData new];char bytes[65536];ssize_t count;
        while((count=read(fd,bytes,sizeof(bytes)))>0){[buffer appendBytes:bytes length:count];if(buffer.length>4*1024*1024)break;while(YES){NSRange newline=[buffer rangeOfData:[NSData dataWithBytes:"\n" length:1] options:0 range:NSMakeRange(0,buffer.length)];if(newline.location==NSNotFound)break;NSData *line=[buffer subdataWithRange:NSMakeRange(0,newline.location)];[buffer replaceBytesInRange:NSMakeRange(0,newline.location+1) withBytes:NULL length:0];id request=[NSJSONSerialization JSONObjectWithData:line options:0 error:nil];if([request isKindOfClass:NSDictionary.class])CUHandle(session,request);}}
        CUStop(session,nil,YES);
      }});
    }});
    NSApplication *app=NSApplication.sharedApplication;[app setActivationPolicy:NSApplicationActivationPolicyAccessory];CUApp *delegate=[CUApp new];app.delegate=delegate;
    signal(SIGTERM,SIG_IGN);dispatch_source_t terminateSource=dispatch_source_create(DISPATCH_SOURCE_TYPE_SIGNAL,SIGTERM,0,dispatch_get_main_queue());dispatch_source_set_event_handler(terminateSource,^{[NSApp terminate:nil];});dispatch_resume(terminateSource);
    [app run];
  }return 0;
}
