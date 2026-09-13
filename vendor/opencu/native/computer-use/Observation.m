#import "ComputerUse.h"
#import <ImageIO/ImageIO.h>
#import <ScreenCaptureKit/ScreenCaptureKit.h>
#import <libproc.h>
#import <dlfcn.h>

@implementation CUElement
- (instancetype)initWithElement:(AXUIElementRef)element { if((self=[super init])){_ax=(AXUIElementRef)CFRetain(element);_identifier=NSUUID.UUID.UUIDString;}return self; }
- (void)dealloc { if(_ax)CFRelease(_ax); }
@end
@implementation CUWindow
- (instancetype)init { if((self=[super init])){_elements=[NSMutableDictionary new];_screenshotScale=0;}return self; }
@end
@implementation CUSession
- (instancetype)init { if((self=[super init])){atomic_init(&cancelled,false);_label=NSUUID.UUID.UUIDString;_windows=[NSMutableDictionary new];_active=dispatch_group_create();_queue=dispatch_queue_create("ai.trisoul.computer-use.session",DISPATCH_QUEUE_SERIAL);_writeLock=[NSLock new];}return self; }
- (void)check { if(atomic_load(&cancelled))CUFail(@"CANCELLED",@"Computer Use session was stopped."); }
@end
void CUFail(NSString *code,NSString *message) { @throw [NSException exceptionWithName:code reason:message userInfo:nil]; }
id CUAX(AXUIElementRef element,CFStringRef attribute) { CFTypeRef value=NULL;AXError error=AXUIElementCopyAttributeValue(element,attribute,&value);return error==kAXErrorSuccess?CFBridgingRelease(value):nil; }
NSString *CUIdentity(pid_t pid) {
  struct proc_bsdinfo info={0};int count=proc_pidinfo(pid,PROC_PIDTBSDINFO,0,&info,sizeof(info));
  if(count!=sizeof(info))CUFail(@"APP_EXITED",@"The selected process no longer exists.");
  return [NSString stringWithFormat:@"%d:%llu:%llu",pid,info.pbi_start_tvsec,info.pbi_start_tvusec];
}
CGWindowID CUAXWindowId(AXUIElementRef element) {
  typedef AXError (*GetWindow)(AXUIElementRef,CGWindowID *);static GetWindow getWindow;static dispatch_once_t once;
  dispatch_once(&once,^{getWindow=(GetWindow)dlsym(RTLD_DEFAULT,"_AXUIElementGetWindow");});
  CGWindowID wid=0;if(getWindow)getWindow(element,&wid);return wid;
}
NSArray *CUWindows(NSNumber *pid) {
  NSArray *all=CFBridgingRelease(CGWindowListCopyWindowInfo(kCGWindowListOptionAll,kCGNullWindowID));NSMutableArray *out=[NSMutableArray new];
  NSMutableDictionary *applicationWindows=nil;
  if(pid&&AXIsProcessTrusted()){
    AXUIElementRef app=AXUIElementCreateApplication(pid.intValue);AXUIElementSetMessagingTimeout(app,.25);
    NSArray *windows=CUAX(app,kAXWindowsAttribute);
    id focused=CUAX(app,kAXFocusedWindowAttribute);CGWindowID focusedId=focused?CUAXWindowId((__bridge AXUIElementRef)focused):0;
    if([windows isKindOfClass:NSArray.class]){applicationWindows=[NSMutableDictionary new];for(id window in windows){AXUIElementRef ax=(__bridge AXUIElementRef)window;CGWindowID wid=CUAXWindowId(ax);if(wid)applicationWindows[@(wid)]=@{@"subrole":CUAX(ax,kAXSubroleAttribute)?:@"",@"modal":CUAX(ax,kAXModalAttribute)?:@NO,@"focused":@((BOOL)(wid==focusedId))};}}
    CFRelease(app);
  }
  for(NSDictionary *w in all) {
    NSNumber *owner=w[(id)kCGWindowOwnerPID];if(pid&&![owner isEqual:pid])continue;
    CGRect rect; if(!CGRectMakeWithDictionaryRepresentation((__bridge CFDictionaryRef)w[(id)kCGWindowBounds],&rect))continue;
    NSMutableDictionary *record=[@{@"pid":owner,@"window_id":w[(id)kCGWindowNumber],@"title":w[(id)kCGWindowName]?:@"",@"app_name":w[(id)kCGWindowOwnerName]?:@"",@"layer":w[(id)kCGWindowLayer]?:@0,@"is_on_screen":w[(id)kCGWindowIsOnscreen]?:@NO,@"bounds":@{@"x":@(rect.origin.x),@"y":@(rect.origin.y),@"width":@(rect.size.width),@"height":@(rect.size.height)}} mutableCopy];
    if(applicationWindows){NSDictionary *info=applicationWindows[w[(id)kCGWindowNumber]];record[@"is_application_window"]=@(info!=nil);if(info)[record addEntriesFromDictionary:info];}
    [out addObject:record];
  }return out;
}
NSArray *CUApps(void) {
  NSMutableDictionary *apps=[NSMutableDictionary new];
  for(NSRunningApplication *app in NSWorkspace.sharedWorkspace.runningApplications) {
    if(app.activationPolicy!=NSApplicationActivationPolicyRegular||!app.bundleIdentifier)continue;
    apps[app.bundleIdentifier]=@{@"bundle_id":app.bundleIdentifier,@"name":app.localizedName?:app.bundleIdentifier,@"pid":@(app.processIdentifier),@"running":@YES,@"active":@(app.active),@"launch_path":app.bundleURL.path?:@""};
  }
  for(NSString *directory in @[@"/Applications",@"/System/Applications",[NSHomeDirectory() stringByAppendingPathComponent:@"Applications"]]) {
    for(NSString *name in [NSFileManager.defaultManager contentsOfDirectoryAtPath:directory error:nil]) {
      if(![name.pathExtension isEqualToString:@"app"])continue;
      NSBundle *bundle=[NSBundle bundleWithPath:[directory stringByAppendingPathComponent:name]];NSString *identifier=bundle.bundleIdentifier;
      if(!identifier||apps[identifier])continue;
      apps[identifier]=@{@"bundle_id":identifier,@"name":[bundle objectForInfoDictionaryKey:@"CFBundleDisplayName"]?:[bundle objectForInfoDictionaryKey:@"CFBundleName"]?:name.stringByDeletingPathExtension,@"pid":@0,@"running":@NO,@"active":@NO,@"launch_path":bundle.bundlePath};
    }
  }return [[apps allValues] sortedArrayUsingComparator:^NSComparisonResult(NSDictionary *a,NSDictionary *b){return [a[@"name"] localizedCaseInsensitiveCompare:b[@"name"]];}];
}
CUWindow *CUResolveWindow(CUSession *session,NSDictionary *args) {
  [session check];NSNumber *pid=args[@"pid"],*wid=args[@"window_id"];
  if(![pid isKindOfClass:NSNumber.class]||![wid isKindOfClass:NSNumber.class]||pid.intValue<=0||wid.unsignedIntValue==0)CUFail(@"INVALID_TARGET",@"An exact pid and window_id are required.");
  NSString *identity=CUIdentity(pid.intValue),*key=[NSString stringWithFormat:@"%@:%@",pid,wid];
  CUWindow *target;@synchronized(session.windows){target=session.windows[key];}
  if(target&&![target.processIdentity isEqualToString:identity])CUFail(@"STALE_PROCESS",@"The application restarted; bind it again.");
  NSArray *windows=CFBridgingRelease(CGWindowListCopyWindowInfo(kCGWindowListOptionIncludingWindow,wid.unsignedIntValue));
  NSDictionary *window=nil;for(NSDictionary *w in windows)if([w[(id)kCGWindowNumber]isEqual:wid]&&[w[(id)kCGWindowOwnerPID]isEqual:pid]){window=w;break;}
  if(!window)CUFail(@"STALE_WINDOW",@"The selected window closed or belongs to a different process.");
  if(!target){target=[CUWindow new];target.pid=pid.intValue;target.windowId=wid.unsignedIntValue;target.processIdentity=identity;@synchronized(session.windows){session.windows[key]=target;}}
  CGRect bounds;if(!CGRectMakeWithDictionaryRepresentation((__bridge CFDictionaryRef)window[(id)kCGWindowBounds],&bounds))CUFail(@"INVALID_WINDOW_BOUNDS",@"The selected window has no usable bounds.");target.bounds=bounds;
  if(target.bounds.size.width<=0||target.bounds.size.height<=0)CUFail(@"INVALID_WINDOW_BOUNDS",@"The selected window has no usable bounds.");
  if(target.screenshotScale>0&&!CGRectEqualToRect(target.bounds,target.screenshotBounds))target.screenshotScale=0;
  return target;
}
static NSString *CUString(id value) {
  if(!value||[value isKindOfClass:NSNull.class])return @"";
  if([value isKindOfClass:NSString.class])return value;
  if([value isKindOfClass:NSNumber.class])return [value stringValue];
  return @"";
}
static void CUCaptureWait(CUSession *session,dispatch_semaphore_t semaphore) {
  for(int i=0;i<80;i++){[session check];if(dispatch_semaphore_wait(semaphore,dispatch_time(DISPATCH_TIME_NOW,50*NSEC_PER_MSEC))==0)return;}
  CUFail(@"CAPTURE_TIMEOUT",@"ScreenCaptureKit did not return a window frame in time.");
}
static CGImageRef CUCapture(CUSession *session,CUWindow *target,double maximum) {
  if(@available(macOS 15.0,*)){
    // The Quartz window capture API was removed in macOS 15.
  }else{
    // On macOS 14, repeated SCScreenshotManager requests can leave ReplayKit's
    // connection interrupted. Use this OS's public window-only Quartz API.
    // Resolve dynamically because current SDKs mark the symbol unavailable.
    typedef CGImageRef (*WindowImage)(CGRect,CGWindowListOption,CGWindowID,CGWindowImageOption);
    WindowImage capture=(WindowImage)dlsym(RTLD_DEFAULT,"CGWindowListCreateImage");
    if(!capture)CUFail(@"CAPTURE_UNAVAILABLE",@"The macOS window capture API is unavailable.");
    [session check];
    CGImageRef image=capture(CGRectNull,kCGWindowListOptionIncludingWindow,target.windowId,kCGWindowImageBoundsIgnoreFraming|kCGWindowImageNominalResolution);
    if(!image)CUFail(@"CAPTURE_UNAVAILABLE",@"The selected window did not produce an image.");
    return image;
  }
  __block SCShareableContent *content;__block NSError *failure;dispatch_semaphore_t ready=dispatch_semaphore_create(0);
  [SCShareableContent getShareableContentExcludingDesktopWindows:YES onScreenWindowsOnly:NO completionHandler:^(SCShareableContent *value,NSError *error){content=value;failure=error;dispatch_semaphore_signal(ready);}];
  CUCaptureWait(session,ready);if(failure)CUFail(@"CAPTURE_UNAVAILABLE",failure.localizedDescription);
  SCWindow *window=nil;for(SCWindow *candidate in content.windows)if(candidate.windowID==target.windowId&&candidate.owningApplication.processID==target.pid){window=candidate;break;}
  if(!window)CUFail(@"CAPTURE_UNAVAILABLE",@"ScreenCaptureKit cannot capture the selected window.");
  double scale=maximum>0?MIN(1,maximum/MAX(target.bounds.size.width,target.bounds.size.height)):1;
  SCContentFilter *filter=[[SCContentFilter alloc]initWithDesktopIndependentWindow:window];SCStreamConfiguration *configuration=[SCStreamConfiguration new];configuration.width=MAX(1,lrint(target.bounds.size.width*scale));configuration.height=MAX(1,lrint(target.bounds.size.height*scale));configuration.showsCursor=NO;configuration.ignoreShadowsSingleWindow=YES;configuration.captureResolution=SCCaptureResolutionNominal;
  dispatch_semaphore_t captured=dispatch_semaphore_create(0);__block id ownedImage;
  [SCScreenshotManager captureImageWithFilter:filter configuration:configuration completionHandler:^(CGImageRef image,NSError *error){if(image)ownedImage=CFBridgingRelease(CGImageRetain(image));failure=error;dispatch_semaphore_signal(captured);}];
  CUCaptureWait(session,captured);if(failure||!ownedImage)CUFail(@"CAPTURE_UNAVAILABLE",failure.localizedDescription?:@"The window frame is unavailable.");
  return CGImageRetain((__bridge CGImageRef)ownedImage);
}
static void CUWalk(CUSession *session,CUWindow *target,AXUIElementRef element,NSUInteger depth,NSUInteger maxDepth,NSUInteger maxNodes,NSMutableArray *rows,NSMutableArray *lines,CFMutableSetRef seen,CFDictionaryRef previous,BOOL *truncated,BOOL *unreadable) {
  [session check];if(CFSetContainsValue(seen,element))return;if(depth>maxDepth||rows.count>=maxNodes){*truncated=YES;return;}CFSetAddValue(seen,element);
  AXUIElementSetMessagingTimeout(element,.25);
  NSArray *keys=@[(__bridge id)kAXRoleAttribute,(__bridge id)kAXTitleAttribute,(__bridge id)kAXDescriptionAttribute,(__bridge id)kAXValueAttribute,(__bridge id)kAXEnabledAttribute,(__bridge id)kAXPositionAttribute,(__bridge id)kAXSizeAttribute,(__bridge id)kAXChildrenAttribute,(__bridge id)kAXIdentifierAttribute];
  CFArrayRef values=NULL;AXError result=AXUIElementCopyMultipleAttributeValues(element,(__bridge CFArrayRef)keys,0,&values);
  if(result!=kAXErrorSuccess||!values){if(values)CFRelease(values);*unreadable=YES;return;}NSArray *v=CFBridgingRelease(values);if(v.count!=keys.count){*unreadable=YES;return;}
  NSString *role=CUString(v[0]),*title=CUString(v[1]),*description=CUString(v[2]),*value=CUString(v[3]);
  if([role isEqualToString:@"AXMenu"]){
    CGSize menuSize={0};
    if(CFGetTypeID((__bridge CFTypeRef)v[6])!=AXValueGetTypeID()||!AXValueGetValue((__bridge AXValueRef)v[6],kAXValueCGSizeType,&menuSize)||menuSize.width<=0||menuSize.height<=0)return;
  }
  CFArrayRef actionValues=NULL;AXUIElementCopyActionNames(element,&actionValues);NSArray *actions=actionValues?CFBridgingRelease(actionValues):@[];
  NSUInteger index=rows.count;NSNumber *number=@(index);
  CUElement *record=(__bridge CUElement *)CFDictionaryGetValue(previous,element);
  if(!record)record=[[CUElement alloc]initWithElement:element];target.elements[number]=record;
  NSMutableDictionary *row=[@{@"element_index":number,@"element_id":record.identifier,@"element_token":[NSString stringWithFormat:@"%@:%lu",target.snapshotId,index],@"role":role,@"label":title.length?title:description,@"depth":@(depth),@"actions":actions} mutableCopy];
  if(value.length)row[@"value"]=value;
  if([role isEqual:@"AXTextField"]||[role isEqual:@"AXTextArea"]){NSString *placeholder=CUString(CUAX(element,kAXPlaceholderValueAttribute));if(placeholder.length)row[@"placeholder"]=placeholder;}
  if([role isEqualToString:@"AXMenuItem"]){
    NSString *character=CUString(CUAX(element,kAXMenuItemCmdCharAttribute));
    if(character.length){id modifiers=CUAX(element,kAXMenuItemCmdModifiersAttribute),virtualKey=CUAX(element,kAXMenuItemCmdVirtualKeyAttribute);row[@"shortcut"]=@{@"character":character,@"modifiers":[modifiers isKindOfClass:NSNumber.class]?modifiers:@0,@"virtual_key":[virtualKey isKindOfClass:NSNumber.class]?virtualKey:@(-1)};}
  }
  CGPoint position={0};CGSize size={0};
  if(CFGetTypeID((__bridge CFTypeRef)v[5])==AXValueGetTypeID()&&CFGetTypeID((__bridge CFTypeRef)v[6])==AXValueGetTypeID()&&AXValueGetValue((__bridge AXValueRef)v[5],kAXValueCGPointType,&position)&&AXValueGetValue((__bridge AXValueRef)v[6],kAXValueCGSizeType,&size))row[@"frame"]=@{@"x":@(position.x),@"y":@(position.y),@"w":@(size.width),@"h":@(size.height)};
  if([v[4] isKindOfClass:NSNumber.class])row[@"enabled"]=v[4];
  [rows addObject:row];
  NSString *indent=[@"" stringByPaddingToLength:depth*2 withString:@" " startingAtIndex:0];
  NSMutableString *line=[NSMutableString stringWithFormat:@"%@- [%lu] %@ %@",indent,index,role,title.length?title:description];
  if(value.length)[line appendFormat:@" = %@",value];if(actions.count)[line appendFormat:@" actions=%@",[actions componentsJoinedByString:@","]];
  [lines addObject:line];
  if([v[7] isKindOfClass:NSArray.class])for(id child in v[7]){if(CFGetTypeID((__bridge CFTypeRef)child)==AXUIElementGetTypeID())CUWalk(session,target,(__bridge AXUIElementRef)child,depth+1,maxDepth,maxNodes,rows,lines,seen,previous,truncated,unreadable);}
}
NSDictionary *CUObserve(CUSession *session,NSDictionary *args) {
  CUWindow *target=CUResolveWindow(session,args);
  BOOL tree=args[@"include_accessibility_tree"]?[args[@"include_accessibility_tree"] boolValue]:YES,shot=args[@"include_screenshot"]?[args[@"include_screenshot"] boolValue]:YES;
  if(!tree&&!shot)CUFail(@"EMPTY_OBSERVATION",@"Request the accessibility tree, a screenshot, or both.");
  NSMutableDictionary *state=[@{@"pid":@(target.pid),@"window_id":@(target.windowId),@"window_bounds":@{@"x":@(target.bounds.origin.x),@"y":@(target.bounds.origin.y),@"width":@(target.bounds.size.width),@"height":@(target.bounds.size.height)}} mutableCopy];
  NSMutableArray *content=[NSMutableArray new];
  CUWindow *treeSnapshot=nil;
  if(tree){
    if(!AXIsProcessTrusted())CUFail(@"ACCESSIBILITY_PERMISSION",@"Enable Accessibility for Oh My DSH Computer Use in macOS Settings.");
    AXUIElementRef app=AXUIElementCreateApplication(target.pid);AXUIElementSetMessagingTimeout(app,.25);

    CFMutableDictionaryRef previous=CFDictionaryCreateMutable(NULL,0,&kCFTypeDictionaryKeyCallBacks,&kCFTypeDictionaryValueCallBacks);
    CFMutableSetRef seen=CFSetCreateMutable(NULL,0,&kCFTypeSetCallBacks);
    @try{
    if(!target.accessibilityRequested){
      // Chromium/Electron build their web AX tree on demand. Request it before
      // walking, without enabling screen-reader mode when the modern opt-in works.
      AXError enabled=AXUIElementSetAttributeValue(app,CFSTR("AXManualAccessibility"),kCFBooleanTrue);
      if(enabled==kAXErrorAttributeUnsupported)enabled=AXUIElementSetAttributeValue(app,CFSTR("AXEnhancedUserInterface"),kCFBooleanTrue);
      if(enabled==kAXErrorSuccess){
        target.accessibilityRequested=YES;target.webAccessibility=YES;
        for(int i=0;i<25;i++){[session check];usleep(20000);}
      }else if(enabled==kAXErrorAttributeUnsupported)target.accessibilityRequested=YES;
    }

      // Compare actual AX objects. Labels, tree positions and application-supplied
      // identifiers can be duplicated or reused by replacement controls.
      for(CUElement *element in target.elements.allValues)CFDictionarySetValue(previous,element.ax,(__bridge const void *)element);
      NSArray *windows=CUAX(app,kAXWindowsAttribute);AXUIElementRef selected=NULL;
      for(id w in windows)if(CUAXWindowId((__bridge AXUIElementRef)w)==target.windowId){selected=(__bridge AXUIElementRef)w;break;}
      treeSnapshot=[CUWindow new];treeSnapshot.snapshotId=NSUUID.UUID.UUIDString;NSMutableArray *rows=[NSMutableArray new],*lines=[NSMutableArray new];
      BOOL truncated=NO,unreadable=NO;
      if(selected){
        NSUInteger depth=MIN([args[@"max_depth"] unsignedIntegerValue]?:25,40),limit=MIN([args[@"max_elements"] unsignedIntegerValue]?:2000,10000);
        state[@"window_title"]=CUString(CUAX(selected,kAXTitleAttribute));
        CUWalk(session,treeSnapshot,selected,0,depth,limit,rows,lines,seen,previous,&truncated,&unreadable);
        id menu=CUAX(app,kAXMenuBarAttribute);if(menu)CUWalk(session,treeSnapshot,(__bridge AXUIElementRef)menu,0,depth,limit,rows,lines,seen,previous,&truncated,&unreadable);
        id focused=CUAX(app,kAXFocusedUIElementAttribute);
        if(focused)for(NSNumber *index in treeSnapshot.elements)if(CFEqual(treeSnapshot.elements[index].ax,(__bridge CFTypeRef)focused)){state[@"focused_element_index"]=index;break;}
      }else{state[@"degraded_reason"]=@"ax_window_unresolved";}
      state[@"snapshot_id"]=treeSnapshot.snapshotId;state[@"elements"]=rows;state[@"element_count"]=@(rows.count);state[@"tree_markdown"]=[lines componentsJoinedByString:@"\n"];
      if(truncated)state[@"truncated"]=@YES;if(unreadable)state[@"unreadable"]=@YES;
    }@finally{CFRelease(seen);CFRelease(previous);CFRelease(app);}
  }
  [session check];
  if(shot){
    if(!CGPreflightScreenCaptureAccess())CUFail(@"SCREEN_RECORDING_PERMISSION",@"Enable Screen Recording for Oh My DSH Computer Use in macOS Settings.");
    CGImageRef captured=CUCapture(session,target,[args[@"max_dimension"] doubleValue]);
    if(!captured)CUFail(@"CAPTURE_UNAVAILABLE",@"The requested window cannot currently be captured.");
    CGFloat width=CGImageGetWidth(captured),height=CGImageGetHeight(captured),maximum=[args[@"max_dimension"] doubleValue];
    CGImageRef image=captured;
    if(maximum>0&&MAX(width,height)>maximum){
      double scale=maximum/MAX(width,height);size_t w=MAX(1,lrint(width*scale)),h=MAX(1,lrint(height*scale));
      CGColorSpaceRef color=CGColorSpaceCreateWithName(kCGColorSpaceSRGB);CGContextRef context=CGBitmapContextCreate(NULL,w,h,8,0,color,kCGImageAlphaPremultipliedLast);CGColorSpaceRelease(color);
      CGContextSetInterpolationQuality(context,kCGInterpolationHigh);CGContextDrawImage(context,CGRectMake(0,0,w,h),captured);image=CGBitmapContextCreateImage(context);CGContextRelease(context);
    }
    NSMutableData *png=[NSMutableData new];CGImageDestinationRef destination=CGImageDestinationCreateWithData((__bridge CFMutableDataRef)png,CFSTR("public.png"),1,NULL);CGImageDestinationAddImage(destination,image,NULL);BOOL ok=CGImageDestinationFinalize(destination);CFRelease(destination);
    target.screenshotScale=(double)CGImageGetWidth(image)/target.bounds.size.width;target.screenshotBounds=target.bounds;state[@"screenshot_width"]=@(CGImageGetWidth(image));state[@"screenshot_height"]=@(CGImageGetHeight(image));state[@"screenshot_scale"]=@(target.screenshotScale);
    if(image!=captured)CGImageRelease(image);CGImageRelease(captured);if(!ok)CUFail(@"CAPTURE_ENCODING_FAILED",@"Could not encode the captured window.");
    [content addObject:@{@"type":@"image",@"mimeType":@"image/png",@"data":[png base64EncodedStringWithOptions:0]}];
  }
  [session check];
  if(treeSnapshot){target.elements=treeSnapshot.elements;target.snapshotId=treeSnapshot.snapshotId;}
  [content addObject:@{@"type":@"text",@"text":state[@"tree_markdown"]?:@"Window screenshot captured."}];return @{@"structuredContent":state,@"content":content};
}
NSDictionary *CUResult(id value) { NSData *json=[NSJSONSerialization dataWithJSONObject:value?:@{} options:0 error:nil];return @{@"structuredContent":value?:@{},@"content":@[@{@"type":@"text",@"text":[[NSString alloc]initWithData:json encoding:NSUTF8StringEncoding]?:@"{}"}]}; }
